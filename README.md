

# ✨ Incognito

**Anonymisez vos corpus qualitatifs en local — sans envoyer vos données dans le cloud.**

Outil pour les sciences humaines et sociales — entretiens, notes de terrain, réponses ouvertes. **Deux interfaces** partagent le même workflow de revue : une **application de bureau** multiplateforme (macOS, Windows, Linux) et une **interface web** dans le navigateur. Détectez les entités sensibles, contrôlez ce qui est remplacé, exportez un texte anonymisé et une trace de vos décisions.

Développé par [Xiaoou Wang](https://xiaoouwang.github.io/) · Ingénieur en Humanités Numériques · [MSHS Sud-Est](https://mshs.univ-cotedazur.fr/) · [Université Côte d'Azur](https://univ-cotedazur.fr/)

**Version actuelle : 0.2.0**

**🌐 Nouveau —** [**Incognito Web**](https://xiaoouwang.github.io/Incognito/) : même workflow de revue dans le navigateur, sans installation (ou en **PWA**). *Tout s'exécute localement — vos données ne quittent pas votre ordinateur.* Voir la section [Version web](#-version-web) ci-dessous.

![Demo](demo.gif)

---

## 🔒 Pourquoi cet outil ?


|                              |                                                                        |
| ---------------------------- | ---------------------------------------------------------------------- |
| 🏠 **100 % local**            | Bureau : aucun appel à une API externe. Web : *tout s'exécute localement dans le navigateur* — seuls les poids du modèle sont téléchargés, jamais vos textes. |
| 🌍 **Multiplateforme**        | Installateurs bureau macOS / Windows / Linux, ou **[Incognito Web](https://xiaoouwang.github.io/Incognito/)** dans le navigateur. |
| 🇫🇷 **Pensé pour le français** | Modèles spaCy et CamemBERT adaptés aux textes qualitatifs en français. |
| 👁️ **Contrôle humain**        | Vous validez, corrigez et désactivez entité par entité avant l'export. |
| 📋 **Traçabilité**            | Rapport d'audit et exports prêts pour l'archivage ou Label Studio.     |


> ⚠️ Assistant d'anonymisation, pas une garantie d'anonymat total. Relisez toujours le résultat avant diffusion.

---

## 🚀 En bref

1. **Importez** un texte, un dossier, ou des fichiers sélectionnés (`.txt`, `.docx` sur le web)
2. **Lancez** la détection d'entités (NER) en un clic
3. **Affinez** catégories et occurrences (personnes, lieux, organisations, dates, e-mails…)
4. **Exportez** texte anonymisé, rapport et JSON Label Studio — dossier `outputs-YYYYMMDD-HHMMSS` (bureau) ou ZIP (web)

Placeholders stables du type `[PERSON_1]`, `[LOCATION_2]`, `[EMAIL_1]`.

---

## 🧰 Fonctionnalités

Disponibles dans les **deux interfaces** (bureau et web), avec des moteurs NER adaptés à chaque plateforme :

- 🔍 **NER configurable** — bureau : spaCy (petit / grand) et CamemBERT ; web : CamemBERT (+ dates), BERT anglais, modèle Hugging Face personnalisé
- 🖍️ **Revue interactive** — surlignage, ajout/suppression de spans, bascule par entité, catégories personnalisées
- 📁 **Mode lot** — bureau : dossier `.txt` sur disque ; web : **dossier entier** ou **fichiers choisis** (`.txt`, `.docx`), navigation Précédent/Suivant, saut par n° ou nom, barres de progression
- 📄 **Exports automatiques** — `*-anonymized.txt`, `*-report.md`, `*-label-studio.json` (variante `*_modified` après changement de fichier)
- 🏷️ **Label Studio** — pré-annotations + configuration XML
- 📊 **Rapport d'audit** — provenance (NER automatique vs revue humaine), positions de caractères, index complet des spans

---

## ⚙️ Stack & pipeline

Incognito repose sur **deux déploiements** partageant la logique de revue (React) :

### Application de bureau

Interface **Electron** + **React** (Vite), moteur NER **Python** embarqué (PyInstaller), modèles **spaCy** et **CamemBERT** / Transformers. Chaîne de build **electron-builder** → installateurs `.dmg`, `.exe`, `.AppImage` / `.deb`, avec CI **GitHub Actions** pour les trois systèmes.


| Couche    | Outils                                          |
| --------- | ----------------------------------------------- |
| 🖥️ Bureau  | Electron, React                                 |
| 🧠 NER     | Python 3.12, spaCy, CamemBERT (Hugging Face)    |
| 📦 Release | PyInstaller, electron-builder                   |
| 🔄 CI      | GitHub Actions (`macos` / `windows` / `ubuntu`) |


### Interface web

Interface **React** (Vite) + **Transformers.js** (ONNX dans un Web Worker), déployée sur **GitHub Pages**. Voir [`web_interface/`](web_interface/).


| Couche   | Outils                                              |
| -------- | --------------------------------------------------- |
| 🌐 Web   | React, Vite, Transformers.js, ONNX Runtime WASM      |
| 🧠 NER   | CamemBERT, BERT anglais, modèles ONNX personnalisés |
| 📦 Release | `npm run build` → GitHub Actions (`deploy-web.yml`) |


Même logique de revue et d'export — bureau ou navigateur, selon les besoins de l'équipe.

---

## 🌐 Version web

**[Incognito Web](https://xiaoouwang.github.io/Incognito/)** — interface autonome pour anonymiser des corpus qualitatifs **dans le navigateur**. Aucun Electron, aucun Python : le NER s'exécute localement via [Transformers.js](https://huggingface.co/docs/transformers.js) et ONNX Runtime WASM.

**Message clé pour les utilisateurs :** *Everything runs locally — your data never leaves your computer.* (affiché dans l'interface.)

👉 **[Essayer en ligne](https://xiaoouwang.github.io/Incognito/)** · [Code source](web_interface/) · [PWA](web_interface/README.md#install-as-an-app-pwa) · [Déploiement](web_interface/README.md#deploy-to-github-pages)


|                              | Version web                                                            | Application de bureau (ci-dessous)                    |
| ---------------------------- | ---------------------------------------------------------------------- | ----------------------------------------------------- |
| 🔒 **Confidentialité**        | Analyse dans le navigateur ; seul le modèle est téléchargé une fois     | 100 % local, hors ligne après installation du modèle  |
| 🧠 **NER**                    | CamemBERT (+ dates), BERT anglais, modèle Hugging Face personnalisé     | spaCy (sm/lg) + CamemBERT                             |
| 📁 **Mode lot**               | Dossier **ou** fichiers choisis (`.txt`, `.docx`) → revue → ZIP         | Dossier `.txt` → écriture dans `outputs-YYYYMMDD-HHMMSS/` |
| 📊 **Progression**            | Barres visuelles (téléchargement modèle, chargement lot, NER lot)        | Statut texte dans l'interface                         |
| 🏷️ **Label Studio**           | Export JSON + config XML                                               | Idem + import lot                                     |
| 💾 **Installation**           | URL ou **PWA** (Chrome / Edge) — voir [instructions](web_interface/README.md#install-as-an-app-pwa) | Installateurs macOS / Windows / Linux                 |


Déployé sur **GitHub Pages** à chaque push sur `main` qui modifie `web_interface/` (workflow [`.github/workflows/deploy-web.yml`](.github/workflows/deploy-web.yml) — les changements hors de ce dossier ne redéploient pas le site).

---

## 💾 Téléchargement (application de bureau)

🌍 **Cross-platform** — binaires autonomes pour **macOS**, **Windows** et **Linux** → [GitHub Releases](https://github.com/xiaoouwang/Incognito/releases)


| Plateforme              | Fichier typique             |
| ----------------------- | --------------------------- |
| 🍎 macOS (Apple Silicon) | `Incognito-0.2.0-arm64.dmg` |
| 🍎 macOS (Intel)         | `Incognito-0.2.0.dmg`       |
| 🪟 Windows               | `Incognito Setup 0.2.0.exe` |
| 🐧 Linux                 | `Incognito-0.2.0.AppImage`  |


Premier lancement CamemBERT : connexion internet une fois (~400 Mo, téléchargement du modèle Hugging Face).

---

## 🛠️ Développeurs

**Prérequis** — Node.js 20+, Python **3.12**

```bash
git clone https://github.com/xiaoouwang/Incognito.git
cd Incognito
npm install

python3.12 -m venv .venv
.venv/bin/pip install -r requirements.txt
.venv/bin/pip install -r requirements-camembert.txt   # CamemBERT
.venv/bin/python -m spacy download fr_core_news_sm
.venv/bin/python -m spacy download fr_core_news_lg

npm run dev
```

**Créer les installateurs**

```bash
npm run dist:mac      # macOS — bundle complet (spaCy + CamemBERT)
npm run dist:win      # Windows
npm run dist:linux    # Linux
```

Version allégée (spaCy seul, ~3× plus léger) : `npm run dist:mac:spacy` (idem `:win`, `:linux`).

CI multi-plateforme : workflow **Release binaries** dans `.github/workflows/release.yml`.

### Branches Git (développement par plateforme)

À partir de la version **0.2.0**, la branche main est utilisée pour le développement sous MacOS.


| Branche   | Usage                                           |
| --------- | ----------------------------------------------- |
| `main`    | Modifications et builds spécifiques **macOS**   |
| `windows` | Modifications et builds spécifiques **Windows** |
| `linux`   | Modifications et builds spécifiques **Linux**   |


**Workflow recommandé**

```bash
# Basculer vers la branche de votre plateforme avant de travailler
git checkout main        # sur macOS
git checkout windows    # sur Windows
git checkout linux      # sur Linux
```

Toute modification doit être faite sur la branche correspondant à la plateforme ciblée.

---

## 📚 Citer cet outil

Si vous utilisez **Incognito** dans un article, un rapport, un protocole ou un jeu de données, merci de citer :

> Wang, X. (2026). *Incognito: A privacy-first, cross-platform tool for reviewing and anonymizing qualitative texts in the social sciences* (Version 0.2.0) [Logiciel]. Maison des Sciences de l'Homme Sud-Est / Université Côte d'Azur. [https://github.com/xiaoouwang/Incognito](https://github.com/xiaoouwang/Incognito)

**Clé LaTeX** — `wang2026incognito`

```latex
\cite{wang2026incognito}
```

**BibTeX**

```bibtex
@software{wang2026incognito,
  author  = {Wang, Xiaoou},
  title   = {{Incognito}: A privacy-first, cross-platform tool for reviewing and anonymizing qualitative texts in the social sciences},
  year    = {2026},
  version = {0.2.0},
  url     = {https://github.com/xiaoouwang/Incognito},
  note    = {Desktop (Electron + spaCy/CamemBERT) and browser (Transformers.js) interfaces.
             Maison des Sciences de l'Homme Sud-Est, Universit{\'e} C{\^o}te d'Azur}
}
```

**APA (7e éd.)**

> Wang, X. (2026). *Incognito: A privacy-first, cross-platform tool for reviewing and anonymizing qualitative texts in the social sciences* (Version 0.2.0) [Computer software]. Maison des Sciences de l'Homme Sud-Est, Université Côte d'Azur. [https://github.com/xiaoouwang/Incognito](https://github.com/xiaoouwang/Incognito)

Un fichier `[CITATION.cff](CITATION.cff)` est aussi disponible pour l'onglet **Cite this repository** sur GitHub.

---

## 📜 Note

Les rapports d'audit peuvent contenir des valeurs sensibles : manipulez-les comme vos données sources.

**Contact** — [xiaoou.wang@univ-cotedazur.fr](mailto:xiaoou.wang@univ-cotedazur.fr)

---

## 📄 License

Copyright (c) 2026 Xiaoou Wang

**Incognito** (v0.2.0) is free and open-source software released under the [GNU Affero General Public License v3.0 (AGPLv3)](LICENSE).

You are free to use, study, modify, and redistribute this software under the terms of the AGPLv3 license.

If you distribute a modified version of Incognito, or make it available to users over a network, you must also make the corresponding source code available under the same license.

The full license text is available in the [LICENSE](LICENSE) file included with this repository.

### Citation

If you use Incognito in academic research, please cite the project and acknowledge its use in publications whenever appropriate.

### Copyright and Authorship

Incognito was designed and developed by Xiaoou Wang.

Copyright remains with the original author. The AGPLv3 license grants users the rights to use, modify, and redistribute the software under the conditions specified by the license.

© 2026 Xiaoou Wang. All rights reserved except as granted under the AGPLv3 license.

---

## 📝 Mises à jour

Historique des évolutions fonctionnelles, avec date et fonctions concernées dans le code.

### 2026-06-25 — Interface web (Incognito = bureau + navigateur)

- **Incognito** n'est plus limité au bureau : ajout de l'interface **[web_interface/](web_interface/)** — React + Vite + Transformers.js, revue interactive, rapport d'audit, export Label Studio, mode lot (ZIP).
- Déploiement automatique sur **[GitHub Pages](https://xiaoouwang.github.io/Incognito/)** via `.github/workflows/deploy-web.yml`.
- Liens croisés bureau ↔ web dans les deux interfaces.
- **PWA** — installation depuis Chrome / Edge (`manifest.webmanifest`, `sw.js`).
- **Confidentialité** — message visible : *Everything runs locally — your data never leaves your computer.*
- **Mode lot web** — dossier entier ou fichiers choisis ; formats `.txt` et `.docx` (mammoth) ; barres de progression (modèle, chargement, NER).
- Composants : `ModelProgress`, `BatchJobProgress`, `InstallAppBanner`, `batchLoad.js`.

### 2026-06-24 — Mode lot, navigation et sorties


| Fonction / handler                            | Fichier             | Rôle                                                                                               |
| --------------------------------------------- | ------------------- | -------------------------------------------------------------------------------------------------- |
| `processInitialBatchFolder`                   | `src/App.jsx`       | À l'ouverture d'un dossier, lance le NER sur **tous** les fichiers et écrit les sorties initiales. |
| `buildBatchFileOutputs`                       | `src/App.jsx`       | Construit texte anonymisé, rapport et JSON Label Studio pour un fichier donné.                     |
| `createCategorySelectionFromEntities`         | `src/App.jsx`       | Active toutes les catégories détectées après un passage NER automatique.                           |
| `writeBatchOutputsForFile`                    | `src/App.jsx`       | Écrit les trois artefacts d'un fichier vers le dossier de sortie courant.                          |
| `goToFile`                                    | `src/App.jsx`       | Change de fichier ; finalise le fichier quitté avec le suffixe `_modified`.                        |
| `handleJumpToFileNumber`                      | `src/App.jsx`       | Navigation directe vers le fichier n° *N* (1-based).                                               |
| `handleJumpToFileName`                        | `src/App.jsx`       | Navigation par nom de fichier (exact, insensible à la casse, ou correspondance partielle unique).  |
| `findBatchFileIndex`                          | `src/App.jsx`       | Résout un nom de fichier vers son index dans le lot.                                               |
| `loadBatchFolder`                             | `src/App.jsx`       | Charge un dossier, crée le dossier de sortie horodaté, lance le traitement initial.                |
| `persistCurrentFileState` / `applyFileState`  | `src/App.jsx`       | Mémorisent et restaurent l'état de revue par fichier (`outputsModified`, entités, catégories).     |
| `createUniqueBatchOutputDir`                  | `electron/main.cjs` | Crée `outputs-YYYYMMDD-HHMMSS` pour éviter d'écraser des runs précédents.                          |
| `formatBatchOutputTimestamp`                  | `electron/main.cjs` | Formate l'horodatage du dossier de sortie.                                                         |
| `buildBatchOutputPaths`                       | `electron/main.cjs` | Chemins `*-anonymized.txt` ou `*-anonymized_modified.txt` (idem rapport et Label Studio).          |
| `removeBatchOutputVariant`                    | `electron/main.cjs` | Supprime l'autre variante (standard / `_modified`) lors d'un changement de statut.                 |
| `batch:loadTextFolder` / `batch:writeOutputs` | `electron/main.cjs` | IPC Electron pour charger un dossier et écrire les sorties lot.                                    |


**Comportement :** sorties dans `outputs-YYYYMMDD-HHMMSS/` ; noms standard à l'issue du traitement automatique ; suffixe `_modified` dès que l'utilisateur **quitte** un fichier (Précédent / Suivant, saut par numéro ou nom, fermeture du dossier).

### 2026-06-24 — Rapport d'audit et traçabilité


| Fonction                      | Fichier       | Rôle                                                                |
| ----------------------------- | ------------- | ------------------------------------------------------------------- |
| `createAuditReport`           | `src/App.jsx` | Rapport Markdown complet (résumé, provenance, index des spans).     |
| `summarizeDocumentProvenance` | `src/App.jsx` | Compte les spans automatiques vs revue manuelle au niveau document. |
| `summarizeSpanProvenance`     | `src/App.jsx` | Provenance par valeur (catégorie + texte).                          |
| `isManualEntity`              | `src/App.jsx` | Détecte les spans ajoutés en revue humaine (`source: manual`).      |
| `formatProvenanceLabel`       | `src/App.jsx` | Libellés lisibles pour chaque source NER.                           |
| `formatSpanProvenanceDetail`  | `src/App.jsx` | Détail des comptages par source dans une ligne de décision.         |
| `formatValueDecisionLine`     | `src/App.jsx` | Ligne par valeur remplacée / exclue, avec origine et positions.     |
| `formatSpanOffset`            | `src/App.jsx` | Affiche une plage de caractères `start–end`.                        |
| `formatSpanPositionLines`     | `src/App.jsx` | Liste indentée des positions par span.                              |
| `formatSpanIndexLines`        | `src/App.jsx` | Section *Complete Span Index* (tous les spans ordonnés).            |


**Convention des positions :** indexation **0-based**, `start` inclusif et `end` exclusif (comme `String.slice` en JavaScript).

### 2026-06-24 — Revue manuelle et catégories personnalisées


| Fonction                                         | Fichier                    | Rôle                                                                                       |
| ------------------------------------------------ | -------------------------- | ------------------------------------------------------------------------------------------ |
| `addEntitySpans`                                 | `src/App.jsx`              | Ajoute des spans manuels avec `source: manual`.                                            |
| `findAllOccurrenceRanges`                        | `src/App.jsx`              | Trouve toutes les occurrences d'un mot (limites Unicode).                                  |
| `buildWordBasedSearchPattern`                    | `src/App.jsx`              | Motif de recherche insensible à la casse avec frontières de mot.                           |
| `createCustomCategoryId`                         | `src/App.jsx`              | Crée un identifiant stable pour une catégorie personnalisée.                               |
| `mergeCustomCategories`                          | `src/App.jsx`              | Fusionne les catégories custom (partagées en mode lot via `batchCustomCategoriesRef`).     |
| `countEntitySpans`                               | `src/App.jsx`              | Compte les spans réels (corrige l'affichage des puces d'entités).                          |
| `EntityEditMenu`                                 | `src/App.jsx`              | Menu d'ajout/suppression ; portée *toutes les occurrences* ou *cette sélection seulement*. |
| `createLabelStudioExport` / `toLabelStudioLabel` | `src/labelStudioExport.js` | Export Label Studio incluant les catégories personnalisées.                                |


### 2026-06-24 — Identité *Incognito* (v0.2.0)

- Renommage de l'application, logo, favicon, barre de titre Electron centrée, icônes de build (`build/icon.png`).
- Installateurs macOS : `Incognito-0.2.0-arm64.dmg`, `Incognito-0.2.0.dmg`.

### 2026-06-23 — Publication et plateformes

- Workflows GitHub Actions multi-OS (`macos` / `windows` / `ubuntu`).
- Fichier de citation `[CITATION.cff](CITATION.cff)` et section *Citer cet outil*.
- Préparation de l'article `[arxiv/main.tex](arxiv/main.tex)`.

