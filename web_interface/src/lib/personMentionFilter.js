/**
 * Drop pronouns / generic human words that GLiNER often tags as `person`
 * (or a custom `people` label) in French interview transcripts.
 */

const PERSON_LIKE_LABELS = new Set([
  "person",
  "person name",
  "people",
  "persons",
  "per",
  "personne",
  "personnes",
]);

/** Canonical category used elsewhere in the app (graph, export, styles). */
export function normalizePersonLabel(label) {
  const key = String(label || "")
    .trim()
    .toLocaleLowerCase();
  if (PERSON_LIKE_LABELS.has(key) || key === "person name") {
    return "person";
  }
  return label;
}

/** Exact tokens (case-insensitive) that are never personal names. */
const PRONOUN_OR_GENERIC_PERSON = new Set([
  // French subject / object / tonic pronouns
  "je",
  "tu",
  "il",
  "elle",
  "on",
  "nous",
  "vous",
  "ils",
  "elles",
  "moi",
  "toi",
  "lui",
  "eux",
  "soi",
  "me",
  "te",
  "se",
  "le",
  "la",
  "les",
  "leur",
  "leurs",
  "y",
  "en",
  "m'",
  "t'",
  "s'",
  "l'",
  "j'",
  "c'",
  "qu'",
  // Demonstratives often mis-tagged as people
  "celui",
  "celle",
  "ceux",
  "celles",
  "celui-ci",
  "celle-ci",
  "ceux-ci",
  "celles-ci",
  "celui-là",
  "celle-là",
  "ceux-là",
  "celles-là",
  // Generic human nouns (FR + EN) — not proper names
  "humain",
  "humaine",
  "humains",
  "humaines",
  "personne",
  "personnes",
  "gens",
  "quelqu'un",
  "quelqu’un",
  "quiconque",
  "chacun",
  "chacune",
  "individu",
  "individus",
  "person",
  "persons",
  "people",
  "human",
  "humans",
  "someone",
  "somebody",
  "anyone",
  "anybody",
  "everyone",
  "everybody",
  "folks",
  // English pronouns
  "i",
  "you",
  "he",
  "she",
  "we",
  "they",
  "me",
  "him",
  "her",
  "us",
  "them",
  "myself",
  "yourself",
  "himself",
  "herself",
  "ourselves",
  "themselves",
]);

function stripLeadingArticle(value) {
  return String(value || "")
    .trim()
    .replace(/^(?:l'|l’|d'|d’|un |une |le |la |les |des )/iu, "")
    .trim();
}

export function isPersonLikeLabel(label) {
  const key = String(label || "")
    .trim()
    .toLocaleLowerCase();
  return PERSON_LIKE_LABELS.has(key);
}

export function isPronounOrGenericPersonMention(text) {
  const raw = String(text || "").trim();
  if (!raw) {
    return true;
  }

  const lower = raw.toLocaleLowerCase();
  if (
    /^(?:tout le monde|les gens|des gens|ces gens|aux gens|l['’]humain|l['’]humaine)$/u.test(
      lower,
    )
  ) {
    return true;
  }

  const normalized = stripLeadingArticle(lower).replace(/[.,;:!?…]+$/u, "");
  if (!normalized) {
    return true;
  }

  // Single-token pronouns / generics (allow hyphenated names like Jean-Pierre)
  if (!/[\s]/u.test(normalized) && PRONOUN_OR_GENERIC_PERSON.has(normalized)) {
    return true;
  }

  return false;
}

/**
 * Drop pronoun / generic spans from person-like categories, and normalize
 * detection labels such as "person name" / "people" to canonical "person".
 */
export function filterPronounPersonEntities(entities) {
  return (entities || [])
    .filter((entity) => {
      if (!isPersonLikeLabel(entity?.label)) {
        return true;
      }
      return !isPronounOrGenericPersonMention(entity?.text);
    })
    .map((entity) => {
      if (!isPersonLikeLabel(entity?.label)) {
        return entity;
      }
      const nextLabel = normalizePersonLabel(entity.label);
      return nextLabel === entity.label ? entity : { ...entity, label: nextLabel };
    });
}
