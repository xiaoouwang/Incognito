import { CAMEMBERT_TO_APP_LABEL } from "./constants.js";

const OUTSIDE_LABELS = new Set(["O", "OUTSIDE"]);

export function parseEntityType(rawLabel) {
  if (!rawLabel) {
    return null;
  }

  const normalized = String(rawLabel).trim().toUpperCase();
  if (OUTSIDE_LABELS.has(normalized)) {
    return null;
  }

  const withoutPrefix = normalized.replace(/^[BI]-/, "");
  return CAMEMBERT_TO_APP_LABEL[withoutPrefix] ? withoutPrefix : withoutPrefix;
}

export function mapEntityTypeToAppLabel(entityType) {
  if (!entityType) {
    return "misc";
  }

  return CAMEMBERT_TO_APP_LABEL[entityType] || "misc";
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function cleanTokenWord(word) {
  return (word || "").replace(/^[▁\s]+/, "").trim();
}

export function aggregateTokenPredictions(tokens) {
  const groups = [];
  let current = null;

  for (const token of tokens) {
    const word = cleanTokenWord(token.word);
    const entityType = parseEntityType(token.entity || token.entity_group);
    if (!word || !entityType) {
      current = null;
      continue;
    }

    const tokenIndex = token.index ?? null;
    const continuesGroup =
      current &&
      current.entityType === entityType &&
      tokenIndex != null &&
      current.lastIndex != null &&
      tokenIndex === current.lastIndex + 1;

    if (!continuesGroup) {
      if (current) {
        groups.push(current);
      }
      current = {
        entityType,
        words: [word],
        score: token.score ?? 0,
        firstIndex: tokenIndex,
        lastIndex: tokenIndex,
      };
      continue;
    }

    current.words.push(word);
    current.lastIndex = tokenIndex;
    current.score = Math.min(current.score, token.score ?? current.score);
  }

  if (current) {
    groups.push(current);
  }

  return groups;
}

function locateJoinedPhrase(text, phrase, searchFrom) {
  const start = text.indexOf(phrase, searchFrom);
  if (start < 0) {
    return null;
  }

  return {
    start,
    end: start + phrase.length,
    text: phrase,
  };
}

function locateSequentialWords(text, words, searchFrom) {
  const first = words[0];
  let position = searchFrom;

  while (position < text.length) {
    const start = text.indexOf(first, position);
    if (start < 0) {
      return null;
    }

    let end = start + first.length;
    let matchedAll = true;

    for (let index = 1; index < words.length; index += 1) {
      const pattern = new RegExp(`^\\s+${escapeRegExp(words[index])}`);
      const remainder = text.slice(end);
      const match = remainder.match(pattern);
      if (!match) {
        matchedAll = false;
        break;
      }
      end += match[0].length;
    }

    if (matchedAll) {
      return {
        start,
        end,
        text: text.slice(start, end),
      };
    }

    position = start + 1;
  }

  return null;
}

function buildFlexiblePattern(words) {
  return words.map(escapeRegExp).join("\\s*");
}

function locateFlexiblePattern(text, words, searchFrom) {
  const pattern = new RegExp(buildFlexiblePattern(words), "u");
  const slice = text.slice(searchFrom);
  const match = slice.match(pattern);
  if (!match || match.index == null) {
    return null;
  }

  const start = searchFrom + match.index;
  return {
    start,
    end: start + match[0].length,
    text: match[0],
  };
}

export function locateAggregatedEntity(text, words, searchFrom = 0) {
  if (!text || !words.length) {
    return null;
  }

  const candidates = [words.join(" "), words.join("")].filter(
    (phrase, index, list) => phrase && list.indexOf(phrase) === index,
  );

  for (const phrase of candidates) {
    const located = locateJoinedPhrase(text, phrase, searchFrom);
    if (located) {
      return located;
    }
  }

  return (
    locateFlexiblePattern(text, words, searchFrom) ||
    locateSequentialWords(text, words, searchFrom)
  );
}

export function mapAggregatedEntities(text, aggregated, modelId) {
  const entities = [];

  for (const group of aggregated) {
    const located = locateAggregatedEntity(text, group.words, 0);
    if (!located) {
      continue;
    }

    const overlaps = entities.some(
      (existing) => located.start < existing.end && located.end > existing.start,
    );
    if (overlaps) {
      continue;
    }

    entities.push({
      text: located.text,
      start: located.start,
      end: located.end,
      label: mapEntityTypeToAppLabel(group.entityType),
      source: `onnx:${modelId}`,
    });
  }

  return entities.sort((left, right) => left.start - right.start || left.end - right.end);
}

export function mapRawTokenEntities(text, rawEntities, modelId) {
  const aggregated = aggregateTokenPredictions(rawEntities);
  return mapAggregatedEntities(text, aggregated, modelId);
}
