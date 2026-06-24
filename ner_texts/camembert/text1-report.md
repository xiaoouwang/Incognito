# Anonymization Audit Report

Generated: 2026-06-23 15:54:53 CEST
Tool: Incognito batch processor
Source file: text1.txt
NER backend: camembert
NER engine: Jean-Baptiste/camembert-ner

## Document Summary
- Source characters: 263
- Anonymized characters: 231
- Entity spans detected: 10
- Entity categories detected: 7
- Categories selected for replacement: 7
- Categories kept unchanged: 0

## Category Decisions
- Dates: 1 unique value(s), 1 occurrence(s), replaced
- Emails: 1 unique value(s), 1 occurrence(s), replaced
- Locations: 2 unique value(s), 2 occurrence(s), replaced
- Organizations: 1 unique value(s), 1 occurrence(s), replaced
- People: 3 unique value(s), 4 occurrence(s), replaced
- Phone numbers: 1 unique value(s), 1 occurrence(s), replaced
- URLs: 1 unique value(s), 1 occurrence(s), replaced

## Exact Values Replaced
- Dates: "12 mars 2022" -> [DATE_1] (1 occurrence, source: rule)
- Emails: "marie.dupont@example.com" -> [EMAIL_1] (1 occurrence, source: rule)
- Locations: "Paris" -> [LOCATION_1] (1 occurrence, source: camembert:Jean-Baptiste/camembert-ner)
- Locations: "de Lyon" -> [LOCATION_2] (1 occurrence, source: camembert:Jean-Baptiste/camembert-ner)
- Organizations: "Université" -> [ORG_1] (1 occurrence, source: camembert:Jean-Baptiste/camembert-ner)
- People: "Marie Dupont" -> [PERSON_1] (1 occurrence, source: camembert:Jean-Baptiste/camembert-ner)
- People: "Jean Martin" -> [PERSON_2] (1 occurrence, source: camembert:Jean-Baptiste/camembert-ner)
- People: "Marie" -> [PERSON_3] (2 occurrences, source: camembert:Jean-Baptiste/camembert-ner)
- Phone numbers: "6 12 34 56 78" -> [PHONE_1] (1 occurrence, source: rule)
- URLs: "https://example.org/project" -> [URL_1] (1 occurrence, source: rule)

## Replacement Method
Selected entity categories were replaced with stable category placeholders, for example [PERSON_1], [LOCATION_1], [DATE_1], and [EMAIL_1]. Replacements are applied consistently for each unique detected value within the current text.

## Categories Replaced
- Dates
- Emails
- Locations
- Organizations
- People
- Phone numbers
- URLs

## Categories Kept Unchanged
- None

## Privacy Note
This report includes raw detected values selected for replacement so the anonymization process can be audited. Treat the report as sensitive research data and store or share it with the same care as the source document.

## Research Caveat
This tool is an anonymization assistant. Researchers should manually review the anonymized text for indirect identifiers, rare contextual details, and model detection errors before sharing or archiving data.
