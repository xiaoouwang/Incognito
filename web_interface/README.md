# Incognito Web

**Version 1.0.5** — standalone, **client-side** web interface for qualitative text anonymization. Detection runs in the browser — no Electron, no Python server required for the core UI (optional Albert API in generative API mode; optional local GLiNER2-PII sidecar under `gliner2_pii_server/`).

**1.0.5 highlights** — **Save / Open session** for Basic & Advanced (single document + full batch). Session JSON is Incognito’s own format (not Label Studio). Batch export ZIP embeds the same session data. Round-trip Vitest coverage for session fields. **Not** implemented for generative modes.

**1.0.4 highlights** — batch remove respects All matching / this occurrence; add-menu word-match count skips emails and overlapping longer spans (e.g. Marie inside Marie Dupont).

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

## Session save / open (Basic & Advanced)

Incognito can pause and resume anonymization without re-running NER.

| Mode | Save | Open |
| ---- | ---- | ---- |
| **Single document** | **Save session** → `incognito.session` JSON | **Open session** → restore that file |
| **Batch** | **Save batch session** → one `incognito.session.batch` JSON with **every** file | **Open session** → restore the whole batch (or open an export ZIP that contains `incognito-batch-session.json`) |

**What is stored:** source text, entities, removed spans, category toggles, exclusions, replacement methods, surface overrides, linked/distinct codes, optional anonymized-text override, and (Advanced) the person-graph snapshot.

**What is not stored:** audit Markdown, anonymized `.txt`, correspondence CSV — those are **rebuilt on export** from the restored state.

**Out of scope:** generative modes (local / Albert API). Label Studio JSON remains export-only.

## Tests (session round-trip)

From `web_interface/`:

```bash
npm test          # once
npm run test:watch
```

The suite lives in [`src/lib/sessionDocument.roundtrip.test.js`](src/lib/sessionDocument.roundtrip.test.js).

### What a round-trip test is

1. Build a rich “live” review fixture (the maps and spans a user would have after annotating).
2. Call `buildSessionDocument` / `buildBatchSessionDocument` (same builders as **Save session**).
3. `JSON.stringify` — the download / disk boundary.
4. Call `parseAnySessionDocument` (same path as **Open session**).
5. Assert durable fields are still equal (categories, exclusions, linked codes, graph, etc.).

If you add a new feature that must survive Save/Open, extend `makeReviewFixture()` and add an assertion. If the builder or parser forgets the field, the test fails. That catches **schema drift**; it does **not** prove the React UI wiring is bug-free.

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

`vite.config.js` uses `base: "./"` so asset paths work under `/incognito/` (Huma-Num), `/Incognito/` (GitHub mirror), **and** frozen version paths like `/incognito/v1.0.5/`. The Albert CORS Worker allowlists both Pages origins.

### Versioned Pages paths

Each CI deploy publishes:

| Path | Meaning |
| ---- | ------- |
| `/` (site root) | Latest build |
| `/vX.Y.Z/` | Frozen snapshot of that app version |
| `/versions.html` | Human index of frozen versions |
| `/versions.json` | Machine-readable list |

Older `/v*` folders are carried forward from the previous Pages tree (GitLab: last `pages` artifact; GitHub: `gh-pages` branch mirror), so colleagues can fall back in the browser if a new release breaks something — no local install.

Assembler: [`scripts/assembleVersionedPages.mjs`](scripts/assembleVersionedPages.mjs).

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
