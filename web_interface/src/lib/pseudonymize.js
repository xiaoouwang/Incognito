/**
 * Category-aware replacements: tokens, hierarchical generalization (L1–L3), or mask.
 * Same (category, value, method) → same surrogate within a document salt.
 */

import { CATEGORY_PREFIXES } from "./constants.js";
import {
  generalizationLevelFromMethod,
  generalizeForCategory,
  ladderCacheKey,
} from "./generalize.js";

/** @typedef {"placeholder" | "level1" | "level2" | "level3" | "redact" | "pseudonym"} ReplacementMethod */

export const REPLACEMENT_STYLES = ["placeholder", "level1", "level2", "level3", "redact"];
/** Default when no per-category choice is set (tokens are the safest baseline). */
export const DEFAULT_REPLACEMENT_STYLE = "placeholder";

export const REPLACEMENT_METHODS = [
  {
    id: "placeholder",
    icon: "[·]",
    labelKey: "replacementMethodPlaceholder",
    hintKey: "replacementMethodPlaceholderHint",
  },
  {
    id: "level1",
    icon: "L1",
    labelKey: "replacementMethodLevel1",
    hintKey: "replacementMethodLevel1Hint",
  },
  {
    id: "level2",
    icon: "L2",
    labelKey: "replacementMethodLevel2",
    hintKey: "replacementMethodLevel2Hint",
  },
  {
    id: "level3",
    icon: "L3",
    labelKey: "replacementMethodLevel3",
    hintKey: "replacementMethodLevel3Hint",
  },
  {
    id: "redact",
    icon: "■■",
    labelKey: "replacementMethodRedact",
    hintKey: "replacementMethodRedactHint",
  },
];

export function normalizeReplacementMethod(method) {
  const value = String(method || "").trim().toLowerCase();
  // Legacy alias: old "pseudonym" UI → light generalization.
  if (value === "pseudonym") {
    return "level1";
  }
  if (
    value === "placeholder" ||
    value === "level1" ||
    value === "level2" ||
    value === "level3" ||
    value === "redact"
  ) {
    return value;
  }
  return DEFAULT_REPLACEMENT_STYLE;
}

/** Merge defaults for newly seen categories without overwriting user choices. */
export function mergeCategoryMethods(current = {}, categories = [], fallback = DEFAULT_REPLACEMENT_STYLE) {
  const next = { ...current };
  let changed = false;
  for (const category of categories) {
    if (!category || next[category] !== undefined) {
      continue;
    }
    next[category] = normalizeReplacementMethod(fallback);
    changed = true;
  }
  return changed ? next : current;
}

export function redactForCategory(originalText) {
  const text = String(originalText || "");
  if (!text) {
    return "■■■";
  }
  // Preserve whitespace so multi-word spans keep shape in the preview.
  return text.replace(/[^\s]/gu, "■");
}

export function replacementForCategoryValue(
  category,
  originalText,
  {
    method = DEFAULT_REPLACEMENT_STYLE,
    index = 0,
    salt = "",
    customCategories = {},
    generalizationLadders = {},
  } = {},
) {
  const resolved = normalizeReplacementMethod(method);
  if (resolved === "redact") {
    return redactForCategory(originalText);
  }
  const level = generalizationLevelFromMethod(resolved);
  if (level) {
    const ladder =
      generalizationLadders[ladderCacheKey(category, originalText)] || null;
    return generalizeForCategory(category, originalText, level, ladder);
  }
  return placeholderForCategory(category, index, customCategories);
}

function categoryPrefix(categoryId, customCategories = {}) {
  const key = String(categoryId || "misc");
  if (CATEGORY_PREFIXES[key]) {
    return CATEGORY_PREFIXES[key];
  }
  if (customCategories[key]) {
    const letters = String(customCategories[key] || key)
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toUpperCase()
      .replace(/[^A-Z]/g, "");
    return letters.slice(0, 3) || "ENT";
  }
  const letters = key
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z]/g, "");
  return letters.slice(0, 3) || "ENT";
}

const FIRST_NAMES = [
  "Camille",
  "Alex",
  "Jordan",
  "Sasha",
  "Morgan",
  "Charlie",
  "Lou",
  "Noa",
  "Eden",
  "Robin",
  "Claude",
  "Dominique",
  "Pascal",
  "Michel",
  "André",
  "Jean",
  "Marie",
  "Claire",
  "Sophie",
  "Nicolas",
  "Julien",
  "Emma",
  "Léa",
  "Hugo",
  "Louis",
  "Chloé",
  "Manon",
  "Thomas",
  "Antoine",
  "Élodie",
];

const LAST_NAMES = [
  "Bernard",
  "Moreau",
  "Lefevre",
  "Garcia",
  "Roux",
  "Fournier",
  "Girard",
  "Bonnet",
  "Dupont",
  "Lambert",
  "Fontaine",
  "Rousseau",
  "Vincent",
  "Muller",
  "Lefebvre",
  "Faure",
  "Andre",
  "Mercier",
  "Blanc",
  "Guerin",
  "Boyer",
  "Garnier",
  "Chevalier",
  "Francois",
  "Legrand",
  "Gauthier",
  "Perrin",
  "Robin",
  "Clement",
  "Morin",
];

const CITIES = [
  "Nantes",
  "Rennes",
  "Toulouse",
  "Lille",
  "Strasbourg",
  "Bordeaux",
  "Dijon",
  "Angers",
  "Tours",
  "Reims",
  "Grenoble",
  "Clermont-Ferrand",
  "Limoges",
  "Orléans",
  "Metz",
  "Besançon",
  "Caen",
  "Poitiers",
  "Amiens",
  "Perpignan",
];

const STREETS = [
  "rue des Lilas",
  "avenue Victor Hugo",
  "boulevard Saint-Michel",
  "impasse des Acacias",
  "place de la République",
  "chemin des Vignes",
  "allée des Tilleuls",
  "cours Mirabeau",
  "rue du Commerce",
  "avenue Jean Jaurès",
];

const ORGS = [
  "Association Horizon",
  "Institut Lumière",
  "Groupe Atlantique",
  "Fondation Clarité",
  "Centre Agora",
  "Société Nord-Est",
  "Collectif Équilibre",
  "Maison des Savoirs",
  "Bureau Rivage",
  "Alliance Pôle Sud",
];

const SCHOOLS = [
  "collège des Alizés",
  "lycée Condorcet",
  "école primaire des Sources",
  "université des Lumières",
  "institut technique du Parc",
  "campus Atlantique",
  "lycée Jean Moulin",
  "école secondaire Pasteur",
];

const HOSPITALS = [
  "hôpital Saint-Louis",
  "clinique des Cèdres",
  "centre hospitalier du Parc",
  "polyclinique Atlantique",
  "hôpital universitaire Nord",
  "clinique Sainte-Anne",
];

const PROFESSIONS = [
  "enseignant·e",
  "infirmier·ère",
  "ingénieur·e",
  "chercheur·e",
  "secrétaire",
  "technicien·ne",
  "commerçant·e",
  "ouvrier·ère",
  "juriste",
  "psychologue",
  "comptable",
  "archiviste",
];

const JOB_ROLES = [
  "chef·fe de projet",
  "responsable pédagogique",
  "chargé·e de mission",
  "coordinateur·rice",
  "directeur·rice adjoint·e",
  "référent·e terrain",
  "assistant·e de recherche",
  "responsable qualité",
];

const NATIONALITIES = [
  "française",
  "belge",
  "suisse",
  "canadienne",
  "italienne",
  "espagnole",
  "allemande",
  "portugaise",
  "marocaine",
  "algérienne",
];

const DISEASES = [
  "affection chronique A",
  "trouble respiratoire B",
  "pathologie articulaire C",
  "syndrome métabolique D",
  "affection neurologique E",
  "trouble digestif F",
];

const DIPLOMAS = [
  "licence en sciences sociales",
  "master en gestion",
  "brevet professionnel",
  "doctorat en lettres",
  "DUT technique",
  "certificat professionnel",
];

const FAMILY_ROLES = [
  "son frère",
  "sa sœur",
  "son père",
  "sa mère",
  "son conjoint",
  "sa conjointe",
  "son cousin",
  "sa cousine",
  "son oncle",
  "sa tante",
];

const MONTHS_FR = [
  "janvier",
  "février",
  "mars",
  "avril",
  "mai",
  "juin",
  "juillet",
  "août",
  "septembre",
  "octobre",
  "novembre",
  "décembre",
];

function hashString(value) {
  let hash = 2166136261;
  const input = String(value || "");
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function pick(list, seed) {
  if (!list.length) {
    return "";
  }
  // Use unsigned remainder — arithmetic >> can turn large hashes negative.
  const index = (Number(seed) >>> 0) % list.length;
  return list[index];
}

function normalizeCategory(category) {
  const key = String(category || "misc").trim().toLowerCase();
  if (key === "phone" || key === "phones" || key === "téléphone") {
    return "phone number";
  }
  if (
    key === "identity" ||
    key === "passport" ||
    key === "passport number" ||
    key === "social security number" ||
    key === "national id" ||
    key === "identity document" ||
    key === "identity document number" ||
    key === "nir" ||
    key === "ssn" ||
    key === "numéro de sécurité sociale" ||
    key === "numero de securite sociale"
  ) {
    return "identity document number";
  }
  if (key === "people" || key === "per") {
    return "person";
  }
  if (key === "org" || key === "organisation") {
    return "organization";
  }
  if (key === "loc" || key === "lieu") {
    return "location";
  }
  if (key === "adr" || key === "adresse") {
    return "address";
  }
  if (key === "ema" || key === "mail") {
    return "email";
  }
  if (key === "dat") {
    return "date";
  }
  if (key === "pro" || key === "job") {
    return "profession";
  }
  return key;
}

function tokenizeName(text) {
  return String(text || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
}

function preserveCaseHint(original, replacement) {
  if (!original || !replacement) {
    return replacement;
  }
  if (original === original.toUpperCase() && original.length > 1) {
    return replacement.toUpperCase();
  }
  return replacement;
}

function pseudonymPerson(original, seed) {
  const tokens = tokenizeName(original);
  if (!tokens.length) {
    return pick(FIRST_NAMES, seed);
  }

  const titleMatch = original.match(/^(Mme|Mlle|M\.|Dr\.?|Pr\.?)\s+/i);
  if (titleMatch) {
    const rawTitle = titleMatch[1];
    const title = /^(Dr|Pr)$/i.test(rawTitle) ? `${rawTitle}.` : rawTitle;
    return preserveCaseHint(original, `${title} ${pick(LAST_NAMES, seed >> 3)}`);
  }

  let fake;
  if (tokens.length === 1) {
    fake = pick(FIRST_NAMES, seed);
  } else if (tokens.length === 2) {
    fake = `${pick(FIRST_NAMES, seed)} ${pick(LAST_NAMES, seed >> 3)}`;
  } else {
    fake = `${pick(FIRST_NAMES, seed)} ${pick(LAST_NAMES, seed >> 3)}`;
  }

  return preserveCaseHint(original, fake);
}

function extractDigits(text) {
  return String(text || "").replace(/\D+/g, "");
}

function pseudonymAge(original, seed) {
  const match = String(original).match(/(\d{1,3})/);
  if (!match) {
    return `${18 + (seed % 50)} ans`;
  }
  const age = Number(match[1]);
  const delta = (seed % 7) + 2;
  const direction = seed % 2 === 0 ? 1 : -1;
  const next = Math.max(1, Math.min(110, age + direction * delta));
  return String(original).replace(match[1], String(next));
}

function pseudonymDate(original, seed) {
  const text = String(original);
  const longFr = text.match(
    /(\d{1,2})\s+(janvier|février|fevrier|mars|avril|mai|juin|juillet|août|aout|septembre|octobre|novembre|décembre|decembre)\s+(\d{4})/i,
  );
  if (longFr) {
    const day = 1 + (seed % 28);
    const month = pick(MONTHS_FR, seed >> 2);
    const year = Number(longFr[3]) + ((seed % 5) + 1) * (seed % 2 === 0 ? 1 : -1);
    return `${day} ${month} ${year}`;
  }

  const iso = text.match(/\b(19|20)(\d{2})([-/.])(\d{1,2})\3(\d{1,2})\b/);
  if (iso) {
    const year = Number(iso[1] + iso[2]) + ((seed % 4) + 1);
    const month = String(1 + (seed % 12)).padStart(2, "0");
    const day = String(1 + (seed % 28)).padStart(2, "0");
    return `${year}${iso[3]}${month}${iso[3]}${day}`;
  }

  const yearOnly = text.match(/\b((?:19|20)\d{2})\b/);
  if (yearOnly) {
    const year = Number(yearOnly[1]) + ((seed % 5) + 1) * (seed % 2 === 0 ? 1 : -1);
    return text.replace(yearOnly[1], String(year));
  }

  const day = 1 + (seed % 28);
  const month = pick(MONTHS_FR, seed);
  const year = 1990 + (seed % 30);
  return `${day} ${month} ${year}`;
}

function pseudonymPhone(original, seed) {
  const digits = extractDigits(original);
  const body = String(100000000 + (seed % 899999999)).padStart(9, "0");
  const national = `0${body}`;
  if (digits.startsWith("33") || String(original).includes("+33")) {
    return `+33 ${national.slice(1, 2)} ${national.slice(2, 4)} ${national.slice(4, 6)} ${national.slice(6, 8)} ${national.slice(8, 10)}`;
  }
  if (/\d/.test(original) && /[\s.-]/.test(original)) {
    return `${national.slice(0, 2)} ${national.slice(2, 4)} ${national.slice(4, 6)} ${national.slice(6, 8)} ${national.slice(8, 10)}`;
  }
  return national;
}

function pseudonymEmail(original, seed) {
  const local = pick(FIRST_NAMES, seed).toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  const domain = pick(["exemple.fr", "mail-demo.org", "courriel.test", "sample.net"], seed >> 4);
  const suffix = (seed % 90) + 10;
  return `${local}.${pick(LAST_NAMES, seed >> 2).toLowerCase()}${suffix}@${domain}`;
}

function pseudonymAddress(original, seed) {
  const number = 1 + (seed % 180);
  const street = pick(STREETS, seed);
  const city = pick(CITIES, seed >> 3);
  const postal = String(10000 + (seed % 80000)).padStart(5, "0");
  if (/^\d/.test(String(original).trim())) {
    return `${number} ${street}, ${postal} ${city}`;
  }
  return `${number} ${street}`;
}

function pseudonymUrl(original, seed) {
  const slug = (seed % 9000) + 1000;
  if (/^https?:\/\//i.test(original)) {
    return `https://exemple.org/p/${slug}`;
  }
  return `exemple.org/p/${slug}`;
}

/**
 * Build a stable surrogate for one category/value pair.
 */
export function pseudonymForCategory(
  category,
  originalText,
  { index = 0, salt = "", customCategories = {} } = {},
) {
  const normalized = normalizeCategory(category);
  const original = String(originalText || "").trim();
  const seed = hashString(`${salt}|${normalized}|${original.toLocaleLowerCase()}|${index}`);

  switch (normalized) {
    case "person":
      return pseudonymPerson(original, seed);
    case "family member": {
      if (/^(mon|ma|son|sa|leur|mes|ses)\s+/i.test(original)) {
        return pick(FAMILY_ROLES, seed);
      }
      return pseudonymPerson(original, seed);
    }
    case "location":
      return preserveCaseHint(original, pick(CITIES, seed));
    case "address":
      return pseudonymAddress(original, seed);
    case "organization":
      return pick(ORGS, seed);
    case "school":
      return pick(SCHOOLS, seed);
    case "hospital":
      return pick(HOSPITALS, seed);
    case "email":
      return pseudonymEmail(original, seed);
    case "phone number":
      return pseudonymPhone(original, seed);
    case "identity document number": {
      const compact = original.replace(/\s+/g, "");
      // French NIR-style: keep spaced groups.
      if (/^[12]\d{14}$/.test(compact) || /^[12](?:\s?\d{2}){3}\s?\d{3}\s?\d{3}\s?\d{2}$/.test(original.trim())) {
        const digits = String((seed % 900000000000000) + 100000000000000);
        return `${digits[0]} ${digits.slice(1, 3)} ${digits.slice(3, 5)} ${digits.slice(5, 7)} ${digits.slice(7, 10)} ${digits.slice(10, 13)} ${digits.slice(13, 15)}`;
      }
      // Passport-like letter(s) + digits.
      const letters = (compact.match(/^[A-Z]+/i) || ["ID"])[0].toUpperCase().slice(0, 2);
      const digitLen = Math.max(6, Math.min(9, compact.replace(/^[A-Z]+/i, "").length || 8));
      const digits = String((seed % 10 ** digitLen) + 10 ** (digitLen - 1)).slice(0, digitLen);
      return `${letters}${digits}`;
    }
    case "date":
      return pseudonymDate(original, seed);
    case "age":
      return pseudonymAge(original, seed);
    case "profession":
      return pick(PROFESSIONS, seed);
    case "job title or project role":
      return pick(JOB_ROLES, seed);
    case "nationality":
      return pick(NATIONALITIES, seed);
    case "disease":
      return pick(DISEASES, seed);
    case "diploma":
      return pick(DIPLOMAS, seed);
    case "url":
      return pseudonymUrl(original, seed);
    default: {
      // Custom / misc: readable surrogate, not a bracket token.
      const prefix = categoryPrefix(normalized, customCategories).toLowerCase();
      const label = pick(FIRST_NAMES, seed);
      return `${label}-${prefix}-${(seed % 90) + 10}`;
    }
  }
}

export function placeholderForCategory(
  category,
  index = 0,
  customCategories = {},
) {
  const prefix = categoryPrefix(normalizeCategory(category), customCategories);
  return `[${prefix}_${index + 1}]`;
}

/**
 * Map unique category values to replacement strings.
 * `categoryMethods` wins per category; `style` is the fallback method.
 */
export function buildReplacementMap(
  groupedEntities,
  selectedCategories,
  {
    style = DEFAULT_REPLACEMENT_STYLE,
    categoryMethods = {},
    customCategories = {},
    salt = "",
    generalizationLadders = {},
  } = {},
) {
  const replacementMap = new Map();
  const fallback = normalizeReplacementMethod(style);

  Object.entries(groupedEntities || {}).forEach(([category, categoryEntities]) => {
    if (selectedCategories && !selectedCategories[category]) {
      return;
    }

    const method = normalizeReplacementMethod(categoryMethods[category] || fallback);

    categoryEntities.forEach((entity, index) => {
      const key = `${category}:${String(entity.text || "").toLocaleLowerCase()}`;
      if (replacementMap.has(key)) {
        return;
      }
      replacementMap.set(
        key,
        replacementForCategoryValue(category, entity.text, {
          method,
          index,
          salt,
          customCategories,
          generalizationLadders,
        }),
      );
    });
  });

  return replacementMap;
}

/**
 * For generative groups: one surrogate per group (keyed by placeholder).
 */
export function buildGroupReplacementLookup(
  groups,
  {
    style = DEFAULT_REPLACEMENT_STYLE,
    categoryMethods = {},
    customCategories = {},
    salt = "",
    resolveCategory,
    generalizationLadders = {},
  } = {},
) {
  const lookup = new Map();
  const fallback = normalizeReplacementMethod(style);

  (groups || []).forEach((group, index) => {
    if (!group?.placeholder) {
      return;
    }
    const category =
      typeof resolveCategory === "function"
        ? resolveCategory(group)
        : group.category || group.type || "misc";
    const method = normalizeReplacementMethod(categoryMethods[category] || fallback);
    const original = group.original || group.aliases?.[0] || group.placeholder;

    if (method === "placeholder") {
      lookup.set(group.placeholder, group.placeholder);
      return;
    }

    lookup.set(
      group.placeholder,
      replacementForCategoryValue(category, original, {
        method,
        index,
        salt,
        customCategories,
        generalizationLadders,
      }),
    );
  });

  return lookup;
}
