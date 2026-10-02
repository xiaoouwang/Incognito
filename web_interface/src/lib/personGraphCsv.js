/**
 * Export person-graph as CSV:
 * - long form: one row per surface / attr / rel
 * - by person: one row per person, columns for everything found about them
 */

import { isSurfaceExcluded, surfaceExcludeKey } from "./albertEdit.js";
import { downloadFile, formatBatchOutputTimestamp } from "./entityUtils.js";

function csvEscape(value) {
  const text = String(value ?? "");
  if (/[",\n\r]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

function pushRow(rows, cells) {
  rows.push(cells.map(csvEscape).join(","));
}

function joinValues(values) {
  return (values || []).filter(Boolean).join(" | ");
}

function attrColumnId(attr) {
  return String(attr?.key || attr?.label || "misc")
    .trim()
    .toLocaleLowerCase()
    .replace(/\s+/g, "_");
}

function attrColumnHeader(attr) {
  return attr?.label || attr?.key || "attr";
}

export function buildPersonGraphCsv(
  persons = [],
  { excludedPlaceholders = {}, excludedSurfaces = {} } = {},
) {
  const rows = [];
  pushRow(rows, [
    "person_placeholder",
    "person_name",
    "person_excluded",
    "kind",
    "label",
    "value",
    "value_placeholder",
    "value_excluded",
  ]);

  for (const person of persons) {
    const personExcluded = Boolean(excludedPlaceholders[person.placeholder]);
    const nameExcluded =
      personExcluded || isSurfaceExcluded(excludedSurfaces, person.placeholder, person.name);

    pushRow(rows, [
      person.placeholder || "",
      person.name || "",
      personExcluded ? "1" : "0",
      "name",
      "name",
      person.name || "",
      person.placeholder || "",
      nameExcluded ? "1" : "0",
    ]);

    for (const alias of person.aliases || []) {
      pushRow(rows, [
        person.placeholder || "",
        person.name || "",
        personExcluded ? "1" : "0",
        "alias",
        "alias",
        alias,
        person.placeholder || "",
        isSurfaceExcluded(excludedSurfaces, person.placeholder, alias) || personExcluded
          ? "1"
          : "0",
      ]);
    }

    for (const coref of person.corefs || []) {
      pushRow(rows, [
        person.placeholder || "",
        person.name || "",
        personExcluded ? "1" : "0",
        "coref",
        "coref",
        coref,
        person.placeholder || "",
        isSurfaceExcluded(excludedSurfaces, person.placeholder, coref) || personExcluded
          ? "1"
          : "0",
      ]);
    }

    for (const attr of person.attrs || []) {
      const attrPlaceholder = attr.placeholder || person.placeholder || "";
      const valueExcluded =
        personExcluded ||
        Boolean(excludedSurfaces[surfaceExcludeKey(attrPlaceholder, attr.value)]) ||
        Boolean(attr.placeholder && excludedPlaceholders[attr.placeholder]);
      pushRow(rows, [
        person.placeholder || "",
        person.name || "",
        personExcluded ? "1" : "0",
        "attr",
        attr.label || attr.key || "attr",
        attr.value || "",
        attrPlaceholder,
        valueExcluded ? "1" : "0",
      ]);
    }

    for (const rel of person.rels || []) {
      pushRow(rows, [
        person.placeholder || "",
        person.name || "",
        personExcluded ? "1" : "0",
        "rel",
        rel.label || rel.key || "rel",
        rel.target || rel.value || "",
        "",
        personExcluded ? "1" : "0",
      ]);
    }
  }

  return `${rows.join("\n")}\n`;
}

/**
 * One row per person; columns cover name, aliases, corefs, each attr type, and rels.
 */
export function buildPersonGraphByPersonCsv(
  persons = [],
  { excludedPlaceholders = {}, excludedSurfaces = {} } = {},
) {
  const attrColumns = [];
  const seenAttrIds = new Set();

  for (const person of persons) {
    for (const attr of person.attrs || []) {
      const id = attrColumnId(attr);
      if (seenAttrIds.has(id)) {
        continue;
      }
      seenAttrIds.add(id);
      attrColumns.push({ id, header: attrColumnHeader(attr) });
    }
  }

  const rows = [];
  pushRow(rows, [
    "placeholder",
    "name",
    "excluded",
    "aliases",
    "corefs",
    ...attrColumns.map((column) => column.header),
    "rels",
  ]);

  for (const person of persons) {
    const personExcluded = Boolean(excludedPlaceholders[person.placeholder]);
    const attrValuesById = {};
    for (const attr of person.attrs || []) {
      const id = attrColumnId(attr);
      if (!attrValuesById[id]) {
        attrValuesById[id] = [];
      }
      const attrPlaceholder = attr.placeholder || person.placeholder || "";
      const valueExcluded =
        personExcluded ||
        Boolean(excludedSurfaces[surfaceExcludeKey(attrPlaceholder, attr.value)]) ||
        Boolean(attr.placeholder && excludedPlaceholders[attr.placeholder]);
      attrValuesById[id].push(valueExcluded ? `${attr.value} [excluded]` : attr.value);
    }

    const relValues = (person.rels || []).map((rel) => {
      const label = rel.label || rel.key || "rel";
      const target = rel.target || rel.value || "";
      return target ? `${label}→${target}` : label;
    });

    pushRow(rows, [
      person.placeholder || "",
      person.name || "",
      personExcluded ? "1" : "0",
      joinValues(person.aliases),
      joinValues(person.corefs),
      ...attrColumns.map((column) => joinValues(attrValuesById[column.id] || [])),
      joinValues(relValues),
    ]);
  }

  return `${rows.join("\n")}\n`;
}

export function downloadPersonGraphCsv(
  persons,
  { excludedPlaceholders = {}, excludedSurfaces = {}, fileName } = {},
) {
  const csv = buildPersonGraphCsv(persons, { excludedPlaceholders, excludedSurfaces });
  const stamp = formatBatchOutputTimestamp();
  downloadFile(
    csv,
    fileName || `person-graph-${stamp}.csv`,
    "text/csv;charset=utf-8",
  );
  return csv;
}

export function downloadPersonGraphByPersonCsv(
  persons,
  { excludedPlaceholders = {}, excludedSurfaces = {}, fileName } = {},
) {
  const csv = buildPersonGraphByPersonCsv(persons, { excludedPlaceholders, excludedSurfaces });
  const stamp = formatBatchOutputTimestamp();
  downloadFile(
    csv,
    fileName || `person-graph-by-person-${stamp}.csv`,
    "text/csv;charset=utf-8",
  );
  return csv;
}
