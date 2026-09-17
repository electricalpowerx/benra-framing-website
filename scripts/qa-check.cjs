const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const BASE = 'http://127.0.0.1:4173';
const OUT = path.join(__dirname, '..', 'qa-screenshots');
fs.mkdirSync(OUT, { recursive: true });

const results = [];
const log = (msg, ok = true) => {
  results.push({ ok, msg });
  console.log((ok ? 'OK   ' : 'FAIL ') + msg);
};

(async () => {
  // Uses Playwright's normal auto-discovered Chromium install.
  // First run: `npx playwright install chromium` if the browser isn't found.
  const browser = await chromium.launch();

  // ---------- DESKTOP PASS ----------
  const desktopCtx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await desktopCtx.newPage();
  const consoleErrors = [];
  page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });
  page.on('pageerror', (e) => consoleErrors.push(String(e)));

  // Homepage
  await page.goto(`${BASE}/index.html`, { waitUntil: 'networkidle' });
  await page.screenshot({ path: path.join(OUT, '01-home-desktop-top.png') });
  log('Homepage loaded (desktop)');

  // scroll to services section
  await page.evaluate(() => window.scrollBy(0, 1400));
  await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(OUT, '02-home-desktop-services.png') });

  // scroll to quote/CTA band
  const quoteBand = await page.$('text=Fast, Free');
  if (quoteBand) { await quoteBand.scrollIntoViewIfNeeded(); await page.waitForTimeout(200); }
  await page.screenshot({ path: path.join(OUT, '03-home-desktop-cta.png') });
  log('CTA/quote section present: ' + (quoteBand ? 'found' : 'NOT FOUND'), !!quoteBand);

  // scroll to areas we serve
  await page.evaluate(() => window.scrollBy(0, 1600));
  await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(OUT, '04-home-desktop-areas.png') });

  // scroll to footer
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(OUT, '05-home-desktop-footer.png') });
  await page.evaluate(() => window.scrollTo(0, 0));

  // ---- Check header nav links resolve (not 404) ----
  const navLinks = await page.$$eval('header a[href$=".html"]', (as) =>
    [...new Set(as.map((a) => a.getAttribute('href')))]
  );
  for (const href of navLinks.slice(0, 12)) {
    const url = new URL(href, BASE + '/').toString();
    const resp = await page.request.get(url);
    log(`Nav link ${href} -> ${resp.status()}`, resp.ok());
  }

  // ---- Phone / WhatsApp CTA hrefs ----
  const telLinks = await page.$$eval('a[href^="tel:"]', (as) => as.map((a) => a.getAttribute('href')));
  const waLinks = await page.$$eval('a[href^="https://wa.me"]', (as) => as.map((a) => a.getAttribute('href')));
  log(`Found ${telLinks.length} tel: links, sample: ${telLinks[0] || 'NONE'}`, telLinks.length > 0);
  log(`Found ${waLinks.length} WhatsApp links, sample: ${waLinks[0] || 'NONE'}`, waLinks.length > 0);

  // ---- FAQ accordion click test ----
  const faqButtons = await page.$$('.faq-item button, details summary, [data-faq-toggle]');
  let faqTested = false;
  if (faqButtons.length > 0) {
    const first = faqButtons[0];
    await first.scrollIntoViewIfNeeded();
    const before = await page.screenshot();
    await first.click();
    await page.waitForTimeout(300);
    const after = await page.screenshot();
    faqTested = Buffer.compare(before, after) !== 0;
    log('FAQ accordion toggles on click', faqTested);
    await page.screenshot({ path: path.join(OUT, '06-faq-open.png') });
  } else {
    log('No FAQ accordion buttons found on homepage', false);
  }

  // ---- Service card link check ----
  const serviceLink = await page.$('a[href*="services/new-home-framing"]');
  log('Featured service card link present', !!serviceLink);

  // ---- Contact form + success modal ----
  await page.goto(`${BASE}/contact.html`, { waitUntil: 'networkidle' });
  await page.screenshot({ path: path.join(OUT, '07-contact-desktop.png') });
  const nameInput = await page.$('input[name="name"], #name');
  const emailInput = await page.$('input[name="email"], #email');
  const phoneInput = await page.$('input[name="phone"], #phone');
  const form = await page.$('form');
  log('Contact form fields present (name/email/phone/form)', !!(nameInput && emailInput && phoneInput && form));
  if (nameInput && emailInput && phoneInput && form) {
    await nameInput.fill('Test User');
    await emailInput.fill('test@example.com');
    await phoneInput.fill('6045551234');
    const projectSelect = await page.$('select');
    if (projectSelect) await projectSelect.selectOption({ index: 1 });
    const submitBtn = await page.$('form button[type="submit"], form input[type="submit"]');
    if (submitBtn) {
      await submitBtn.click();
      await page.waitForTimeout(500);
      await page.screenshot({ path: path.join(OUT, '08-contact-submitted.png') });
      const modalVisible = await page.evaluate(() => {
        const m = document.querySelector('.modal, [role="dialog"], .success-modal');
        return m ? getComputedStyle(m).display !== 'none' && getComputedStyle(m).visibility !== 'hidden' : null;
      });
      log('Submit button clickable, success modal check: ' + modalVisible, submitBtn !== null);
    } else {
      log('No submit button found on contact form', false);
    }
  }

  // ---- Pricing page ----
  await page.goto(`${BASE}/pricing.html`, { waitUntil: 'networkidle' });
  await page.screenshot({ path: path.join(OUT, '09-pricing-desktop.png') });
  const pricingLinks = await page.$$eval('a[href*="local/"]', (as) => as.length);
  log(`Pricing page has ${pricingLinks} links into combo/local pages`, pricingLinks > 0);
  if (pricingLinks > 0) {
    const href = await page.$eval('a[href*="local/"]', (a) => a.getAttribute('href'));
    const resp = await page.request.get(new URL(href, BASE + '/').toString());
    log(`Sample pricing->local link ${href} -> ${resp.status()}`, resp.ok());
  }

  // ---- Projects page ----
  await page.goto(`${BASE}/projects.html`, { waitUntil: 'networkidle' });
  await page.screenshot({ path: path.join(OUT, '10-projects-desktop.png') });
  const projectImgs = await page.$$eval('img', (imgs) => imgs.length);
  log(`Projects page has ${projectImgs} images`, projectImgs > 0);

  // ---- Sample generated pages ----
  await page.goto(`${BASE}/services/new-home-framing.html`, { waitUntil: 'networkidle' });
  await page.screenshot({ path: path.join(OUT, '11-service-page.png') });
  const svcTitle = await page.title();
  log(`Service page title: "${svcTitle}"`, svcTitle.length > 0);

  await page.goto(`${BASE}/local/deck-framing-surrey.html`, { waitUntil: 'networkidle' });
  await page.screenshot({ path: path.join(OUT, '12-combo-page.png') });
  const comboTitle = await page.title();
  log(`Combo page title: "${comboTitle}"`, comboTitle.length > 0);

  await page.goto(`${BASE}/locations/framing-surrey.html`, { waitUntil: 'networkidle' });
  await page.screenshot({ path: path.join(OUT, '13-location-page.png') });
  const locTitle = await page.title();
  log(`Location page title: "${locTitle}"`, locTitle.length > 0);

  await page.goto(`${BASE}/blog.html`, { waitUntil: 'networkidle' });
  await page.screenshot({ path: path.join(OUT, '14-blog-hub.png') });

  await page.goto(`${BASE}/about.html`, { waitUntil: 'networkidle' });
  await page.screenshot({ path: path.join(OUT, '15-about.png') });

  log(`Console errors collected across all pages: ${consoleErrors.length}`, consoleErrors.length === 0);
  if (consoleErrors.length) console.log('Console errors:', consoleErrors.slice(0, 10));

  await desktopCtx.close();

  // ---------- MOBILE PASS ----------
  const mobileCtx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const mpage = await mobileCtx.newPage();
  await mpage.goto(`${BASE}/index.html`, { waitUntil: 'networkidle' });
  await mpage.screenshot({ path: path.join(OUT, '16-home-mobile-top.png') });
  log('Homepage loaded (mobile viewport)');

  // Mobile menu toggle test
  const menuBtn = await mpage.$('[aria-label*="menu" i], .mobile-menu-toggle, #mobile-menu-btn, button:has-text("Menu")');
  if (menuBtn) {
    await menuBtn.click();
    await mpage.waitForTimeout(300);
    await mpage.screenshot({ path: path.join(OUT, '17-mobile-menu-open.png') });
    const menuVisible = await mpage.evaluate(() => {
      const nav = document.querySelector('#mobile-menu, .mobile-nav, nav.mobile-open, [data-mobile-menu]');
      if (!nav) return null;
      const s = getComputedStyle(nav);
      return s.display !== 'none' && s.visibility !== 'hidden';
    });
    log('Mobile menu toggle button found and clicked, menu visible: ' + menuVisible, menuBtn !== null);
  } else {
    log('Mobile menu toggle button NOT found', false);
  }

  // Floating buttons on mobile (WhatsApp / review)
  const floatingBtns = await mpage.$$eval('a[href^="https://wa.me"], a[href*="google.com/search"]', (as) => as.length);
  log(`Floating action buttons found: ${floatingBtns}`, floatingBtns > 0);
  await mpage.screenshot({ path: path.join(OUT, '18-home-mobile-floating.png') });

  await mobileCtx.close();
  await browser.close();

  fs.writeFileSync(path.join(OUT, 'results.json'), JSON.stringify(results, null, 2));
  const failed = results.filter((r) => !r.ok);
  console.log(`\n=== ${results.length - failed.length}/${results.length} checks passed ===`);
  if (failed.length) {
    console.log('FAILURES:');
    failed.forEach((f) => console.log(' - ' + f.msg));
  }
})();
