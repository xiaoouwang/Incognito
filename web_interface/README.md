# Incognito Web

**Version 1.0.0** — standalone, **client-side** web interface for [Incognito](../README.md). One of two ways to anonymize qualitative text (alongside the desktop app). NER runs in the browser — no Python, no Electron, no server (except optional Albert API calls in Generative mode).

**Live app:** [https://xiaoouwang.github.io/Incognito/](https://xiaoouwang.github.io/Incognito/)

> **Everything runs locally — your data never leaves your computer.**
> Your text is analyzed in the browser, not on a remote server. The only internet use is a one-time download of detection models; your documents are never uploaded. *(Generative mode is the exception: text is sent to Albert with your API key.)*

## Three anonymization modes

Use the toggle at the top of the workflow:

| Mode | Engine | Best for |
| ---- | ------ | -------- |
| **Basic anonymization** (default) | CamemBERT (+ dates), BERT English, custom Hugging Face ONNX | People, places, organisations, dates in French qualitative text |
| **Advanced anonymization** | [GLiNER](https://github.com/urchade/GLiNER) multi-label NER | Finer protocols — health, diplomas, job titles, nationality, custom labels |
| **Generative anonymization** | [Albert](https://albert.api.etalab.gouv.fr/) chat API | LLM-built person graph / relations, then the same review tools |

All three modes share the **person graph** review layer:

1. **Detect** (or run Albert)
2. **Review** categories, soft-exclude values, edit spans, attach surfaces with **Related to**
3. **Focus** person chips above the highlighted text (focus only — does not change anonymization)
4. **Export** anonymized text, audit / Label Studio (Basic & Advanced), and person-graph **CSV** / **CSV by person**

Replacements use **short stable placeholders**: three letters from the category + number — e.g. `[PER_1]`, `[PER_2]`, `[LOC_1]`, `[ORG_1]`, `[EMA_1]`, `[NAT_1]`.

This is an **anonymization assistant**, not a guarantee of full anonymization. Always read the output before sharing or archiving.

## Features

### Basic anonymization (CamemBERT)

- **ONNX NER** — French: CamemBERT + dates (default) or CamemBERT base; English: BERT NER; or any Hugging Face `token-classification` model with ONNX weights (custom)
- **Rule-based detection** — emails, URLs, dates, phone numbers (same patterns as the desktop app)
- **All occurrences** — each detected value is expanded to every matching occurrence in the document
- **Pre-loaded demo** — sample interview (Claire / Julien) with entities ready to explore (no model download on first open)

### Advanced anonymization (GLiNER)

- **Custom entity labels** — choose from 15 built-in types (person, organization, location, disease, diploma, nationality, …) or add categories manually during review
- **Regex-first contact details** — emails, URLs, and phone numbers are detected with regular expressions (preferred over GLiNER when spans overlap)
- **Chunked inference** — long texts are split into segments; progress reflects each segment
- **Pre-loaded demo** — Jean Dupont biography with example spans (explore labels without downloading the model)
- **Score threshold** — adjustable GLiNER confidence (default 0.2)

### Generative anonymization (Albert)

- **API key + model** — paste your Albert key; choose a chat model
- **Person / relation graph** from the model response, then soft-exclude and Related to like the other modes
- **Sample text** for a first run without your own corpus

### Person graph (all web modes)

- Built after detection via French **UDPipe** (WASM, French-GSD ~23 MB, **CC BY-NC-SA**, cached) or proximity fallback
- Soft-exclude sync between category chips and graph cards (updates anonymized preview)
- Person chips above highlighted text for focus/underline only
- Manual **Related to** from entity click menus
- **Export CSV** (one row per surface) and **Export CSV by person** (one row per person)

### Shared review & export

- **Layout** — categories · highlighted text · person graph · anonymized preview (full-width bottom row)
- **Interactive review** — category toggles, per-value exclusion, manual span add/remove, custom categories
- **Audit report** — Markdown traceability with provenance (automatic vs manual) — Basic & Advanced
- **Label Studio** — JSON pre-annotations + XML config download — Basic & Advanced
- **Batch mode** — choose a folder or pick files (`.txt`, `.docx`); Previous / Next; jump by number or name; ZIP download with anonymized text, report, and Label Studio JSON
- **Visible progress** — model download, GLiNER segment detection, batch loading, and batch detection
- **FR / EN UI** — language toggle in the header

## Quick start (local)

```bash
cd web_interface
npm install
npm run dev
```

Open the URL printed by Vite (default `http://127.0.0.1:5173`).

The app opens in **Basic anonymization** with a pre-loaded sample demo. Switch to **Advanced** or **Generative** as needed.

**First run on your own text:**

- **Basic** — CamemBERT ONNX downloads from Hugging Face (~100–400 MB depending on model) and is cached in the browser. After detection, the person graph may download UDPipe French-GSD (~23 MB).
- **Advanced** — GLiNER ONNX (`model_q4f16.onnx`, ~472 MB) downloads once and is cached; then the same person graph / focus underlines as Basic.
- **Generative** — requires an Albert API key; no local NER model download.

Progress bars show download and detection status.

## Using the app

### Basic mode

1. Explore the **pre-loaded demo** or paste your own text.
2. Choose a **NER backend** (French CamemBERT + dates by default).
3. Click **Run Anonymization**.
4. Review **Categories & entities** and the **Person graph**. Soft-exclude stays in sync; use person chips only to focus.
5. Copy anonymized text, open the **audit report**, **export to Label Studio**, or export the graph as CSV.

Key files: `src/lib/sampleDemo.js` · `src/lib/basicPersonGraph.js` · `src/hooks/usePersonGraphPanel.js` · `src/depWorker.js` · `src/components/CamembertWorkflowSection.jsx`

### Advanced mode

1. Select **entity labels** to detect (chips above the batch panel).
2. Paste text or use the **Jean Dupont** sample demo.
3. Click **Run GLiNER detection**.
4. Review **Categories & entities** and the **Person graph** (GLiNER labels map to attributes).
5. Export as in basic mode.

Key files: `src/lib/glinerRuntime.js` · `src/lib/glinerSampleDemo.js` · `src/components/GlinerWorkflowSection.jsx`

### Generative mode

1. Enter your **Albert API key** and choose a model.
2. Paste text or use the sample, then run generative anonymization.
3. Review the person graph / highlights; soft-exclude and Related to as needed.
4. Export person-graph CSVs; copy anonymized text.

Key files: `src/lib/albertClient.js` · `src/lib/albertEdit.js` · `src/components/GenerativeWorkflowSection.jsx`

## Batch processing

1. **Choose folder** — load all supported `.txt` / `.docx` files in a directory (including subfolders).
2. **Choose files…** — pick specific documents without importing the whole folder.
3. Review each file (Previous / Next, jump by number or name).
4. **Download batch ZIP** when review is complete (`*-anonymized.txt`, `*-report.md`, `*-label-studio.json`).

Progress bars show **document loading** and **batch detection**. Word `.doc` (legacy format) is not supported — use `.docx`.

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

## Desktop vs web

| Desktop (Electron)                | Web                                                           |
| --------------------------------- | ------------------------------------------------------------- |
| spaCy + CamemBERT (Python)        | CamemBERT + BERT NER ONNX + GLiNER + Generative (Albert) + person graph |
| Batch: folder of `.txt` on disk   | Batch: folder **or** selected `.txt` / `.docx` → ZIP download |
| Writes batch outputs to disk      | Downloads batch outputs as ZIP                                |
| Label Studio batch anonymization  | Not included (export only)                                    |
| Fully offline after model install | Requires network once per model for download (and Albert if generative) |
| Installers (.dmg, .exe, AppImage) | Browser URL — no installer                                    |

## Stack

- React 19 + Vite
- `@huggingface/transformers` (ONNX in Web Worker) — basic mode
- `gliner` (ONNX Runtime WASM) — advanced mode
- `udpipe-wasm` — French dependency parse for the person graph
- Albert HTTP API — generative mode
- [mammoth](https://www.npmjs.com/package/mammoth) — `.docx` text extraction
- JSZip for batch export

## License

Same as the parent project: [AGPLv3](../LICENSE).
