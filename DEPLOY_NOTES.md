# Cloudflare Pages Deploy Notes

- GitHub branch for deploy: `web-only-deploy`
- Project root directory: `/` (branch itself is web-only)
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

## Daily deploy flow (recommended)

Use this script from `D:\開発\s-cad`:

```powershell
powershell -ExecutionPolicy Bypass -File .\deploy-web.ps1 -Message "your update message"
```

What it does:

1. Copy root `index.html` -> `web/cad.html`
2. Sync `cad/` -> `web/cad/`
3. Sync `favicon.svg` -> `web/favicon.svg`
4. Commit and push `main`
5. Rebuild and force-push `web-only-deploy`

## How to ask Codex

You can send either of these:

- `deploy-web.ps1 実行して。メッセージは "fix snap bug"`  
- `cadの変更をwebへ同期して、mainとweb-only-deployまで反映して`

If you want commit only (no push):

- `deploy-web.ps1 を NoPush で実行して`
