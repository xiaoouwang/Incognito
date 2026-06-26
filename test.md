# Anonymization Audit Report

Generated: 25/06/2026, 12:03:25
Tool: Incognito Web
NER engine: Xenova/camembert-ner


## Document Summary
- Source characters: 676
- Anonymized characters: 593
- Entity categories in review: 6
- Categories selected for replacement: 6
- Categories kept unchanged: 0
- Total annotated spans: 17
- Character positions use 0-based indexing; each span is reported as `start–end` where `start` is inclusive and `end` is exclusive (same convention as JavaScript string slices).

## Provenance Summary
This report distinguishes automatic NER detections from spans added or revised during human review.

- Automatic detection spans: 17
- Human manual review spans: 0
- Unique values with automatic spans only: 8
- Unique values with manual spans only: 0
- Unique values with mixed automatic + manual spans: 0

### Automatic Detection Breakdown
- Automatic detection (onnx:Xenova/camembert-ner): 9 spans
- Automatic detection (rule-based pattern): 8 spans

### Human Review Notes
- Manual spans are tagged `source: manual` in the annotation data.
- Values toggled off during review remain listed under "Values excluded from anonymization".
- Custom categories defined during review: none

## Category Decisions
- People: 2 unique value(s), 4 span(s) (4 automatic, 0 manual), replaced
- Dates: 1 unique value(s), 2 span(s) (2 automatic, 0 manual), replaced
- Locations: 2 unique value(s), 5 span(s) (5 automatic, 0 manual), replaced
- Emails: 1 unique value(s), 2 span(s) (2 automatic, 0 manual), replaced
- Phone numbers: 1 unique value(s), 2 span(s) (2 automatic, 0 manual), replaced
- URLs: 1 unique value(s), 2 span(s) (2 automatic, 0 manual), replaced

## Automatic Detections — Values Replaced
- People: "Marie Dupont" -> [PERSON_1] (2 spans, 2 automatic (onnx:Xenova/camembert-ner); origin: automatic detection)
  - chars 35–47: onnx:Xenova/camembert-ner
  - chars 374–386: onnx:Xenova/camembert-ner
- People: "Jean Martin" -> [PERSON_2] (2 spans, 2 automatic (onnx:Xenova/camembert-ner); origin: automatic detection)
  - chars 60–71: onnx:Xenova/camembert-ner
  - chars 399–410: onnx:Xenova/camembert-ner
- Dates: "12 mars 2022" -> [DATE_1] (2 spans, 2 automatic (rule); origin: automatic detection)
  - chars 83–95: rule
  - chars 422–434: rule
- Locations: "Université de Lyon" -> [LOCATION_1] (2 spans, 2 automatic (onnx:Xenova/camembert-ner); origin: automatic detection)
  - chars 120–138: onnx:Xenova/camembert-ner
  - chars 459–477: onnx:Xenova/camembert-ner
- Locations: "Paris" -> [LOCATION_2] (3 spans, 3 automatic (onnx:Xenova/camembert-ner); origin: automatic detection)
  - chars 310–315: onnx:Xenova/camembert-ner
  - chars 413–418: onnx:Xenova/camembert-ner
  - chars 649–654: onnx:Xenova/camembert-ner
- Emails: "marie.dupont@example.com" -> [EMAIL_1] (2 spans, 2 automatic (rule); origin: automatic detection)
  - chars 154–178: rule
  - chars 493–517: rule
- Phone numbers: "6 12 34 56 78" -> [PHONE_1] (2 spans, 2 automatic (rule); origin: automatic detection)
  - chars 218–231: rule
  - chars 557–570: rule
- URLs: "https://example.org/project" -> [URL_1] (2 spans, 2 automatic (rule); origin: automatic detection)
  - chars 235–262: rule
  - chars 574–601: rule

## Human Manual Additions — Values Replaced
- None

## Mixed Origin — Values Replaced
Values below contain both automatic detections and manual review spans for the same category/value.
- None

## Values Excluded from Anonymization
These values were detected or added during review but toggled off for replacement.
- None

## Complete Span Index
All annotated spans in source order with exact character positions.
- chars 35–47 | People | "Marie Dupont" | onnx:Xenova/camembert-ner | replaced in output
- chars 60–71 | People | "Jean Martin" | onnx:Xenova/camembert-ner | replaced in output
- chars 83–95 | Dates | "12 mars 2022" | rule | replaced in output
- chars 120–138 | Locations | "Université de Lyon" | onnx:Xenova/camembert-ner | replaced in output
- chars 154–178 | Emails | "marie.dupont@example.com" | rule | replaced in output
- chars 218–231 | Phone numbers | "6 12 34 56 78" | rule | replaced in output
- chars 235–262 | URLs | "https://example.org/project" | rule | replaced in output
- chars 310–315 | Locations | "Paris" | onnx:Xenova/camembert-ner | replaced in output
- chars 374–386 | People | "Marie Dupont" | onnx:Xenova/camembert-ner | replaced in output
- chars 399–410 | People | "Jean Martin" | onnx:Xenova/camembert-ner | replaced in output
- chars 413–418 | Locations | "Paris" | onnx:Xenova/camembert-ner | replaced in output
- chars 422–434 | Dates | "12 mars 2022" | rule | replaced in output
- chars 459–477 | Locations | "Université de Lyon" | onnx:Xenova/camembert-ner | replaced in output
- chars 493–517 | Emails | "marie.dupont@example.com" | rule | replaced in output
- chars 557–570 | Phone numbers | "6 12 34 56 78" | rule | replaced in output
- chars 574–601 | URLs | "https://example.org/project" | rule | replaced in output
- chars 649–654 | Locations | "Paris" | onnx:Xenova/camembert-ner | replaced in output

## Replacement Method
Selected entity categories were replaced with stable category placeholders, for example [PERSON_1], [LOCATION_1], [DATE_1], and [EMAIL_1]. Replacements are applied consistently for each unique value within the current text. Each line above records span counts, character offsets, and whether spans came from automatic detection or human manual review.

## Categories Replaced
- People
- Dates
- Locations
- Emails
- Phone numbers
- URLs

## Categories Kept Unchanged
- None

## Privacy Note
This report includes raw detected values selected for replacement so the anonymization process can be audited. Treat the report as sensitive research data and store or share it with the same care as the source document.

## Research Caveat
This tool is an anonymization assistant. Researchers should manually review the anonymized text for indirect identifiers, rare contextual details, and model detection errors before sharing or archiving data.
