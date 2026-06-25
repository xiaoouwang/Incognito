# Incognito Web

Standalone, **client-side** web interface for [Incognito](../README.md) — one of two ways to anonymize qualitative text (alongside the desktop app). NER runs entirely in the browser via [Transformers.js](https://huggingface.co/docs/transformers.js) and ONNX Runtime WASM — no Python, no Electron, no server.

**Live demo:** [https://xiaoouwang.github.io/Incognito/](https://xiaoouwang.github.io/Incognito/)

> **Everything runs locally — your data never leaves your computer.**  
> Your text is analyzed in the browser, not on a remote server. The only internet use is a one-time download of the detection model; your documents are never uploaded.

## Features

- **ONNX NER** — French: CamemBERT + dates (default) or CamemBERT base; English: BERT NER; or any Hugging Face `token-classification` model with ONNX weights (custom)
- **Rule-based detection** — emails, URLs, dates, phone numbers (same patterns as the desktop app)
- **Interactive review** — category toggles, per-value exclusion, manual span add/remove, custom categories
- **Audit report** — Markdown traceability with provenance (automatic vs manual)
- **Label Studio export** — pre-annotations JSON + labeling config XML
- **Batch processing** — choose a **whole folder** or **hand-picked files** (`.txt`, `.docx`); review each document; download a timestamped ZIP with anonymized text, reports, and Label Studio JSON
- **Visible progress** — progress bars for model download and batch loading / NER
- **Installable PWA** — add to Dock / desktop from Chrome or Edge (no binary build)

## Quick start

```bash
cd web_interface
npm install
npm run dev
```

Open the URL shown in the terminal (typically http://127.0.0.1:5173).

**First NER run:** the selected ONNX model downloads from Hugging Face (~100–400 MB depending on model) and is cached in the browser. A **progress bar** shows the download status.

## Batch processing

1. **Choose folder** — load all supported `.txt` / `.docx` files in a directory (including subfolders).
2. **Choose files…** — pick specific documents without importing the whole folder.
3. Review each file (Previous / Next, jump by number or name).
4. **Download batch ZIP** when review is complete.

Progress bars show **document loading** and **batch NER** (`File 3 of 30`, current filename). Word `.doc` (legacy format) is not supported — use `.docx`.

## Build for static hosting

```bash
npm run build
npm run preview
```

The `dist/` folder can be served by any static file host.

## Deploy to GitHub Pages

This repo includes [`.github/workflows/deploy-web.yml`](../.github/workflows/deploy-web.yml), which builds `web_interface/` and publishes `dist/` when you push to `main` **and** the commit touches `web_interface/` (or the workflow file itself). Pushes that only change other parts of the repo do not trigger a redeploy.

1. **Commit and push** the `web_interface/` folder (and the workflow file) to GitHub.
2. In the repo on GitHub: **Settings → Pages → Build and deployment → Source** → choose **GitHub Actions**.
3. After the first successful workflow run, the site is live at:

   **https://xiaoouwang.github.io/Incognito/**

   (Project Pages URL: `https://<username>.github.io/<repo-name>/` — for this repo, [xiaoouwang/Incognito](https://github.com/xiaoouwang/Incognito).)

4. To redeploy without changing code: **Actions → Deploy web interface → Run workflow**.

`vite.config.js` uses `base: "./"` so asset paths work under the `/Incognito/` subpath. Users still need network access the first time they run NER so the browser can download model weights from Hugging Face.

## Install as an app (PWA)

Incognito is a **Progressive Web App**. After opening the live site:

1. **Chrome / Edge** — click **Install app** in the banner, or use the browser menu → *Install Incognito* / *Apps → Install this site*.
2. **macOS** — the installed app can live in the Dock like a native program.
3. **Safari** — limited PWA support; use Chrome or Edge for the best install experience.

No `.dmg`, `.exe`, or release binary is required — the installed app loads the same client-side site in a standalone window.

PWA files: `public/manifest.webmanifest`, `public/sw.js`, icons `pwa-192.png` / `pwa-512.png`.

## Desktop vs web

| Desktop (Electron) | Web |
| --- | --- |
| spaCy + CamemBERT (Python) | CamemBERT + BERT NER ONNX (Transformers.js) |
| Batch: folder of `.txt` on disk | Batch: folder **or** selected `.txt` / `.docx` → ZIP download |
| Writes batch outputs to disk | Downloads batch outputs as ZIP |
| Label Studio batch anonymization | Not included (export only) |
| Fully offline after model install | Requires network once per model for download |
| Installers (.dmg, .exe, AppImage) | URL or **PWA** install (Chrome / Edge) |

## Stack

- React 19 + Vite
- `@huggingface/transformers` (ONNX in Web Worker)
- [mammoth](https://www.npmjs.com/package/mammoth) — `.docx` text extraction
- JSZip for batch export

## License

Same as the parent project: [AGPLv3](../LICENSE).
