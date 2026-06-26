import { placeholderPrefixFromCategory } from "./entityUtils.js";
import { GLINER_LABELS } from "./glinerConstants.js";
import { isEntityActive, normalizeEntities } from "./entityUtils.js";

const GLINER_LABEL_HIGHLIGHT_CLASSES = {
  person: "highlight-person",
  organization: "highlight-organization",
  location: "highlight-location",
  address: "highlight-address",
  email: "highlight-email",
  url: "highlight-url",
  "phone number": "highlight-phone",
  date: "highlight-date",
  profession: "highlight-profession",
  "job title or project role": "highlight-job-role",
  school: "highlight-school",
  hospital: "highlight-hospital",
  "family member": "highlight-family",
  nationality: "highlight-nationality",
  disease: "highlight-disease",
  diploma: "highlight-diploma",
};

export function getGlinerLabelHighlightClass(label) {
  return GLINER_LABEL_HIGHLIGHT_CLASSES[label] ?? "highlight-custom";
}

export function buildGlinerHighlightSegments(text, entities) {
  if (!text) {
    return [];
  }

  const orderedEntities = [...entities].sort(
    (left, right) => left.start - right.start || right.end - right.start - (left.end - left.start),
  );
  const segments = [];
  let cursor = 0;

  for (const entity of orderedEntities) {
    if (entity.start < cursor) {
      continue;
    }

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

export function labelToPlaceholderPrefix(label) {
  return placeholderPrefixFromCategory(label);
}

export function buildAnonymizedPreview(text, entities) {
  if (!entities.length) {
    return text;
  }

  const sorted = [...entities].sort((left, right) => {
    if (right.start !== left.start) {
      return right.start - left.start;
    }
    return right.end - left.end;
  });

  const counters = {};
  let anonymized = text;

  for (const entity of sorted) {
    if (entity.start < 0 || entity.end > text.length || entity.start >= entity.end) {
      continue;
    }

    const prefix = labelToPlaceholderPrefix(entity.label);
    counters[prefix] = (counters[prefix] || 0) + 1;
    const placeholder = `[${prefix}_${counters[prefix]}]`;
    anonymized = `${anonymized.slice(0, entity.start)}${placeholder}${anonymized.slice(entity.end)}`;
  }

  return anonymized;
}

export function groupEntitiesByLabel(entities) {
  const groups = new Map();

  for (const entity of entities) {
    const bucket = groups.get(entity.label) ?? [];
    bucket.push(entity);
    groups.set(entity.label, bucket);
  }

  return [...groups.entries()].sort(([left], [right]) => left.localeCompare(right));
}

export function formatGlinerLabelDisplay(label) {
  return label.charAt(0).toUpperCase() + label.slice(1);
}

export function buildGlinerMenuCategories(activeLabels, customCategories = {}) {
  const selectedLabels = GLINER_LABELS.filter((label) => activeLabels.has(label)).map((label) => [
    label,
    formatGlinerLabelDisplay(label),
  ]);
  const custom = Object.entries(customCategories)
    .filter(([categoryId]) => !GLINER_LABELS.includes(categoryId))
    .sort(([, left], [, right]) => left.localeCompare(right));

  return [...selectedLabels, ...custom];
}

export function buildGlinerCategoryLabels(customCategories = {}) {
  const builtin = Object.fromEntries(
    GLINER_LABELS.map((label) => [label, formatGlinerLabelDisplay(label)]),
  );
  return { ...builtin, ...customCategories };
}

export function replaceGlinerSelectedLabels(text, entities, selectedCategories, excludedEntityKeys) {
  const activeEntities = entities.filter((entity) =>
    isEntityActive(entity, selectedCategories, excludedEntityKeys),
  );
  return buildAnonymizedPreview(text, activeEntities);
}

export function finalizeGlinerEntities(text, entities, source = "gliner") {
  return normalizeEntities(
    entities.map((entity) => ({ ...entity, source: entity.source || source })),
    text,
  );
}

const GLINER_CHUNK_CHAR_LIMIT = 1000;

export function splitTextForGlinerDetection(text, maxChars = GLINER_CHUNK_CHAR_LIMIT) {
  const normalized = text.replace(/\r\n/g, "\n").trim();
  if (!normalized) {
    return [];
  }

  const paragraphs = normalized.split(/\n{2,}/);
  const chunks = [];
  let searchFrom = 0;

  const pushChunk = (chunkText) => {
    const trimmed = chunkText.trim();
    if (!trimmed) {
      return;
    }

    const start = normalized.indexOf(trimmed, searchFrom);
    if (start === -1) {
      chunks.push({ text: trimmed, start: 0 });
      return;
    }

    chunks.push({ text: trimmed, start });
    searchFrom = start + trimmed.length;
  };

  let current = "";

  for (const paragraph of paragraphs) {
    const trimmed = paragraph.trim();
    if (!trimmed) {
      continue;
    }

    const separator = current ? "\n\n" : "";
    const candidate = `${current}${separator}${trimmed}`;

    if (candidate.length <= maxChars) {
      current = candidate;
      continue;
    }

    if (current) {
      pushChunk(current);
      current = "";
    }

    if (trimmed.length <= maxChars) {
      current = trimmed;
      continue;
    }

    for (let index = 0; index < trimmed.length; index += maxChars) {
      pushChunk(trimmed.slice(index, index + maxChars));
    }
  }

  if (current) {
    pushChunk(current);
  }

  return chunks;
}

export function offsetGlinerEntities(entities, chunkStart) {
  return entities.map((entity) => ({
    ...entity,
    start: entity.start + chunkStart,
    end: entity.end + chunkStart,
  }));
}

export function dedupeGlinerEntities(entities) {
  const seen = new Set();

  return entities.filter((entity) => {
    const key = `${entity.start}:${entity.end}:${entity.label}:${entity.text}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}
