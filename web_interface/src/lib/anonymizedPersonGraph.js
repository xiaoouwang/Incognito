/**
 * Build a person graph whose surfaces match the anonymized preview
 * (placeholders / Level 1–3 / mask), for review and CSV export.
 */

import { isSurfaceExcluded, surfaceExcludeKey } from "./albertEdit.js";
import { buildBasicPersonGraph } from "./basicPersonGraph.js";
import {
  applySurfaceReplacementOverrides,
  getEntityValueKey,
  unifyPersonGraphReplacements,
} from "./entityUtils.js";
import {
  DEFAULT_REPLACEMENT_STYLE,
  buildReplacementMap,
  normalizeReplacementMethod,
} from "./pseudonymize.js";

const ATTR_KEY_TO_CATEGORY = {
  loc: "location",
  org: "organization",
  dob: "date",
  age: "age",
  em: "email",
  tel: "phone number",
  addr: "address",
  job: "profession",
  family: "family member",
  nat: "nationality",
  url: "url",
  pob: "location",
  misc: "misc",
};

function resolvePersons(text, entities, persons) {
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

/** Same replacement map used for the anonymized text preview. */
export function buildAnonymizationReplacementMap(
  text,
  entities,
  groupedEntities,
  selectedCategories,
  customCategories = {},
  options = {},
) {
  const {
    style = DEFAULT_REPLACEMENT_STYLE,
    categoryMethods = {},
    salt = text || "",
    generalizationLadders = {},
    persons: personsOption,
    surfaceOverrides = {},
  } = options;

  const replacementMap = buildReplacementMap(groupedEntities, selectedCategories, {
    style,
    categoryMethods,
    customCategories,
    salt,
    generalizationLadders,
  });

  unifyPersonGraphReplacements(
    replacementMap,
    resolvePersons(text, entities, personsOption),
    {
      style,
      categoryMethods,
      customCategories,
      salt,
      generalizationLadders,
      selectedCategories,
    },
  );

  applySurfaceReplacementOverrides(replacementMap, surfaceOverrides, {
    customCategories,
    salt,
    generalizationLadders,
    groupedEntities,
  });

  return replacementMap;
}

function categoryEnabled(selectedCategories, category) {
  if (!selectedCategories || !Object.keys(selectedCategories).length) {
    return true;
  }
  return selectedCategories[category] !== false;
}

function lookupReplacement(replacementMap, category, surface) {
  if (!surface || !replacementMap) {
    return surface;
  }
  const key = getEntityValueKey(category, surface);
  if (replacementMap.has(key)) {
    return replacementMap.get(key);
  }
  return surface;
}

function attrCategory(attr) {
  if (attr?.entityLabel) {
    return attr.entityLabel;
  }
  if (attr?.key && ATTR_KEY_TO_CATEGORY[attr.key]) {
    return ATTR_KEY_TO_CATEGORY[attr.key];
  }
  return "misc";
}

/**
 * Map a source person graph through the anonymization replacement map.
 * Excluded people/surfaces stay in clear text (same as the preview).
 */
export function buildAnonymizedPersonGraph(
  persons = [],
  replacementMap,
  {
    excludedPlaceholders = {},
    excludedSurfaces = {},
    selectedCategories = {},
  } = {},
) {
  if (!persons?.length) {
    return [];
  }

  const anonymized = persons.map((person) => {
    const personExcluded = Boolean(excludedPlaceholders[person.placeholder]);

    const mapPersonSurface = (surface) => {
      if (!surface) {
        return surface;
      }
      if (
        personExcluded ||
        isSurfaceExcluded(excludedSurfaces, person.placeholder, surface) ||
        !categoryEnabled(selectedCategories, "person")
      ) {
        return surface;
      }
      return lookupReplacement(replacementMap, "person", surface);
    };

    const mapAttr = (attr) => {
      const category = attrCategory(attr);
      const owner = attr.placeholder || person.placeholder;
      const surfaceExcluded =
        personExcluded ||
        Boolean(excludedSurfaces[surfaceExcludeKey(owner, attr.value)]) ||
        Boolean(attr.placeholder && excludedPlaceholders[attr.placeholder]);
      const value =
        surfaceExcluded || !categoryEnabled(selectedCategories, category)
          ? attr.value
          : lookupReplacement(replacementMap, category, attr.value);
      return {
        ...attr,
        value,
        originalValue: attr.value,
        source: "anonymized",
      };
    };

    const mapRel = (rel) => {
      const targetExcluded =
        personExcluded ||
        isSurfaceExcluded(excludedSurfaces, person.placeholder, rel.target);
      const target =
        targetExcluded || !categoryEnabled(selectedCategories, "person")
          ? rel.target
          : lookupReplacement(replacementMap, "person", rel.target);
      // Keep structural placeholder when the target person still exists.
      let placeholder = rel.placeholder || "";
      if (placeholder && !targetExcluded) {
        const targetPerson = persons.find((item) => item.placeholder === placeholder);
        if (targetPerson) {
          placeholder = targetPerson.placeholder;
        }
      }
      return {
        ...rel,
        target,
        originalTarget: rel.target,
        placeholder,
        source: "anonymized",
      };
    };

    const originalName = person.name;
    const name = mapPersonSurface(person.name);
    const nameLower = String(name || "").toLocaleLowerCase();
    const aliasOriginals = {};
    const corefOriginals = {};
    const uniqueMapped = (surfaces, originalsMap = null) => {
      const seen = new Set();
      const out = [];
      for (const surface of surfaces || []) {
        const mapped = mapPersonSurface(surface);
        const key = String(mapped || "").toLocaleLowerCase();
        if (!key || key === nameLower || seen.has(key)) {
          continue;
        }
        seen.add(key);
        if (originalsMap) {
          originalsMap[key] = surface;
        }
        out.push(mapped);
      }
      return out;
    };

    return {
      ...person,
      name,
      originalName,
      aliases: uniqueMapped(person.aliases, aliasOriginals),
      aliasOriginals,
      corefs: uniqueMapped(person.corefs, corefOriginals),
      corefOriginals,
      attrs: (person.attrs || []).map(mapAttr),
      rels: (person.rels || []).map(mapRel),
      source: "anonymized",
    };
  });

  return anonymized;
}

/**
 * Resolve the clear-text origin + category for an anonymized graph edge value.
 */
export function resolveAnonymizedGraphEdgeOrigin(person, kind, currentValue) {
  if (!person) {
    return null;
  }
  const current = String(currentValue || "");
  const currentLower = current.toLocaleLowerCase();

  if (kind === "name") {
    return {
      category: "person",
      originalSurface: person.originalName || person.name,
      previousReplacement: person.name,
    };
  }
  if (kind === "alias" || kind === "coref") {
    const originals = kind === "coref" ? person.corefOriginals : person.aliasOriginals;
    const list = kind === "coref" ? person.corefs : person.aliases;
    const original =
      originals?.[currentLower] ||
      (list || []).find(
        (surface) => String(surface || "").toLocaleLowerCase() === currentLower,
      ) ||
      current;
    return {
      category: "person",
      originalSurface: original,
      previousReplacement: current,
    };
  }
  if (kind === "attr") {
    const attr = (person.attrs || []).find(
      (item) => String(item.value || "") === current || String(item.originalValue || "") === current,
    );
    if (!attr) {
      return null;
    }
    return {
      category: attrCategory(attr),
      originalSurface: attr.originalValue || attr.value,
      previousReplacement: attr.value,
    };
  }
  if (kind === "rel") {
    const rel = (person.rels || []).find(
      (item) =>
        String(item.target || "") === current || String(item.originalTarget || "") === current,
    );
    if (!rel) {
      return null;
    }
    return {
      category: "person",
      originalSurface: rel.originalTarget || rel.target,
      previousReplacement: rel.target,
    };
  }
  return null;
}

/**
 * Apply an anonymized-graph value edit: custom surface overrides for every map
 * entry that currently shows the same replacement, plus preview text rewrite.
 */
export function applyAnonymizedGraphValueEdit({
  surfaceOverrides = {},
  replacementMap = null,
  category,
  originalSurface,
  previousReplacement,
  nextReplacement,
  anonymizedTextOverride = null,
  generatedAnonymizedText = "",
}) {
  const prev = String(previousReplacement ?? "");
  const next = String(nextReplacement ?? "").trim();
  if (!next || next === prev) {
    return null;
  }

  const nextOverrides = { ...surfaceOverrides };
  const rememberComment = (key) =>
    nextOverrides[key]?.comment ? { comment: nextOverrides[key].comment } : {};

  if (replacementMap && prev) {
    for (const [key, value] of replacementMap.entries()) {
      if (String(value) !== prev) {
        continue;
      }
      const colon = key.indexOf(":");
      if (colon < 0) {
        continue;
      }
      const cat = key.slice(0, colon);
      const surfaceLower = key.slice(colon + 1);
      const surface =
        cat === category &&
        String(originalSurface || "").toLocaleLowerCase() === surfaceLower
          ? originalSurface
          : surfaceLower;
      nextOverrides[key] = {
        kind: "custom",
        text: next,
        category: cat,
        surface,
        ...rememberComment(key),
      };
    }
  }

  if (category && originalSurface) {
    const key = getEntityValueKey(category, originalSurface);
    nextOverrides[key] = {
      kind: "custom",
      text: next,
      category,
      surface: originalSurface,
      ...rememberComment(key),
    };
  }

  const baseText =
    anonymizedTextOverride != null ? anonymizedTextOverride : generatedAnonymizedText || "";
  let nextTextOverride = anonymizedTextOverride;
  if (baseText && prev && baseText.includes(prev)) {
    nextTextOverride = baseText.split(prev).join(next);
  }

  return {
    surfaceOverrides: nextOverrides,
    anonymizedTextOverride: nextTextOverride,
  };
}

export function resolveAnonymizedPersonGraph({
  text,
  entities,
  groupedEntities,
  selectedCategories,
  customCategories,
  persons,
  excludedPlaceholders,
  excludedSurfaces,
  categoryMethods,
  generalizationLadders,
  salt,
  surfaceOverrides = {},
}) {
  const replacementMap = buildAnonymizationReplacementMap(
    text,
    entities,
    groupedEntities,
    selectedCategories,
    customCategories,
    {
      categoryMethods,
      generalizationLadders,
      salt: salt || text || "",
      persons,
      surfaceOverrides,
      style: normalizeReplacementMethod(
        categoryMethods?.person || DEFAULT_REPLACEMENT_STYLE,
      ),
    },
  );

  return {
    persons: buildAnonymizedPersonGraph(persons, replacementMap, {
      excludedPlaceholders,
      excludedSurfaces,
      selectedCategories,
    }),
    replacementMap,
  };
}
