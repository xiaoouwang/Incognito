# Incognito Web

**Version 1.0.1** — standalone, **client-side** web interface for [Incognito](../README.md). One of two ways to anonymize qualitative text (alongside the desktop app). Detection runs in the browser — no Electron, no Python server required for the core UI (optional Albert API in generative API mode; optional local GLiNER2-PII sidecar under `gliner2_pii_server/`).

**Live app:** [https://xiaoouwang.github.io/Incognito/](https://xiaoouwang.github.io/Incognito/)

> **Everything runs locally — your data never leaves your computer.**
> Your text is analyzed in the browser, not on a remote server. The only internet use is a one-time download of detection models; your documents are never uploaded. *(API-based generative mode is the exception: text is sent to Albert with your API key.)*

## Anonymization modes

Use the toggle at the top of the workflow:

| Mode | Engine | Best for |
| ---- | ------ | -------- |
| **Basic anonymization** (default) | [GLiNER2-multi](https://huggingface.co/onnx-community/gliner2-multi-v1-agent-ONNX) or [GLiNER2-PII ONNX](https://huggingface.co/yethdev/gliner2-pii-onnx) | Local multi-label NER only (people, places, contacts, identity documents…) |
| **Advanced anonymization** | Same GLiNER2 engines + **ReLex** person graph | NER plus aliases / attributes / relations review |
| **Local generative anonymization** | Local generative pipeline | Generative review without the Albert cloud path (as configured) |
| **API-based generative anonymization** | [Albert](https://albert.api.etalab.gouv.fr/) chat API | LLM-built person graph / relations, then the same review tools |

Shared review layer (Advanced + generative):

1. **Detect** (or run generative)
2. **Review** categories, soft-exclude values, edit spans
3. **Person graph** — cards + **Show person graph** (react-force-graph overlay)
4. **Export** anonymized text, audit / Label Studio (Basic & Advanced), and person-graph **CSV** / **CSV by person**

Replacements: **placeholders**, **pseudonyms**, or **generalization ladders** (level 1–3 / mask). Placeholders stay short and stable — e.g. `[PER_1]`, `[LOC_1]`, `[EMA_1]`.

This is an **anonymization assistant**, not a guarantee of full anonymization. Always read the output before sharing or archiving.

## Features

### Basic anonymization (GLiNER2 NER only)

- **Model choice** — GLiNER2-multi (~fp16) or quantized GLiNER2-PII ONNX
- **Custom entity labels** — built-in chips (person, organization, location, address, email, phone, identity document number, date, age, …) plus free-form labels
- **Rule-based detection** — emails, URLs, phones, dates where applicable
- **Pre-loaded demo** — sample interview ready to explore without downloading a model on first open
- **Batch** — folder or files (`.txt`, `.docx`), processing **waves** (all at once / 1 / 5 / 10 / 25)

### Advanced anonymization (GLiNER2 + ReLex)

- Same detection stack as Basic, plus **person graph** built with GLiNER ReLex (demo uses a captured fixture so the graph appears without waiting for the relation model)
- Soft-exclude sync between category chips and graph cards
- **Show person graph** — full-page **react-force-graph-2d** overlay (drag, zoom, Esc to close)
- CSV exports (long form and one row per person)

### Generative modes

- **Local** / **API-based** tabs — API mode needs an Albert key; production Pages builds use the Cloudflare CORS proxy under [`albert-proxy/`](albert-proxy/)
- Same person-graph review and force-graph overlay as Advanced

### Shared review & export

- **Interactive review** — category toggles, per-value exclusion, manual span add/remove
- **Audit report** / **Label Studio** — Basic & Advanced
- **FR / EN UI** — language toggle in the header
- Sample corpora under [`samples/`](samples/) (FR interviews + EN/DE/IT/ES snippets)

## Quick start (local)

```bash
cd web_interface
npm install
npm run dev
```

Open the URL printed by Vite (default `http://127.0.0.1:5173`).

The app opens in **Basic anonymization** with a pre-loaded sample demo.

**First run on your own text:** the selected ONNX model downloads from Hugging Face and is cached in the browser. Progress bars show download and detection status.

## Build for static hosting

```bash
npm run build
npm run preview
```

The `dist/` folder can be served by any static file host.

## Deploy to GitHub Pages

This repo includes [`.github/workflows/deploy-web.yml`](../.github/workflows/deploy-web.yml), which builds `web_interface/` and publishes `dist/` when you push to `main` **and** the commit touches `web_interface/` (or the workflow file itself).

1. **Commit and push** the `web_interface/` folder (and the workflow file) to GitHub.
2. In the repo on GitHub: **Settings → Pages → Build and deployment → Source** → choose **GitHub Actions**.
3. After the first successful workflow run, the site is live at **https://xiaoouwang.github.io/Incognito/**

4. To redeploy without changing code: **Actions → Deploy web interface → Run workflow**.

`vite.config.js` uses `base: "./"` so asset paths work under the `/Incognito/` subpath.

## Stack

- React 19 + Vite
- GLiNER2 ONNX (multi / PII) + optional ReLex for Advanced
- `react-force-graph-2d` — person-graph network overlay
- Albert HTTP API — API-based generative mode (+ Cloudflare Worker proxy for Pages)
- [mammoth](https://www.npmjs.com/package/mammoth) — `.docx` text extraction
- JSZip for batch export

## License

Same as the parent project: [AGPLv3](../LICENSE).
