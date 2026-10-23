import { useMemo } from "react";
import {
  ladderCacheKey,
  methodNeedsGeneralization,
  needsModelGeneralization,
} from "../lib/generalize.js";
import { normalizeReplacementMethod } from "../lib/pseudonymize.js";

/** Offline Level 1–3 only — no Albert calls for pseudonymization. */
export const USE_ALBERT_FOR_GENERALIZATION = false;

/**
 * Collect unique {category, value} pairs that would need model ladders.
 * Kept for diagnostics / future re-enable; currently unused for fetching.
 */
export function collectGeneralizationItems({
  entities = [],
  groups = [],
  categoryMethods = {},
  selectedCategories = null,
  resolveGroupCategory,
} = {}) {
  const items = [];
  const seen = new Set();

  function consider(category, value) {
    const cat = String(category || "").trim();
    const val = String(value || "").trim();
    if (!cat || !val) {
      return;
    }
    if (selectedCategories && selectedCategories[cat] === false) {
      return;
    }
    const method = normalizeReplacementMethod(categoryMethods[cat]);
    if (!methodNeedsGeneralization(method) || !needsModelGeneralization(cat)) {
      return;
    }
    const key = ladderCacheKey(cat, val);
    if (seen.has(key)) {
      return;
    }
    seen.add(key);
    items.push({ category: cat, value: val });
  }

  for (const entity of entities || []) {
    consider(entity.label, entity.text);
  }

  for (const group of groups || []) {
    const category =
      typeof resolveGroupCategory === "function"
        ? resolveGroupCategory(group)
        : group.category || group.type;
    const values = [
      group.original,
      ...(Array.isArray(group.aliases) ? group.aliases : []),
    ];
    for (const value of values) {
      consider(category, value);
    }
  }

  return items;
}

/**
 * Level 1–3 use local structural rules + heuristics only (no Albert).
 * Returns an empty ladder map so `generalizeForCategory` stays offline.
 */
export function useGeneralizationLadders({
  entities = [],
  groups = [],
  categoryMethods = {},
  selectedCategories = null,
  resolveGroupCategory,
} = {}) {
  const items = useMemo(
    () =>
      collectGeneralizationItems({
        entities,
        groups,
        categoryMethods,
        selectedCategories,
        resolveGroupCategory,
      }),
    [entities, groups, categoryMethods, selectedCategories, resolveGroupCategory],
  );

  return {
    ladders: {},
    loading: false,
    error: "",
    mode: items.length ? "heuristic" : "idle",
    pendingCount: 0,
    itemCount: items.length,
    useAlbert: USE_ALBERT_FOR_GENERALIZATION,
  };
}
