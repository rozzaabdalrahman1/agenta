# Claude Chat

A complete, dependency-free AI chat website that talks to the Anthropic (Claude) Messages API with streaming, multiple saved chats, markdown and code blocks with copy buttons, dark mode, Arabic/RTL support, and a model picker.

UI layout follows the familiar chat pattern (sidebar of chats, message column, bottom composer). All code is original; no third-party UI code is copied, so there is no extra license to honor. MIT licensed.

## Why the key is never in the code

GitHub Pages is static. Anything in the code is public, and a leaked key gets stolen. This project has two safe modes, switchable in Settings:

1. **Bring your own key (default).** You paste your key in the Settings dialog. It is kept in `sessionStorage` (cleared when the tab closes) or, if you tick "Remember", in `localStorage` on your own device. It is sent only to `https://api.anthropic.com`. Fine for personal use. Do not use it on a shared computer.
2. **Proxy (best for sharing the site).** A tiny Cloudflare Worker (`worker/worker.js`) holds the key as a secret and forwards requests. It only accepts your site's origin, only the listed models, and caps output tokens. The browser never sees the key.

## Setup

### A. Publish the site
1. Repo **Settings > Pages > Build and deployment > Source: GitHub Actions**.
2. Push to `main`. The workflow runs the tests and deploys. Your site: `https://<your-user>.github.io/<repo>/`.

### B. Use it with your own key (mode 1)
Open the site, Settings, paste your key from https://console.anthropic.com/. Done.

### C. Deploy the proxy (mode 2)
```bash
npm i -g wrangler
cd worker
wrangler login
# edit ALLOWED_ORIGIN in wrangler.toml to https://<your-user>.github.io
wrangler secret put ANTHROPIC_API_KEY   # paste the key when prompted (stays on Cloudflare)
wrangler deploy
```
Copy the printed `https://claude-proxy.<you>.workers.dev` URL into Settings > Proxy URL.

Note: with a public proxy, anyone who finds your site can spend your credits through it. Set a monthly spend limit in the Anthropic console.

## Local run and tests
```bash
npm start   # http://localhost:8080
npm test
```

## Models
IDs checked against https://platform.claude.com/docs/en/models/overview: `claude-sonnet-5-5`, `claude-opus-5-5`, `claude-haiku-5-5`, `claude-fable-5-2`. Edit `MODELS` in `api.js` and `ALLOWED_MODELS` in `worker/worker.js` to change them.

## Files
`index.html`, `style.css`, `app.js` (UI), `api.js` (requests and SSE stream), `markdown.js` (safe renderer), `worker/` (proxy), `tests/`.
