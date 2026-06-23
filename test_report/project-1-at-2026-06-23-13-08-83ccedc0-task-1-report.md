# Anonymization Audit Report

Generated: 2026-06-23 16:36:35 CEST
Tool: Label Studio anonymization report script
Source file: project-1-at-2026-06-23-13-08-83ccedc0.json
NER engine: Jean-Baptiste/camembert-ner
- Task id: 1

## Document Summary
- Source characters: 1873
- Anonymized characters: 1906
- Entity spans annotated: 12
- Entity categories detected: 4
- Categories selected for replacement: 4
- Categories kept unchanged: 0

## Category Decisions
- Locations: 5 unique value(s), 6 occurrence(s), replaced
- Other entities: 1 unique value(s), 1 occurrence(s), replaced
- Organizations: 3 unique value(s), 3 occurrence(s), replaced
- People: 2 unique value(s), 2 occurrence(s), replaced

## Exact Values Replaced
- Locations: "université Côte d'Azur" -> [LOCATION_1] (1 occurrence, origin: prediction)
- Locations: "Sophia" -> [LOCATION_2] (1 occurrence, origin: prediction)
- Locations: "Turquie" -> [LOCATION_3] (1 occurrence, origin: prediction)
- Locations: "Serbie" -> [LOCATION_4] (2 occurrences, origin: prediction)
- Locations: "Grasse" -> [LOCATION_5] (1 occurrence, origin: prediction)
- Other entities: "Bidim" -> [ENTITY_1] (1 occurrence, origin: prediction)
- Organizations: "CNRS" -> [ORG_1] (1 occurrence, origin: prediction)
- Organizations: "Bioline" -> [ORG_2] (1 occurrence, origin: prediction)
- Organizations: "Lancôme" -> [ORG_3] (1 occurrence, origin: prediction)
- People: "Sibylle" -> [PERSON_1] (1 occurrence, origin: manual)
- People: "Mikaela" -> [PERSON_2] (1 occurrence, origin: prediction)

## Replacement Method
Selected entity categories were replaced with stable category placeholders, for example [PERSON_1], [LOCATION_1], [DATE_1], and [EMAIL_1]. Span-based replacement is applied from the annotated offsets; repeated values share the same placeholder.

## Categories Replaced
- Locations
- Other entities
- Organizations
- People

## Categories Kept Unchanged
- None

## Privacy Note
This report includes raw detected values selected for replacement so the anonymization process can be audited. Treat the report as sensitive research data and store or share it with the same care as the source document.

## Research Caveat
This tool is an anonymization assistant. Researchers should manually review the anonymized text for indirect identifiers, rare contextual details, and annotation errors before sharing or archiving data.
