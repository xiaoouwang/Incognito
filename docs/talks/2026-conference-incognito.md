---
marp: true
title: Incognito — Anonymiser des corpus qualitatifs en local
description: Présentation conférence (~20 min) — focus web, pipelines techniques
author: Xiaoou Wang · MSHS Sud-Est · Université Côte d'Azur
paginate: true
size: 16:9
lang: fr
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

**Anonymiser des corpus qualitatifs en local**
dans le navigateur — détection, revue, graphe de personnes

<p class="tagline">CamemBERT · GLiNER · Albert API · UDPipe — pipelines client-side pour les SHS.</p>

<p class="meta">
<strong>Xiaoou Wang</strong> · Ingénieur en Humanités Numériques<br>
MSHS Sud-Est · Université Côte d'Azur<br>
<span class="muted">Incognito Web 1.0.0 · AGPLv3 · ~20 minutes</span>
</p>

<!--
SPEAKER (~1 min)
Accroche privacy + « tout dans le navigateur ». Pas de bureau dans ce talk.
-->

---

# Plan (20 minutes)

|     | Bloc                                 | ~min |
| --- | ------------------------------------ | ---- |
| 1   | Problème & proposition               | 3    |
| 2   | Architecture web (client-side)       | 2    |
| 3   | Pipeline **Basic** (CamemBERT)       | 3    |
| 4   | Pipeline **Advanced** (GLiNER)       | 3    |
| 5   | Pipeline **Generative** (Albert API) | 2.5  |
| 6   | Graphe de personnes          | 3    |
| 7   | Limites & perspectives                 | 1.5  |

<p class="muted">Fil : chaque mode = un pipeline différent ; la revue humaine est commune.</p>

<!--
SPEAKER (~30 s)
Démo volontairement courte — le détail est dans les slides techniques.
-->

---

<!-- _class: section -->

# 1 · Problème & proposition

---

# Anonymiser sans trahir le terrain

- Entretiens / notes : prénoms, lieux, employeurs, santé, diplômes…
- Risque de **réidentification** par combinaison de détails
- Tension : protéger **et** garder un texte analysable
- Les LLM cloud « marchent » — en **exportant** le corpus

<div class="warn" style="margin-top:0.9em;">
Incognito vise un autre contrat : <strong>traitement local</strong> + <strong>contrôle humain</strong> + <strong>traçabilité</strong>.
</div>

<!--
SPEAKER (~1.5 min)
-->

---

# Proposition produit

**Détecter → revoir → remplacer → exporter**

<span class="pill">[PER_1]</span>
<span class="pill">[LOC_1]</span>
<span class="pill">[ORG_1]</span>
<span class="pill">[EMA_1]</span>
<span class="pill">[NAT_1]</span>
<span class="muted"> · 3 lettres de catégorie + index stable</span>

<br>

| Principe              | Implémentation web                           |
| --------------------- | -------------------------------------------- |
| Local-first           | ONNX / WASM dans le navigateur (sauf Albert) |
| Humain dans la boucle | Soft-exclude, spans manuels, Related to      |
| Traçabilité           | Audit Markdown, CSV graphe                   |
| Multi-protocoles      | 3 moteurs, 1 couche de revue                 |

<p class="muted">Assistant d'anonymisation — pas une garantie d'anonymat total.</p>

<!--
SPEAKER (~1.5 min)
-->

---

<!-- _class: section -->

# 2 · Architecture web


---

<!-- _class: tech -->

# Stack client-side

<div class="flow">
Interface dans le navigateur &nbsp;→&nbsp;
détection en arrière-plan (sans figer l'écran) &nbsp;→&nbsp;
revue, graphe de personnes, exports
</div>

<br>

| Couche     | Tech · Framework                     | Rôle                                  |
| ---------- | ------------------------------------ | ------------------------------------- |
| UI         | React (Vite), FR/EN                  | Revue 3+1, batch, progress            |
| Basic NER  | Transformers.js + ONNX Runtime WASM  | Token-classification CamemBERT / BERT |
| Advanced   | `gliner` + ONNX `q4f16` (~472 Mo)    | Labels ouverts, chunking              |
| Generative | `fetch` → Worker CORS → Albert `/v1` | JSON graphe compact                   |
| Graphe     | UDPipe WASM French-GSD (~23 Mo)      | Deps + merge proximité                |
| Hosting    | GitHub Pages (statique) + Cloud EOSC |                                       |

<!--
SPEAKER (~2 min)
Insister : Pages = fichiers statiques ; Albert a besoin d'un proxy CORS séparé.
-->

---

# Où vont les données ?

<div class="cols">
<div class="card">

### Basic & Advanced
Texte **reste** dans le navigateur
Download one-shot des poids HF
puis **cache** navigateur

</div>
<div class="card">

### Generative
Texte + clé → **Albert**
via Worker EOSC (European Open Science Cloud)

</div>
</div>

<br>

<div class="flow small">
Pages <code>github.io</code> &nbsp;→&nbsp; Worker <code>/v1/*</code> &nbsp;→&nbsp; <code>albert.api.etalab.gouv.fr</code><br>
</div>

<!--
SPEAKER (~1 min)
Albert sans CORS utilisable depuis github.io → d'où le Worker.
-->

---

<!-- _class: section -->

# 3 · Pipeline Basic

CamemBERT / Transformers.js

---

<!-- _class: tech -->

# Basic — flux de traitement

<div class="flow">
On part du texte collé ou importé<br>
→ le modèle repère les noms, lieux, organisations, dates… <em>sans bloquer l'interface</em><br>
→ chaque mention détectée est regroupée en entités lisibles<br>
→ <strong>toutes les occurrences</strong> de la même valeur sont surlignées (pas seulement la première)<br>
→ les e-mails, URL, dates et téléphones peuvent aussi être trouvés par règles simples<br>
→ le tout est rangé par <strong>catégories</strong> (personne, lieu…)<br>
→ on remplace par des codes du type <code>[PER_1]</code> et on montre un aperçu<br>
→ en parallèle, on construit le <strong>graphe de personnes</strong> (possibilité de révision humaine)
</div>

<br>

**Modèles typiques :** CamemBERT + dates (défaut), CamemBERT base, BERT anglais

<!--
SPEAKER (~1.5 min)
-->

---

<!-- _class: tech -->



<!-- _class: section -->

# 4 · Pipeline Advanced

GLiNER multi-label

---

<!-- _class: tech -->

# Advanced — flux de traitement

<div class="flow">
On choisit les types à chercher (personne, maladie, diplôme, nationalité…)<br>
→ le modèle GLiNER se télécharge une fois, puis reste en cache dans le navigateur<br>
→ pour e-mail, URL et téléphone, on préfère des <strong>règles explicites</strong> au modèle<br>
→ les résultats alimentent les catégories à l'écran <em>et</em> les attributs du graphe de personnes<br>
→ ensuite : même revue que le mode Basic (exclure, rattacher, exporter)
</div>

<!--
SPEAKER (~1.5 min)
-->

---

<!-- _class: tech -->

# Advanced — pourquoi GLiNER ici

| CamemBERT (Basic)           | GLiNER (Advanced)                      |
| --------------------------- | -------------------------------------- |
| Types NER fixés du modèle   | Étiquettes **texte libre** / protocole |
| Bon défaut FR entretiens    | Santé, diplôme, fonction, nationalité… |
| Plus stable sur PER/LOC/ORG | Plus flexible, parfois plus bruyant    |

<br>

- Seuil bas (0.2) → rappel élevé → **la revue filtre**
- Même couche graphe : attributs plus riches (adresse, profession, école…)

<p class="muted">Fichiers : <code>glinerRuntime.js</code> · <code>useGlinerWorker.js</code> · <code>ruleDetection.js</code> · <code>GlinerWorkflowSection.jsx</code></p>

<!--
SPEAKER (~1.5 min)
-->

---

<!-- _class: section -->

# 5 · Pipeline Génératif

Albert API https://ia.numerique.gouv.fr/outils-ia/albert-api/

---

<!-- _class: tech -->

# Generative — flux de traitement

<div class="flow">
On repère d'abord localement des candidats (noms, contacts…)<br>
→ le texte part vers <strong>Albert</strong> (avec la clé de l'utilisateur)<br>
→ Albert renvoie un <strong>petit plan</strong> : qui est qui, alias, attributs, liens
→ le navigateur rattache ce plan aux mots du texte<br>
→ on construit l'aperçu anonymisé localement<br>
→ l'utilisateur peut exclure, rattacher (« Related to »), ou se concentrer sur une personne<br>
→ chaque correction recalcule l'aperçu (pour éviter des restes du type <code>[PER_1] Martin</code>)
</div>

<!--
SPEAKER (~1.5 min)
-->

---

<!-- _class: tech -->

# Generative — contraintes réseau & tokens

- **CORS** : Albert ne répond pas correctement aux preflights depuis `github.io` → Worker proxy allowlist
- **Proxy** : forward `Authorization` + body ; **aucune clé stockée** côté Cloud
- **max_tokens** / JSON compact : réduire `finish_reason=length`

<p class="muted">Fichiers : <code>albertClient.js</code> · <code>albertCandidates.js</code> · <code>albertEdit.js</code> · <code>albert-proxy/</code></p>

<!--
SPEAKER (~1 min)
-->

---

<!-- _class: section -->

# 6 · Graphe & revue

Couche commune aux 3 modes

---

<!-- _class: tech -->

# Construction du graphe de personnes

<div class="flow">
On part des entités détectées (Basic / Advanced) ou du plan Albert<br>
→ analyse linguistique du français (dépendances) dans le navigateur<br>
→ on relie chaque mention à sa place dans le texte<br>
→ on regroupe ce qui appartient à la <strong>même personne</strong> :<br>
&nbsp;&nbsp;· liens grammaticaux dans la phrase<br>
&nbsp;&nbsp;· proximité dans le paragraphe<br>
&nbsp;&nbsp;· (Advanced) types riches : adresse, métier, école…<br>
→ l'utilisateur peut corriger avec <strong>Related to</strong> (ces choix sont conservés)<br>
→ exclure une valeur dans les catégories ou dans le graphe : <strong>même effet</strong> sur l'aperçu
</div>

<!--
SPEAKER (~1.5 min)
UDPipe seul sous-relie → proximité + Related to.
-->

---

<!-- _class: tech -->

# Sémantique des interactions

| Action                   | UI surlignée           | Texte anonymisé            |
| ------------------------ | ---------------------- | -------------------------- |
| Pastille personne (chip) | Focus / soulignement   | **Aucun effet**            |
| Soft-exclude (× / menu)  | Grisé                  | **Retiré** du remplacement |
| Related to               | Réattache attr / alias | Rebuild + remplacements    |


<br>

**Layout 3+1 :** Catégories · Texte · Graphe — preview anonymisé en **plein largeur dessous**

**Exports :** CSV long (1 ligne / surface) · CSV by person · audit · Label Studio

<!--
SPEAKER (~1.5 min)
Règle produit importante : chips ≠ exclude.
-->

---

<!-- _class: section -->

# 8 · Limites & perspectives

---

# Limites techniques

- Quasi-identifiants / contexte narratif hors NER
- Graphe **incomplet**
- GLiNER / CamemBERT : frontières, faux + / faux −
- WASM : perf machine-dépendante

<div class="warn" style="margin-top:0.8em;">
Toujours <strong>relire</strong> avant diffusion ou archivage.
</div>

---

# Perspectives

* Mobiliser des modèles génératifs pour détecter les quasi-identifiants complexes, notamment ceux qui ne peuvent être repérés par une simple reconnaissance d’entités nommées.
* Coupler l’analyse qualitative avec des méthodes quantitatives d’anonymisation, en exploitant le graphe personnes–informations pour mesurer le risque de réidentification (k-anonymat, unicité des profils, combinaison d’attributs, etc.).
* Évaluer la robustesse de l’anonymisation par des attaques de réidentification, en croisant avec des sources publiques (INSEE, Wikidata, annuaires et autres bases ouvertes) afin d’estimer le risque réel de réidentification.

---

# Takeaways

1. **Trois pipelines** distincts (CamemBERT · GLiNER · Albert+client)
2. **Une couche de revue** (graphe, soft-exclude, Related to, CSV)
3. **Local-first** dans le navigateur + Generative

<br>

**Liens**

- App : [xiaoouwang.github.io/Incognito](https://xiaoouwang.github.io/Incognito/)
- Code : [github.com/xiaoouwang/Incognito](https://github.com/xiaoouwang/Incognito)
- Journal : `docs/WEB_INTERFACE_EVOLUTION.md`

---

<!-- _class: title -->
<!-- _paginate: false -->

# Merci

**Questions ?**

<p class="meta">
Xiaoou Wang · MSHS Sud-Est · Université Côte d'Azur<br>
<a href="https://xiaoouwang.github.io/Incognito/">xiaoouwang.github.io/Incognito</a><br>
<span class="muted">AGPLv3 · Incognito Web 1.0.0</span>
</p>

<!--
SPEAKER
FAQ probables : Worker CORS, chunking GLiNER, JSON compact Albert, UDPipe vs spaCy.
-->
