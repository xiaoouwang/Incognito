# Anonymization Audit Report

Generated: 2026-06-23 15:54:53 CEST
Tool: Qualitative Text Anonymizer batch processor
Source file: text3.txt
NER backend: camembert
NER engine: Jean-Baptiste/camembert-ner

## Document Summary
- Source characters: 1483
- Anonymized characters: 1485
- Entity spans detected: 5
- Entity categories detected: 2
- Categories selected for replacement: 2
- Categories kept unchanged: 0

## Category Decisions
- Locations: 4 unique value(s), 4 occurrence(s), replaced
- People: 1 unique value(s), 1 occurrence(s), replaced

## Exact Values Replaced
- Locations: "Chambre d" -> [LOCATION_1] (1 occurrence, source: camembert:Jean-Baptiste/camembert-ner)
- Locations: "agriculture de l" -> [LOCATION_2] (1 occurrence, source: camembert:Jean-Baptiste/camembert-ner)
- Locations: "Hérault" -> [LOCATION_3] (1 occurrence, source: camembert:Jean-Baptiste/camembert-ner)
- Locations: "Montpellier" -> [LOCATION_4] (1 occurrence, source: camembert:Jean-Baptiste/camembert-ner)
- People: "Sophie Martin" -> [PERSON_1] (1 occurrence, source: camembert:Jean-Baptiste/camembert-ner)

## Replacement Method
Selected entity categories were replaced with stable category placeholders, for example [PERSON_1], [LOCATION_1], [DATE_1], and [EMAIL_1]. Replacements are applied consistently for each unique detected value within the current text.

## Categories Replaced
- Locations
- People

## Categories Kept Unchanged
- None

## Privacy Note
This report includes raw detected values selected for replacement so the anonymization process can be audited. Treat the report as sensitive research data and store or share it with the same care as the source document.

## Research Caveat
This tool is an anonymization assistant. Researchers should manually review the anonymized text for indirect identifiers, rare contextual details, and model detection errors before sharing or archiving data.
