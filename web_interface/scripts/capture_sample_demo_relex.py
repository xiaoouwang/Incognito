#!/usr/bin/env python3
"""Capture real GLiNER-ReLex NER+relations for the Marie Dupont sample demo.

Writes JSON that sampleDemo.js can embed (entities + relations).
Uses the same label sets / thresholds as web_interface ReLex defaults.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

from gliner import GLiNER

ROOT = Path(__file__).resolve().parents[1]
SAMPLE_TEXT = """Marie Dupont, âgée de 43 ans, habite au 15 rue des Orangers à Nice. Elle travaille comme enseignante au lycée Masséna depuis septembre 2018. Son mari, Pierre Martin, est médecin à l’hôpital Pasteur. Ils ont deux enfants, Lucas, 12 ans, et Emma, 8 ans.

Marie est née le 14 mars 1983 à Lyon. Elle utilise l’adresse électronique marie.dupont@example.com et peut être contactée au 06 12 34 56 78.

Lors d’un entretien réalisé le 5 octobre 2026, Marie explique qu’elle a récemment déménagé dans le quartier de Cimiez. Elle précise que son mari travaille souvent de nuit et que leur fils Lucas est scolarisé dans le même établissement où elle enseigne.

Quelques minutes plus tard, elle ajoute : « Mon père, Jean Dupont, était professeur à l’Université Côte d’Azur. Il a pris sa retraite en 2020. Ma sœur Sophie travaille maintenant à la mairie de Cannes. »

Enfin, Marie indique qu’elle est la seule enseignante de chinois de son établissement à avoir participé à un programme d’échange universitaire avec Pékin en 2019."""

# Mirror web_interface/src/lib/glinerConstants.js + glinerRelexConstants.js
ENTITY_LABELS = [
    "person",
    "organization",
    "location",
    "address",
    "email",
    "url",
    "phone number",
    "date",
    "age",
    "profession",
    "job title or project role",
    "school",
    "hospital",
    "family member",
    "nationality",
    "disease",
    "diploma",
]

RELATION_LABELS = [
    "lives at",
    "lives in",
    "resides at",
    "has address",
    "has home",
    "located in",
    "habite à",
    "habite au",
    "réside à",
    "domicilié à",
    "born in",
    "born on",
    "né à",
    "née à",
    "né le",
    "née le",
    "works for",
    "works at",
    "employed by",
    "travaille pour",
    "travaille à",
    "employé par",
    "studied at",
    "attends school",
    "student at",
    "élève à",
    "étudie à",
    "scolarisée à",
    "scolarisée au",
    "treated at",
    "patient at",
    "hospitalized at",
    "soigné à",
    "soignée à",
    "hospitalisé à",
    "hospitalisée à",
    "colleague of",
    "family of",
    "spouse of",
    "child of",
    "parent of",
    "sibling of",
    "mother of",
    "father of",
    "son of",
    "daughter of",
    "brother of",
    "sister of",
    "marié à",
    "mariée à",
    "époux de",
    "épouse de",
    "fils de",
    "fille de",
    "père de",
    "mère de",
    "frère de",
    "sœur de",
    "reports to",
    "manages",
    "has email",
    "has phone",
    "has nationality",
    "suffers from",
    "has diploma",
    "graduated from",
    "has age",
    "aged",
    "âge de",
    "has profession",
    "works as",
    "has job title",
    "exerce comme",
    "profession de",
]

ENTITY_THRESHOLD = 0.3
RELATION_THRESHOLD = 0.35
ADJACENCY_THRESHOLD = 0.35
MODEL_ID = "knowledgator/gliner-relex-base-v1.0"


def main() -> int:
    out_path = ROOT / "src" / "lib" / "sampleDemoRelexFixture.json"
    print(f"Loading {MODEL_ID}…", flush=True)
    model = GLiNER.from_pretrained(MODEL_ID)

    print("Running inference…", flush=True)
    entities, relations = model.inference(
        texts=[SAMPLE_TEXT],
        labels=ENTITY_LABELS,
        relations=RELATION_LABELS,
        threshold=ENTITY_THRESHOLD,
        relation_threshold=RELATION_THRESHOLD,
        adjacency_threshold=ADJACENCY_THRESHOLD,
        return_relations=True,
        flat_ner=False,
    )

    entity_rows = []
    for entity in entities[0]:
        start = int(entity["start"])
        end = int(entity["end"])
        text = SAMPLE_TEXT[start:end]
        entity_rows.append(
            {
                "label": entity["label"],
                "text": text,
                "start": start,
                "end": end,
                "score": round(float(entity.get("score", 0)), 4),
                "source": "gliner-relex-capture",
            }
        )

    relation_rows = []
    for relation in relations[0]:
        head = relation["head"]
        tail = relation["tail"]
        relation_rows.append(
            {
                "head": {
                    "text": head.get("text") or SAMPLE_TEXT[int(head["start"]) : int(head["end"])],
                    "label": head.get("label") or head.get("type") or "misc",
                    "start": int(head["start"]) if head.get("start") is not None else None,
                    "end": int(head["end"]) if head.get("end") is not None else None,
                    "score": round(float(head["score"]), 4) if head.get("score") is not None else None,
                },
                "tail": {
                    "text": tail.get("text") or SAMPLE_TEXT[int(tail["start"]) : int(tail["end"])],
                    "label": tail.get("label") or tail.get("type") or "misc",
                    "start": int(tail["start"]) if tail.get("start") is not None else None,
                    "end": int(tail["end"]) if tail.get("end") is not None else None,
                    "score": round(float(tail["score"]), 4) if tail.get("score") is not None else None,
                },
                "relation": relation["relation"],
                "score": round(float(relation.get("score", 0)), 4),
            }
        )

    payload = {
        "modelId": MODEL_ID,
        "entityThreshold": ENTITY_THRESHOLD,
        "relationThreshold": RELATION_THRESHOLD,
        "adjacencyThreshold": ADJACENCY_THRESHOLD,
        "entityLabels": ENTITY_LABELS,
        "relationLabels": RELATION_LABELS,
        "entities": entity_rows,
        "relations": relation_rows,
    }
    out_path.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Wrote {out_path}")
    print(f"entities={len(entity_rows)} relations={len(relation_rows)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
