#!/usr/bin/env python3
"""Batch NER, anonymization, and Label Studio export for a folder of text files."""

from __future__ import annotations

import argparse
import json
import sys
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

SCRIPT_DIR = Path(__file__).resolve().parent
if str(SCRIPT_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPT_DIR))

from ner import detect_entities, normalize_backend

TEXT_EXTENSIONS = {".txt", ".text"}
OUTPUT_ARTIFACT_STEMS = ("-anonymized", "-report", "-label-studio")
OUTPUT_ARTIFACT_NAMES = {"batch-summary.json", "label-studio-ner-config.xml"}

CATEGORY_LABELS = {
    "person": "People",
    "location": "Locations",
    "organization": "Organizations",
    "date": "Dates",
    "email": "Emails",
    "phone": "Phone numbers",
    "url": "URLs",
    "misc": "Other entities",
}

CATEGORY_PREFIXES = {
    "person": "PERSON",
    "location": "LOCATION",
    "organization": "ORG",
    "date": "DATE",
    "email": "EMAIL",
    "phone": "PHONE",
    "url": "URL",
    "misc": "ENTITY",
}

APP_TO_LABEL_STUDIO = {
    "person": "Person",
    "location": "Location",
    "organization": "Organization",
    "date": "Date",
    "email": "Email",
    "phone": "Phone",
    "url": "URL",
    "misc": "Misc",
}

LABEL_STUDIO_NER_CONFIG = """<View>
  <Labels name="label" toName="text">
    <Label value="Person" background="#c45c26"/>
    <Label value="Location" background="#2f6f4e"/>
    <Label value="Organization" background="#5b4d8a"/>
    <Label value="Date" background="#8a6d3b"/>
    <Label value="Email" background="#3d6f8a"/>
    <Label value="Phone" background="#6b5b4f"/>
    <Label value="URL" background="#4a6fa5"/>
    <Label value="Misc" background="#7a7a7a"/>
  </Labels>
  <Text name="text" value="$text"/>
</View>"""


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Run NER and anonymization on every text file in a folder.",
    )
    parser.add_argument("--input-dir", type=Path, required=True)
    parser.add_argument("--output-dir", type=Path, required=True)
    parser.add_argument("--backend", default="spacy-lg")
    parser.add_argument(
        "--categories",
        help="Comma-separated entity categories to anonymize (default: all).",
    )
    return parser.parse_args()


def parse_categories(value: str | None) -> set[str]:
    if not value:
        return set(CATEGORY_LABELS)
    selected = {item.strip().lower() for item in value.split(",") if item.strip()}
    unknown = selected - set(CATEGORY_LABELS)
    if unknown:
        raise ValueError(f"Unknown categories: {', '.join(sorted(unknown))}")
    return selected


def group_unique_entities(entities: list[dict[str, Any]]) -> dict[str, list[dict[str, Any]]]:
    grouped: dict[str, list[dict[str, Any]]] = defaultdict(list)
    seen: dict[str, set[str]] = defaultdict(set)

    for entity in entities:
        label = entity.get("label") or "misc"
        text = entity.get("text") or ""
        key = text.casefold()
        if not text or key in seen[label]:
            continue
        seen[label].add(key)
        grouped[label].append(entity)

    return dict(grouped)


def count_occurrences(text: str, value: str) -> int:
    count = 0
    cursor = 0
    while cursor < len(text):
        index = text.find(value, cursor)
        if index == -1:
            break
        count += 1
        cursor = index + len(value)
    return count


def build_replacement_map(
    grouped: dict[str, list[dict[str, Any]]],
    selected_categories: set[str],
) -> dict[tuple[str, str], str]:
    replacements: dict[tuple[str, str], str] = {}

    for category in sorted(grouped):
        if category not in selected_categories:
            continue
        prefix = CATEGORY_PREFIXES.get(category, "ENTITY")
        for index, entity in enumerate(grouped[category], start=1):
            replacements[(category, entity["text"])] = f"[{prefix}_{index}]"

    return replacements


def anonymize_text(
    text: str,
    entities: list[dict[str, Any]],
    grouped: dict[str, list[dict[str, Any]]],
    selected_categories: set[str],
) -> str:
    replacements = build_replacement_map(grouped, selected_categories)
    applicable = [
        entity
        for entity in entities
        if entity.get("label") in selected_categories
        and (entity.get("label"), entity.get("text")) in replacements
    ]

    output = text
    for entity in sorted(applicable, key=lambda item: item["start"], reverse=True):
        placeholder = replacements[(entity["label"], entity["text"])]
        start = entity["start"]
        end = entity["end"]
        if start < 0 or end > len(output) or start >= end:
            continue
        output = output[:start] + placeholder + output[end:]
    return output


def create_audit_report(
    *,
    source_name: str,
    text: str,
    anonymized_text: str,
    grouped: dict[str, list[dict[str, Any]]],
    selected_categories: set[str],
    model_name: str | None,
    backend: str,
    entity_count: int,
) -> str:
    categories = sorted(grouped)
    selected = sorted(category for category in categories if category in selected_categories)
    kept = sorted(category for category in categories if category not in selected_categories)

    category_lines = []
    for category in categories:
        unique_count = len(grouped[category])
        occurrence_count = sum(count_occurrences(text, entity["text"]) for entity in grouped[category])
        status = "replaced" if category in selected_categories else "kept unchanged"
        display = CATEGORY_LABELS.get(category, category)
        category_lines.append(
            f"- {display}: {unique_count} unique value(s), "
            f"{occurrence_count} occurrence(s), {status}"
        )

    replacement_lines = []
    for category in selected:
        display = CATEGORY_LABELS.get(category, category)
        prefix = CATEGORY_PREFIXES.get(category, "ENTITY")
        for index, entity in enumerate(grouped[category], start=1):
            replacement = f"[{prefix}_{index}]"
            occurrences = count_occurrences(text, entity["text"])
            plural = "" if occurrences == 1 else "s"
            replacement_lines.append(
                f'- {display}: "{entity["text"]}" -> {replacement} '
                f"({occurrences} occurrence{plural}, source: {entity.get('source', 'unknown')})"
            )

    generated = datetime.now(timezone.utc).astimezone().strftime("%Y-%m-%d %H:%M:%S %Z")

    return f"""# Anonymization Audit Report

Generated: {generated}
Tool: Incognito batch processor
Source file: {source_name}
NER backend: {backend}
NER engine: {model_name or "Not specified"}

## Document Summary
- Source characters: {len(text)}
- Anonymized characters: {len(anonymized_text)}
- Entity spans detected: {entity_count}
- Entity categories detected: {len(categories)}
- Categories selected for replacement: {len(selected)}
- Categories kept unchanged: {len(kept)}

## Category Decisions
{chr(10).join(category_lines) if category_lines else "- No entities detected"}

## Exact Values Replaced
{chr(10).join(replacement_lines) if replacement_lines else "- No values selected for replacement"}

## Replacement Method
Selected entity categories were replaced with stable category placeholders, for example [PERSON_1], [LOCATION_1], [DATE_1], and [EMAIL_1]. Replacements are applied consistently for each unique detected value within the current text.

## Categories Replaced
{chr(10).join(f"- {CATEGORY_LABELS.get(category, category)}" for category in selected) or "- None"}

## Categories Kept Unchanged
{chr(10).join(f"- {CATEGORY_LABELS.get(category, category)}" for category in kept) or "- None"}

## Privacy Note
This report includes raw detected values selected for replacement so the anonymization process can be audited. Treat the report as sensitive research data and store or share it with the same care as the source document.

## Research Caveat
This tool is an anonymization assistant. Researchers should manually review the anonymized text for indirect identifiers, rare contextual details, and model detection errors before sharing or archiving data.
"""


def entity_to_label_studio_result(entity: dict[str, Any], index: int) -> dict[str, Any]:
    label = APP_TO_LABEL_STUDIO.get(entity.get("label"), "Misc")
    return {
        "id": f"ner-{index}",
        "from_name": "label",
        "to_name": "text",
        "type": "labels",
        "value": {
            "start": entity["start"],
            "end": entity["end"],
            "text": entity.get("text", ""),
            "labels": [label],
        },
    }


def create_label_studio_export(
    *,
    text: str,
    entities: list[dict[str, Any]],
    model_name: str | None,
    backend: str,
    source_name: str,
) -> list[dict[str, Any]]:
    ordered = sorted(entities, key=lambda item: (item["start"], item["end"]))
    return [
        {
            "data": {
                "text": text,
                "source_file": source_name,
                "ner_backend": backend,
                "ner_model": model_name,
                "exported_at": datetime.now(timezone.utc).isoformat(),
            },
            "predictions": [
                {
                    "model_version": model_name or backend or "incognito",
                    "result": [
                        entity_to_label_studio_result(entity, index)
                        for index, entity in enumerate(ordered)
                    ],
                }
            ],
        }
    ]


def is_source_text_file(path: Path) -> bool:
    if path.suffix.lower() not in TEXT_EXTENSIONS:
        return False
    if path.name in OUTPUT_ARTIFACT_NAMES:
        return False
    return not any(path.stem.endswith(suffix) for suffix in OUTPUT_ARTIFACT_STEMS)


def resolve_output_dir(input_dir: Path, output_dir: Path) -> Path:
    if input_dir.resolve() == output_dir.resolve():
        resolved = output_dir / "anonymized-results"
        resolved.mkdir(parents=True, exist_ok=True)
        return resolved
    return output_dir


def discover_text_files(input_dir: Path, output_dir: Path | None = None) -> list[Path]:
    output_resolved = output_dir.resolve() if output_dir else None
    files = []

    for path in sorted(input_dir.iterdir()):
        if not path.is_file() or not is_source_text_file(path):
            continue
        if output_resolved:
            try:
                path.resolve().relative_to(output_resolved)
                continue
            except ValueError:
                pass
        files.append(path)

    if not files:
        raise ValueError(
            f"No source text files found in {input_dir}. "
            "Use plain `.txt` files and keep outputs in a separate folder."
        )
    return files


def process_text_file(
    input_path: Path,
    output_dir: Path,
    *,
    backend: str,
    selected_categories: set[str],
) -> dict[str, Any]:
    text = input_path.read_text(encoding="utf-8")
    if not text.strip():
        raise ValueError(f"{input_path.name} is empty.")

    detection = detect_entities(text, backend)
    entities = detection.get("entities") or []
    grouped = group_unique_entities(entities)
    anonymized_text = anonymize_text(text, entities, grouped, selected_categories)
    report = create_audit_report(
        source_name=input_path.name,
        text=text,
        anonymized_text=anonymized_text,
        grouped=grouped,
        selected_categories=selected_categories,
        model_name=detection.get("model"),
        backend=backend,
        entity_count=len(entities),
    )
    label_studio = create_label_studio_export(
        text=text,
        entities=entities,
        model_name=detection.get("model"),
        backend=backend,
        source_name=input_path.name,
    )

    stem = input_path.stem
    anonymized_path = output_dir / f"{stem}-anonymized.txt"
    report_path = output_dir / f"{stem}-report.md"
    label_studio_path = output_dir / f"{stem}-label-studio.json"

    anonymized_path.write_text(anonymized_text, encoding="utf-8")
    report_path.write_text(report, encoding="utf-8")
    label_studio_path.write_text(json.dumps(label_studio, indent=2, ensure_ascii=False), encoding="utf-8")

    return {
        "source_file": input_path.name,
        "entity_count": len(entities),
        "unique_values": sum(len(values) for values in grouped.values()),
        "anonymized_path": str(anonymized_path),
        "report_path": str(report_path),
        "label_studio_path": str(label_studio_path),
    }


def process_text_directory(
    input_dir: Path,
    output_dir: Path,
    *,
    backend: str,
    selected_categories: set[str],
) -> dict[str, Any]:
    if not selected_categories:
        raise ValueError("Select at least one entity category to anonymize.")

    resolved_output_dir = resolve_output_dir(input_dir, output_dir)
    text_files = discover_text_files(input_dir, resolved_output_dir)
    resolved_output_dir.mkdir(parents=True, exist_ok=True)

    config_path = resolved_output_dir / "label-studio-ner-config.xml"
    if not config_path.exists():
        config_path.write_text(LABEL_STUDIO_NER_CONFIG, encoding="utf-8")

    results: list[dict[str, Any]] = []
    errors: list[dict[str, str]] = []

    for text_file in text_files:
        try:
            results.append(
                process_text_file(
                    text_file,
                    resolved_output_dir,
                    backend=backend,
                    selected_categories=selected_categories,
                )
            )
        except Exception as error:
            errors.append({"file": text_file.name, "error": str(error)})

    summary = {
        "input_dir": str(input_dir),
        "output_dir": str(resolved_output_dir),
        "requested_output_dir": str(output_dir),
        "output_redirected": resolved_output_dir.resolve() != output_dir.resolve(),
        "backend": backend,
        "categories": sorted(selected_categories),
        "text_files": len(text_files),
        "files_processed": len(results),
        "results": results,
        "errors": errors,
        "label_studio_config_path": str(config_path),
    }
    summary_path = resolved_output_dir / "batch-summary.json"
    summary_path.write_text(json.dumps(summary, indent=2), encoding="utf-8")
    summary["summary_path"] = str(summary_path)
    return summary


def main() -> int:
    args = parse_args()
    backend = normalize_backend(args.backend)
    selected_categories = parse_categories(args.categories)

    summary = process_text_directory(
        args.input_dir,
        args.output_dir,
        backend=backend,
        selected_categories=selected_categories,
    )

    if summary["errors"] and not summary["files_processed"]:
        print(json.dumps(summary, indent=2), file=sys.stderr)
        return 1

    print(json.dumps(summary, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
