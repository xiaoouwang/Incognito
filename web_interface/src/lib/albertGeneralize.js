/**
 * Albert prompts + parsing for automatic Level 1–3 generalization ladders.
 */

import { ladderCacheKey } from "./generalize.js";

export const ALBERT_GENERALIZE_SYSTEM_PROMPT = `You help with text pseudonymization via hierarchical generalization (k-anonymity style).

For each sensitive entity, invent three replacements that keep the sentence grammatical:
- level1 (light): slightly less specific, still somewhat informative
- level2 (moderate): broader class / region / role
- level3 (strong): minimal identifying detail

Rules:
- Match the language of the entity value (French in → French out).
- Do NOT invent fake personal names, phone numbers, emails, or street addresses.
- Prefer real-world taxonomies when you know them (city→department→region→country; specialty→profession→sector; disease subtype→disease→health issue).
- Keep replacements short (a few words).
- Return JSON only.`;

export function buildAlbertGeneralizeUserPrompt(items) {
  const payload = items.map((item, index) => ({
    id: item.id || `e${index + 1}`,
    category: item.category,
    value: item.value,
  }));

  return `Produce generalization ladders for these entities.

Return exactly this JSON shape:
{"ladders":[{"id":"e1","category":"...","value":"...","level1":"...","level2":"...","level3":"..."}]}

Entities:
${JSON.stringify(payload, null, 2)}`;
}

/**
 * @param {unknown} parsed
 * @param {{ id: string, category: string, value: string }[]} requested
 * @returns {Record<string, { level1: string, level2: string, level3: string }>}
 */
export function parseAlbertGeneralizationLadders(parsed, requested = []) {
  const byId = new Map(requested.map((item) => [String(item.id), item]));
  const rawList = Array.isArray(parsed?.ladders)
    ? parsed.ladders
    : Array.isArray(parsed?.p)
      ? parsed.p
      : Array.isArray(parsed)
        ? parsed
        : [];

  /** @type {Record<string, { level1: string, level2: string, level3: string }>} */
  const out = {};

  for (const row of rawList) {
    if (!row || typeof row !== "object") {
      continue;
    }
    const id = String(row.id || "").trim();
    const matched = id ? byId.get(id) : null;
    const category = String(row.category || matched?.category || "").trim();
    const value = String(row.value || matched?.value || "").trim();
    const level1 = String(row.level1 || row.L1 || "").trim();
    const level2 = String(row.level2 || row.L2 || "").trim();
    const level3 = String(row.level3 || row.L3 || "").trim();
    if (!category || !value || !level1 || !level2 || !level3) {
      continue;
    }
    out[ladderCacheKey(category, value)] = { level1, level2, level3 };
  }

  // Fill any missing keys from requested ids if the model reused category/value only.
  for (const item of requested) {
    const key = ladderCacheKey(item.category, item.value);
    if (out[key]) {
      continue;
    }
    const loose = rawList.find(
      (row) =>
        row &&
        normLoose(row.category) === normLoose(item.category) &&
        normLoose(row.value) === normLoose(item.value),
    );
    if (!loose) {
      continue;
    }
    const level1 = String(loose.level1 || loose.L1 || "").trim();
    const level2 = String(loose.level2 || loose.L2 || "").trim();
    const level3 = String(loose.level3 || loose.L3 || "").trim();
    if (level1 && level2 && level3) {
      out[key] = { level1, level2, level3 };
    }
  }

  return out;
}

function normLoose(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

export const GENERALIZE_BATCH_SIZE = 36;
