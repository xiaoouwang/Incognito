/**
 * Hierarchical generalization (Level 1 light → Level 3 strong).
 *
 * Structured types (age, date, email, phone) use deterministic rules.
 * Open-vocabulary types (location, profession, org, …) prefer model-generated
 * ladders when available; otherwise apply language-agnostic text heuristics.
 */

function normKey(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ");
}

/** Categories that do not need an LLM — pure parsing rules cover them. */
export const STRUCTURAL_GENERALIZATION_CATEGORIES = new Set([
  "age",
  "date",
  "email",
  "phone number",
  "identity document number",
  "phone",
]);

export function ladderCacheKey(category, value) {
  return `${String(category || "misc").trim().toLowerCase()}:${normKey(value)}`;
}

export function needsModelGeneralization(category) {
  const normalized = String(category || "")
    .trim()
    .toLowerCase()
    .replace(/^phone$/, "phone number");
  return Boolean(normalized) && !STRUCTURAL_GENERALIZATION_CATEGORIES.has(normalized);
}

function pickFromLadder(ladder, level) {
  if (!ladder || typeof ladder !== "object") {
    return null;
  }
  const key = level === 1 ? "level1" : level === 2 ? "level2" : "level3";
  const value = ladder[key] || ladder[`L${level}`] || ladder[level];
  const text = String(value || "").trim();
  return text || null;
}

function generalizeAge(original, level) {
  const match = String(original).match(/(\d{1,3})/);
  if (!match) {
    return level >= 3 ? "adulte" : level === 2 ? "âge adulte" : "âge non précisé";
  }
  const age = Number(match[1]);
  const width = level === 1 ? 5 : level === 2 ? 10 : 20;
  const start = Math.floor(age / width) * width;
  const end = start + width - 1;
  const suffix = /ans/i.test(original) ? " ans" : "";
  return `${start}–${end}${suffix}`;
}

function generalizeDate(original, level) {
  const text = String(original);
  const longFr = text.match(
    /(\d{1,2})\s+(janvier|février|fevrier|mars|avril|mai|juin|juillet|août|aout|septembre|octobre|novembre|décembre|decembre)\s+(\d{4})/i,
  );
  if (longFr) {
    const month = longFr[2];
    const year = Number(longFr[3]);
    if (level === 1) return `${month} ${year}`;
    if (level === 2) return String(year);
    return `${Math.floor(year / 10) * 10}s`;
  }
  const iso = text.match(/\b((?:19|20)\d{2})[-/.](\d{1,2})[-/.](\d{1,2})\b/);
  if (iso) {
    const year = Number(iso[1]);
    if (level === 1) return `${iso[2]}/${year}`;
    if (level === 2) return String(year);
    return `${Math.floor(year / 10) * 10}s`;
  }
  const yearOnly = text.match(/\b((?:19|20)\d{2})\b/);
  if (yearOnly) {
    const year = Number(yearOnly[1]);
    if (level === 1) return String(year);
    if (level === 2) return `${Math.floor(year / 5) * 5}–${Math.floor(year / 5) * 5 + 4}`;
    return `${Math.floor(year / 10) * 10}s`;
  }
  if (level === 1) return "une date récente";
  if (level === 2) return "une année";
  return "une période";
}

function generalizeEmail(original, level) {
  if (level === 1) {
    const domain = String(original).split("@")[1] || "exemple.fr";
    return `contact@${domain}`;
  }
  if (level === 2) return "une adresse e-mail";
  return "un contact numérique";
}

function generalizePhone(original, level) {
  if (level === 1) {
    const digits = String(original).replace(/\D+/g, "");
    if (digits.length >= 4) {
      return `0X XX XX ${digits.slice(-4, -2)} ${digits.slice(-2)}`;
    }
    return "0X XX XX XX XX";
  }
  if (level === 2) return "un numéro de téléphone";
  return "un moyen de contact";
}

function generalizePerson(original, level) {
  const tokens = String(original)
    .trim()
    .replace(/^(Mme|Mlle|M\.|Dr\.?|Pr\.?)\s+/i, "")
    .split(/\s+/)
    .filter(Boolean);
  if (!tokens.length) {
    return level >= 3 ? "une personne" : "quelqu'un";
  }
  if (level === 1) {
    return tokens[0];
  }
  if (level === 2) {
    return tokens.map((token) => `${token.charAt(0).toUpperCase()}.`).join(" ");
  }
  return "une personne";
}

/**
 * Offline fallback when no model ladder is available:
 * peel modifiers, then fall back to category-level abstractions.
 */
function heuristicGeneralize(category, original, level) {
  const text = String(original).trim();
  const peeled = text
    .replace(/\s+(de|du|des|en|à|au|aux|d'|d’)\s+.+$/i, "")
    .replace(/\s+[([].+$/, "")
    .trim();

  const categoryDefaults = {
    location: ["une commune", "une région", "un pays"],
    address: ["une voie urbaine", "une adresse locale", "une adresse"],
    profession: ["une profession", "une activité professionnelle", "un métier"],
    "job title or project role": ["un rôle professionnel", "une activité", "un métier"],
    organization: ["une organisation", "un établissement", "une institution"],
    hospital: ["un centre hospitalier", "un établissement de santé", "une institution"],
    school: ["un établissement scolaire", "un établissement d'enseignement", "une institution"],
    diploma: ["un diplôme", "une certification", "une qualification"],
    disease: ["une affection", "un problème de santé", "une donnée de santé"],
    nationality: ["une nationalité", "une origine", "une appartenance"],
    "family member": ["un membre de la famille", "un proche", "une relation personnelle"],
    url: ["un site web", "une ressource en ligne", "un lien"],
  };

  const defaults =
    categoryDefaults[category] ||
    ["une valeur sensible", "une information sensible", "une donnée"];

  if (level === 1) {
    if (peeled && peeled.length >= 2 && normKey(peeled) !== normKey(text)) {
      return peeled;
    }
    // Keep a shortened surface (first 1–2 tokens) rather than inventing a fake place name.
    const tokens = text.split(/\s+/).filter(Boolean);
    if (tokens.length > 2) {
      return tokens.slice(0, 2).join(" ");
    }
    return defaults[0];
  }
  if (level === 2) {
    return defaults[1];
  }
  return defaults[2];
}

/**
 * @param {string} category
 * @param {string} originalText
 * @param {1|2|3} level
 * @param {{ level1?: string, level2?: string, level3?: string } | null} [ladder]
 */
export function generalizeForCategory(category, originalText, level = 1, ladder = null) {
  const normalized = String(category || "misc")
    .trim()
    .toLowerCase()
    .replace(/^phone$/, "phone number");
  const original = String(originalText || "").trim();
  const lvl = Math.min(3, Math.max(1, Number(level) || 1));

  if (!original) {
    return lvl === 1 ? "une valeur" : lvl === 2 ? "une information" : "une donnée";
  }

  const fromModel = pickFromLadder(ladder, lvl);
  if (fromModel) {
    return fromModel;
  }

  switch (normalized) {
    case "age":
      return generalizeAge(original, lvl);
    case "date":
      return generalizeDate(original, lvl);
    case "email":
      return generalizeEmail(original, lvl);
    case "phone number":
      return generalizePhone(original, lvl);
    case "person":
      return generalizePerson(original, lvl);
    default:
      return heuristicGeneralize(normalized, original, lvl);
  }
}

export function generalizationLevelFromMethod(method) {
  const value = String(method || "").toLowerCase();
  if (value === "level1" || value === "generalize-1" || value === "pseudonym") return 1;
  if (value === "level2" || value === "generalize-2") return 2;
  if (value === "level3" || value === "generalize-3") return 3;
  return null;
}

export function methodNeedsGeneralization(method) {
  return generalizationLevelFromMethod(method) != null;
}
