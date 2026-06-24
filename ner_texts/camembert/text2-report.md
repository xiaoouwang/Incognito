# Anonymization Audit Report

Generated: 2026-06-23 15:54:53 CEST
Tool: Incognito batch processor
Source file: text2.txt
NER backend: camembert
NER engine: Jean-Baptiste/camembert-ner

## Document Summary
- Source characters: 2155
- Anonymized characters: 2146
- Entity spans detected: 12
- Entity categories detected: 3
- Categories selected for replacement: 3
- Categories kept unchanged: 0

## Category Decisions
- Locations: 8 unique value(s), 8 occurrence(s), replaced
- Other entities: 2 unique value(s), 2 occurrence(s), replaced
- Organizations: 2 unique value(s), 2 occurrence(s), replaced

## Exact Values Replaced
- Locations: "Université de Montpellier" -> [LOCATION_1] (1 occurrence, source: camembert:Jean-Baptiste/camembert-ner)
- Locations: "Baillarguet" -> [LOCATION_2] (1 occurrence, source: camembert:Jean-Baptiste/camembert-ner)
- Locations: "la France" -> [LOCATION_3] (1 occurrence, source: camembert:Jean-Baptiste/camembert-ner)
- Locations: "Espagne" -> [LOCATION_4] (1 occurrence, source: camembert:Jean-Baptiste/camembert-ner)
- Locations: "Andalousie" -> [LOCATION_5] (1 occurrence, source: camembert:Jean-Baptiste/camembert-ner)
- Locations: "Perpignan" -> [LOCATION_6] (1 occurrence, source: camembert:Jean-Baptiste/camembert-ner)
- Locations: "domaine de Valmy" -> [LOCATION_7] (1 occurrence, source: camembert:Jean-Baptiste/camembert-ner)
- Locations: "Roussillon" -> [LOCATION_8] (1 occurrence, source: camembert:Jean-Baptiste/camembert-ner)
- Other entities: "AgroResilience" -> [ENTITY_1] (1 occurrence, source: camembert:Jean-Baptiste/camembert-ner)
- Other entities: "GlobalG.A.P." -> [ENTITY_2] (1 occurrence, source: camembert:Jean-Baptiste/camembert-ner)
- Organizations: "AgroNova" -> [ORG_1] (1 occurrence, source: camembert:Jean-Baptiste/camembert-ner)
- Organizations: "Floralis" -> [ORG_2] (1 occurrence, source: camembert:Jean-Baptiste/camembert-ner)

## Replacement Method
Selected entity categories were replaced with stable category placeholders, for example [PERSON_1], [LOCATION_1], [DATE_1], and [EMAIL_1]. Replacements are applied consistently for each unique detected value within the current text.

## Categories Replaced
- Locations
- Other entities
- Organizations

## Categories Kept Unchanged
- None

## Privacy Note
This report includes raw detected values selected for replacement so the anonymization process can be audited. Treat the report as sensitive research data and store or share it with the same care as the source document.

## Research Caveat
This tool is an anonymization assistant. Researchers should manually review the anonymized text for indirect identifiers, rare contextual details, and model detection errors before sharing or archiving data.
