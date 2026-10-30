---
marp: true
title: Incognito — Anonymizing Qualitative Research Data Locally
description: Conference presentation (~20 min) — web architecture and technical pipelines
author: Xiaoou Wang · MSHS Sud-Est · Université Côte d'Azur
paginate: true
size: 16:9
lang: en
theme: default
style: |
  @import url('https://fonts.googleapis.com/css2?family=Source+Serif+4:opsz,wght@8..60,600;8..60,700&family=IBM+Plex+Sans:wght@400;500;600&family=IBM+Plex+Mono:wght@400;500&display=swap');

  :root {
    --ink: #1a2740;
    --navy: #203a5f;
    --mist: #e8eef5;
    --paper: #f7f5f1;
    --accent: #c45c26;
    --muted: #5a6a7e;
  }

  section {
    font-family: 'IBM Plex Sans', system-ui, sans-serif;
    color: var(--ink);
    background: var(--paper);
    padding: 44px 52px;
    font-size: 26px;
    line-height: 1.32;
  }

  h1, h2, h3 {
    font-family: 'Source Serif 4', Georgia, serif;
    font-weight: 700;
    color: var(--navy);
    letter-spacing: -0.02em;
  }

  h1 { font-size: 44px; margin-bottom: 0.3em; }
  h2 { font-size: 34px; margin-bottom: 0.35em; }
  h3 { font-size: 24px; margin: 0.2em 0; }

  strong { color: var(--navy); font-weight: 600; }
  a { color: var(--navy); }

  ul { margin: 0.15em 0; }
  li { margin: 0.2em 0; }
  li::marker { color: var(--accent); }

  code {
    font-family: 'IBM Plex Mono', ui-monospace, monospace;
    background: var(--mist);
    font-size: 0.88em;
    padding: 0.05em 0.3em;
    border-radius: 3px;
  }

  table { font-size: 20px; width: 100%; }
  th { background: var(--navy); color: #fff; font-weight: 600; }
  td { background: #fff; vertical-align: top; }

  footer { font-size: 13px; color: var(--muted); }

  section.title {
    background:
      radial-gradient(ellipse 80% 60% at 100% 0%, #d4e0ef 0%, transparent 55%),
      linear-gradient(165deg, #f7f5f1 0%, #e8eef5 100%);
    display: flex;
    flex-direction: column;
    justify-content: center;
  }
  section.title h1 { font-size: 52px; margin-bottom: 0.12em; }
  section.title .tagline {
    font-size: 24px; color: var(--muted); max-width: 20em; margin-top: 0.35em;
  }
  section.title .meta { margin-top: 1.8em; font-size: 19px; }

  section.section {
    background: var(--navy);
    color: #f2f5f9;
    display: flex;
    flex-direction: column;
    justify-content: center;
  }
  section.section h1, section.section h2 { color: #fff; }
  section.section p { color: #c5d0de; font-size: 22px; }

  section.demo {
    background: linear-gradient(135deg, #1a2740 0%, #203a5f 55%, #2a4a73 100%);
    color: #f2f5f9;
  }
  section.demo h2 { color: #fff; }
  section.demo li::marker { color: #e8a070; }

  section.tech { font-size: 24px; }
  section.tech h2 { font-size: 30px; }
  section.tech table { font-size: 18px; }

  .pill {
    display: inline-block;
    background: var(--mist);
    color: var(--navy);
    padding: 0.12em 0.45em;
    border-radius: 4px;
    font-size: 0.82em;
    font-weight: 600;
  }
  .warn {
    border-left: 4px solid var(--accent);
    padding-left: 0.7em;
    font-size: 0.92em;
  }
  .cols { display: grid; grid-template-columns: 1fr 1fr; gap: 1.2em; }
  .cols-3 { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 0.9em; }
  .card {
    background: #fff;
    border: 1px solid #d5dde8;
    padding: 0.7em 0.85em;
    border-radius: 6px;
  }
  .card h3 { margin: 0 0 0.3em; font-size: 20px; }
  .muted { color: var(--muted); font-size: 0.85em; }
  .flow {
    font-family: 'IBM Plex Mono', ui-monospace, monospace;
    font-size: 18px;
    background: #fff;
    border: 1px solid #d5dde8;
    padding: 0.7em 0.9em;
    border-radius: 6px;
    line-height: 1.55;
  }
  .flow strong { font-family: 'IBM Plex Sans', sans-serif; }
  .small { font-size: 0.88em; }
---

<!-- _class: title -->
<!-- _paginate: false -->

# Incognito

**Anonymizing Qualitative Research Data Locally**
in the browser — detection, review, and person graphs

<p class="tagline">CamemBERT · GLiNER · Albert API · UDPipe — client-side pipelines for the humanities and social sciences.</p>

<p class="meta">
<strong>Xiaoou Wang</strong> · Digital Humanities Engineer<br>
MSHS Sud-Est · Université Côte d'Azur<br>
<span class="muted">Incognito Web 1.0.0 · AGPLv3 · ~20 minutes</span>
</p>

<!--
SPEAKER (~1 min)
Open with privacy and “everything runs in the browser.” This talk does not cover the desktop version.
-->

---

# Agenda (20 minutes)

|     | Section                              | ~min |
| --- | ------------------------------------ | ---- |
| 1   | Problem & approach                   | 3    |
| 2   | Web architecture (client-side)       | 2    |
| 3   | Pipeline **Basic** (CamemBERT)       | 3    |
| 4   | Pipeline **Advanced** (GLiNER)       | 3    |
| 5   | Pipeline **Generative** (Albert API) | 2.5  |
| 6   | Person graph                         | 3    |
| 7   | Limitations & future directions      | 1.5  |

<p class="muted">Key idea: each mode has a different pipeline, but all share the same human review layer.</p>

<!--
SPEAKER (~30 s)
Keep the demo short; the technical slides provide the details.
-->

---

<!-- _class: section -->

# 1 · Problem & approach

---

# Anonymize without losing the research context

- Interviews / field notes: names, places, employers, health, qualifications…
- Risk of **re-identification** through combinations of details
- Trade-off: protect participants **while** keeping the text analyzable
- Commercial solutions may work — but require **sending the corpus off-device**

<div class="warn" style="margin-top:0.9em;">
Incognito takes a different approach: <strong>local processing</strong> + <strong>human oversight</strong> + <strong>traceability</strong>.
</div>

<!--
SPEAKER (~1.5 min)
-->

---

# What Incognito offers

**Detect → review → replace → export**

<span class="pill">[PER_1]</span>
<span class="pill">[LOC_1]</span>
<span class="pill">[ORG_1]</span>
<span class="pill">[EMA_1]</span>
<span class="pill">[NAT_1]</span>
<span class="muted"> · 3-letter category code + stable index</span>

<br>

| Principle          | Web implementation                         |
| ------------------ | ------------------------------------------ |
| Local-first        | ONNX / WASM in the browser (except Albert) |
| Human in the loop  | Soft-exclude, spans manuels, Related to    |
| Traceability       | Audit Markdown, CSV graphe                 |
| Multiple pipelines | 3 engines, 1 review layer                  |

<p class="muted">An anonymization assistant — not a guarantee of complete anonymity.</p>

<!--
SPEAKER (~1.5 min)
-->

---

<!-- _class: section -->

# 2 · Web architecture


---

<!-- _class: tech -->

# Stack client-side

<div class="flow">
Browser interface &nbsp;→&nbsp;
background detection (without freezing the UI) &nbsp;→&nbsp;
review, person graph, exports
</div>

<br>

| Layer      | Tech · Framework                     | Role                                          |
| ---------- | ------------------------------------ | --------------------------------------------- |
| UI         | React (Vite), FR/EN                  | 3+1 review layout, batch processing, progress |
| Basic NER  | Transformers.js + ONNX Runtime WASM  | Token-classification CamemBERT / BERT         |
| Advanced   | `gliner` + ONNX `q4f16` (~472 Mo)    | Open labels, chunking                         |
| Generative | `fetch` → Worker CORS → Albert `/v1` | Compact graph JSON                            |
| Graphe     | UDPipe WASM French-GSD (~23 Mo)      | Dependencies + proximity-based merging        |
| Hosting    | GitHub Pages (statique) + Cloud EOSC |                                               |

<!--
SPEAKER (~2 min)
Emphasize: Pages hosts static files; Albert requires a separate CORS proxy.
-->

---

# Where does the data go?

<div class="cols">
<div class="card">

### Basic & Advanced
Text **stays** in the browser
One-time download of HF model weights
then **browser caching**

</div>
<div class="card">

### Generative
Text + API key → **Albert**
via Worker EOSC (European Open Science Cloud)

</div>
</div>

<br>

<div class="flow small">
Pages <code>github.io</code> &nbsp;→&nbsp; Worker <code>/v1/*</code> &nbsp;→&nbsp; <code>albert.api.etalab.gouv.fr</code><br>
</div>

<!--
SPEAKER (~1 min)
Albert cannot be accessed directly from github.io due to CORS; hence the Worker.
-->

---

<!-- _class: section -->

# 3 · Basic Pipeline

CamemBERT / Transformers.js

---

<!-- _class: tech -->

# Basic — processing pipeline

<div class="flow">
Start with pasted or imported text<br>
→ the model identifies names, places, organizations, dates… <em>without blocking the UI</em><br>
→ <strong>all occurrences</strong> of the same value are highlighted (not just the first)<br>
→ emails, URLs, dates, and phone numbers can also be detected with simple rules<br>
→ results are organized by <strong>category</strong> (person, location…)<br>
→ values are replaced with codes such as <code>[PER_1]</code> and a preview is displayed<br>
→ in parallel, a <strong>person graph</strong> is built (with human review)
</div>

<br>

**Typical models:** CamemBERT + dates (default), base CamemBERT, English BERT

<!--
SPEAKER (~1.5 min)
-->

---

<!-- _class: tech -->



<!-- _class: section -->

# 4 · Advanced Pipeline

Open-label GLiNER

---

<!-- _class: tech -->

# Advanced — processing pipeline

<div class="flow">
Choose the entity types to detect (person, disease, qualification, nationality…)<br>
→ the GLiNER model is downloaded once and then cached in the browser<br>
→ for emails, URLs, and phone numbers, <strong>explicit rules</strong> are preferred over model predictions<br>
→ results populate the on-screen categories <em>and</em> the person graph attributes<br>
→ then the same review workflow as Basic (exclude, link, export)
</div>

<!--
SPEAKER (~1.5 min)
-->

---

<!-- _class: tech -->

# Advanced — why GLiNER?

| CamemBERT (Basic)                  | GLiNER (Advanced)                               |
| ---------------------------------- | ----------------------------------------------- |
| Fixed NER entity types             | **Free-text** labels / configurable protocol    |
| Good default for French interviews | Health, qualifications, job title, nationality… |
| More stable for PER/LOC/ORG        | More flexible, sometimes noisier                |

<br>

- Low threshold (0.2) → high recall → **human review filters results**
- Same graph layer, with richer attributes (address, occupation, school…)

<p class="muted">Fichiers : <code>glinerRuntime.js</code> · <code>useGlinerWorker.js</code> · <code>ruleDetection.js</code> · <code>GlinerWorkflowSection.jsx</code></p>

<!--
SPEAKER (~1.5 min)
-->

---

<!-- _class: section -->

# 5 · Generative pipeline

Albert API https://ia.numerique.gouv.fr/outils-ia/albert-api/

---

<!-- _class: tech -->

# Generative — processing pipeline

<div class="flow">
First, candidate entities are identified locally (names, contact details…)<br>
→ the text is sent to <strong>Albert</strong> (using the user's API key)<br>
→ Albert returns a <strong>compact representation</strong>: identities, aliases, attributes, relationships
→ the browser aligns this representation with spans in the text<br>
→ the anonymized preview is generated locally<br>
→ the user can exclude, link ('Related to'), or focus on a person<br>
→ each correction regenerates the preview
</div>

<!--
SPEAKER (~1.5 min)
-->

---

<!-- _class: tech -->

# Generative — network and token constraints

- **CORS** : Albert does not properly handle preflight requests from `github.io` → allowlisted Worker proxy
- **Proxy** : forward `Authorization` + body ; **no API keys stored** in the cloud
- **max_tokens** / JSON compact : reduce `finish_reason=length`

<p class="muted">Fichiers : <code>albertClient.js</code> · <code>albertCandidates.js</code> · <code>albertEdit.js</code> · <code>albert-proxy/</code></p>

<!--
SPEAKER (~1 min)
-->

---

<!-- _class: section -->

# 6 · Graph & review

Common layer to all pipelines

---

<!-- _class: tech -->

# Building the person graph

<div class="flow">
Start with detected entities (Basic / Advanced) or Albert’s representation<br>
→ French dependency parsing in the browser<br>
→ each mention is linked to its position in the text<br>
→ information referring to the <strong>same person</strong> is grouped using:<br>
&nbsp;&nbsp;· grammatical relationships within a sentence<br>
&nbsp;&nbsp;· proximity within a paragraph<br>
→ the user can correct links with <strong>Related to</strong> (these choices are preserved)<br>
→ excluding a value in the categories or graph has the <strong>same effect</strong> on the preview
</div>

<!--
SPEAKER (~1.5 min)
UDPipe alone misses some links → add proximity heuristics + Related to.
-->

---

<!-- _class: tech -->

# Interaction semantics

| Action                  | Highlighted UI              | Anonymized text               |
| ----------------------- | --------------------------- | ----------------------------- |
| Person chip             | Focus / underline           | **No effect**                 |
| Soft-exclude (× / menu) | Greyed out                  | **Excluded** from replacement |
| Related to              | Relink attributes / aliases | Rebuild + replacements        |


<br>

**Layout 3+1 :** Categories · Text · Graph — **full-width anonymized preview below**

**Exports :** CSV long (1 row per surface form) · CSV by person · Audit log

<!--
SPEAKER (~1.5 min)
Important UI rule: selecting a chip ≠ excluding an entity.
-->

---

<!-- _class: section -->

# 8 · Limitations & future directions

---

# Technical limitations

- Quasi-identifiers / narrative context beyond NER
- **Incomplete** graph
- GLiNER / CamemBERT : entity boundaries, false positives / false negatives
- WASM : performance depends on the user’s device

<div class="warn" style="margin-top:0.8em;">
Always <strong>review the output</strong> before sharing or archiving.
</div>

---

# Future directions

* Use generative models to detect complex quasi-identifiers, especially those that cannot be identified through named entity recognition alone.
* Combine qualitative analysis with quantitative anonymization methods, using the person–information graph to measure re-identification risk (k-anonymity, profile uniqueness, combinations of attributes, etc.).
* Evaluate anonymization robustness through re-identification attacks, cross-referencing public sources (INSEE, Wikidata, directories, and other open databases) to estimate real-world re-identification risk.

---

# Takeaways

1. **Three distinct pipelines** distincts (CamemBERT · GLiNER · Albert)
2. **One shared review layer**
3. **Local-first** in the browser + Generative mode

<br>

**Links**

- App : [xiaoouwang.github.io/Incognito](https://xiaoouwang.github.io/Incognito/)
- Code : [github.com/xiaoouwang/Incognito](https://github.com/xiaoouwang/Incognito)
- Development log : `docs/WEB_INTERFACE_EVOLUTION.md`

---

<!-- _class: title -->
<!-- _paginate: false -->

# Thank you

**Questions?**

<p class="meta">
Xiaoou Wang · MSHS Sud-Est · Université Côte d'Azur<br>
<a href="https://xiaoouwang.github.io/Incognito/">xiaoouwang.github.io/Incognito</a><br>
<span class="muted">AGPLv3 · Incognito Web 1.0.0</span>
</p>

<!--
SPEAKER
Likely FAQs : Worker CORS, chunking GLiNER, JSON compact Albert, UDPipe vs spaCy.
-->
