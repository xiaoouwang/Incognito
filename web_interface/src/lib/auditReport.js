import {
  applySurfaceReplacementOverrides,
  formatCategoryDisplayName,
  getCategoryLabel,
  getCategoryPrefix,
  getEntityValueKey,
  isManualEntity,
  countEntitySpans,
  isEntityActive,
  unifyPersonGraphReplacements,
} from "./entityUtils.js";
import { buildBasicPersonGraph } from "./basicPersonGraph.js";
import {
  DEFAULT_REPLACEMENT_STYLE,
  buildReplacementMap,
  normalizeReplacementMethod,
} from "./pseudonymize.js";

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

function describeSurfaceOverride(override) {
  if (!override) {
    return null;
  }
  const comment = String(override.comment || "").trim();
  const commentSuffix = comment ? `; note: ${comment}` : "";
  if (override.kind === "custom") {
    return `custom text "${String(override.text ?? "")}"${commentSuffix}`;
  }
  if (override.kind === "method") {
    return `per-value method ${normalizeReplacementMethod(override.method)}${commentSuffix}`;
  }
  return null;
}

function formatValueDecisionLine({
  category,
  customCategories,
  value,
  replacement,
  occurrences,
  provenance,
  status,
  overrideNote = null,
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
  const overrideSuffix = overrideNote ? `; override: ${overrideNote}` : "";

  let header;
  if (status === "replaced") {
    header = `- ${label}: "${value}" -> ${replacement} (${occurrences} span${occurrences === 1 ? "" : "s"}, ${provenanceDetail}; origin: ${origin}${overrideSuffix})`;
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

function escapeTableCell(value) {
  return String(value ?? "")
    .replace(/\|/g, "\\|")
    .replace(/\r?\n/g, " ")
    .trim();
}

function formatCorrespondenceTable(rows) {
  if (!rows.length) {
    return "- None";
  }

  const header = [
    "| # | Category / Catégorie | Original | Replacement / Remplacement | Status | Comment / Note |",
    "| --- | --- | --- | --- | --- | --- |",
  ];
  const body = rows.map((row, index) => {
    return `| ${index + 1} | ${escapeTableCell(row.categoryLabel)} | ${escapeTableCell(row.original)} | ${escapeTableCell(row.replacement)} | ${escapeTableCell(row.status)} | ${escapeTableCell(row.comment || "")} |`;
  });
  return [...header, ...body].join("\n");
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
  categoryMethods = {},
  replacementStyle = DEFAULT_REPLACEMENT_STYLE,
  generalizationLadders = {},
  persons = null,
  surfaceOverrides = {},
}) {
  const categories = Object.keys(groupedEntities);
  const selected = categories.filter((category) => selectedCategories[category]);
  const kept = categories.filter((category) => !selectedCategories[category]);
  const provenance = summarizeDocumentProvenance(entities);
  const replacementMap = buildReplacementMap(groupedEntities, selectedCategories, {
    style: replacementStyle,
    categoryMethods,
    customCategories,
    salt: text || "",
    generalizationLadders,
  });
  const resolvedPersons =
    Array.isArray(persons) && persons.length
      ? persons
      : text && entities?.length
        ? buildBasicPersonGraph(text, entities, null).persons || []
        : [];
  unifyPersonGraphReplacements(replacementMap, resolvedPersons, {
    style: replacementStyle,
    categoryMethods,
    customCategories,
    salt: text || "",
    generalizationLadders,
    selectedCategories,
  });
  applySurfaceReplacementOverrides(replacementMap, surfaceOverrides, {
    customCategories,
    salt: text || "",
    generalizationLadders,
    groupedEntities,
  });

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
  const customOverrideReplacements = [];
  const excludedValues = [];
  const correspondenceRows = [];

  categories.forEach((category) => {
    groupedEntities[category].forEach((entity, index) => {
      const mapKey = getEntityValueKey(category, entity.text);
      const mappedReplacement = replacementMap.get(mapKey);
      const fallbackPlaceholder = `[${getCategoryPrefix(category, customCategories)}_${index + 1}]`;
      const replacement = selectedCategories[category]
        ? mappedReplacement || fallbackPlaceholder
        : null;
      const spanProvenance = summarizeSpanProvenance(entities, category, entity.text);
      const occurrences = spanProvenance.spans.length;
      const active = isEntityActive(entity, selectedCategories, excludedEntityKeys);
      const replaced = Boolean(active && replacement);
      const override = surfaceOverrides[mapKey] || null;
      const overrideNote = describeSurfaceOverride(override);
      const line = formatValueDecisionLine({
        category,
        customCategories,
        value: entity.text,
        replacement,
        occurrences,
        provenance: spanProvenance,
        status: replaced ? "replaced" : "excluded",
        overrideNote,
      });

      let statusLabel = "excluded";
      if (replaced) {
        if (override?.kind === "custom") {
          statusLabel = "custom override";
        } else if (override?.kind === "method") {
          statusLabel = `method override (${normalizeReplacementMethod(override.method)})`;
        } else {
          statusLabel = "replaced";
        }
      }

      correspondenceRows.push({
        categoryLabel: getCategoryLabel(category, customCategories),
        original: entity.text,
        replacement: replaced ? replacement : "(unchanged / non remplacé)",
        status: statusLabel,
        comment: String(override?.comment || "").trim(),
      });

      if (!replaced) {
        if (selectedCategories[category]) {
          excludedValues.push(line);
        }
        return;
      }

      if (override?.kind === "custom" || override?.kind === "method") {
        customOverrideReplacements.push(line);
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

  // Stable reading order for the mapping table: category, then original value.
  correspondenceRows.sort((left, right) => {
    const byCategory = left.categoryLabel.localeCompare(right.categoryLabel);
    if (byCategory) return byCategory;
    return String(left.original).localeCompare(String(right.original));
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

## Correspondence Table / Table de correspondance
One-to-one mapping used to build the anonymized text (same unique value → same replacement within this document).

${formatCorrespondenceTable(correspondenceRows)}

## Automatic Detections — Values Replaced
${formatSection(automaticReplacements, "- None")}

## Human Manual Additions — Values Replaced
${formatSection(manualReplacements, "- None")}

## Mixed Origin — Values Replaced
Values below contain both automatic detections and manual review spans for the same category/value.
${formatSection(mixedReplacements, "- None")}

## Per-value Overrides (Custom Text or Method)
Values edited in the anonymized preview (custom typed replacement, or a method different from the category default). These are authoritative for the correspondence table.
${formatSection(customOverrideReplacements, "- None")}

## Values Excluded from Anonymization
These values were detected or added during review but toggled off for replacement.
${formatSection(excludedValues, "- None")}

## Complete Span Index
All annotated spans in source order with exact character positions.
${formatSection(spanIndexLines, "- None")}

## Replacement Method
Replacements follow the per-category method chosen in the anonymized preview (Placeholder / Level 1–3 generalization / Mask), unless a per-value override was set (custom typed text or a different method for that value). Levels 1–3 use local hierarchical rules only (structural for age/date/contact; heuristics for other categories). The correspondence table above is the authoritative mapping, including custom overrides.

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
