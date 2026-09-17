/* Full technical + SEO audit of the built dist/ site.
   Run after `npm run build`. Crawls every generated HTML file. */
const fs = require("fs");
const path = require("path");

const { SITE } = require("./seo-data.cjs");
const DIST = path.join(__dirname, "..", "dist");
const DOMAIN = SITE.domain;

function walk(dir) {
  let out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) out = out.concat(walk(p));
    else if (entry.name.endsWith(".html")) out.push(p);
  }
  return out;
}

const files = walk(DIST);
const issues = []; // { file, type, detail }
const warn = (file, type, detail) => issues.push({ file, type, detail, sev: "warn" });
const err = (file, type, detail) => issues.push({ file, type, detail, sev: "error" });

const titles = new Map(); // title -> [files]
const descs = new Map();
const allInternalTargets = new Set(); // every unique href*.html found across the site
const linkedPages = new Set(); // pages that are targets of at least one internal link
const existingRelPaths = new Set(files.map((f) => path.relative(DIST, f).replace(/\\/g, "/")));

for (const file of files) {
  const rel = path.relative(DIST, file).replace(/\\/g, "/");
  const html = fs.readFileSync(file, "utf8");

  // --- title ---
  const titleMatch = html.match(/<title>([^<]*)<\/title>/);
  if (!titleMatch) err(rel, "missing-title", "");
  else {
    const t = titleMatch[1].trim();
    if (t.length < 10) err(rel, "title-too-short", t);
    if (t.length > 70) warn(rel, "title-long", `${t.length} chars: "${t}"`);
    if (!titles.has(t)) titles.set(t, []);
    titles.get(t).push(rel);
  }

  // --- meta description ---
  const descMatch = html.match(/<meta name="description" content="([^"]*)"/);
  if (!descMatch) err(rel, "missing-meta-description", "");
  else {
    const d = descMatch[1].trim();
    if (d.length < 50) warn(rel, "description-too-short", `${d.length} chars`);
    if (d.length > 175) warn(rel, "description-long", `${d.length} chars`);
    if (!descs.has(d)) descs.set(d, []);
    descs.get(d).push(rel);
  }

  // --- canonical ---
  const canonMatch = html.match(/<link rel="canonical" href="([^"]*)"/);
  if (!canonMatch) err(rel, "missing-canonical", "");
  else if (!canonMatch[1].startsWith(DOMAIN)) err(rel, "canonical-not-absolute", canonMatch[1]);

  // --- viewport / charset / lang / favicon ---
  if (!/<meta charset="UTF-8"/.test(html)) warn(rel, "missing-charset", "");
  if (!/<meta name="viewport"/.test(html)) err(rel, "missing-viewport", "");
  if (!/<html lang="en"/.test(html)) warn(rel, "missing-lang-attr", "");
  if (!/<link rel="icon"/.test(html)) warn(rel, "missing-favicon", "");

  // --- Open Graph / Twitter ---
  for (const tag of ["og:title", "og:description", "og:image", "og:url", "og:type"]) {
    if (!html.includes(`property="${tag}"`)) warn(rel, "missing-og-tag", tag);
  }
  if (!html.includes('property="og:locale"')) warn(rel, "missing-og-locale", "");
  if (!html.includes('property="og:site_name"')) warn(rel, "missing-og-site_name", "");
  for (const tag of ["twitter:card", "twitter:title", "twitter:description", "twitter:image"]) {
    if (!html.includes(`name="${tag}"`)) warn(rel, "missing-twitter-tag", tag);
  }

  // --- H1 ---
  const h1s = [...html.matchAll(/<h1[ >]/g)];
  if (h1s.length === 0) err(rel, "missing-h1", "");
  else if (h1s.length > 1) warn(rel, "multiple-h1", `${h1s.length} found`);

  // --- images: alt attributes ---
  const imgs = [...html.matchAll(/<img\s[^>]*>/g)].map((m) => m[0]);
  for (const imgTag of imgs) {
    if (!/alt="[^"]*"/.test(imgTag)) {
      err(rel, "image-missing-alt", imgTag.slice(0, 80));
    } else {
      const altVal = imgTag.match(/alt="([^"]*)"/)[1];
      if (altVal.trim() === "") warn(rel, "image-empty-alt", imgTag.slice(0, 80));
    }
  }

  // --- JSON-LD validity ---
  const ldBlocks = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)];
  if (ldBlocks.length === 0) warn(rel, "no-structured-data", "");
  for (const [, block] of ldBlocks) {
    try {
      const parsed = JSON.parse(block);
      if (!parsed["@type"]) warn(rel, "jsonld-missing-type", "");
    } catch (e) {
      err(rel, "jsonld-invalid", e.message);
    }
  }

  // --- internal links (broken link + link graph for orphan check) ---
  const hrefs = [...html.matchAll(/href="([^"]+\.html)"/g)].map((m) => m[1]);
  for (const href of hrefs) {
    if (href.startsWith("http")) continue; // external, skip
    // normalize to a dist-relative path
    let target = href.startsWith("/") ? href.slice(1) : path.normalize(path.join(path.dirname(rel), href));
    target = target.replace(/\\/g, "/");
    allInternalTargets.add(target);
    if (!existingRelPaths.has(target)) {
      err(rel, "broken-internal-link", href);
    } else {
      linkedPages.add(target);
    }
  }
}

// --- duplicate titles / descriptions across the whole site ---
for (const [t, list] of titles) {
  if (list.length > 1) err("(site-wide)", "duplicate-title", `"${t}" used on ${list.length} pages: ${list.slice(0, 4).join(", ")}${list.length > 4 ? "…" : ""}`);
}
for (const [d, list] of descs) {
  if (list.length > 1) err("(site-wide)", "duplicate-meta-description", `used on ${list.length} pages: ${list.slice(0, 4).join(", ")}${list.length > 4 ? "…" : ""}`);
}

// --- orphan pages: every file should be linked from somewhere else on the site ---
for (const rel of existingRelPaths) {
  if (!linkedPages.has(rel)) warn(rel, "orphan-page", "not linked from any internal <a href> found in the crawl");
}

// --- sitemap cross-check ---
const sitemapPath = path.join(DIST, "sitemap.xml");
if (fs.existsSync(sitemapPath)) {
  const sm = fs.readFileSync(sitemapPath, "utf8");
  const locs = [...sm.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
  const smPaths = new Set(locs.map((u) => u.replace(DOMAIN, "").replace(/^\//, "") || "index.html"));
  for (const rel of existingRelPaths) {
    if (!smPaths.has(rel)) warn(rel, "missing-from-sitemap", "");
  }
  for (const p of smPaths) {
    if (!existingRelPaths.has(p)) err("(sitemap.xml)", "sitemap-points-to-missing-file", p);
  }
} else {
  err("(site-wide)", "missing-sitemap", "");
}

// --- robots.txt ---
const robotsPath = path.join(DIST, "robots.txt");
if (!fs.existsSync(robotsPath)) err("(site-wide)", "missing-robots-txt", "");
else {
  const robots = fs.readFileSync(robotsPath, "utf8");
  if (!/Sitemap:/i.test(robots)) warn("robots.txt", "no-sitemap-directive", "");
}

// --- llms.txt ---
if (!fs.existsSync(path.join(DIST, "llms.txt"))) warn("(site-wide)", "missing-llms-txt", "");

// ---------------- report ----------------
const errors = issues.filter((i) => i.sev === "error");
const warnings = issues.filter((i) => i.sev === "warn");

console.log(`\nCrawled ${files.length} pages.\n`);
console.log(`ERRORS: ${errors.length}`);
const errByType = {};
for (const i of errors) errByType[i.type] = (errByType[i.type] || 0) + 1;
for (const [t, c] of Object.entries(errByType)) console.log(`  - ${t}: ${c}`);

console.log(`\nWARNINGS: ${warnings.length}`);
const warnByType = {};
for (const i of warnings) warnByType[i.type] = (warnByType[i.type] || 0) + 1;
for (const [t, c] of Object.entries(warnByType)) console.log(`  - ${t}: ${c}`);

console.log("\n--- sample error detail (first 40) ---");
for (const i of errors.slice(0, 40)) console.log(`[${i.type}] ${i.file} :: ${i.detail}`);

console.log("\n--- sample warning detail (first 40) ---");
for (const i of warnings.slice(0, 40)) console.log(`[${i.type}] ${i.file} :: ${i.detail}`);

fs.writeFileSync(path.join(__dirname, "..", "seo-audit-report.json"), JSON.stringify(issues, null, 2));
console.log(`\nFull report written to seo-audit-report.json (${issues.length} total findings).`);
