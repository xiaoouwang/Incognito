# Incognito Web

Standalone, **client-side** version of [Incognito](../README.md) for qualitative text anonymization. NER runs entirely in the browser via [Transformers.js](https://huggingface.co/docs/transformers.js) and ONNX Runtime WASM — no Python, no Electron, no server.

## Features

- **ONNX NER** — French: CamemBERT + dates (default) or CamemBERT base; English: BERT NER; or any Hugging Face `token-classification` model with ONNX weights (custom)
- **Rule-based detection** — emails, URLs, dates, phone numbers (same patterns as the desktop app)
- **Interactive review** — category toggles, per-value exclusion, manual span add/remove, custom categories
- **Audit report** — Markdown traceability with provenance (automatic vs manual)
- **Label Studio export** — pre-annotations JSON + labeling config XML
- **Batch mode** — load a folder of `.txt` files, review with navigation, download a timestamped ZIP

## Quick start

```bash
cd web_interface
npm install
npm run dev
```

Open the URL shown in the terminal (typically http://127.0.0.1:5173).

**First NER run:** the selected ONNX model downloads from Hugging Face (~100–400 MB depending on model) and is cached in the browser.

## Build for static hosting

```bash
npm run build
npm run preview
```

The `dist/` folder can be served by any static file host.

## Deploy to GitHub Pages

This repo includes [`.github/workflows/deploy-web.yml`](../.github/workflows/deploy-web.yml), which builds `web_interface/` and publishes `dist/` on every push to `main`.

1. **Commit and push** the `web_interface/` folder (and the workflow file) to GitHub.
2. In the repo on GitHub: **Settings → Pages → Build and deployment → Source** → choose **GitHub Actions**.
3. After the first successful workflow run, the site is live at:

   **https://xiaoouwang.github.io/Incognito/**

   (Project Pages URL: `https://<username>.github.io/<repo-name>/` — for this repo, [xiaoouwang/Incognito](https://github.com/xiaoouwang/Incognito).)

4. To redeploy without changing code: **Actions → Deploy web interface → Run workflow**.

`vite.config.js` uses `base: "./"` so asset paths work under the `/Incognito/` subpath. Users still need network access the first time they run NER so the browser can download model weights from Hugging Face.

## Differences from the desktop app

| Desktop (Electron) | Web |
| --- | --- |
| spaCy + CamemBERT (Python) | CamemBERT + BERT NER ONNX (Transformers.js) |
| Writes batch outputs to disk | Downloads batch outputs as ZIP |
| Label Studio batch anonymization | Not included (export only) |
| Fully offline after model install | Requires network once per model for download |

## Stack

- React 19 + Vite
- `@huggingface/transformers` (ONNX in Web Worker)
- JSZip for batch export

## License

Same as the parent project: [AGPLv3](../LICENSE).
