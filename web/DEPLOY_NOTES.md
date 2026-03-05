# Cloudflare Pages Deploy Notes

- Project root directory: `web`
- Build command: none
- Build output directory: `.`

## Main routes

- Top: `index.html`
- Manual: `manual.html`
- CAD app: `cad.html`

## Required assets

- `cad/` (runtime scripts)
- `assets/` (logo data etc.)
- `favicon.svg`

## Quick check before upload

1. Open `index.html` and verify links to `manual.html` and `cad.html`.
2. Open `manual.html` and verify links back to `index.html` and to `cad.html`.
3. Open `cad.html` and verify `./cad/app.js` loads.
