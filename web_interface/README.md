# Incognito Web

**Version 1.0.3** — standalone, **client-side** web interface for qualitative text anonymization. Detection runs in the browser — no Electron, no Python server required for the core UI (optional Albert API in generative API mode; optional local GLiNER2-PII sidecar under `gliner2_pii_server/`).

**1.0.3 highlights** — change entity category (one/all + custom); same-code / distinct-occurrence controls; compact entity menu that stays on-screen; no duplicate category chips; NER-surface codes by first appearance; person-graph regenerate respects distinct occurrences.

**1.0.2 highlights** — NER/ReLex on Web Workers for long interviews; text pagination; chip **×** / **↩** (remove detection vs soft-exclude with eye); batch load normalizes classic Mac `\r` newlines; taller audit report window.

**Live app (canonical):** [https://mshs-sud-est.gitpages.huma-num.fr/incognito/](https://mshs-sud-est.gitpages.huma-num.fr/incognito/) · mirror: [https://xiaoouwang.github.io/Incognito/](https://xiaoouwang.github.io/Incognito/)

**Source:** [GitLab Huma-Num](https://gitlab.huma-num.fr/mshs-sud-est/incognito) · mirror: [GitHub](https://github.com/xiaoouwang/Incognito)

> **Everything runs locally — your data never leaves your computer.**
> Your text is analyzed in the browser, not on a remote server. The only internet use is a one-time download of detection models; your documents are never uploaded. *(API-based generative mode is the exception: text is sent to Albert with your API key.)*

> **Project focus** — Incognito is **web-only**. The former Electron desktop app was dropped: multi-OS desktop packaging is less sustainable to maintain; the browser app covers the same local-privacy workflow with a single deploy path.

## Anonymization modes

Use the toggle at the top of the workflow:

| Mode | Engine | Best for |
| ---- | ------ | -------- |
| **Basic anonymization** (default) | [GLiNER2-multi](https://huggingface.co/onnx-community/gliner2-multi-v1-agent-ONNX) or [GLiNER2-PII ONNX](https://huggingface.co/yethdev/gliner2-pii-onnx) | Local multi-label NER only |
| **Advanced anonymization** | Same GLiNER2 engines + **ReLex** person graph | NER plus aliases / attributes / relations |
| **Local generative anonymization** | Local generative pipeline | Generative review without the Albert cloud path (as configured) |
| **API-based generative anonymization** | [Albert](https://albert.api.etalab.gouv.fr/) chat API | LLM-built person graph / relations, then the same review tools |

Shared review layer (Advanced + generative):

1. **Detect** (or run generative)
2. **Review** categories, soft-exclude values, edit spans
3. **Person graph** — cards + **Show person graph** (react-force-graph overlay)
4. **Export** anonymized text, audit / Label Studio, person-graph CSV, or **Export everything**

Replacements: **placeholders**, **pseudonyms**, or **generalization ladders** (level 1–3 / mask).

This is an **anonymization assistant**, not a guarantee of full anonymization. Always read the output before sharing or archiving.

## Features

### Basic anonymization (GLiNER2 NER only)

- **Model choice** — GLiNER2-multi (~fp16) or quantized GLiNER2-PII ONNX
- **Custom entity labels** — built-in chips plus free-form labels
- **Rule-based detection** — emails, URLs, phones, dates where applicable
- **Pre-loaded demo** — sample interview ready to explore
- **Batch** — folder or files (`.txt`, `.docx`), processing **waves**

### Advanced anonymization (GLiNER2 + ReLex)

- Same detection stack as Basic, plus **person graph** via GLiNER ReLex
- Soft-exclude sync between category chips and graph cards
- **Show person graph** — full-page **react-force-graph-2d** overlay
- CSV exports (long form and one row per person)

### Generative modes

- **Local** / **API-based** tabs — API mode needs an Albert key; production Pages builds use the Cloudflare CORS proxy under [`albert-proxy/`](albert-proxy/)
- Same person-graph review and force-graph overlay as Advanced

### Shared review & export

- Interactive review, audit report, Label Studio, FR/EN UI
- Sample corpora under [`samples/`](samples/)

## Quick start (local)

```bash
cd web_interface
npm install
npm run dev
```

Or from the repo root: `npm run dev` (delegates here).

Open the URL printed by Vite (default `http://127.0.0.1:5173`).

## Build for static hosting

```bash
npm run build
npm run preview
```

The `dist/` folder can be served by any static file host.

## Deploy

`vite.config.js` uses `base: "./"` so asset paths work under both `/incognito/` (Huma-Num GitLab) and `/Incognito/` (GitHub mirror) subpaths. The Albert CORS Worker allowlists both Pages origins.

### Huma-Num GitLab Pages (canonical)

[`.gitlab-ci.yml`](../.gitlab-ci.yml) builds the app for [mshs-sud-est/incognito](https://gitlab.huma-num.fr/mshs-sud-est/incognito).

1. Push `main` to `https://gitlab.huma-num.fr/mshs-sud-est/incognito.git`.
2. After a green `pages` job: **https://mshs-sud-est.gitpages.huma-num.fr/incognito/**
3. Redeploy: **Build → Pipelines → Run pipeline**.

### GitHub Pages (mirror)

[`.github/workflows/deploy-web.yml`](../.github/workflows/deploy-web.yml) publishes when `main` touches `web_interface/` (or the workflow file).

1. Push the same `main` to the GitHub mirror.
2. Site mirror: **https://xiaoouwang.github.io/Incognito/**

## Stack

- React 19 + Vite
- GLiNER2 ONNX (multi / PII) + optional ReLex for Advanced
- `react-force-graph-2d` — person-graph network overlay
- Albert HTTP API — API-based generative mode (+ Cloudflare Worker proxy for Pages)
- [mammoth](https://www.npmjs.com/package/mammoth) — `.docx` text extraction
- JSZip for batch export

## License

Same as the parent project: [AGPLv3](../LICENSE).
