# Albert CORS proxy (Cloudflare Worker)

GitHub Pages is static: the Vite `/albert-api` proxy only exists in `npm run dev` / `npm run preview`. Albert’s API (`albert.api.etalab.gouv.fr`) does **not** send CORS headers that allow `https://xiaoouwang.github.io`, so Generative mode fails in the deployed app with a browser cross-origin error.

This Worker is a **fixed-upstream** reverse proxy:

- Browser → `https://<this-worker>/v1/...` (CORS allowed for the Pages origin)
- Worker → `https://albert.api.etalab.gouv.fr/v1/...`
- Forwards the user’s `Authorization: Bearer …` header; **no API key is stored on Cloudflare**

## Deploy

```bash
cd web_interface/albert-proxy
npm install
npx wrangler deploy
```

Copy the printed `*.workers.dev` URL (plus `/v1`) into:

1. `web_interface/src/lib/albertConstants.js` → `ALBERT_CORS_PROXY_BASE_URL`
2. Optional GitHub Actions variable `VITE_ALBERT_BASE_URL` (same value) for CI builds

## Local

Pages builds use the Worker. Local Vite still uses `/albert-api` via `vite.config.js`.
