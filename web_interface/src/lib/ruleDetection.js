const EMAIL_PATTERN = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;
const URL_PATTERN = /\bhttps?:\/\/[^\s<>"']+|\bwww\.[^\s<>"']+/gi;
const PHONE_PATTERN = /(?:\+?\d{1,3}[\s.-]?)?(?:\(?\d{2,4}\)?[\s.-]?){2,4}\d{2,4}\b/g;
const DATE_PATTERN =
  /\b(?:\d{1,2}[/-]\d{1,2}[/-]\d{2,4}|\d{4}[/-]\d{1,2}[/-]\d{1,2}|\d{1,2}\s+(?:janvier|février|fevrier|mars|avril|mai|juin|juillet|août|aout|septembre|octobre|novembre|décembre|decembre|january|february|march|april|may|june|july|august|september|october|november|december)\s+\d{2,4})\b/gi;

const RULE_PATTERNS = [
  ["email", EMAIL_PATTERN],
  ["url", URL_PATTERN],
  ["date", DATE_PATTERN],
  ["phone", PHONE_PATTERN],
];

export const GLINER_RULE_PATTERNS = [
  ["email", EMAIL_PATTERN],
  ["url", URL_PATTERN],
  ["phone number", PHONE_PATTERN],
];

function trimMatch(value) {
  return value.replace(/[.,;:)]$/, "");
}

export function detectWithRules(text) {
  const entities = [];

  for (const [label, pattern] of RULE_PATTERNS) {
    const regex = new RegExp(pattern.source, pattern.flags);
    let match;

    while ((match = regex.exec(text)) !== null) {
      const matchText = trimMatch(match[0]);
      entities.push({
        text: matchText,
        start: match.index,
        end: match.index + matchText.length,
        label,
        source: "rule",
      });
    }
  }

  return entities;
}

export function detectWithSelectedRules(text, labels, patterns = RULE_PATTERNS) {
  const allowed = new Set(labels);
  const entities = [];

  for (const [label, pattern] of patterns) {
    if (!allowed.has(label)) {
      continue;
    }

    const regex = new RegExp(pattern.source, pattern.flags);
    let match;

    while ((match = regex.exec(text)) !== null) {
      const matchText = trimMatch(match[0]);
      entities.push({
        text: matchText,
        start: match.index,
        end: match.index + matchText.length,
        label,
        source: "rule",
      });
    }
  }

  return entities;
}

export function detectWithGlinerRules(text, labels) {
  return detectWithSelectedRules(text, labels, GLINER_RULE_PATTERNS);
}

export function mergeEntities(entities) {
  const sorted = [...entities].sort((left, right) => {
    const leftPriority = left.source === "rule" ? 0 : 1;
    const rightPriority = right.source === "rule" ? 0 : 1;
    if (leftPriority !== rightPriority) {
      return leftPriority - rightPriority;
    }
    if (left.start !== right.start) {
      return left.start - right.start;
    }
    return right.end - right.start - (left.end - left.start);
  });

  const kept = [];

  for (const entity of sorted) {
    if (entity.start >= entity.end) {
      continue;
    }

    const overlaps = kept.some(
      (existing) => entity.start < existing.end && entity.end > existing.start,
    );
    if (overlaps) {
      continue;
    }

    kept.push(entity);
  }

  return kept.sort((left, right) => left.start - right.start);
}
