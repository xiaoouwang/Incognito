# Incognito Web — design & code evolution (day one → 1.0.0)

This document tracks **what changed**, **why**, and **where in the code**, from the first decision to ship a standalone browser UI through the **1.0.0** release (person graph, Related to, generative Albert mode, CSV exports).

It is a product/engineering journal for the `web_interface/` track. Desktop Electron history is out of scope except where it motivated the web fork.

**Companion links**

- Live app: https://xiaoouwang.github.io/Incognito/
- Working chat that drove much of this arc: [Incognito web evolution](ac144e07-78b7-4d8e-93a1-1dae8a212c26)
- Release commit (1.0.0): `7d1a6da` on `main`

---

## How to read this document

Each phase has:

1. **Intent** — user need / product reason  
2. **Design decisions** — UX and information architecture  
3. **Code / stack changes** — main files and mechanisms  
4. **Outcomes / lessons** — bugs fixed, trade-offs

Versions mentioned:

| Version | Meaning |
| ------- | ------- |
| pre-0.3 | Early web port and UX hardening |
| **0.3.0** | Basic anonymization (CamemBERT) stabilized |
| **0.4.0** | Advanced anonymization (GLiNER) + dual-mode UI |
| **1.0.0** | Person graph + generative mode + relation editing (exit 0.x) |

---

## Phase 0 — Product framing (before the first commit)

**Intent.** Incognito desktop (Electron + Python NER) was mature enough that a **local, client-side web** derivative made sense: same interactive review, but Transformers.js / ONNX in the browser, no Electron/Python install for many users.

**Design.** Keep the human-in-the-loop review (categories, exclude, manual spans, audit, Label Studio). Replace the Python NER backend with browser ONNX.

**Code.** Greenfield under `web_interface/` (Vite + React), separate from the Electron app but shared conceptual workflow.

---

## Phase 1 — Birth of `web_interface/` (CamemBERT / Transformers.js)

### Intent

Adapt desktop functions into a standalone web app in `@web_interface`.

### Design decisions

- Privacy messaging must be clear for non-CS researchers: models download once; **documents stay in the browser**.
- Early clarification: downloading ONNX weights from Hugging Face is **not** uploading user text.
- Category set initially limited by the chosen CamemBERT NER model; users asked for stronger / more models.

### Code / stack

- Vite + React SPA
- `@huggingface/transformers` in a Web Worker for token-classification ONNX
- Interactive review UI ported/adapted from desktop patterns
- Model options evolved:
  - Fixed CamemBERT NER (quantized path issues → better default)
  - **CamemBERT + dates** set as **default** (best qualitative results)
  - English BERT NER option
  - Custom Hugging Face ONNX model URL field

### Outcomes / lessons

- Wrong/missing ONNX files (`model_quantized.onnx`) caused hard failures → careful model registry and defaults.
- Batch “choose folder → nothing happens” needed clearer loading + progress.
- spaCy is **not** practical in pure WASM the way CamemBERT ONNX is; keep spaCy on desktop.

---

## Phase 2 — Deploy, branding, privacy, i18n, PWA experiments

### Intent

Ship on GitHub Pages (`xiaoouwang/Incognito`), rebrand away from old `anonymizer` URLs, position Incognito as **desktop + web**.

### Design decisions

- Auto-deploy only when `web_interface/` changes (not every desktop commit).
- Citation / SEO title oriented to social sciences privacy tooling.
- Strong privacy copy + “Details here” modal (non-technical, open-source angle).
- FR/EN UI toggle for chrome strings (not necessarily category names / audit body).
- Statcounter analytics snippet integrated for the public site.
- Explored “desktop = thin WebView / PWA shell” instead of heavy Electron rebuilds; PWA install hints later removed to reduce clutter.
- PWA offline: install ≠ offline forever; models/cache rules still apply.

### Code

- GitHub Actions `deploy-web.yml` path filters
- `PrivacyPromise`, `PrivacyDetailsWindow`, `uiStrings.js` locale maps
- README / credits / repo URL sweeps to `Incognito`

### Outcomes

- Contributors list on GitHub can lag history rewrites; deleting the repo is drastic and history-risky (documented as advice, not a product feature).

---

## Phase 3 — Batch UX, progress bars, sample demo, 0.3.0

### Intent

Make batch review usable for real corpora; make first open educational without a model download.

### Design decisions

- Batch: whole folder **or** pick files; `.txt` and `.docx` (mammoth).
- Jump-to-file controls on the **same row** as Previous/Next.
- Visible **progress bars** for model download, file load, and detection (single-file must not jump to 100% incorrectly).
- Button label: **Run Anonymization** (not “Run NER”).
- Preloaded **toy demo** (Claire / Julien interview) with entities already set so users explore review tools before downloading models.
- Expand detections to **all occurrences** of a value (bug: only first span highlighted).

### Code

- `batchLoad.js`, ZIP export, `ModelProgress` / `BatchJobProgress`
- `sampleDemo.js` + demo restore
- Occurrence expansion in entity finalization

### Version

- Raised to **0.3.0** — “basic anonymization” (person → `[PER_1]`, etc.) considered stable.

---

## Phase 4 — Decoder experiments → Advanced GLiNER → 0.4.0

### Intent

Finer labels than fixed CamemBERT types (health, diploma, job role, nationality…).

### Design decisions

1. Tried a **decoder / generative** Transformers.js path with prompts → unusable outputs; parked.
2. Switched to **GLiNER** `onnx-community/gliner_multi-v2.1` as Advanced mode.
3. Dual UI: **Basic anonymization** / **Advanced anonymization** toggles; separate sections, same review capabilities (batch, audit, export), no interference.
4. Copy rewritten for researchers (not ONNX jargon).
5. Hero simplified to three beats: detect → review → audit report.
6. GLiNER toy demo (Jean Dupont) like Basic.
7. Labels expanded over iterations: nationality, disease, diploma, job title/project role; threshold default **0.2**.
8. Regex preferred for **email / URL / phone** over GLiNER.
9. Progress for GLiNER must reflect chunked inference; cache ONNX so re-runs don’t re-download.
10. Placeholders: first **three letters** of category (`[PER_1]`, `[NAT_1]`…).
11. Synced scroll between highlighted text and anonymized preview.
12. Layout: larger text panels; categories slightly smaller; app width ~1600px.
13. Version banner became the privacy/version strip: **0.4.0 Advanced anonymization**.

### Code

- Branch work for decoder then GLiNER (`feature/decoder-anonymization` merged to `main`)
- `GlinerWorkflowSection`, `glinerRuntime.js`, `glinerSampleDemo.js`, `glinerConstants.js`
- Service-worker / hard-refresh blank page issues around caching addressed carefully
- Manual edit menus; Advanced category chips driven by **selected labels**

### Outcomes

- GLiNER is flexible but weaker on short French LOCs/professions → documented honestly; Basic remains default.
- SEO metadata added without changing visible UI copy.

---

## Phase 5 — Generative anonymization (Albert API)

### Intent

Third mode: LLM proposes a person-centric anonymization graph; client builds preview.

### Design decisions

- Mode toggle: Basic / Advanced / **Generative**.
- Albert key + model picker; Vite **proxy** (CORS blocks direct browser calls from GitHub Pages).
- Early approach (full anonymized text JSON) truncated → pivot to **compact entity/graph JSON**, client-side replacement.
- Output minimization iterated: drop repeated placeholders, prefer span/token indices, raise `max_tokens` / completion ceiling.
- Sample text tuned (Claire Martin administrative dossier); later shortened / trimmed when UI or truncation issues appeared.
- Relation tree visualization desired (colors; avoid SVG if possible); inter-person relation arrows later **hidden** to reduce noise.
- Manual edit parity with Basic: soft-exclude (gray, not hard-delete), category-style panel, custom categories.
- Generative CSS isolated (`generativeWorkflow.css`) after class collisions blanked the page.
- Sync scroll + three-column-like workspace: categories, source, graph/preview.

### Code

- `GenerativeWorkflowSection`, `albertClient.js`, `albertEdit.js`, `albertHighlight.js`, `albertCandidates.js`, `albertConstants.js`
- `scripts/benchmark_albert.py` for latency/output experiments
- Soft-exclude maps: `excludedPlaceholders`, `excludedSurfaces`, synced with category chips

### Privacy caveat

- Generative mode **does** send text to Albert (user’s key). All other modes stay fully local after model download. Documented in READMEs.

---

## Phase 6 — Person graph for Basic (UDPipe) and Advanced (GLiNER)

### Intent

Bring generative-style **person-wise** editing to Basic/Advanced without requiring Albert.

### Design decisions

- Web dependency parse via **UDPipe WASM** + French-GSD (~23 MB, CC BY-NC-SA, cached) preferred over shipping spaCy to the browser.
- Graph builder: `buildBasicPersonGraph` — governor-share + proximity merge (UDPipe alone under-links attributes).
- Soft-exclude synced between graph and Categories & entities.
- Person **underline focus** (not recolor) on hover/pin — category colors already used for NER.
- Sparse graph / click not updating preview: matching entities by text; don’t clear exclusions on async dep rebuild; paragraph nearest-other ownership (Julien stealing Claire’s attrs).
- spaCy would help linking more than discovery → user chose **GLiNER graph** next: richer spans map into the same graph (`LABEL_TO_ATTR` for address, profession, family, school, …).
- Shared hook `usePersonGraphPanel` for Advanced; Basic initially inlined then aligned behaviorally.

### Code

- `depWorker.js`, `useDepWorker.js`, `udpipeAlign.js`, `udpipeConstants.js`
- `basicPersonGraph.js`, `personFocus.js`, `PersonGraphCard.jsx`
- `CamembertWorkflowSection` / `GlinerWorkflowSection` graph mounting

---

## Phase 7 — Global layout (1.0.0 information architecture)

### Intent

Categories and person graph must not fight for one sidebar; anonymized preview is secondary.

### Design evolution

1. Stacked sidebar (categories + graph) with taller graph min-height.  
2. Four columns L→R: Categories · Highlighted text · Anonymized preview · Person graph.  
3. Final layout: **three panels on the first row** (Categories · Highlighted text · Person graph); **anonymized preview full-width underneath** (less important).

Applied globally to Basic, Advanced, and Generative (`workspace-four-col` / `gen-workspace` CSS).

---

## Phase 8 — Manual “Related to”, focus chips, soft-exclude rules

### Intent

Users must correct wrong automatic attachments; focus a person without changing anonymization; soft-exclude must still change anonymized text when intended.

### Design decisions

| Interaction | Effect on highlighted UI | Effect on anonymized preview |
| ----------- | ------------------------ | ---------------------------- |
| Person chips (click) | Focus / underline related surfaces; click again clears focus | **None** |
| Graph × / category chip soft-exclude / entity menu exclude | Gray out | **Yes** — drop from replacement set |
| Related to (entity menu) | Reattach surface as attr or alias | Rebuild graph; replacements follow |

- Related to first on Basic/Advanced (`EntityEditMenu` + relation overrides that survive UDPipe rebuilds); then Generative (`GenerativeEditMenu` + `relateSurfaceToPerson`).
- Generative title **Paste text → Highlighted text** when relation view is on.
- Bug `[PER_1] Martin`: excluding full name while shorter alias still replaced → generative rebuild temporarily made *all* soft-exclude visual-only (too aggressive) → restored soft-exclude for anonymization with nested-alias safety; chips made **focus-only**.

### Code

- `applyRelationOverrides` / `relateEntityToPerson` (Basic/Advanced)
- `relateSurfaceToPerson` (Generative)
- `PersonFocusChips.jsx` + chips in `GenerativeRelationView`
- `rebuildGenerativeOutputs` soft-exclude + substring alias guard

---

## Phase 9 — Person graph CSV exports & 1.0.0 release

### Intent

Export the graph for analysis/archiving; mark the release as a **major** version because relation + generative are first-class.

### Design decisions

- **Export CSV** — long form: one row per name / alias / coref / attr / rel.  
- **Export CSV by person** — one row per person; columns for aliases, corefs, attr types, rels.  
- Version **1.0.0** (web); desktop remains **0.3.0** in installers until bumped separately.  
- README + web README + UI banner updated; pushed to `main`.

### Code

- `personGraphCsv.js`, `PersonGraphExportButton.jsx`
- `web_interface/package.json` `1.0.0`, `uiStrings.versionNumber`

---

## Exact date change log

Calendar dates and clock times below are **authoritative where a git commit or chat timestamp exists**. Timezone is **Europe/Paris (UTC+2)** unless noted. Source tags:

- **git** — `git log` author date on `main` (or noted branch)
- **chat** — working-session timestamp ([Incognito web evolution](ac144e07-78b7-4d8e-93a1-1dae8a212c26)); used when several design steps landed in one release commit
- **inferred** — same calendar day as surrounding git/chat evidence; no finer clock time

Phases 5–9 (generative, person graph, Related to, CSV, 1.0.0) were developed and shipped on **2026-10-02**; earlier web history is mostly **2026-06-25 → 2026-06-26**, with SEO on **2026-07-20**.

### 2026-06-25 — Birth of the web UI through i18n / PWA cleanup

| Time | Change | Reason | Source |
| ---- | ------ | ------ | ------ |
| ~morning (before 13:23) | Product decision: fork a **client-side** `web_interface/` (Vite + React + Transformers.js/ONNX) from the mature desktop app | Local browser anonymization without Electron/Python for many users | chat + inferred |
| 13:23 | **`6137a1a`** — first `web_interface/` tree + GitHub Pages deploy workflow; `package.json` **0.1.0** | Ship a standalone browser app | git |
| 13:23 | **`a321268`** — README: Incognito = desktop + web; repo URL fixes | Positioning and citations | git |
| 13:23 | **`6371c28`** — longer citation title; path-filtered web deploy triggers | Avoid redeploying Pages on pure desktop commits | git |
| 13:36 | **`cb8f01e`** — version / privacy banner | Visible product identity and privacy promise | git |
| afternoon (same day, before batch commit) | Model registry hardening; CamemBERT+dates as default; English NER option; custom HF ONNX URL; privacy copy clarifications (download ≠ upload text) | Wrong ONNX paths failed; dates model qualitatively best; researchers need clear privacy language | chat + inferred |
| 15:07 | **`e21be02`** — progress bars, `.docx` (mammoth), folder **or** file open modes; PWA assets/SW | Batch UX and loading feedback for real corpora | git |
| 15:40 | **`28f9f7c`** — simpler interface wording (“Run Anonymization”, researcher-facing copy) | Drop NER jargon | git |
| 15:50 | **`cf7f7ef`** — manipulable toy demo (Claire / Julien) | Explore review UI before downloading models | git |
| 17:06 | **`9a67ddb`** — FR/EN UI (`uiStrings`, locale context, privacy details) | Bilingual chrome for FR/EN users | git |
| 17:26 | **`70de9b5`** — remove install-as-app / PWA clutter | Install ≠ offline forever; reduce UI noise | git |

### 2026-06-26 — Basic 0.3.0 and Advanced 0.4.0 (GLiNER)

| Time | Change | Reason | Source |
| ---- | ------ | ------ | ------ |
| 10:59 | **`6e93ae6`** — expand NER highlights to **all occurrences** of a value | Bug: only the first span was highlighted | git |
| 11:30 | **`b1be9ae`** — release **0.3.0** (was 0.1.0) | Basic CamemBERT anonymization considered stable | git |
| same day (pre-merge) | Decoder / generative Transformers.js experiment tried then **abandoned** | Outputs unusable for controlled anonymization | chat + inferred |
| 16:56 | **`cd85522`** — **Advanced anonymization (GLiNER)** dual-mode UI; CamemBERT extracted to `CamembertWorkflowSection`; regex email/URL/phone; synced scroll; placeholders; layout/copy overhaul | Finer labels (nationality, disease, diploma, job…); keep Basic intact | git |
| 17:00 | **`c92f3c0`** (branch history) — parallel “advance anonymization / GLiNER” interface note | Same Advanced track | git |
| 17:02 | **`055ae10`** — READMEs; `package.json` **0.4.0** | Document Advanced mode and bump version | git |

*(Root README historically labeled 0.3.0 / 0.4.0 under 2026-06-25; git author dates for those releases are **2026-06-26**.)*

### 2026-07-20 — SEO only

| Time | Change | Reason | Source |
| ---- | ------ | ------ | ------ |
| 16:16 | Request: SEO without changing visible UI copy | Discoverability for the public Pages site | chat |
| 16:19 | **`9b9571d`** — `index.html` meta, `robots.txt`, `sitemap.xml`, manifest tweaks | Implement SEO request | git |

### 2026-10-02 — Generative Albert, person graph, layout 3+1, Related to, CSV, **1.0.0**

All of the following were built in one working session and landed in release commit **`7d1a6da`** at **20:01**. Times are chat timestamps for *when the decision/work was driven*; code first appeared on `main` at the release commit.

| Time | Change | Reason | Source |
| ---- | ------ | ------ | ------ |
| 14:45 | Local Vite preview for Generative work | Iterate Albert mode without waiting on Pages | chat |
| 14:55–15:59 | Albert key/model wiring; longer sample; CORS → Vite **proxy**; JSON truncation → **compact entity/graph JSON** + client replace; raise `max_tokens`; `scripts/benchmark_albert.py` | Direct browser→Albert blocked/truncated; need reliable person-centric graph | chat |
| 15:24 | Isolated **`generativeWorkflow.css`** | Shared CSS classes blanked the page | chat |
| 16:12–16:55 | Relation highlighting in paste text; hide inter-person arrows | Show person graph in text; reduce visual noise | chat |
| 17:02–17:45 | Sync scroll; soft-exclude gray-out; Categories & entities parity; panel sizing; graph click vs soft-exclude bugs | Manual edit parity with Basic | chat |
| 17:49–18:17 | **Person graph for Basic** via **UDPipe WASM** + `buildBasicPersonGraph` (governor-share + proximity) | Person-wise editing without Albert | chat |
| 18:17–18:39 | Graph sparse / preview click bugs; person **underline focus** (not recolor) | Category colors already used for NER; improve focus UX | chat |
| 18:47–18:58 | **GLiNER → same person graph** (`LABEL_TO_ATTR`, `usePersonGraphPanel`); taller graph | Richer Advanced spans should feed the graph | chat |
| 19:00–19:07 | Layout → four columns, then **3+1**: Categories · Highlighted · Graph on one row; anonymized preview full-width below | Preview is secondary; categories and graph must not share one sidebar | chat |
| 19:23–19:38 | Manual **Related to** (Basic/Advanced, then Generative); paste title → Highlighted when relation view on | Users must fix wrong automatic attachments | chat |
| 19:40–19:48 | Person **chips = focus only**; soft-exclude must still change anonymized text (restore after over-aggressive visual-only); nested-alias guard for `[PER_1] Martin` | Focus ≠ exclude; aliases must not keep replacing after full-name exclude | chat |
| 19:41–19:58 | **Export CSV** + **Export CSV by person** on all modes | Archive / analyze the person graph | chat |
| 20:01–20:04 | **`7d1a6da`** / **`0c52f09`** — 1.0.0 + evolution journal | Ship + document | chat + git |
| evening (post-release) | Cloudflare Worker **`incognito-albert-proxy`** + Pages uses `ALBERT_CORS_PROXY_BASE_URL` | Albert has no usable CORS for `github.io`; Vite proxy is local-only | git + deploy |

### Date ↔ phase map

| Date(s) | Phase(s) in this doc |
| ------- | -------------------- |
| 2026-06-25 (pre-commit → 17:26) | Phase 0–3 (framing, birth, deploy/i18n/PWA, batch/demo start) |
| 2026-06-26 | Phase 3 end (**0.3.0**) + Phase 4 (**0.4.0** GLiNER) |
| 2026-07-20 | Phase 4 follow-up (SEO) |
| 2026-10-02 | Phases 5–9 (Generative, UDPipe/GLiNER graph, layout 3+1, Related to / chips / soft-exclude, CSV, **1.0.0**, this journal) |

### Gaps (honest)

- Early June chat turns (models, privacy, spaCy, batch “folder does nothing”) have **no embedded clock timestamps** in the transcript; they are dated by the **2026-06-25** git commits they produced.
- Decoder experiments were **not** kept as separate `main` commits; only the GLiNER outcome is dated precisely (**2026-06-26 16:56**).
- Between **2026-07-20** and **2026-10-02** there were **no** `web_interface/` commits on `main`.

---

## Chronological index of user-driven milestones

Condensed from the working chat (paraphrased; API keys omitted).

| # | Theme |
| - | ----- |
| 1 | Create client-side `web_interface` with Transformers.js/ONNX |
| 2–14 | Privacy wording, models (dates default, English, custom HF), emojis |
| 15–23 | Deploy Pages, rebrand Incognito, desktop+web identity |
| 24–28 | Path-filtered deploy, citation, Statcounter, contributor questions |
| 29–31 | WebView/PWA as lighter “desktop” |
| 32–40 | Batch folder/files, docx, progress bars, Run Anonymization, sample text |
| 41–50 | Toy demo, Details here, FR/EN, remove install-as-app clutter |
| 51–54 | All-occurrence highlight bug → **0.3.0** |
| 55–61 | Decoder attempt → abandon → **GLiNER** Advanced |
| 62–74 | GLiNER progress, cache, threshold, labels, toy demo |
| 75–82 | Three-panel Basic layout; Advanced parity; synced scroll |
| 83–101 | Copy cleanup, mode toggles, placeholders, regex contacts, merge, SEO |
| 103–128 | **Generative Albert**: compact JSON, relations, edit, CSS isolation |
| 129–134 | Soft-exclude gray-out; Categories like Basic; custom categories |
| 135–142 | Basic person graph (UDPipe); focus underlines; **GLiNER graph** |
| 145–148 | Layout → 3+1 (preview bottom) |
| 149–156 | Related to; chips focus; soft-exclude vs chips; CSV exports |
| 157–158 | **1.0.0** + push |
| 159 | This evolution document |

---

## Current architecture snapshot (1.0.0)

```
web_interface/
  src/
    App.jsx                          # Basic | Advanced | Generative toggle
    components/
      CamembertWorkflowSection.jsx   # Basic NER + graph
      GlinerWorkflowSection.jsx      # Advanced NER + graph
      GenerativeWorkflowSection.jsx  # Albert + graph
      PersonGraphCard.jsx
      PersonFocusChips.jsx
      PersonGraphExportButton.jsx
      EntityEditMenu.jsx / GenerativeEditMenu.jsx
      HighlightedText.jsx / GenerativeRelationView.jsx
    hooks/
      usePersonGraphPanel.js
      useDepWorker.js / useGlinerWorker.js / useNerWorker.js
    lib/
      basicPersonGraph.js            # UDPipe + proximity graph
      personFocus.js / personGraphCsv.js
      albert*.js / gliner*.js / …
    depWorker.js                     # UDPipe WASM worker
```

**Workspace layout (all three modes)**

1. Categories & entities  
2. Highlighted text (+ person chips)  
3. Person graph (+ CSV exports)  
4. Anonymized preview (full-width row below)

---

## Open product notes (not blocking 1.0.0)

- Automatic attachment quality still limited vs a heavyweight NLP stack; Related to + GLiNER labels mitigate.
- Inter-person relation arrows intentionally off in generative highlight for now.
- Generative depends on Albert availability, key, and token limits.
- Desktop installers not yet at 1.0.0 feature parity for person graph / generative.

---

## Maintenance

When shipping a meaningful UX or workflow change:

1. Add a row (or hourly block) under **Exact date change log** with `YYYY-MM-DD`, time if known, reason, and `git` / `chat` source.  
2. Extend or add a phase section if the change is large enough to need Intent / Design / Code narrative.  
3. Update root `README.md` / `web_interface/README.md` if user-facing.  
4. Bump `web_interface/package.json` + `uiStrings.versionNumber` when the release warrants it.

*Last updated: 2026-10-02 — exact date change log added (git + chat timestamps).*
