# Benra Framing and Renovations Limited

Framing & renovations website for Surrey & the Lower Mainland.

- **Legal name:** Benra Framing and Renovations Limited
- **Address:** 16832 60 Avenue, Surrey, BC V3S 1T2
- **Phone:** 604-720-0207
- **Live:** https://benra-framing.netlify.app

## Develop

```bash
npm install
npm run dev
```

## Build / deploy

```bash
npm run generate   # regenerate SEO silo pages from scripts/seo-data.cjs
npm run build
```

Netlify: `npm run build` → publish `dist`. Subdomain only — no custom domain.
