import json
import re
import sys

import spacy

SPACY_MODELS = {
    "spacy-sm": "fr_core_news_sm",
    "spacy-lg": "fr_core_news_lg",
}

CAMEMBERT_MODEL_ID = "Jean-Baptiste/camembert-ner"

SPACY_TO_APP_LABEL = {
    "PER": "person",
    "PERSON": "person",
    "LOC": "location",
    "GPE": "location",
    "ORG": "organization",
    "MISC": "misc",
    "DATE": "date",
}

CAMEMBERT_TO_APP_LABEL = {
    "PER": "person",
    "LOC": "location",
    "ORG": "organization",
    "MISC": "misc",
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

BACKEND_CACHE = {}


def main():
    if "--server" in sys.argv:
        run_server()
        return

    payload = json.load(sys.stdin)
    text = payload.get("text", "")
    backend = normalize_backend(payload.get("backend", "spacy"))
    print(json.dumps(detect_entities(text, backend)))


def run_server():
    print(
        json.dumps(
            {
                "type": "ready",
                "backends": ["spacy-sm", "spacy-lg", "camembert"],
                "default_backend": "spacy-lg",
            }
        ),
        flush=True,
    )

    for line in sys.stdin:
        payload = None
        try:
            payload = json.loads(line)
            request_id = payload.get("id")
            text = payload.get("text", "")
            backend = normalize_backend(payload.get("backend", "spacy"))
            result = detect_entities(text, backend)
            print(
                json.dumps({"type": "result", "id": request_id, "result": result}),
                flush=True,
            )
        except Exception as error:
            print(
                json.dumps(
                    {
                        "type": "error",
                        "id": payload.get("id") if payload else None,
                        "error": str(error),
                    }
                ),
                flush=True,
            )


def normalize_backend(value):
    backend = (value or "spacy-lg").strip().lower()
    if backend == "spacy":
        backend = "spacy-lg"
    if backend not in {"spacy-sm", "spacy-lg", "camembert"}:
        raise ValueError(f"Unknown NER backend: {value}")
    return backend


def detect_entities(text, backend):
    if backend == "camembert":
        model_entities = detect_with_camembert(text)
        model_name = CAMEMBERT_MODEL_ID
    else:
        model_entities, model_name = detect_with_spacy(text, backend)

    entities = list(model_entities)
    entities.extend(detect_with_rules(text))
    entities = split_entities_at_newlines(text, entities)

    return {
        "backend": backend,
        "model": model_name or "none",
        "entities": merge_entities(entities),
    }


def detect_with_spacy(text, backend):
    nlp, model_name = get_spacy_backend(backend)
    entities = []

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

    return entities, model_name


def detect_with_camembert(text):
    pipeline = get_camembert_backend()
    entities = []
    search_from = 0

    for ent in pipeline(text):
        word = (ent.get("word") or "").strip()
        if not word:
            continue

        start = ent.get("start")
        end = ent.get("end")
        if start is None or end is None:
            start = text.find(word, search_from)
            if start < 0:
                start = text.lower().find(word.lower())
            if start < 0:
                continue
            end = start + len(word)
            search_from = end

        entities.append(
            {
                "text": word,
                "start": start,
                "end": end,
                "label": CAMEMBERT_TO_APP_LABEL.get(ent.get("entity_group"), "misc"),
                "source": f"camembert:{CAMEMBERT_MODEL_ID}",
            }
        )

    return entities


def detect_with_rules(text):
    entities = []

    for label, pattern in RULE_PATTERNS:
        for match in pattern.finditer(text):
            match_text = trim_match(match.group(0))
            entities.append(
                {
                    "text": match_text,
                    "start": match.start(),
                    "end": match.start() + len(match_text),
                    "label": label,
                    "source": "rule",
                }
            )

    return entities


def get_spacy_backend(backend):
    if backend not in BACKEND_CACHE:
        BACKEND_CACHE[backend] = load_spacy_model(backend)
    return BACKEND_CACHE[backend]


def load_spacy_model(backend):
    model_name = SPACY_MODELS.get(backend)
    if not model_name:
        raise ValueError(f"Unknown spaCy backend: {backend}")

    try:
        return spacy.load(model_name), model_name
    except OSError as error:
        raise RuntimeError(
            f"spaCy model '{model_name}' is not installed. "
            f"Run: python -m spacy download {model_name}"
        ) from error


def get_camembert_backend():
    if "camembert" not in BACKEND_CACHE:
        BACKEND_CACHE["camembert"] = load_camembert_model()
    return BACKEND_CACHE["camembert"]


def load_camembert_model():
    import torch
    from transformers import pipeline
    from transformers.models.camembert import CamembertTokenizer

    if not hasattr(torch, "Tensor"):
        raise RuntimeError(
            "PyTorch is not available. Install CamemBERT dependencies with "
            "pip install -r requirements-camembert.txt"
        )

    tokenizer = CamembertTokenizer.from_pretrained(CAMEMBERT_MODEL_ID)
    return pipeline(
        "ner",
        model=CAMEMBERT_MODEL_ID,
        tokenizer=tokenizer,
        aggregation_strategy="simple",
    )


def split_entities_at_newlines(text, entities):
    expanded = []

    for entity in entities:
        start = entity["start"]
        end = entity["end"]
        if start >= end or end > len(text):
            expanded.append(entity)
            continue

        chunk_start = start
        split = False

        for index in range(start, end):
            if text[index] != "\n":
                continue

            split = True
            piece = text[chunk_start:index]
            if piece.strip():
                expanded.append(
                    {**entity, "start": chunk_start, "end": index, "text": piece}
                )
            chunk_start = index + 1

        if not split:
            expanded.append(entity)
            continue

        if chunk_start < end:
            piece = text[chunk_start:end]
            if piece.strip():
                expanded.append(
                    {**entity, "start": chunk_start, "end": end, "text": piece}
                )

    return expanded


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

    for entity in sorted_entities:
        if entity["start"] >= entity["end"]:
            continue

        if any(
            entity["start"] < existing["end"] and entity["end"] > existing["start"]
            for existing in kept
        ):
            continue

        kept.append(entity)

    return sorted(kept, key=lambda item: item["start"])


def trim_match(value):
    return value.rstrip(".,;:)")


if __name__ == "__main__":
    main()
