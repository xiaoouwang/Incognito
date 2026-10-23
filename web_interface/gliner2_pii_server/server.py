#!/usr/bin/env python3
"""Local GLiNER2-PII ONNX sidecar for Incognito Basic mode.

Uses okasi/gliner2-privacy-filter-pii-multi-onnx (Q8 MatMulNBits) via onnxruntime.
Fixed SPY 7-label schema baked at export time.
"""

from __future__ import annotations

import os
import re
from pathlib import Path
from typing import Any

import numpy as np
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

MODEL_ID = os.environ.get(
    "GLINER2_PII_MODEL",
    "okasi/gliner2-privacy-filter-pii-multi-onnx",
)
ONNX_FILE = os.environ.get("GLINER2_PII_ONNX_FILE", "model_q8.onnx")
HOST = os.environ.get("GLINER2_PII_HOST", "127.0.0.1")
PORT = int(os.environ.get("GLINER2_PII_PORT", "8765"))
DEFAULT_THRESHOLD = float(os.environ.get("GLINER2_PII_THRESHOLD", "0.5"))
CACHE_DIR = Path(
    os.environ.get(
        "GLINER2_PII_CACHE",
        Path(__file__).resolve().parent / ".model_cache",
    )
)
# Optional: point at an already-downloaded Hub snapshot (skips download).
LOCAL_MODEL_DIR = os.environ.get("GLINER2_PII_LOCAL_DIR", "").strip()

# Export-fixed label order (entity_labels.json). Do not reorder.
ENTITY_LABELS = [
    "name",
    "address",
    "email",
    "phone_num",
    "id_num",
    "url",
    "username",
]

LABEL_MAP = {
    "name": "person",
    "address": "address",
    "email": "email",
    "phone_num": "phone",
    "id_num": "misc",
    "url": "url",
    "username": "misc",
}

SPECIAL_TOKENS = {
    "[P]",
    "[E]",
    "[SEP_TEXT]",
    "[C]",
    "[R]",
    "[L]",
    "[SEP_STRUCT]",
    "[EXAMPLE]",
    "[OUTPUT]",
    "[DESCRIPTION]",
}

WORD_RE = re.compile(
    r"(?:https?://[^\s]+|www\.[^\s]+)|"
    r"[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}|"
    r"@[a-z0-9_]+|"
    r"\w+(?:[-_]\w+)*|"
    r"\S",
    flags=re.IGNORECASE,
)

app = FastAPI(title="Incognito GLiNER2-PII ONNX", version="0.2.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

_session = None
_tokenizer = None
_model_dir: Path | None = None
_model_error: str | None = None


def split_words(text: str) -> list[dict[str, Any]]:
    lowered = text.lower()
    words: list[dict[str, Any]] = []
    for match in WORD_RE.finditer(lowered):
        words.append(
            {
                "text": match.group(0),
                "start": match.start(),
                "end": match.end(),
            }
        )
    return words


def build_feed(tokenizer, text: str) -> dict[str, Any]:
    words = split_words(text)
    schema_tokens = ["(", "[P]", "entities", "("]
    for label in ENTITY_LABELS:
        schema_tokens.append("[E]")
        schema_tokens.extend(label.split())
    schema_tokens.extend([")", ")"])
    full = [*schema_tokens, "[SEP_TEXT]", *[word["text"] for word in words]]

    input_ids: list[int] = []
    text_word_indices: list[int] = []
    for index, token in enumerate(full):
        piece = token if token in SPECIAL_TOKENS else f"\u2581{token}"
        encoded = tokenizer(piece, add_special_tokens=False)["input_ids"]
        if index >= len(schema_tokens) + 1:
            text_word_indices.append(len(input_ids))
        input_ids.extend(encoded)

    return {
        "input_ids": np.asarray([input_ids], dtype=np.int64),
        "attention_mask": np.ones((1, len(input_ids)), dtype=np.int64),
        "text_word_indices": np.asarray([text_word_indices], dtype=np.int64),
        "text_word_counts": np.asarray([len(words)], dtype=np.int64),
        "start_mapping": [word["start"] for word in words],
        "end_mapping": [word["end"] for word in words],
    }


def find_char_spans(
    scores: np.ndarray,
    threshold: float,
    text_len: int,
    text: str,
    start_map: list[int],
    end_map: list[int],
) -> list[tuple[str, float, int, int]]:
    valid = np.where(scores[:text_len, :] >= threshold)
    spans: list[tuple[str, float, int, int]] = []
    for start, width in zip(valid[0].tolist(), valid[1].tolist()):
        end = start + width + 1
        if not (0 <= start < text_len and end <= text_len):
            continue
        try:
            char_start = start_map[start]
            char_end = end_map[end - 1]
            text_span = text[char_start:char_end].strip()
        except (IndexError, KeyError):
            continue
        if text_span:
            spans.append((text_span, float(scores[start, width]), char_start, char_end))
    return spans


def decode_entities(
    *,
    text: str,
    count_logits: np.ndarray,
    span_scores: np.ndarray,
    start_mapping: list[int],
    end_mapping: list[int],
    threshold: float,
) -> list[dict[str, Any]]:
    if int(np.asarray(count_logits).argmax()) <= 0:
        return []

    text_len = len(start_mapping)
    entities: list[dict[str, Any]] = []
    for label_index, raw_label in enumerate(ENTITY_LABELS):
        label_scores = span_scores[label_index, :text_len, :]
        spans = find_char_spans(
            label_scores,
            threshold,
            text_len,
            text,
            start_mapping,
            end_mapping,
        )
        if not spans:
            continue
        spans.sort(key=lambda item: item[1], reverse=True)
        selected: list[tuple[str, float, int, int]] = []
        for candidate in spans:
            overlap = any(
                not (candidate[3] <= item[2] or candidate[2] >= item[3])
                for item in selected
            )
            if not overlap:
                selected.append(candidate)
        mapped = LABEL_MAP.get(raw_label, raw_label)
        for text_span, confidence, char_start, char_end in selected:
            entities.append(
                {
                    "id": f"gliner2-pii-{char_start}-{char_end}-{mapped}",
                    "start": char_start,
                    "end": char_end,
                    "text": text_span,
                    "label": mapped,
                    "score": confidence,
                    "source": "gliner2-pii",
                    "rawLabel": raw_label,
                }
            )

    entities.sort(key=lambda item: (item["start"], item["end"]))
    return entities


def ensure_model():
    global _session, _tokenizer, _model_dir, _model_error
    if _session is not None and _tokenizer is not None:
        return _session, _tokenizer
    if _model_error:
        raise RuntimeError(_model_error)

    try:
        import onnxruntime as ort
        from huggingface_hub import snapshot_download
        from transformers import AutoTokenizer

        if LOCAL_MODEL_DIR:
            model_dir = Path(LOCAL_MODEL_DIR).expanduser().resolve()
            print(f"[gliner2-pii] using local dir {model_dir}", flush=True)
        else:
            print(
                f"[gliner2-pii] downloading/loading {MODEL_ID} ({ONNX_FILE}) …",
                flush=True,
            )
            CACHE_DIR.mkdir(parents=True, exist_ok=True)
            model_dir = Path(
                snapshot_download(
                    MODEL_ID,
                    local_dir=str(CACHE_DIR / MODEL_ID.replace("/", "__")),
                    allow_patterns=[
                        ONNX_FILE,
                        f"{ONNX_FILE}.data",
                        "tokenizer.json",
                        "tokenizer_config.json",
                        "config.json",
                        "entity_labels.json",
                        "encoder_config/*",
                    ],
                )
            )
        onnx_path = model_dir / ONNX_FILE
        if not onnx_path.exists():
            raise FileNotFoundError(f"Missing {onnx_path}")

        _tokenizer = AutoTokenizer.from_pretrained(str(model_dir))
        _session = ort.InferenceSession(
            str(onnx_path),
            providers=["CPUExecutionProvider"],
        )
        _model_dir = model_dir
        print(f"[gliner2-pii] ready ({onnx_path})", flush=True)
        return _session, _tokenizer
    except Exception as exc:  # noqa: BLE001
        _model_error = str(exc)
        raise


class DetectRequest(BaseModel):
    text: str = Field(..., min_length=1)
    labels: list[str] | None = None
    threshold: float | None = None


@app.get("/health")
def health():
    return {
        "ok": True,
        "model": MODEL_ID,
        "onnx": ONNX_FILE,
        "labels": ENTITY_LABELS,
        "loaded": _session is not None,
        "error": _model_error,
        "cache": str(_model_dir) if _model_dir else None,
    }


@app.post("/detect")
def detect(body: DetectRequest):
    text = body.text.strip()
    if not text:
        raise HTTPException(status_code=400, detail="text is empty")

    threshold = DEFAULT_THRESHOLD if body.threshold is None else float(body.threshold)
    # Labels are fixed at ONNX export; ignore client overrides except for future compat.
    if body.labels and body.labels != ENTITY_LABELS:
        print(
            "[gliner2-pii] ignoring custom labels; export schema is fixed:",
            ENTITY_LABELS,
            flush=True,
        )

    try:
        session, tokenizer = ensure_model()
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=503, detail=f"model load failed: {exc}") from exc

    try:
        feed = build_feed(tokenizer, text)
        count_logits, span_scores = session.run(
            None,
            {
                "input_ids": feed["input_ids"],
                "attention_mask": feed["attention_mask"],
                "text_word_indices": feed["text_word_indices"],
                "text_word_counts": feed["text_word_counts"],
            },
        )
        entities = decode_entities(
            text=text,
            count_logits=count_logits[0],
            span_scores=span_scores[0],
            start_mapping=feed["start_mapping"],
            end_mapping=feed["end_mapping"],
            threshold=threshold,
        )
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=500, detail=f"inference failed: {exc}") from exc

    return {
        "entities": entities,
        "model": MODEL_ID,
        "onnx": ONNX_FILE,
        "threshold": threshold,
        "labels": ENTITY_LABELS,
    }


@app.post("/warmup")
def warmup():
    try:
        ensure_model()
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    return {"ok": True, "model": MODEL_ID, "onnx": ONNX_FILE}


def main() -> None:
    import uvicorn

    try:
        ensure_model()
    except Exception as exc:  # noqa: BLE001
        print(f"[gliner2-pii] warmup deferred: {exc}", flush=True)

    uvicorn.run(app, host=HOST, port=PORT, log_level="info")


if __name__ == "__main__":
    main()
