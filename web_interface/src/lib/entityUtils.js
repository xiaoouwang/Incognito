import {
  BUILTIN_CATEGORY_IDS,
  CATEGORY_LABELS,
  CATEGORY_PREFIXES,
} from "./constants.js";

export function slugifyCategoryId(name) {
  const slug = name
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 40);

  return slug || "custom";
}

export function formatCategoryDisplayName(categoryId) {
  return categoryId
    .split("_")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function categoryPrefixFromLabel(label) {
  const prefix = label
    .trim()
    .toUpperCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 24);

  return prefix || "CUSTOM";
}

export function createCustomCategoryId(displayName, customCategories) {
  let baseId = slugifyCategoryId(displayName);
  if (!CATEGORY_LABELS[baseId] && !customCategories[baseId]) {
    return baseId;
  }

  let suffix = 2;
  while (CATEGORY_LABELS[`${baseId}_${suffix}`] || customCategories[`${baseId}_${suffix}`]) {
    suffix += 1;
  }

  return `${baseId}_${suffix}`;
}

export function inferCustomCategoriesFromEntities(entities, customCategories = {}) {
  const inferred = { ...customCategories };

  entities.forEach((entity) => {
    const categoryId = entity.label;
    if (categoryId && !CATEGORY_LABELS[categoryId] && !inferred[categoryId]) {
      inferred[categoryId] = formatCategoryDisplayName(categoryId);
    }
  });

  return inferred;
}

export function buildCategoryLabels(customCategories) {
  return { ...CATEGORY_LABELS, ...customCategories };
}

export function buildMenuCategories(customCategories) {
  return [
    ...Object.entries(CATEGORY_LABELS),
    ...Object.entries(customCategories)
      .filter(([categoryId]) => !CATEGORY_LABELS[categoryId])
      .sort(([, left], [, right]) => left.localeCompare(right)),
  ];
}

export function getCategoryLabel(categoryId, customCategories) {
  return buildCategoryLabels(customCategories)[categoryId] || categoryId;
}

export function getCategoryPrefix(categoryId, customCategories) {
  if (CATEGORY_PREFIXES[categoryId]) {
    return CATEGORY_PREFIXES[categoryId];
  }

  return categoryPrefixFromLabel(getCategoryLabel(categoryId, customCategories));
}

export function getCategoryChipClass(categoryId) {
  return BUILTIN_CATEGORY_IDS.has(categoryId) ? `chip-${categoryId}` : "chip-custom";
}

export function getCategoryHighlightClass(categoryId) {
  return BUILTIN_CATEGORY_IDS.has(categoryId) ? `highlight-${categoryId}` : "highlight-custom";
}

export function isManualEntity(entity) {
  return entity?.source === "manual";
}

export function getEntityValueKey(category, entityText) {
  return `${category}:${entityText.toLocaleLowerCase()}`;
}

export function isEntityActive(entity, selectedCategories, excludedEntityKeys) {
  if (!selectedCategories[entity.label]) {
    return false;
  }

  return !excludedEntityKeys[getEntityValueKey(entity.label, entity.text)];
}

export function createCategorySelectionFromEntities(entities) {
  return Object.fromEntries(
    [...new Set(entities.map((entity) => entity.label))].map((label) => [label, true]),
  );
}

export function splitEntitiesAtNewlines(sourceText, entities) {
  const expanded = [];

  for (const entity of entities) {
    const start = entity.start;
    const end = entity.end;
    if (!sourceText || start >= end || end > sourceText.length) {
      expanded.push(entity);
      continue;
    }

    let chunkStart = start;
    let split = false;

    for (let index = start; index < end; index += 1) {
      if (sourceText[index] !== "\n") {
        continue;
      }

      split = true;
      const piece = sourceText.slice(chunkStart, index);
      if (piece.trim()) {
        expanded.push({
          ...entity,
          start: chunkStart,
          end: index,
          text: piece,
        });
      }
      chunkStart = index + 1;
    }

    if (!split) {
      expanded.push(entity);
      continue;
    }

    if (chunkStart < end) {
      const piece = sourceText.slice(chunkStart, end);
      if (piece.trim()) {
        expanded.push({
          ...entity,
          start: chunkStart,
          end,
          text: piece,
        });
      }
    }
  }

  return expanded;
}

export function normalizeEntities(entities, sourceText) {
  const split = sourceText ? splitEntitiesAtNewlines(sourceText, entities) : entities;

  return split
    .map((entity, index) => ({
      ...entity,
      id: entity.id || `ent-${entity.start}-${entity.end}-${index}`,
      key: `${entity.label}:${entity.text.toLocaleLowerCase()}:${entity.start}:${index}`,
    }))
    .filter((entity) => entity.text && entity.start < entity.end)
    .sort((a, b) => a.start - b.start || a.end - b.end);
}

export function addEntitySpans(entities, spans, label, sourceText) {
  if (!spans.length) {
    return entities;
  }

  const stamp = Date.now();
  const newEntities = spans.map((span, index) => ({
    id: `manual-${span.start}-${span.end}-${stamp}-${index}`,
    start: span.start,
    end: span.end,
    text: span.text,
    label,
    source: "manual",
  }));

  const filtered = entities.filter(
    (entity) =>
      !newEntities.some((span) => entity.end > span.start && entity.start < span.end),
  );

  return normalizeEntities([...filtered, ...newEntities], sourceText);
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function buildWordBasedSearchPattern(searchText) {
  if (typeof searchText !== "string" || !searchText.trim()) {
    return null;
  }

  const words = searchText.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) {
    return null;
  }

  return words.map(escapeRegExp).join("\\s+");
}

export function findAllOccurrenceRanges(text, searchText) {
  const pattern = buildWordBasedSearchPattern(searchText);
  if (!text || !pattern) {
    return [];
  }

  const regex = new RegExp(`(?<![\\p{L}\\p{N}])${pattern}(?![\\p{L}\\p{N}])`, "giu");
  const ranges = [];
  let match;

  while ((match = regex.exec(text)) !== null) {
    const matchedText = match[0];
    ranges.push({
      start: match.index,
      end: match.index + matchedText.length,
      text: matchedText,
    });

    if (matchedText.length === 0) {
      regex.lastIndex += 1;
    }
  }

  return ranges;
}

export function removeEntityById(entities, entityId) {
  return entities.filter((entity) => entity.id !== entityId);
}

export function groupEntities(entities) {
  return entities.reduce((groups, entity) => {
    const category = entity.label || "misc";
    const existing = groups[category] || [];

    if (existing.some((item) => item.text.toLocaleLowerCase() === entity.text.toLocaleLowerCase())) {
      return groups;
    }

    return {
      ...groups,
      [category]: [...existing, entity],
    };
  }, {});
}

export function createHighlightSegments(text, entities) {
  if (!text) return [];

  const orderedEntities = [...entities].sort(
    (a, b) => a.start - b.start || b.end - b.start - (a.end - a.start),
  );
  const segments = [];
  let cursor = 0;

  for (const entity of orderedEntities) {
    if (entity.start < cursor) continue;

    if (entity.start > cursor) {
      segments.push({
        text: text.slice(cursor, entity.start),
        start: cursor,
        end: entity.start,
      });
    }

    segments.push({
      text: text.slice(entity.start, entity.end),
      start: entity.start,
      end: entity.end,
      entity,
    });
    cursor = entity.end;
  }

  if (cursor < text.length) {
    segments.push({
      text: text.slice(cursor),
      start: cursor,
      end: text.length,
    });
  }

  return segments;
}

export function replaceSelectedCategories(
  text,
  entities,
  groupedEntities,
  selectedCategories,
  excludedEntityKeys,
  customCategories,
) {
  const replacementMap = new Map();

  Object.entries(groupedEntities).forEach(([category, categoryEntities]) => {
    if (!selectedCategories[category]) return;

    categoryEntities.forEach((entity, index) => {
      replacementMap.set(
        getEntityValueKey(category, entity.text),
        `[${getCategoryPrefix(category, customCategories)}_${index + 1}]`,
      );
    });
  });

  let output = text;
  const applicable = entities
    .filter((entity) => isEntityActive(entity, selectedCategories, excludedEntityKeys))
    .sort((a, b) => b.start - a.start || b.end - a.end);

  for (const entity of applicable) {
    const placeholder = replacementMap.get(getEntityValueKey(entity.label, entity.text));
    if (!placeholder) continue;
    if (entity.start < 0 || entity.end > output.length || entity.start >= entity.end) continue;
    output = output.slice(0, entity.start) + placeholder + output.slice(entity.end);
  }

  return output;
}

export function countEntitySpans(entities, category, value) {
  const normalized = value.toLocaleLowerCase();
  return entities.filter(
    (entity) =>
      entity.label === category && entity.text.toLocaleLowerCase() === normalized,
  ).length;
}

export function countOccurrences(text, value) {
  return findAllOccurrenceRanges(text, value).length;
}

export function findBatchFileIndex(files, query) {
  const trimmed = query.trim();
  if (!trimmed || !files.length) {
    return -1;
  }

  let index = files.findIndex((file) => file.name === trimmed);
  if (index >= 0) {
    return index;
  }

  const lower = trimmed.toLocaleLowerCase();
  index = files.findIndex((file) => file.name.toLocaleLowerCase() === lower);
  if (index >= 0) {
    return index;
  }

  const partialMatches = files
    .map((file, fileIndex) => ({ file, fileIndex }))
    .filter(({ file }) => file.name.toLocaleLowerCase().includes(lower));

  return partialMatches.length === 1 ? partialMatches[0].fileIndex : -1;
}

export function getSelectionOffsets(container, text) {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0 || selection.isCollapsed || !container) {
    return null;
  }

  const range = selection.getRangeAt(0);
  if (!container.contains(range.commonAncestorContainer)) {
    return null;
  }

  const start = getOffsetWithinContainer(container, range.startContainer, range.startOffset);
  const end = getOffsetWithinContainer(container, range.endContainer, range.endOffset);
  if (start === null || end === null || start >= end) {
    return null;
  }

  return {
    start,
    end,
    text: text.slice(start, end),
  };
}

function getOffsetWithinContainer(container, node, offset) {
  const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
  let position = 0;

  while (walker.nextNode()) {
    const current = walker.currentNode;
    if (current === node) {
      return position + offset;
    }
    position += current.textContent.length;
  }

  return null;
}

export function downloadFile(content, fileName, type) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(url);
}

export function formatBatchOutputTimestamp(date = new Date()) {
  const pad = (value) => String(value).padStart(2, "0");
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}-${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`;
}

export function buildBatchOutputBaseName(sourceFileName) {
  return sourceFileName.replace(/\.(txt|text)$/i, "");
}

export function buildBatchOutputFileNames(sourceFileName, modified = false) {
  const base = buildBatchOutputBaseName(sourceFileName);
  const suffix = modified ? "_modified" : "";
  return {
    anonymized: `${base}-anonymized${suffix}.txt`,
    report: `${base}-report${suffix}.md`,
    labelStudio: `${base}-label-studio${suffix}.json`,
  };
}
