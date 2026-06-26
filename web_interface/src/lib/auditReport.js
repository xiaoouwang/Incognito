import {
  formatCategoryDisplayName,
  getCategoryLabel,
  getCategoryPrefix,
  isManualEntity,
  countEntitySpans,
  isEntityActive,
} from "./entityUtils.js";

function formatProvenanceLabel(source) {
  if (!source || source === "manual") {
    return "Human manual review";
  }

  if (source === "rule") {
    return "Automatic detection (rule-based pattern)";
  }

  if (source === "demo") {
    return "Sample demo (preloaded)";
  }

  return `Automatic detection (${source})`;
}

function getSpansForValue(entities, category, value) {
  const normalized = value.toLocaleLowerCase();
  return entities.filter(
    (entity) =>
      entity.label === category && entity.text.toLocaleLowerCase() === normalized,
  );
}

function summarizeSpanProvenance(entities, category, value) {
  const spans = getSpansForValue(entities, category, value);
  const manualSpans = spans.filter(isManualEntity);
  const machineSpans = spans.filter((entity) => !isManualEntity(entity));
  const machineBySource = machineSpans.reduce((counts, entity) => {
    const key = entity.source || "unknown";
    counts[key] = (counts[key] || 0) + 1;
    return counts;
  }, {});

  return {
    spans,
    manualSpans,
    machineSpans,
    machineBySource,
  };
}

function formatSpanProvenanceDetail(provenance) {
  const parts = Object.entries(provenance.machineBySource)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([source, count]) => `${count} automatic (${source})`);

  if (provenance.manualSpans.length) {
    parts.push(`${provenance.manualSpans.length} manual`);
  }

  return parts.join(", ") || "unknown";
}

function summarizeDocumentProvenance(entities) {
  const manualSpans = entities.filter(isManualEntity);
  const machineSpans = entities.filter((entity) => !isManualEntity(entity));
  const machineBySource = machineSpans.reduce((counts, entity) => {
    const key = entity.source || "unknown";
    counts[key] = (counts[key] || 0) + 1;
    return counts;
  }, {});

  const manualValues = new Set(
    manualSpans.map((entity) => `${entity.label}:${entity.text.toLocaleLowerCase()}`),
  );
  const machineValues = new Set(
    machineSpans.map((entity) => `${entity.label}:${entity.text.toLocaleLowerCase()}`),
  );

  let mixedValueCount = 0;
  manualValues.forEach((key) => {
    if (machineValues.has(key)) {
      mixedValueCount += 1;
    }
  });

  return {
    manualSpans,
    machineSpans,
    machineBySource,
    manualOnlyValues: manualValues.size - mixedValueCount,
    machineOnlyValues: machineValues.size - mixedValueCount,
    mixedValues: mixedValueCount,
  };
}

function formatSpanOffset(start, end) {
  return `${start}–${end}`;
}

function formatSpanPositionLines(spans) {
  if (!spans.length) {
    return "";
  }

  return [...spans]
    .sort((left, right) => left.start - right.start || left.end - right.end)
    .map((span) => {
      const sourceLabel = isManualEntity(span) ? "manual" : span.source || "unknown";
      return `  - chars ${formatSpanOffset(span.start, span.end)}: ${sourceLabel}`;
    })
    .join("\n");
}

function formatValueDecisionLine({
  category,
  customCategories,
  value,
  replacement,
  occurrences,
  provenance,
  status,
}) {
  const label = getCategoryLabel(category, customCategories);
  const provenanceDetail = formatSpanProvenanceDetail(provenance);
  const origin =
    provenance.manualSpans.length && provenance.machineSpans.length
      ? "mixed origin"
      : provenance.manualSpans.length
        ? "human manual review"
        : "automatic detection";
  const positionLines = formatSpanPositionLines(provenance.spans);

  let header;
  if (status === "replaced") {
    header = `- ${label}: "${value}" -> ${replacement} (${occurrences} span${occurrences === 1 ? "" : "s"}, ${provenanceDetail}; origin: ${origin})`;
  } else {
    header = `- ${label}: "${value}" kept unchanged (${occurrences} span${occurrences === 1 ? "" : "s"}, ${provenanceDetail}; origin: ${origin}; toggled off during review)`;
  }

  return positionLines ? `${header}\n${positionLines}` : header;
}

function formatSpanIndexLines(entities, selectedCategories, excludedEntityKeys, customCategories) {
  return [...entities]
    .sort((left, right) => left.start - right.start || left.end - right.end)
    .map((entity) => {
      const label = getCategoryLabel(entity.label, customCategories);
      const sourceLabel = isManualEntity(entity) ? "manual" : entity.source || "unknown";
      const active = isEntityActive(entity, selectedCategories, excludedEntityKeys);
      const status = active ? "replaced in output" : "excluded from output";
      return `- chars ${formatSpanOffset(entity.start, entity.end)} | ${label} | "${entity.text}" | ${sourceLabel} | ${status}`;
    });
}

export function createAuditReport({
  text,
  entities,
  anonymizedText,
  groupedEntities,
  selectedCategories,
  excludedEntityKeys,
  modelName,
  sourceFile = null,
  nerBackend = null,
  batchMode = false,
  customCategories = {},
}) {
  const categories = Object.keys(groupedEntities);
  const selected = categories.filter((category) => selectedCategories[category]);
  const kept = categories.filter((category) => !selectedCategories[category]);
  const provenance = summarizeDocumentProvenance(entities);

  const machineSourceLines = Object.entries(provenance.machineBySource)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([source, count]) => `- ${formatProvenanceLabel(source)}: ${count} span${count === 1 ? "" : "s"}`);

  const customCategoryLines = Object.entries(customCategories)
    .sort(([, left], [, right]) => left.localeCompare(right))
    .map(([categoryId, label]) => {
      const spanCount = entities.filter((entity) => entity.label === categoryId).length;
      return `- ${label} (${categoryId}): ${spanCount} span${spanCount === 1 ? "" : "s"} in this document`;
    });

  const replacementSummary = categories
    .map((category) => {
      const uniqueCount = groupedEntities[category].length;
      const occurrenceCount = groupedEntities[category].reduce(
        (total, entity) => total + countEntitySpans(entities, category, entity.text),
        0,
      );
      const categorySpans = entities.filter((entity) => entity.label === category);
      const manualSpanCount = categorySpans.filter(isManualEntity).length;
      const machineSpanCount = categorySpans.length - manualSpanCount;
      const activeCount = groupedEntities[category].filter((entity) =>
        isEntityActive(entity, selectedCategories, excludedEntityKeys),
      ).length;
      const status = !selectedCategories[category]
        ? "kept unchanged"
        : activeCount === uniqueCount
          ? "replaced"
          : `${activeCount} of ${uniqueCount} value(s) replaced`;

      return `- ${getCategoryLabel(category, customCategories)}: ${uniqueCount} unique value(s), ${occurrenceCount} span(s) (${machineSpanCount} automatic, ${manualSpanCount} manual), ${status}`;
    })
    .join("\n");

  const automaticReplacements = [];
  const manualReplacements = [];
  const mixedReplacements = [];
  const excludedValues = [];

  categories.forEach((category) => {
    groupedEntities[category].forEach((entity, index) => {
      const replacement = selectedCategories[category]
        ? `[${getCategoryPrefix(category, customCategories)}_${index + 1}]`
        : null;
      const spanProvenance = summarizeSpanProvenance(entities, category, entity.text);
      const occurrences = spanProvenance.spans.length;
      const active = isEntityActive(entity, selectedCategories, excludedEntityKeys);
      const line = formatValueDecisionLine({
        category,
        customCategories,
        value: entity.text,
        replacement,
        occurrences,
        provenance: spanProvenance,
        status: active && replacement ? "replaced" : "excluded",
      });

      if (!active || !replacement) {
        if (selectedCategories[category]) {
          excludedValues.push(line);
        }
        return;
      }

      if (spanProvenance.manualSpans.length && spanProvenance.machineSpans.length) {
        mixedReplacements.push(line);
      } else if (spanProvenance.manualSpans.length) {
        manualReplacements.push(line);
      } else {
        automaticReplacements.push(line);
      }
    });
  });

  const formatSection = (lines, fallback) => lines.join("\n") || fallback;
  const spanIndexLines = formatSpanIndexLines(
    entities,
    selectedCategories,
    excludedEntityKeys,
    customCategories,
  );

  return `# Anonymization Audit Report

Generated: ${new Date().toLocaleString()}
Tool: Incognito Web${batchMode ? " batch review" : ""}
NER engine: ${modelName || "Not run"}${nerBackend ? ` (${nerBackend})` : ""}
${sourceFile ? `Source file: ${sourceFile}` : ""}

## Document Summary
- Source characters: ${text.length}
- Anonymized characters: ${anonymizedText.length}
- Entity categories in review: ${categories.length}
- Categories selected for replacement: ${selected.length}
- Categories kept unchanged: ${kept.length}
- Total annotated spans: ${provenance.manualSpans.length + provenance.machineSpans.length}
- Character positions use 0-based indexing; each span is reported as \`start–end\` where \`start\` is inclusive and \`end\` is exclusive (same convention as JavaScript string slices).

## Provenance Summary
This report distinguishes automatic NER detections from spans added or revised during human review.

- Automatic detection spans: ${provenance.machineSpans.length}
- Human manual review spans: ${provenance.manualSpans.length}
- Unique values with automatic spans only: ${provenance.machineOnlyValues}
- Unique values with manual spans only: ${provenance.manualOnlyValues}
- Unique values with mixed automatic + manual spans: ${provenance.mixedValues}

### Automatic Detection Breakdown
${formatSection(machineSourceLines, "- No automatic spans in the final review")}

### Human Review Notes
- Manual spans are tagged \`source: manual\` in the annotation data.
- Values toggled off during review remain listed under "Values excluded from anonymization".
${customCategoryLines.length ? `- Custom categories defined during review:\n${customCategoryLines.join("\n")}` : "- Custom categories defined during review: none"}

## Category Decisions
${replacementSummary || "- No entities detected"}

## Automatic Detections — Values Replaced
${formatSection(automaticReplacements, "- None")}

## Human Manual Additions — Values Replaced
${formatSection(manualReplacements, "- None")}

## Mixed Origin — Values Replaced
Values below contain both automatic detections and manual review spans for the same category/value.
${formatSection(mixedReplacements, "- None")}

## Values Excluded from Anonymization
These values were detected or added during review but toggled off for replacement.
${formatSection(excludedValues, "- None")}

## Complete Span Index
All annotated spans in source order with exact character positions.
${formatSection(spanIndexLines, "- None")}

## Replacement Method
Selected entity categories were replaced with stable category placeholders, for example [PER_1], [LOC_1], [DAT_1], and [EMA_1]. Replacements are applied consistently for each unique value within the current text. Each line above records span counts, character offsets, and whether spans came from automatic detection or human manual review.

## Categories Replaced
${selected.map((category) => `- ${getCategoryLabel(category, customCategories)}`).join("\n") || "- None"}

## Categories Kept Unchanged
${kept.map((category) => `- ${getCategoryLabel(category, customCategories)}`).join("\n") || "- None"}

## Privacy Note
This report includes raw detected values selected for replacement so the anonymization process can be audited. Treat the report as sensitive research data and store or share it with the same care as the source document.

## Research Caveat
This tool is an anonymization assistant. Researchers should manually review the anonymized text for indirect identifiers, rare contextual details, and model detection errors before sharing or archiving data.
`;
}

export { formatCategoryDisplayName };
