/**
 * Client-side edit helpers for generative anonymization.
 * Mutate persons + groups, then rebuild the anonymized preview locally.
 */

import { applyAlbertReplacements, groupsToReplacementRows } from "./albertClient.js";
import {
  createCategorySelectionFromEntities,
  getEntityValueKey,
  placeholderPrefixFromCategory,
} from "./entityUtils.js";
import { CATEGORY_LABELS } from "./constants.js";

/** Albert mask type → basic anonymization category id */
export const ALBERT_TYPE_TO_CATEGORY = {
  PER: "person",
  LOC: "location",
  ORG: "organization",
  DAT: "date",
  EMA: "email",
  PHO: "phone",
  URL: "url",
  ADR: "location",
  ID: "misc",
  IBAN: "misc",
  PRO: "misc",
  OTH: "misc",
};

export const CATEGORY_TO_ALBERT_TYPE = {
  person: "PER",
  location: "LOC",
  organization: "ORG",
  date: "DAT",
  email: "EMA",
  phone: "PHO",
  url: "URL",
  misc: "OTH",
};

export function mapAlbertTypeToCategory(typeOrCategory, customCategories = {}) {
  const raw = String(typeOrCategory || "OTH").trim();
  if (!raw) {
    return "misc";
  }
  const lower = raw.toLowerCase();
  if (CATEGORY_LABELS[lower] || customCategories[lower]) {
    return lower;
  }
  const upper = raw.toUpperCase();
  if (ALBERT_TYPE_TO_CATEGORY[upper]) {
    return ALBERT_TYPE_TO_CATEGORY[upper];
  }
  // Keep custom / app category ids (e.g. profession) instead of collapsing to misc
  if (/^[a-z][a-z0-9_]*$/.test(lower)) {
    return lower;
  }
  return "misc";
}

export function resolveGroupCategory(group, customCategories = {}) {
  if (!group) {
    return "misc";
  }
  const stored = String(group.category || "").trim().toLowerCase();
  if (CATEGORY_LABELS[stored] || customCategories[stored]) {
    return stored;
  }
  return mapAlbertTypeToCategory(group.type || group.category, customCategories);
}


function findAliasSpans(text, alias) {
  const spans = [];
  if (!text || !alias) {
    return spans;
  }
  const haystack = text.toLocaleLowerCase();
  const needle = alias.toLocaleLowerCase();
  if (!needle) {
    return spans;
  }
  let from = 0;
  while (from <= haystack.length - needle.length) {
    const index = haystack.indexOf(needle, from);
    if (index === -1) {
      break;
    }
    spans.push({ start: index, end: index + alias.length });
    from = index + Math.max(needle.length, 1);
  }
  return spans;
}

/**
 * Shape Albert groups into the same CategoryReview model used by basic anonymization.
 */
export function buildGenerativeCategoryView(groups, text, customCategories = {}) {
  const entities = [];
  const groupedEntities = {};
  const seenInCategory = new Map();

  for (const group of groups || []) {
    const category = resolveGroupCategory(group, customCategories);
    if (!groupedEntities[category]) {
      groupedEntities[category] = [];
      seenInCategory.set(category, new Set());
    }
    const seen = seenInCategory.get(category);

    for (const alias of group.aliases || []) {
      const value = String(alias || "").trim();
      if (!value) {
        continue;
      }
      const valueKey = getEntityValueKey(category, value);
      if (seen.has(valueKey)) {
        continue;
      }
      seen.add(valueKey);
      groupedEntities[category].push({
        key: `${group.placeholder || category}:${valueKey}`,
        text: value,
        label: category,
        placeholder: group.placeholder,
      });

      const spans = findAliasSpans(text, value);
      if (spans.length) {
        for (const span of spans) {
          entities.push({
            key: `${valueKey}:${span.start}`,
            text: value,
            label: category,
            start: span.start,
            end: span.end,
            placeholder: group.placeholder,
          });
        }
      } else {
        entities.push({
          key: `${valueKey}:0`,
          text: value,
          label: category,
          start: 0,
          end: 0,
          placeholder: group.placeholder,
        });
      }
    }
  }

  // Stable order: builtin labels, then custom / other categories alphabetically
  const ordered = {};
  for (const category of Object.keys(CATEGORY_LABELS)) {
    if (groupedEntities[category]?.length) {
      ordered[category] = groupedEntities[category];
    }
  }
  for (const category of Object.keys(customCategories).sort()) {
    if (groupedEntities[category]?.length && !ordered[category]) {
      ordered[category] = groupedEntities[category];
    }
  }
  for (const [category, rows] of Object.entries(groupedEntities)) {
    if (!ordered[category]) {
      ordered[category] = rows;
    }
  }

  return {
    entities,
    groupedEntities: ordered,
    selectedCategories: createCategorySelectionFromEntities(entities),
  };
}

function isAliasActiveInCategory(
  category,
  alias,
  selectedCategories = {},
  excludedEntityKeys = {},
) {
  if (selectedCategories[category] === false) {
    return false;
  }
  return !excludedEntityKeys[getEntityValueKey(category, alias)];
}

function uniqueLongestFirst(values) {
  const seen = new Set();
  const unique = [];
  for (const value of values) {
    if (!value || seen.has(value)) {
      continue;
    }
    seen.add(value);
    unique.push(value);
  }
  return unique.sort((left, right) => right.length - left.length);
}

function clonePersons(persons) {
  return persons.map((person) => ({
    ...person,
    aliases: [...(person.aliases || [])],
    corefs: [...(person.corefs || [])],
    attrs: (person.attrs || []).map((attr) => ({ ...attr })),
    rels: (person.rels || []).map((rel) => ({ ...rel })),
  }));
}

function cloneGroups(groups) {
  return groups.map((group) => ({
    ...group,
    aliases: [...(group.aliases || [])],
  }));
}

function nextPlaceholder(groups, type = "PER") {
  const prefix = `[${type}_`;
  let max = 0;
  for (const group of groups) {
    const match = String(group.placeholder || "").match(
      new RegExp(`^\\[${type}_(\\d+)\\]$`, "i"),
    );
    if (match) {
      max = Math.max(max, Number(match[1]));
    }
  }
  return `[${type}_${max + 1}]`;
}

function syncPersonAliasesIntoGroups(persons, groups) {
  const nextGroups = cloneGroups(groups);
  for (const person of persons) {
    const group = nextGroups.find((item) => item.placeholder === person.placeholder);
    if (!group) {
      continue;
    }
    group.aliases = uniqueLongestFirst([
      person.name,
      ...(person.aliases || []),
      ...(person.corefs || []),
    ]);
    group.original = person.name;
  }
  return nextGroups;
}

export function surfaceExcludeKey(placeholder, surface) {
  return `${placeholder || ""}::${surface || ""}`;
}

export function toggleSurfaceExcluded(excludedSurfaces, placeholder, surface) {
  const key = surfaceExcludeKey(placeholder, surface);
  const next = { ...excludedSurfaces };
  if (next[key]) {
    delete next[key];
  } else {
    next[key] = true;
  }
  return next;
}

export function isSurfaceExcluded(excludedSurfaces, placeholder, surface) {
  return Boolean(excludedSurfaces[surfaceExcludeKey(placeholder, surface)]);
}

export function rebuildGenerativeOutputs(
  text,
  groups,
  excludedPlaceholders = {},
  excludedSurfaces = {},
  selectedCategories = null,
  excludedEntityKeys = {},
  customCategories = {},
) {
  function isAliasSoftExcluded(group, alias, category) {
    if (excludedPlaceholders[group.placeholder]) {
      return true;
    }
    if (excludedSurfaces[surfaceExcludeKey(group.placeholder, alias)]) {
      return true;
    }
    if (
      selectedCategories &&
      !isAliasActiveInCategory(category, alias, selectedCategories, excludedEntityKeys)
    ) {
      return true;
    }
    // If a longer form of the same group is excluded, skip shorter substrings
    // so "Claire Martin" → exclude does not leave "[PER_1] Martin".
    const aliasLower = String(alias || "").toLocaleLowerCase();
    for (const other of group.aliases || []) {
      if (!other || other.length <= alias.length) {
        continue;
      }
      const otherExcluded =
        Boolean(excludedSurfaces[surfaceExcludeKey(group.placeholder, other)]) ||
        (selectedCategories
          ? !isAliasActiveInCategory(
              category,
              other,
              selectedCategories,
              excludedEntityKeys,
            )
          : false);
      if (otherExcluded && other.toLocaleLowerCase().includes(aliasLower)) {
        return true;
      }
    }
    return false;
  }

  const forAnonymization = groups
    .filter((group) => !excludedPlaceholders[group.placeholder])
    .map((group) => {
      const category = resolveGroupCategory(group, customCategories);
      return {
        ...group,
        aliases: (group.aliases || []).filter(
          (alias) => !isAliasSoftExcluded(group, alias, category),
        ),
      };
    })
    .filter((group) => group.aliases.length > 0);

  return {
    anonymizedText: applyAlbertReplacements(text, forAnonymization),
    replacements: groupsToReplacementRows(groups).map((row) => {
      const group = groups.find((item) => item.placeholder === row.placeholder);
      const category = resolveGroupCategory(
        group || { category: row.category, type: row.category },
        customCategories,
      );
      const allSurfacesExcluded =
        Boolean(group?.aliases?.length) &&
        group.aliases.every((alias) => isAliasSoftExcluded(group, alias, category));
      return {
        ...row,
        excluded:
          Boolean(excludedPlaceholders[row.placeholder]) || allSurfacesExcluded,
      };
    }),
  };
}

function aliasMatches(left, right) {
  return String(left || "").toLocaleLowerCase() === String(right || "").toLocaleLowerCase();
}

/** Keep person-graph surface excludes and Categories chips in sync. */
export function toggleSurfaceExclusionSynced(
  groups,
  excludedSurfaces,
  excludedEntityKeys,
  placeholder,
  surface,
  customCategories = {},
) {
  const nextSurfaces = toggleSurfaceExcluded(excludedSurfaces, placeholder, surface);
  const excluded = Boolean(nextSurfaces[surfaceExcludeKey(placeholder, surface)]);
  const group = groups.find((item) => item.placeholder === placeholder);
  const category = resolveGroupCategory(group, customCategories);
  const entityKey = getEntityValueKey(category, surface);
  const nextKeys = { ...excludedEntityKeys };

  if (excluded) {
    nextKeys[entityKey] = true;
  } else {
    delete nextKeys[entityKey];
    // Restore every matching surface in that category so chip + graph agree
    for (const item of groups) {
      if (resolveGroupCategory(item, customCategories) !== category) {
        continue;
      }
      for (const alias of item.aliases || []) {
        if (!aliasMatches(alias, surface)) {
          continue;
        }
        delete nextSurfaces[surfaceExcludeKey(item.placeholder, alias)];
      }
    }
  }

  return { excludedSurfaces: nextSurfaces, excludedEntityKeys: nextKeys, excluded };
}

/** Chip toggle → also flip matching person-graph surfaces. */
export function toggleEntityExclusionSynced(
  groups,
  excludedSurfaces,
  excludedEntityKeys,
  category,
  entityText,
  customCategories = {},
) {
  const entityKey = getEntityValueKey(category, entityText);
  const nextKeys = { ...excludedEntityKeys };
  const excluding = !nextKeys[entityKey];
  if (excluding) {
    nextKeys[entityKey] = true;
  } else {
    delete nextKeys[entityKey];
  }

  const nextSurfaces = { ...excludedSurfaces };
  for (const group of groups) {
    if (resolveGroupCategory(group, customCategories) !== category) {
      continue;
    }
    for (const alias of group.aliases || []) {
      if (!aliasMatches(alias, entityText)) {
        continue;
      }
      const key = surfaceExcludeKey(group.placeholder, alias);
      if (excluding) {
        nextSurfaces[key] = true;
      } else {
        delete nextSurfaces[key];
      }
    }
  }

  return { excludedSurfaces: nextSurfaces, excludedEntityKeys: nextKeys, excluded: excluding };
}

/** Whole-person / placeholder exclude → gray all related category chips. */
export function togglePlaceholderExclusionSynced(
  groups,
  excludedPlaceholders,
  excludedSurfaces,
  excludedEntityKeys,
  placeholder,
  customCategories = {},
) {
  const nextPlaceholders = togglePlaceholderExcluded(excludedPlaceholders, placeholder);
  const excluding = Boolean(nextPlaceholders[placeholder]);
  const group = groups.find((item) => item.placeholder === placeholder);
  const category = resolveGroupCategory(group, customCategories);
  const nextSurfaces = { ...excludedSurfaces };
  const nextKeys = { ...excludedEntityKeys };

  for (const alias of group?.aliases || []) {
    const surfaceKey = surfaceExcludeKey(placeholder, alias);
    const entityKey = getEntityValueKey(category, alias);
    if (excluding) {
      nextSurfaces[surfaceKey] = true;
      nextKeys[entityKey] = true;
    } else {
      delete nextSurfaces[surfaceKey];
      delete nextKeys[entityKey];
    }
  }

  return {
    excludedPlaceholders: nextPlaceholders,
    excludedSurfaces: nextSurfaces,
    excludedEntityKeys: nextKeys,
    excluded: excluding,
  };
}

export function addSurfaceToExistingPerson(persons, groups, personIndex, surface) {
  const value = String(surface || "").trim();
  if (!value || personIndex < 0 || personIndex >= persons.length) {
    return { persons, groups };
  }

  const nextPersons = clonePersons(persons);
  const person = nextPersons[personIndex];
  if (person.name !== value && !person.aliases.includes(value) && !person.corefs.includes(value)) {
    person.aliases = uniqueLongestFirst([...person.aliases, value]);
  }

  const nextGroups = syncPersonAliasesIntoGroups(nextPersons, groups);
  // Also ensure the surface is on the PER group even if sync missed
  const group = nextGroups.find((item) => item.placeholder === person.placeholder);
  if (group && !group.aliases.includes(value)) {
    group.aliases = uniqueLongestFirst([...group.aliases, value]);
  }

  return { persons: nextPersons, groups: nextGroups };
}

/**
 * Manually attach a surface to a person (alias or attribute). Removes it from other
 * persons first so the relation is unique.
 */
export function relateSurfaceToPerson(
  persons,
  groups,
  surface,
  toPersonIndex,
  { asAlias = false, attrLabel = "", attrKey = "misc", fromPlaceholder = "" } = {},
) {
  const value = String(surface || "").trim();
  if (!value || toPersonIndex < 0 || toPersonIndex >= persons.length) {
    return { persons, groups };
  }

  const nextPersons = clonePersons(persons);
  const target = nextPersons[toPersonIndex];
  let movedAttr = null;

  for (const person of nextPersons) {
    const matchingAttr = (person.attrs || []).find((attr) => aliasMatches(attr.value, value));
    if (matchingAttr && !movedAttr) {
      movedAttr = { ...matchingAttr };
    }
    person.attrs = (person.attrs || []).filter((attr) => !aliasMatches(attr.value, value));
    person.aliases = (person.aliases || []).filter((alias) => !aliasMatches(alias, value));
    person.corefs = (person.corefs || []).filter((coref) => !aliasMatches(coref, value));
    if (aliasMatches(person.name, value) && person.placeholder !== target.placeholder) {
      const nextName = person.aliases[0] || person.corefs[0] || "";
      person.name = nextName;
      person.aliases = person.aliases.filter((alias) => alias !== nextName);
      person.corefs = person.corefs.filter((coref) => coref !== nextName);
    }
  }

  const treatAsAlias =
    asAlias ||
    aliasMatches(target.name, value) ||
    Boolean(fromPlaceholder && String(fromPlaceholder).startsWith("[PER_"));

  if (treatAsAlias) {
    if (!aliasMatches(target.name, value)) {
      target.aliases = uniqueLongestFirst([...(target.aliases || []), value]);
    }
  } else {
    const label = attrLabel || movedAttr?.label || "autre";
    const key = attrKey || movedAttr?.key || "misc";
    if (!(target.attrs || []).some((attr) => aliasMatches(attr.value, value))) {
      target.attrs = [
        ...(target.attrs || []),
        {
          key,
          label,
          value,
          inSource: true,
          placeholder: movedAttr?.placeholder || undefined,
        },
      ];
    }
  }

  let nextGroups = syncPersonAliasesIntoGroups(
    nextPersons.filter((person) => person.name),
    groups,
  );

  // Keep non-person category groups that still need this surface for replacements
  if (!treatAsAlias) {
    const categoryGroup = nextGroups.find((group) =>
      (group.aliases || []).some((alias) => aliasMatches(alias, value)),
    );
    if (!categoryGroup && movedAttr?.placeholder) {
      const existing = groups.find((group) => group.placeholder === movedAttr.placeholder);
      if (existing) {
        nextGroups.push({
          ...existing,
          aliases: uniqueLongestFirst([...(existing.aliases || []), value]),
        });
      }
    }
  }

  return {
    persons: nextPersons.filter((person) => person.name),
    groups: nextGroups,
  };
}

export function addSurfaceAsNewPerson(persons, groups, surface) {
  const value = String(surface || "").trim();
  if (!value) {
    return { persons, groups };
  }

  // If already owned by a person group, don't duplicate
  for (const group of groups) {
    if (group.type === "PER" && group.aliases.includes(value)) {
      return { persons, groups };
    }
  }

  const nextGroups = cloneGroups(groups);
  const placeholder = nextPlaceholder(nextGroups, "PER");
  nextGroups.push({
    type: "PER",
    category: "person",
    placeholder,
    aliases: [value],
    original: value,
  });

  const nextPersons = clonePersons(persons);
  nextPersons.push({
    name: value,
    placeholder,
    aliases: [],
    corefs: [],
    attrs: [],
    rels: [],
  });

  return { persons: nextPersons, groups: nextGroups };
}

/**
 * Add a surface under a basic-style category (builtin or custom).
 * Person category also creates a person-graph node.
 */
export function addSurfaceAsCategory(persons, groups, surface, categoryId) {
  const value = String(surface || "").trim();
  const category = String(categoryId || "").trim().toLowerCase();
  if (!value || !category) {
    return { persons, groups };
  }

  if (category === "person") {
    return addSurfaceAsNewPerson(persons, groups, value);
  }

  const nextGroups = cloneGroups(groups);
  const existing = nextGroups.find(
    (group) =>
      resolveGroupCategory(group) === category &&
      (group.aliases || []).some((alias) => aliasMatches(alias, value)),
  );
  if (existing) {
    return { persons, groups: nextGroups };
  }

  const type = CATEGORY_TO_ALBERT_TYPE[category] || placeholderPrefixFromCategory(category);
  const placeholder = nextPlaceholder(nextGroups, type);
  nextGroups.push({
    type,
    category,
    placeholder,
    aliases: [value],
    original: value,
  });

  return { persons, groups: nextGroups };
}

export function removeSurfaceFromGraph(persons, groups, surface, placeholder = null) {
  const value = String(surface || "").trim();
  if (!value) {
    return { persons, groups };
  }

  const nextPersons = clonePersons(persons)
    .map((person) => {
      if (placeholder && person.placeholder !== placeholder) {
        return person;
      }
      if (person.name === value) {
        const nextName = person.aliases[0] || person.corefs[0] || "";
        return {
          ...person,
          name: nextName,
          aliases: person.aliases.filter((alias) => alias !== nextName && alias !== value),
          corefs: person.corefs.filter((alias) => alias !== nextName && alias !== value),
        };
      }
      return {
        ...person,
        aliases: person.aliases.filter((alias) => alias !== value),
        corefs: person.corefs.filter((alias) => alias !== value),
        attrs: person.attrs.filter((attr) => attr.value !== value),
      };
    })
    .filter((person) => person.name || person.aliases.length || person.corefs.length);

  let nextGroups = cloneGroups(groups)
    .map((group) => {
      if (placeholder && group.placeholder !== placeholder) {
        return group;
      }
      return {
        ...group,
        aliases: group.aliases.filter((alias) => alias !== value),
        original:
          group.original === value ? group.aliases.find((alias) => alias !== value) || "" : group.original,
      };
    })
    .filter((group) => group.aliases.length > 0);

  // Drop orphan person slots whose placeholder disappeared
  const living = new Set(nextGroups.map((group) => group.placeholder));
  const filteredPersons = nextPersons.filter(
    (person) => !person.placeholder || living.has(person.placeholder),
  );

  nextGroups = syncPersonAliasesIntoGroups(filteredPersons, nextGroups).filter(
    (group) => group.aliases.length > 0,
  );

  return { persons: filteredPersons, groups: nextGroups };
}

export function removePersonAttr(persons, groups, personIndex, attrKey) {
  if (personIndex < 0 || personIndex >= persons.length) {
    return { persons, groups };
  }

  const nextPersons = clonePersons(persons);
  const person = nextPersons[personIndex];
  const attr = person.attrs.find((item) => item.key === attrKey);
  person.attrs = person.attrs.filter((item) => item.key !== attrKey);

  let nextGroups = cloneGroups(groups);
  if (attr?.value) {
    // Only remove the attr value group if no other person still uses it
    const stillUsed = nextPersons.some((candidate) =>
      (candidate.attrs || []).some((item) => item.value === attr.value),
    );
    if (!stillUsed) {
      nextGroups = nextGroups
        .map((group) => ({
          ...group,
          aliases: group.aliases.filter((alias) => alias !== attr.value),
        }))
        .filter((group) => group.aliases.length > 0);
    }
  }

  return { persons: nextPersons, groups: nextGroups };
}

export function removePersonRel(persons, personIndex, relKey, target) {
  if (personIndex < 0 || personIndex >= persons.length) {
    return persons;
  }
  const nextPersons = clonePersons(persons);
  nextPersons[personIndex].rels = nextPersons[personIndex].rels.filter(
    (rel) => !(rel.key === relKey && rel.target === target),
  );
  return nextPersons;
}

export function togglePlaceholderExcluded(excludedPlaceholders, placeholder) {
  const next = { ...excludedPlaceholders };
  if (next[placeholder]) {
    delete next[placeholder];
  } else {
    next[placeholder] = true;
  }
  return next;
}
