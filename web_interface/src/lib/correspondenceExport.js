/**
 * Standalone correspondence / mapping table export (CSV).
 * One row per annotated span, with source start/end offsets so replacements
 * can be applied unambiguously.
 */

import { buildBasicPersonGraph } from "./basicPersonGraph.js";
import {
  applySurfaceReplacementOverrides,
  getCategoryLabel,
  getCategoryPrefix,
  getEntityValueKey,
  isEntityActive,
  unifyPersonGraphReplacements,
} from "./entityUtils.js";
import {
  DEFAULT_REPLACEMENT_STYLE,
  buildReplacementMap,
  normalizeReplacementMethod,
} from "./pseudonymize.js";

function csvEscape(value) {
  const text = String(value ?? "");
  if (/[",\n\r]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

function uniqueIndexInCategory(groupedEntities, category, entityText) {
  const values = groupedEntities[category] || [];
  const lower = String(entityText || "").toLocaleLowerCase();
  const index = values.findIndex((item) => String(item.text || "").toLocaleLowerCase() === lower);
  return index >= 0 ? index : 0;
}

/**
 * One row per span (not per unique value), sorted by source offset.
 */
export function buildCorrespondenceRows({
  entities = [],
  groupedEntities = {},
  selectedCategories = {},
  excludedEntityKeys = {},
  customCategories = {},
  replacementMap,
  surfaceOverrides = {},
}) {
  const rows = [];
  const sorted = [...(entities || [])].sort(
    (left, right) =>
      Number(left.start) - Number(right.start) ||
      Number(left.end) - Number(right.end) ||
      String(left.text || "").localeCompare(String(right.text || "")),
  );

  for (const entity of sorted) {
    const category = entity.label || "misc";
    const start = Number(entity.start);
    const end = Number(entity.end);
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) {
      continue;
    }

    const mapKey = getEntityValueKey(category, entity.text);
    const mappedReplacement = replacementMap?.get(mapKey);
    const uniqueIndex = uniqueIndexInCategory(groupedEntities, category, entity.text);
    const fallbackPlaceholder = `[${getCategoryPrefix(category, customCategories)}_${uniqueIndex + 1}]`;
    const replacement = selectedCategories[category]
      ? mappedReplacement || fallbackPlaceholder
      : null;
    const active = isEntityActive(entity, selectedCategories, excludedEntityKeys);
    const replaced = Boolean(active && replacement);
    const override = surfaceOverrides[mapKey] || null;

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

    rows.push({
      start,
      end,
      categoryLabel: getCategoryLabel(category, customCategories),
      original: entity.text,
      replacement: replaced ? replacement : "(unchanged / non remplacé)",
      status: statusLabel,
      comment: String(override?.comment || "").trim(),
    });
  }

  return rows;
}

export function formatCorrespondenceCsv(rows = []) {
  const lines = [
    ["#", "start", "end", "category", "original", "replacement", "status", "comment"]
      .map(csvEscape)
      .join(","),
  ];
  rows.forEach((row, index) => {
    lines.push(
      [
        String(index + 1),
        String(row.start ?? ""),
        String(row.end ?? ""),
        row.categoryLabel,
        row.original,
        row.replacement,
        row.status,
        row.comment || "",
      ]
        .map(csvEscape)
        .join(","),
    );
  });
  return `${lines.join("\n")}\n`;
}

export function buildCorrespondenceCsv({
  text = "",
  entities = [],
  groupedEntities = {},
  selectedCategories = {},
  excludedEntityKeys = {},
  customCategories = {},
  categoryMethods = {},
  replacementStyle = DEFAULT_REPLACEMENT_STYLE,
  generalizationLadders = {},
  persons = null,
  surfaceOverrides = {},
} = {}) {
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

  const rows = buildCorrespondenceRows({
    entities,
    groupedEntities,
    selectedCategories,
    excludedEntityKeys,
    customCategories,
    replacementMap,
    surfaceOverrides,
  });
  return formatCorrespondenceCsv(rows);
}
