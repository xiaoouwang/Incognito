#!/usr/bin/env python3
"""Benchmark Albert generative anonymization (compact candidate-ID schema).

Usage:
  export ALBERT_API_KEY=sk-...
  python3 scripts/benchmark_albert.py
  python3 scripts/benchmark_albert.py --runs 3 --model openweight-small

Measures wall-clock latency, completion size, token usage, and finish_reason.
Reconstruction of strings from candidate IDs is done locally (same idea as the web client).
"""

from __future__ import annotations

import argparse
import json
import os
import re
import statistics
import sys
import time
import urllib.error
import urllib.request
from dataclasses import dataclass
from typing import Any

ALBERT_BASE = os.environ.get("ALBERT_BASE_URL", "https://albert.api.etalab.gouv.fr/v1").rstrip(
    "/"
)

SAMPLE_TEXT = """Le 14 septembre 2026, Claire Martin, née le 3 février 1989 à Grenoble, s’est présentée au service administratif de l’Université de Montfleury afin de mettre à jour son dossier. Elle réside actuellement au 27 rue des Tilleuls, 69003 Lyon et peut être contactée au 06 42 18 73 91 ou à l’adresse claire.martin89@example.fr.

Mme Martin travaille depuis avril 2024 comme ingénieure de recherche au laboratoire LIRIS. Son numéro de dossier est DR-2026-18452. Elle a indiqué que son contrat avait été préparé par Julien Moreau, responsable administratif du laboratoire. Celui-ci est joignable au 04 72 43 81 26.

Claire a également précisé que son ancienne adresse était 8 avenue Jean-Jaurès à Grenoble. Cette adresse figure encore sur certains documents associés à son dossier, notamment celui portant la référence CM-2024-771.

Quelques jours plus tard, Julien Moreau a envoyé un courriel au service RH pour signaler que Mme Martin avait changé de banque. Le nouveau compte communiqué par l’intéressée porte l’IBAN fictif FR76 9999 8888 7777 6666 5555 444. Dans son message, Julien mentionne également Sophie Bernard, collègue de Claire, qui travaille dans la même équipe mais n’est pas concernée par cette modification.

Sophie, née en 1992, habite à Villeurbanne. Elle partage le bureau 312 avec Claire. Le numéro 06 11 22 33 44 mentionné dans un précédent échange appartient à Sophie et non à Mme Martin."""

SYSTEM_PROMPT = """Groupe des ids candidats. Aucune chaine du texte. JSON seul.

Schema EXACT (x = lignes plates [personne,cle,id], PAS de listes imbriquees):
{"p":[[4,16,27],[24,57],[43,45],[67]],"x":[[0,"dob",5],[0,"tel",14],[0,"em",15],[1,"tel",26]],"r":[[0,"resp",1],[0,"col",2],[0,"fr",3]],"o":[9],"l":[8],"d":[1]}

- p[i]=ids meme personne (nom puis aliases/corefs)
- x=UNIQUEMENT [i,"dob"|"yob"|"pob"|"addr"|"addr0"|"tel"|"em"|"id"|"id0"|"iban"|"org"|"job"|"loc"|"room",id]
- r=UNIQUEMENT [i,"resp"|"col"|"fr"|"of"|"urg"|"bureau"|"col_de",j]
- o/l/d=ids orgs/lieux/dates
INTERDIT: texte, offsets, placeholders, x imbrique, relations dans x. Max ~40 lignes x."""


@dataclass
class Candidate:
    id: int
    start: int
    end: int
    text: str
    kind: str


def _collect(regex: re.Pattern[str], text: str, kind: str, out: list[tuple[int, int, str, str]]) -> None:
    for match in regex.finditer(text):
        out.append((match.start(), match.end(), match.group(0), kind))


def extract_candidates(text: str) -> list[Candidate]:
    raw: list[tuple[int, int, str, str]] = []
    _collect(re.compile(r"[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}", re.I), text, "em", raw)
    _collect(re.compile(r"(?:\+33|0)\s*[1-9](?:[\s.-]*\d{2}){4}"), text, "tel", raw)
    _collect(re.compile(r"\b[A-Z]{2}\d{2}(?:\s*\d{4}){2,8}\b"), text, "iban", raw)
    _collect(re.compile(r"\b[A-Z]{1,4}-\d{4}-\d{2,6}\b"), text, "id", raw)
    _collect(
        re.compile(
            r"\b\d{1,2}\s+(?:janvier|février|fevrier|mars|avril|mai|juin|juillet|août|aout|"
            r"septembre|octobre|novembre|décembre|decembre)\s+\d{4}\b",
            re.I,
        ),
        text,
        "dat",
        raw,
    )
    _collect(
        re.compile(
            r"\b(?:janvier|février|fevrier|mars|avril|mai|juin|juillet|août|aout|"
            r"septembre|octobre|novembre|décembre|decembre)\s+\d{4}\b",
            re.I,
        ),
        text,
        "dat",
        raw,
    )
    _collect(
        re.compile(
            r"\b\d{1,4}\s+(?:rue|avenue|av\.|bd|boulevard|impasse|place|chemin|allée|allee|cours)\b"
            r"[^,.\n]{3,60}(?:,\s*\d{5}\s+[A-ZÀ-Ü][A-Za-zà-ü'-]+)?",
            re.I,
        ),
        text,
        "addr",
        raw,
    )
    _collect(
        re.compile(
            r"\b(?:l['’]intéressée|la titulaire du dossier\s+[A-Z0-9-]+|"
            r"M(?:me|\.)\s+[A-ZÀ-Ü][a-zà-ü'’-]+)\b",
            re.I,
        ),
        text,
        "coref",
        raw,
    )
    _collect(
        re.compile(
            r"\b(?:[A-ZÀ-Ü](?:\.|[a-zà-ü'’-]*)"
            r"(?:\s+(?:de|du|des|la|le)\s+[A-ZÀ-Ü](?:\.|[a-zà-ü'’-]*)|"
            r"\s+[A-ZÀ-Ü](?:\.|[a-zà-ü'’-]*)){0,5})\b"
        ),
        text,
        "name",
        raw,
    )
    _collect(re.compile(r"\b(?:19|20)\d{2}\b"), text, "yob", raw)

    stop = {"RH", "IBAN", "FR", "CM", "DR", "PDF", "OK", "CE", "SE", "LE", "LA", "LES", "DES", "UNE", "UN"}
    for match in re.finditer(r"\b[A-Z]{2,12}\b", text):
        if match.group(0) not in stop:
            raw.append((match.start(), match.end(), match.group(0), "org"))

    raw.sort(key=lambda item: (-(item[1] - item[0]), item[0]))
    seen: set[tuple[int, int]] = set()
    unique: list[tuple[int, int, str, str]] = []
    for start, end, value, kind in raw:
        key = (start, end)
        if key in seen:
            continue
        seen.add(key)
        unique.append((start, end, value, kind))

    unique.sort(key=lambda item: (item[0], -(item[1] - item[0])))
    return [
        Candidate(id=index, start=start, end=end, text=value, kind=kind)
        for index, (start, end, value, kind) in enumerate(unique)
    ]


def format_candidate_list(candidates: list[Candidate]) -> str:
    return "\n".join(f"{c.id}|{c.text}" for c in candidates)


def albert_post(path: str, api_key: str, body: dict[str, Any]) -> dict[str, Any]:
    request = urllib.request.Request(
        f"{ALBERT_BASE}{path}",
        data=json.dumps(body).encode("utf-8"),
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(request, timeout=180) as response:
            return json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as error:
        detail = error.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"HTTP {error.code}: {detail[:500]}") from error


def run_once(
    *,
    api_key: str,
    model: str,
    text: str,
    max_tokens: int,
    use_json_object: bool,
) -> dict[str, Any]:
    candidates = extract_candidates(text)
    candidate_list = format_candidate_list(candidates)
    user = "\n\n".join(
        [
            "Reponds avec un OBJET JSON {\"p\":[[ids...],...],\"x\":[[i,\"tel\",id],...],\"r\":[[i,\"resp\",j],...],\"o\":[],\"l\":[],\"d\":[]}. "
            "Uniquement des ids entiers de Candidats. Aucune chaine du texte.",
            f"Candidats (id|texte):\n{candidate_list}",
            f"Texte:\n{text}",
        ]
    )
    body: dict[str, Any] = {
        "model": model,
        "messages": [
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": user},
        ],
        "temperature": 0,
        "max_tokens": max_tokens,
        "stream": False,
    }
    if use_json_object:
        body["response_format"] = {"type": "json_object"}

    started = time.perf_counter()
    payload = albert_post("/chat/completions", api_key, body)
    elapsed = time.perf_counter() - started

    choice = (payload.get("choices") or [{}])[0]
    content = ((choice.get("message") or {}).get("content")) or ""
    if isinstance(content, list):
        content = "".join(
            part.get("text", "") if isinstance(part, dict) else str(part) for part in content
        )
    usage = payload.get("usage") or {}
    finish_reason = choice.get("finish_reason") or choice.get("finishReason")

    parsed = None
    parse_error = None
    try:
        parsed = json.loads(content)
        if isinstance(parsed, list):
            parsed = {"p": parsed}
    except json.JSONDecodeError as error:
        parse_error = str(error)
        parsed = None

    # tolerate truncated JSON that is still a person-id matrix
    if parsed is None:
        try:
            start = content.find("[")
            end = content.rfind("]")
            if start >= 0 and end > start:
                maybe = json.loads(content[start : end + 1])
                if isinstance(maybe, list):
                    parsed = {"p": maybe}
                    parse_error = None
        except json.JSONDecodeError:
            pass

    return {
        "elapsed_s": elapsed,
        "model": payload.get("model") or model,
        "finish_reason": finish_reason,
        "content_chars": len(content),
        "prompt_tokens": usage.get("prompt_tokens"),
        "completion_tokens": usage.get("completion_tokens"),
        "total_tokens": usage.get("total_tokens"),
        "candidate_count": len(candidates),
        "candidate_list_chars": len(candidate_list),
        "parsed_ok": parsed is not None,
        "person_groups": len(parsed.get("p", [])) if isinstance(parsed, dict) else 0,
        "parse_error": parse_error,
        "content_preview": content[:240].replace("\n", " "),
        "parsed": parsed,
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--model", default=os.environ.get("ALBERT_MODEL", "openweight-small"))
    parser.add_argument("--runs", type=int, default=3)
    parser.add_argument("--max-tokens", type=int, default=8192)
    parser.add_argument("--no-json-object", action="store_true")
    parser.add_argument("--text-file", help="Optional UTF-8 text file instead of the sample")
    args = parser.parse_args()

    api_key = os.environ.get("ALBERT_API_KEY") or os.environ.get("VITE_ALBERT_API_KEY")
    if not api_key:
        print("Set ALBERT_API_KEY first.", file=sys.stderr)
        return 1

    text = SAMPLE_TEXT
    if args.text_file:
        with open(args.text_file, encoding="utf-8") as handle:
            text = handle.read().strip()

    print(f"base={ALBERT_BASE}")
    print(f"model={args.model} runs={args.runs} max_tokens={args.max_tokens}")
    print(f"text_chars={len(text)}")
    print()

    results: list[dict[str, Any]] = []
    for index in range(1, args.runs + 1):
        print(f"--- run {index}/{args.runs}")
        try:
            result = run_once(
                api_key=api_key,
                model=args.model,
                text=text,
                max_tokens=args.max_tokens,
                use_json_object=not args.no_json_object,
            )
        except Exception as error:  # noqa: BLE001 - benchmark surface
            print(f"ERROR: {error}")
            continue

        results.append(result)
        print(
            f"  {result['elapsed_s']:.2f}s | finish={result['finish_reason']} | "
            f"out={result['content_chars']} chars | "
            f"tokens prompt/completion/total="
            f"{result['prompt_tokens']}/{result['completion_tokens']}/{result['total_tokens']} | "
            f"parsed={result['parsed_ok']} persons={result['person_groups']}"
        )
        print(f"  preview: {result['content_preview']}")

    if not results:
        return 1

    times = [item["elapsed_s"] for item in results]
    out_chars = [item["content_chars"] for item in results]
    print()
    print("=== summary ===")
    print(
        f"latency_s: mean={statistics.mean(times):.2f} "
        f"median={statistics.median(times):.2f} "
        f"min={min(times):.2f} max={max(times):.2f}"
    )
    print(
        f"output_chars: mean={statistics.mean(out_chars):.0f} "
        f"min={min(out_chars)} max={max(out_chars)}"
    )
    completion = [item["completion_tokens"] for item in results if item["completion_tokens"] is not None]
    if completion:
        print(
            f"completion_tokens: mean={statistics.mean(completion):.0f} "
            f"min={min(completion)} max={max(completion)}"
        )
    print(f"candidates: {results[0]['candidate_count']} (list {results[0]['candidate_list_chars']} chars)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
