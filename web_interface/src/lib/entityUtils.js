import {
  BUILTIN_CATEGORY_IDS,
  CATEGORY_CANONICAL_IDS,
  CATEGORY_LABELS,
  CATEGORY_MENU_ALIASES,
} from "./constants.js";
import { GLINER_LABEL_STYLE_KEYS, GLINER_RULE_LABELS } from "./glinerConstants.js";
import { buildBasicPersonGraph } from "./basicPersonGraph.js";
import {
  DEFAULT_REPLACEMENT_STYLE,
  buildReplacementMap,
  normalizeReplacementMethod,
  replacementForCategoryValue,
} from "./pseudonymize.js";
import { filterPronounPersonEntities } from "./personMentionFilter.js";
import { detectWithGlinerRules, mergeEntities } from "./ruleDetection.js";

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

export function placeholderPrefixFromCategory(categoryId) {
  const letters = String(categoryId)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z]/g, "");

  return letters.slice(0, 3) || "ENT";
}

function categoryPrefixFromLabel(label) {
  return placeholderPrefixFromCategory(label);
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

export function canonicalCategoryId(categoryId) {
  const key = String(categoryId || "");
  return CATEGORY_CANONICAL_IDS[key] || key;
}

export function buildMenuCategories(customCategories) {
  return [
    ...Object.entries(CATEGORY_LABELS).filter(
      ([categoryId]) => !CATEGORY_MENU_ALIASES.has(categoryId),
    ),
    ...Object.entries(customCategories)
      .filter(
        ([categoryId]) =>
          !CATEGORY_LABELS[categoryId] && !CATEGORY_MENU_ALIASES.has(categoryId),
      )
      .sort(([, left], [, right]) => left.localeCompare(right)),
  ];
}

export function getCategoryLabel(categoryId, customCategories) {
  return buildCategoryLabels(customCategories)[categoryId] || categoryId;
}

export function getCategoryPrefix(categoryId, customCategories = {}) {
  return placeholderPrefixFromCategory(categoryId);
}

export function getCategoryChipClass(categoryId) {
  const glinerStyle = GLINER_LABEL_STYLE_KEYS[categoryId];
  if (glinerStyle) {
    return `chip-${glinerStyle}`;
  }
  return BUILTIN_CATEGORY_IDS.has(categoryId) ? `chip-${categoryId}` : "chip-custom";
}

export function getCategoryHighlightClass(categoryId) {
  const glinerStyle = GLINER_LABEL_STYLE_KEYS[categoryId];
  if (glinerStyle) {
    return `highlight-${glinerStyle}`;
  }
  return BUILTIN_CATEGORY_IDS.has(categoryId) ? `highlight-${categoryId}` : "highlight-custom";
}

export function isManualEntity(entity) {
  return entity?.source === "manual";
}

export function getEntityValueKey(category, entityText) {
  return `${category}:${entityText.toLocaleLowerCase()}`;
}

/** Stable id for one span (used to single out same-spelling occurrences). */
export function getEntityOccurrenceKey(entity) {
  if (!entity) {
    return "";
  }
  if (entity.id) {
    return `id:${entity.id}`;
  }
  return `${entity.label}:${entity.start}:${entity.end}:${String(entity.text || "").toLocaleLowerCase()}`;
}

/**
 * Extra replacements for spans the user singled out from their spelling group.
 * Indices continue after the normal per-value placeholders for that category.
 */
export function buildDistinctOccurrenceReplacements(
  replacementMap,
  entities,
  distinctOccurrenceKeys,
  {
    style = DEFAULT_REPLACEMENT_STYLE,
    categoryMethods = {},
    customCategories = {},
    salt = "",
    generalizationLadders = {},
  } = {},
) {
  const flagged = distinctOccurrenceKeys || {};
  const occurrenceMap = new Map();
  if (!Object.keys(flagged).length) {
    return occurrenceMap;
  }

  const nextIndexByCategory = new Map();
  for (const key of replacementMap?.keys?.() || []) {
    const category = String(key).split(":")[0];
    if (!category) {
      continue;
    }
    nextIndexByCategory.set(category, (nextIndexByCategory.get(category) || 0) + 1);
  }

  for (const entity of entities || []) {
    const occKey = getEntityOccurrenceKey(entity);
    if (!flagged[occKey] || occurrenceMap.has(occKey)) {
      continue;
    }
    const category = entity.label || "misc";
    const index = nextIndexByCategory.get(category) || 0;
    nextIndexByCategory.set(category, index + 1);
    const method = normalizeReplacementMethod(categoryMethods[category] || style);
    occurrenceMap.set(
      occKey,
      replacementForCategoryValue(category, entity.text, {
        method,
        index,
        salt,
        customCategories,
        generalizationLadders,
      }),
    );
  }

  return occurrenceMap;
}

export function resolveEntityReplacement(
  entity,
  replacementMap,
  occurrenceReplacements,
  distinctOccurrenceKeys = {},
) {
  if (!entity) {
    return undefined;
  }
  const occKey = getEntityOccurrenceKey(entity);
  if (distinctOccurrenceKeys[occKey] && occurrenceReplacements?.has(occKey)) {
    return occurrenceReplacements.get(occKey);
  }
  return replacementMap?.get(getEntityValueKey(entity.label, entity.text));
}

/**
 * Resolve a same-code link chain: `person:marie` → `person:marie dupont`.
 */
export function resolveLinkedValueKey(valueKey, linkedValueKeys = {}, seen = new Set()) {
  const next = linkedValueKeys?.[valueKey];
  if (!next || next === valueKey || seen.has(valueKey)) {
    return valueKey;
  }
  seen.add(valueKey);
  return resolveLinkedValueKey(next, linkedValueKeys, seen);
}

function earliestStartForValue(entities, category, entityText) {
  const lower = String(entityText || "").toLocaleLowerCase();
  let earliest = Number.POSITIVE_INFINITY;
  for (const entity of entities || []) {
    if (entity.label !== category) {
      continue;
    }
    if (String(entity.text || "").toLocaleLowerCase() !== lower) {
      continue;
    }
    const start = Number.isFinite(entity.start) ? entity.start : Number.POSITIVE_INFINITY;
    if (start < earliest) {
      earliest = start;
    }
  }
  return earliest;
}

function clearLinksInvolving(next, valueKey) {
  delete next[valueKey];
  for (const [key, target] of Object.entries(next)) {
    if (key === valueKey || target === valueKey) {
      delete next[key];
    }
  }
  return next;
}

/**
 * Set or clear a same-code link for `fromKey`.
 * Pass `toKey = null` / empty to clear. Replaces any previous link for this value.
 * Selecting the same target again clears the link (toggle).
 * The later-in-text surface points at the earlier one so numbering stays stable.
 */
export function toggleLinkedValueKeys(current, fromKey, toKey, entities = []) {
  const prev = current || {};
  const previousCanonical = resolveLinkedValueKey(fromKey, prev);
  const previouslyLinked =
    previousCanonical !== fromKey || Object.values(prev).includes(fromKey);
  const previousPartner =
    previousCanonical !== fromKey
      ? previousCanonical
      : Object.entries(prev).find(([, target]) => target === fromKey)?.[0] || null;

  const next = { ...prev };
  clearLinksInvolving(next, fromKey);

  if (!toKey || toKey === fromKey) {
    return { next, linked: false, canonicalKey: null };
  }

  if (previouslyLinked && previousPartner === toKey) {
    clearLinksInvolving(next, toKey);
    return { next, linked: false, canonicalKey: null };
  }

  clearLinksInvolving(next, toKey);

  const fromCategory = fromKey.slice(0, fromKey.indexOf(":"));
  const fromText = fromKey.slice(fromKey.indexOf(":") + 1);
  const toCategory = toKey.slice(0, toKey.indexOf(":"));
  const toText = toKey.slice(toKey.indexOf(":") + 1);
  const fromStart = earliestStartForValue(entities, fromCategory, fromText);
  const toStart = earliestStartForValue(entities, toCategory, toText);
  // Later form → earlier form (earlier keeps its PERSON_N).
  const [aliasKey, canonicalKey] =
    fromStart <= toStart ? [toKey, fromKey] : [fromKey, toKey];
  next[aliasKey] = canonicalKey;
  return { next, linked: true, canonicalKey, aliasKey };
}

/**
 * Make differently spelled surfaces share one replacement (earliest text form
 * keeps its code; later linked forms copy it).
 */
export function applyLinkedValueReplacements(replacementMap, linkedValueKeys = {}) {
  if (!replacementMap || !linkedValueKeys || !Object.keys(linkedValueKeys).length) {
    return replacementMap;
  }
  for (const fromKey of Object.keys(linkedValueKeys)) {
    const toKey = resolveLinkedValueKey(fromKey, linkedValueKeys);
    if (toKey === fromKey) {
      continue;
    }
    if (replacementMap.has(toKey)) {
      replacementMap.set(fromKey, replacementMap.get(toKey));
    } else if (replacementMap.has(fromKey)) {
      replacementMap.set(toKey, replacementMap.get(fromKey));
    }
  }
  return replacementMap;
}

/**
 * Stable `[PREFIX_N]` codes for hover hints — same numbering as placeholder
 * anonymization (per detected surface; optional same-code links).
 */
export function buildPlaceholderHintMap(
  groupedEntities,
  customCategories = {},
  {
    entities = [],
    distinctOccurrenceKeys = {},
    linkedValueKeys = {},
  } = {},
) {
  const map = buildReplacementMap(groupedEntities, null, {
    style: "placeholder",
    customCategories,
  });
  applyLinkedValueReplacements(map, linkedValueKeys);
  const occurrenceMap = buildDistinctOccurrenceReplacements(
    map,
    entities,
    distinctOccurrenceKeys,
    { style: "placeholder", customCategories },
  );
  return {
    get(entity) {
      return resolveEntityReplacement(
        entity,
        map,
        occurrenceMap,
        distinctOccurrenceKeys,
      );
    },
  };
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

/** Drop selection keys for categories that no longer have any spans. */
export function pruneSelectedCategories(selectedCategories, entities, ensureCategory = null) {
  const present = new Set(
    (entities || []).map((entity) => entity.label).filter(Boolean),
  );
  const next = {};
  for (const [category, enabled] of Object.entries(selectedCategories || {})) {
    if (present.has(category)) {
      next[category] = enabled;
    }
  }
  if (ensureCategory && present.has(ensureCategory) && !(ensureCategory in next)) {
    next[ensureCategory] = true;
  }
  return next;
}

/**
 * Move a per-value override when a surface changes category.
 * Keeps the old key if other spans still use the previous category+value.
 */
export function migrateSurfaceOverrideOnRetarget(
  surfaceOverrides,
  oldKey,
  newKey,
  nextCategory,
  { keepOldKey = false } = {},
) {
  const current = surfaceOverrides || {};
  const override = current[oldKey];
  if (!override) {
    return current;
  }
  const next = { ...current };
  if (!keepOldKey) {
    delete next[oldKey];
  }
  next[newKey] = {
    ...override,
    category: nextCategory,
  };
  return next;
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
      id: `ent-${entity.start}-${entity.end}-${index}`,
      key: `${entity.label}:${entity.text.toLocaleLowerCase()}:${entity.start}:${index}`,
    }))
    .filter((entity) => entity.text && entity.start < entity.end)
    .sort((a, b) => a.start - b.start || a.end - b.end);
}

function spansOverlap(left, right) {
  return left.start < right.end && left.end > right.start;
}

/**
 * Add manually annotated spans without removing existing detections.
 * New spans that overlap an already-detected entity are skipped so short
 * selections (e.g. "Marie") cannot wipe longer spans ("Marie Dupont") or
 * unrelated entities that share a substring (e.g. email local-parts).
 */
export function addEntitySpans(entities, spans, label, sourceText) {
  if (!spans.length) {
    return entities;
  }

  const existing = Array.isArray(entities) ? entities : [];
  const stamp = Date.now();
  const newEntities = [];

  for (let index = 0; index < spans.length; index += 1) {
    const span = spans[index];
    if (
      span == null ||
      span.start == null ||
      span.end == null ||
      span.start >= span.end
    ) {
      continue;
    }
    const overlapsExisting = existing.some((entity) => spansOverlap(entity, span));
    const overlapsNew = newEntities.some((entity) => spansOverlap(entity, span));
    if (overlapsExisting || overlapsNew) {
      continue;
    }
    newEntities.push({
      id: `manual-${span.start}-${span.end}-${stamp}-${index}`,
      start: span.start,
      end: span.end,
      text: span.text,
      label,
      source: "manual",
    });
  }

  if (!newEntities.length) {
    return existing;
  }

  return normalizeEntities([...existing, ...newEntities], sourceText);
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

/**
 * Characters that continue an identifier token for whole-word search.
 * Letters/digits plus connectors so "Marie" does not match inside
 * "marie.dupont@example.com" or "Marie-Claire".
 */
const WORD_BOUNDARY_CONTINUE = String.raw`[\p{L}\p{N}._@\-]`;

export function findAllOccurrenceRanges(text, searchText) {
  const pattern = buildWordBasedSearchPattern(searchText);
  if (!text || !pattern) {
    return [];
  }

  const regex = new RegExp(
    `(?<!${WORD_BOUNDARY_CONTINUE})${pattern}(?!${WORD_BOUNDARY_CONTINUE})`,
    "giu",
  );
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

/**
 * Word matches that can still be added — skips ranges that overlap an
 * existing detection (e.g. "Marie" inside an annotated "Marie Dupont").
 */
export function findAddableOccurrenceRanges(text, searchText, existingEntities = []) {
  const ranges = findAllOccurrenceRanges(text, searchText);
  if (!ranges.length || !existingEntities?.length) {
    return ranges;
  }
  return ranges.filter(
    (span) => !existingEntities.some((entity) => spansOverlap(entity, span)),
  );
}

/** Repeat each entity span for every matching value occurrence in the source text. */
export function expandEntityValueOccurrences(text, entities) {
  if (!text || !entities.length) {
    return entities;
  }

  const expanded = [];
  // One regex scan per unique label+value — repeating per span was O(n²) on long docs.
  const seenValues = new Set();

  for (const entity of entities) {
    const valueKey = `${entity.label || ""}\0${String(entity.text || "").toLocaleLowerCase()}`;
    if (seenValues.has(valueKey)) {
      continue;
    }
    seenValues.add(valueKey);

    const ranges = findAllOccurrenceRanges(text, entity.text);
    if (!ranges.length) {
      expanded.push(entity);
      continue;
    }

    for (const range of ranges) {
      expanded.push({
        ...entity,
        start: range.start,
        end: range.end,
        text: range.text,
      });
    }
  }

  return expanded;
}

/** O(n) occurrence counts keyed by getEntityValueKey(label, text). */
export function buildEntitySpanCounts(entities) {
  const counts = new Map();
  for (const entity of entities || []) {
    const key = getEntityValueKey(entity.label, entity.text);
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  return counts;
}

/**
 * Expand model spans to every matching occurrence, merge regex rules (email, phone,
 * identity documents…), and normalize.
 * @param {string} text
 * @param {Array} entities
 * @param {{ ruleLabels?: string[] }} [options] — defaults to all GLINER_RULE_LABELS
 */
export function finalizeDetectedEntities(text, entities, options = {}) {
  const ruleLabels = Array.isArray(options.ruleLabels) ? options.ruleLabels : GLINER_RULE_LABELS;
  const incoming = Array.isArray(entities) ? entities : [];
  const modelEntities = incoming.filter((entity) => entity.source !== "rule");
  const expandedModel = expandEntityValueOccurrences(text, modelEntities);
  const ruleEntities = ruleLabels.length ? detectWithGlinerRules(text, ruleLabels) : [];
  const cleaned = filterPronounPersonEntities([...expandedModel, ...ruleEntities]);

  return normalizeEntities(mergeEntities(cleaned), text);
}

export function removeEntityById(entities, entityId, entity = null) {
  if (entityId) {
    return entities.filter((item) => item.id !== entityId);
  }

  if (entity) {
    return entities.filter(
      (item) =>
        !(
          item.start === entity.start &&
          item.end === entity.end &&
          item.label === entity.label &&
          item.text === entity.text
        ),
    );
  }

  return entities;
}

function entityMatchesIdentity(item, entity) {
  if (!item || !entity) {
    return false;
  }
  if (entity.id && item.id) {
    return item.id === entity.id;
  }
  return (
    item.start === entity.start &&
    item.end === entity.end &&
    item.label === entity.label &&
    item.text === entity.text
  );
}

/** Count spans that share category + surface form with the given entity. */
export function countEntitiesMatchingValue(entities, category, entityText) {
  const normalized = String(entityText || "").toLocaleLowerCase();
  return (entities || []).filter(
    (item) =>
      item.label === category &&
      String(item.text || "").toLocaleLowerCase() === normalized,
  ).length;
}

/**
 * Change the category of one clicked span, or every span with the same
 * category + surface form (case-insensitive).
 */
export function retargetEntityCategory(entities, entity, nextLabel, scope = "single") {
  if (!entity || !nextLabel || entity.label === nextLabel) {
    return { entities: entities || [], changedCount: 0 };
  }

  const normalized = String(entity.text || "").toLocaleLowerCase();
  let changedCount = 0;
  const next = (entities || []).map((item) => {
    const matchesSingle = entityMatchesIdentity(item, entity);
    const matchesAll =
      item.label === entity.label &&
      String(item.text || "").toLocaleLowerCase() === normalized;
    const shouldChange = scope === "all" ? matchesAll : matchesSingle;
    if (!shouldChange) {
      return item;
    }
    changedCount += 1;
    return { ...item, label: nextLabel };
  });

  return { entities: next, changedCount };
}

/** Split out every span for a category + value (chip remove / restore). */
export function extractEntitiesByValue(entities, category, entityText) {
  const normalized = String(entityText || "").toLocaleLowerCase();
  const kept = [];
  const extracted = [];
  for (const item of entities || []) {
    if (
      item.label === category &&
      String(item.text || "").toLocaleLowerCase() === normalized
    ) {
      extracted.push(item);
    } else {
      kept.push(item);
    }
  }
  return { kept, extracted };
}

/** Remove every span for a category + value (chip delete). */
export function removeEntitiesByValue(entities, category, entityText) {
  return extractEntitiesByValue(entities, category, entityText).kept;
}

/**
 * Remove one clicked span, or every span with the same category + surface
 * (same scopes as retargetEntityCategory / the entity menu).
 */
export function removeEntitiesByScope(entities, entity, scope = "single") {
  if (!entity) {
    return { entities: entities || [], removed: [] };
  }
  if (scope === "all") {
    const { kept, extracted } = extractEntitiesByValue(
      entities,
      entity.label,
      entity.text,
    );
    return { entities: kept, removed: extracted };
  }

  const removed = [];
  const next = [];
  for (const item of entities || []) {
    if (entityMatchesIdentity(item, entity)) {
      removed.push(item);
    } else {
      next.push(item);
    }
  }
  return { entities: next, removed };
}

function sortEntitiesBySpan(entities) {
  return [...(entities || [])].sort(
    (left, right) =>
      (left.start ?? 0) - (right.start ?? 0) || (left.end ?? 0) - (right.end ?? 0),
  );
}

/** Re-insert extracted spans into the active entity list. */
export function mergeEntitiesBySpan(entities, toAdd) {
  if (!toAdd?.length) {
    return entities || [];
  }
  return sortEntitiesBySpan([...(entities || []), ...toAdd]);
}

/**
 * Unique values per category, ordered by first appearance in the source text
 * (earliest start offset) so [PERSON_1] is the first name the reader sees.
 */
export function groupEntities(entities) {
  const earliestByCategory = new Map();

  for (const entity of entities || []) {
    const category = entity.label || "misc";
    const valueKey = String(entity.text || "").toLocaleLowerCase();
    if (!valueKey) {
      continue;
    }
    let byValue = earliestByCategory.get(category);
    if (!byValue) {
      byValue = new Map();
      earliestByCategory.set(category, byValue);
    }
    const prev = byValue.get(valueKey);
    const start = Number.isFinite(entity.start) ? entity.start : Number.POSITIVE_INFINITY;
    if (!prev || start < prev.start) {
      byValue.set(valueKey, entity);
    }
  }

  const groups = {};
  for (const [category, byValue] of earliestByCategory) {
    groups[category] = [...byValue.values()].sort(
      (left, right) =>
        (Number.isFinite(left.start) ? left.start : 0) -
          (Number.isFinite(right.start) ? right.start : 0) ||
        String(left.text || "").localeCompare(String(right.text || "")),
    );
  }
  return groups;
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

/**
 * Force every surface of the same person (name + aliases + corefs) to share one
 * replacement token / generalization, matching the person graph.
 */
export function unifyPersonGraphReplacements(
  replacementMap,
  persons,
  {
    style = DEFAULT_REPLACEMENT_STYLE,
    categoryMethods = {},
    customCategories = {},
    salt = "",
    generalizationLadders = {},
    selectedCategories = null,
  } = {},
) {
  if (!replacementMap || !persons?.length) {
    return replacementMap;
  }
  if (selectedCategories && selectedCategories.person === false) {
    return replacementMap;
  }

  const method = normalizeReplacementMethod(categoryMethods.person || style);

  persons.forEach((person, personIndex) => {
    const surfaces = [person.name, ...(person.aliases || []), ...(person.corefs || [])]
      .map((value) => String(value || "").trim())
      .filter((value) => value.length >= 2);
    if (!surfaces.length) {
      return;
    }

    const canonical = String(person.name || surfaces[0]).trim();
    const replacement = replacementForCategoryValue("person", canonical, {
      method,
      index: personIndex,
      salt,
      customCategories,
      generalizationLadders,
    });

    for (const surface of surfaces) {
      replacementMap.set(getEntityValueKey("person", surface), replacement);
    }
  });

  return replacementMap;
}

function resolvePersonsForReplacement(text, entities, persons) {
  if (Array.isArray(persons) && persons.length) {
    return persons;
  }
  if (!text || !entities?.length) {
    return [];
  }
  try {
    return buildBasicPersonGraph(text, entities, null).persons || [];
  } catch {
    return [];
  }
}

/**
 * Per-value override after category methods:
 * `{ kind: "custom", text, category, surface }` or
 * `{ kind: "method", method, category, surface }`.
 */
export function applySurfaceReplacementOverrides(
  replacementMap,
  surfaceOverrides = {},
  {
    customCategories = {},
    salt = "",
    generalizationLadders = {},
    groupedEntities = {},
  } = {},
) {
  if (!replacementMap || !surfaceOverrides || !Object.keys(surfaceOverrides).length) {
    return replacementMap;
  }

  for (const [key, override] of Object.entries(surfaceOverrides)) {
    if (!override?.category) {
      continue;
    }
    const surface = String(override.surface ?? "").trim() || key.slice(key.indexOf(":") + 1);
    if (override.kind === "custom") {
      replacementMap.set(key, String(override.text ?? ""));
      continue;
    }
    if (override.kind === "method") {
      const method = normalizeReplacementMethod(override.method);
      const categoryEntities = groupedEntities[override.category] || [];
      let index = categoryEntities.findIndex(
        (entity) =>
          String(entity.text || "").toLocaleLowerCase() === String(surface).toLocaleLowerCase(),
      );
      if (index < 0) {
        index = 0;
      }
      replacementMap.set(
        key,
        replacementForCategoryValue(override.category, surface, {
          method,
          index,
          salt,
          customCategories,
          generalizationLadders,
        }),
      );
    }
  }

  return replacementMap;
}

/**
 * Build anonymized text + highlight segments (positions in the anonymized output).
 */
export function buildAnonymizedPreviewModel(
  text,
  entities,
  groupedEntities,
  selectedCategories,
  excludedEntityKeys,
  customCategories,
  options = {},
) {
  const {
    style = DEFAULT_REPLACEMENT_STYLE,
    categoryMethods = {},
    salt = text || "",
    generalizationLadders = {},
    persons: personsOption,
    surfaceOverrides = {},
    unifyPersonSurfaces = false,
    distinctOccurrenceKeys = {},
    linkedValueKeys = {},
  } = options;

  if (!text) {
    return { anonymizedText: "", segments: [], replacementMap: new Map() };
  }

  const replacementMap = buildReplacementMap(groupedEntities, selectedCategories, {
    style,
    categoryMethods,
    customCategories,
    salt,
    generalizationLadders,
  });

  // Default: follow NER surfaces (Marie ≠ Marie Dupont). Opt-in alias merge only.
  if (unifyPersonSurfaces) {
    unifyPersonGraphReplacements(
      replacementMap,
      resolvePersonsForReplacement(text, entities, personsOption),
      {
        style,
        categoryMethods,
        customCategories,
        salt,
        generalizationLadders,
        selectedCategories,
      },
    );
  }

  // Explicit same-code links (different spellings the user marked as one entity).
  applyLinkedValueReplacements(replacementMap, linkedValueKeys);

  applySurfaceReplacementOverrides(replacementMap, surfaceOverrides, {
    customCategories,
    salt,
    generalizationLadders,
    groupedEntities,
  });

  const occurrenceReplacements = buildDistinctOccurrenceReplacements(
    replacementMap,
    entities,
    distinctOccurrenceKeys,
    {
      style,
      categoryMethods,
      customCategories,
      salt,
      generalizationLadders,
    },
  );

  const applicable = pickNonOverlappingEntities(
    entities.filter((entity) => isEntityActive(entity, selectedCategories, excludedEntityKeys)),
  ).sort((a, b) => a.start - b.start || b.end - a.end);

  let output = "";
  let cursor = 0;
  const segments = [];
  const originalLength = text.length;

  for (const entity of applicable) {
    if (
      entity.start == null ||
      entity.end == null ||
      entity.start < cursor ||
      entity.start < 0 ||
      entity.end > originalLength ||
      entity.start >= entity.end
    ) {
      continue;
    }

    if (entity.start > cursor) {
      const plain = text.slice(cursor, entity.start);
      segments.push({
        text: plain,
        start: output.length,
        end: output.length + plain.length,
      });
      output += plain;
    }

    const valueKey = getEntityValueKey(entity.label, entity.text);
    const replacement = resolveEntityReplacement(
      entity,
      replacementMap,
      occurrenceReplacements,
      distinctOccurrenceKeys,
    );
    if (replacement == null) {
      const plain = text.slice(entity.start, entity.end);
      segments.push({
        text: plain,
        start: output.length,
        end: output.length + plain.length,
      });
      output += plain;
    } else {
      const start = output.length;
      output += replacement;
      segments.push({
        text: replacement,
        start,
        end: output.length,
        entity,
        originalText: entity.text,
        replacement,
        valueKey,
      });
    }
    cursor = entity.end;
  }

  if (cursor < text.length) {
    const plain = text.slice(cursor);
    segments.push({
      text: plain,
      start: output.length,
      end: output.length + plain.length,
    });
    output += plain;
  }

  return { anonymizedText: output, segments, replacementMap };
}

export function replaceSelectedCategories(
  text,
  entities,
  groupedEntities,
  selectedCategories,
  excludedEntityKeys,
  customCategories,
  options = {},
) {
  return buildAnonymizedPreviewModel(
    text,
    entities,
    groupedEntities,
    selectedCategories,
    excludedEntityKeys,
    customCategories,
    options,
  ).anonymizedText;
}

/**
 * Greedy non-overlapping span pick: longest first, then leftmost.
 * Nested mentions (Marie inside Marie Dupont) keep only the outer span.
 */
export function pickNonOverlappingEntities(entities = []) {
  const ranked = [...entities].sort(
    (a, b) => b.end - b.start - (a.end - a.start) || a.start - b.start || a.end - b.end,
  );
  const kept = [];
  for (const entity of ranked) {
    if (
      entity == null ||
      entity.start == null ||
      entity.end == null ||
      entity.start >= entity.end
    ) {
      continue;
    }
    const overlaps = kept.some(
      (other) => entity.start < other.end && entity.end > other.start,
    );
    if (!overlaps) {
      kept.push(entity);
    }
  }
  return kept;
}

export function countEntitySpans(entities, category, value) {
  const normalized = value.toLocaleLowerCase();
  return entities.filter(
    (entity) =>
      entity.label === category && entity.text.toLocaleLowerCase() === normalized,
  ).length;
}

export function countOccurrences(text, value, existingEntities) {
  if (existingEntities) {
    return findAddableOccurrenceRanges(text, value, existingEntities).length;
  }
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
    original: `${base}-original${suffix}.txt`,
    anonymized: `${base}-anonymized${suffix}.txt`,
    report: `${base}-report${suffix}.md`,
    correspondence: `${base}-correspondence${suffix}.csv`,
    personGraph: `${base}-person-graph${suffix}.csv`,
    personGraphByPerson: `${base}-person-graph-by-person${suffix}.csv`,
    labelStudio: `${base}-label-studio${suffix}.json`,
  };
}
