# ✨ Text Data Anonymizer

**Anonymisez vos corpus qualitatifs en local — sans envoyer vos données dans le cloud.**

Application de bureau pour les sciences humaines et sociales : entretiens, notes de terrain, réponses ouvertes. Détectez les entités sensibles, contrôlez ce qui est remplacé, exportez un texte anonymisé et une trace de vos décisions.

Développé par [Xiaoou Wang](https://xiaoouwang.github.io/) · Ingénieur en Humanités Numériques · [MSHS Sud-Est](https://mshs.univ-cotedazur.fr/) · [Université Côte d'Azur](https://univ-cotedazur.fr/)

---

## 🔒 Pourquoi cet outil ?

|                              |                                                                        |
| ---------------------------- | ---------------------------------------------------------------------- |
| 🏠 **100 % local**            | Aucun appel à une API externe. Vos textes restent sur votre machine.   |
| 🇫🇷 **Pensé pour le français** | Modèles spaCy et CamemBERT adaptés aux textes qualitatifs en français. |
| 👁️ **Contrôle humain**        | Vous validez, corrigez et désactivez entité par entité avant l'export. |
| 📋 **Traçabilité**            | Rapport d'audit et exports prêts pour l'archivage ou Label Studio.     |

> ⚠️ Assistant d'anonymisation, pas une garantie d'anonymat total. Relisez toujours le résultat avant diffusion.

---

## 🚀 En bref

1. **Importez** un texte ou un dossier de fichiers `.txt`
2. **Lancez** la détection d'entités (NER) en un clic
3. **Affinez** catégories et occurrences (personnes, lieux, organisations, dates, e-mails…)
4. **Exportez** texte anonymisé, rapport et JSON Label Studio — en direct en mode lot

Placeholders stables du type `[PERSON_1]`, `[LOCATION_2]`, `[EMAIL_1]`.

---

## 🧰 Fonctionnalités

- 🔍 **Trois moteurs NER** — spaCy (petit / grand) et CamemBERT
- 🖍️ **Revue interactive** — surlignage, ajout/suppression de spans, bascule par entité
- 📁 **Mode lot** — navigation fichier par fichier, sorties mises à jour en temps réel
- 📄 **Exports automatiques** — `*-anonymized.txt`, `*-report.md`, `*-label-studio.json`
- 🏷️ **Label Studio** — pré-annotations + configuration XML
- 📊 **Rapport d'audit** — décisions documentées pour vos protocoles de recherche

---

## 💾 Téléchargement

Binaires autonomes pour **macOS**, **Windows** et **Linux** → [GitHub Releases](https://github.com/xiaoouwang/anonymizer/releases)

| Plateforme              | Fichier typique                        |
| ----------------------- | -------------------------------------- |
| 🍎 macOS (Apple Silicon) | `Text Data Anonymizer-0.1.0-arm64.dmg` |
| 🍎 macOS (Intel)         | `Text Data Anonymizer-0.1.0.dmg`       |
| 🪟 Windows               | `Text Data Anonymizer Setup 0.1.0.exe` |
| 🐧 Linux                 | `Text Data Anonymizer-0.1.0.AppImage`  |

Premier lancement CamemBERT : connexion internet une fois (~400 Mo, téléchargement du modèle Hugging Face).

---

## 🛠️ Développeurs

**Prérequis** — Node.js 20+, Python **3.12**

```bash
git clone https://github.com/xiaoouwang/anonymizer.git
cd anonymizer
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

---

## 📚 Citer cet outil

Si vous utilisez **Text Data Anonymizer** dans un article, un rapport, un protocole ou un jeu de données, merci de citer :

> Wang, X. (2026). *Text Data Anonymizer* (Version 0.1.0) [Logiciel]. Maison des Sciences de l'Homme Sud-Est / Université Côte d'Azur. https://github.com/xiaoouwang/anonymizer

**Clé LaTeX** — `wang2026textdataanonymizer`

```latex
\cite{wang2026textdataanonymizer}
```

**BibTeX**

```bibtex
@software{wang2026textdataanonymizer,
  author  = {Wang, Xiaoou},
  title   = {Text Data Anonymizer},
  year    = {2026},
  version = {0.1.0},
  url     = {https://github.com/xiaoouwang/anonymizer},
  note    = {Local desktop application for qualitative text anonymization.
             Maison des Sciences de l'Homme Sud-Est, Universit{\'e} C{\^o}te d'Azur}
}
```

**APA (7e éd.)**

> Wang, X. (2026). *Text Data Anonymizer* (Version 0.1.0) [Computer software]. Maison des Sciences de l'Homme Sud-Est, Université Côte d'Azur. https://github.com/xiaoouwang/anonymizer

Un fichier [`CITATION.cff`](CITATION.cff) est aussi disponible pour l'onglet **Cite this repository** sur GitHub.

---

## 📜 Note

Outil de recherche en cours d'évolution. Les rapports d'audit peuvent contenir des valeurs sensibles : manipulez-les comme vos données sources.

**Contact** — [xiaoou.wang@univ-cotedazur.fr](mailto:xiaoou.wang@univ-cotedazur.fr)
