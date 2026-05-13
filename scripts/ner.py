import json
import re
import sys

import spacy


MODEL_CANDIDATES = [
    "fr_core_news_md",
    "fr_core_news_sm",
    "en_core_web_sm",
]

SPACY_TO_APP_LABEL = {
    "PER": "person",
    "PERSON": "person",
    "LOC": "location",
    "GPE": "location",
    "ORG": "organization",
    "MISC": "misc",
    "DATE": "date",
}

RULE_PATTERNS = [
    ("email", re.compile(r"\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b", re.I)),
    ("url", re.compile(r"\bhttps?://[^\s<>\"']+|\bwww\.[^\s<>\"']+", re.I)),
    (
        "date",
        re.compile(
            r"\b(?:"
            r"\d{1,2}[/-]\d{1,2}[/-]\d{2,4}|"
            r"\d{4}[/-]\d{1,2}[/-]\d{1,2}|"
            r"\d{1,2}\s+(?:janvier|février|fevrier|mars|avril|mai|juin|juillet|août|aout|septembre|octobre|novembre|décembre|decembre|january|february|march|april|may|june|july|august|september|october|november|december)\s+\d{2,4}"
            r")\b",
            re.I,
        ),
    ),
    (
        "phone",
        re.compile(r"(?:\+?\d{1,3}[\s.-]?)?(?:\(?\d{2,4}\)?[\s.-]?){2,4}\d{2,4}\b"),
    ),
]


def detect_entities(text, nlp, model_name):
    entities = []
    if nlp is not None:
        doc = nlp(text)
        entities.extend(
            {
                "text": ent.text,
                "start": ent.start_char,
                "end": ent.end_char,
                "label": SPACY_TO_APP_LABEL.get(ent.label_, ent.label_.lower()),
                "source": f"spacy:{model_name}",
            }
            for ent in doc.ents
            if ent.text.strip()
        )

    for label, pattern in RULE_PATTERNS:
        for match in pattern.finditer(text):
            entities.append(
                {
                    "text": trim_match(match.group(0)),
                    "start": match.start(),
                    "end": match.start() + len(trim_match(match.group(0))),
                    "label": label,
                    "source": "rule",
                }
            )

    return {"model": model_name or "none", "entities": merge_entities(entities)}


def main():
    if "--server" in sys.argv:
        run_server()
        return

    payload = json.load(sys.stdin)
    text = payload.get("text", "")
    nlp, model_name = load_model()
    print(json.dumps(detect_entities(text, nlp, model_name)))


def run_server():
    nlp, model_name = load_model()
    print(json.dumps({"type": "ready", "model": model_name or "none"}), flush=True)

    for line in sys.stdin:
        try:
            payload = json.loads(line)
            request_id = payload.get("id")
            text = payload.get("text", "")
            result = detect_entities(text, nlp, model_name)
            print(
                json.dumps({"type": "result", "id": request_id, "result": result}),
                flush=True,
            )
        except Exception as error:
            print(
                json.dumps(
                    {
                        "type": "error",
                        "id": payload.get("id") if "payload" in locals() else None,
                        "error": str(error),
                    }
                ),
                flush=True,
            )


def load_model():
    for model_name in MODEL_CANDIDATES:
        try:
            return spacy.load(model_name), model_name
        except OSError:
            continue

    return None, None


def merge_entities(entities):
    sorted_entities = sorted(
        entities,
        key=lambda item: (
            0 if item["source"] == "rule" else 1,
            item["start"],
            -(item["end"] - item["start"]),
        ),
    )
    kept = []
    seen = set()

    for entity in sorted_entities:
        if entity["start"] >= entity["end"]:
            continue

        key = (entity["label"], entity["text"].casefold())

        if key in seen:
            continue

        if any(
            entity["start"] < existing["end"] and entity["end"] > existing["start"]
            for existing in kept
        ):
            continue

        seen.add(key)
        kept.append(entity)

    return sorted(kept, key=lambda item: item["start"])


def trim_match(value):
    return value.rstrip(".,;:)")


if __name__ == "__main__":
    main()
