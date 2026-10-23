/**
 * GLiNER2 schema + word feeds for onnx-community/gliner2-multi-v1-agent-ONNX.
 * Port of the published JS/Node preprocess (▁ pretokens, no Python).
 */

import { GLINER2_MULTI_MAX_WIDTH } from "./gliner2MultiConstants.js";

const SPECIAL_TOKENS = new Set([
  "[P]",
  "[E]",
  "[L]",
  "[C]",
  "[R]",
  "[SEP_TEXT]",
  "[SEP_STRUCT]",
  "[DESCRIPTION]",
  "[EXAMPLE]",
  "[OUTPUT]",
]);

const WORD_RE =
  /(?:https?:\/\/[^\s]+|www\.[^\s]+)|[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}|@[a-z0-9_]+|\w+(?:[-_]\w+)*|\S/gi;

export function splitGliner2Words(text) {
  const lowered = String(text || "").toLowerCase();
  const words = [];
  let match;
  WORD_RE.lastIndex = 0;
  while ((match = WORD_RE.exec(lowered)) !== null) {
    words.push({
      text: match[0],
      start: match.index,
      end: match.index + match[0].length,
    });
  }
  return words;
}

function buildDescriptionBlob(labelMap) {
  let blob = "entities";
  for (const [label, description] of Object.entries(labelMap)) {
    blob += ` [DESCRIPTION] ${label}: ${description}`;
  }
  return blob;
}

async function encodeWord(tokenizer, word) {
  const input = SPECIAL_TOKENS.has(word) ? word : `\u2581${word}`;
  const encoded = await tokenizer(input, { add_special_tokens: false });
  return Array.from(encoded.input_ids.data ?? encoded.input_ids, Number);
}

/**
 * @param {object} tokenizer transformers.js AutoTokenizer
 * @param {string} text
 * @param {Record<string, string>} labelMap label → description
 */
export async function buildGliner2MultiFeed(tokenizer, text, labelMap) {
  const labels = Object.keys(labelMap);
  if (!labels.length) {
    throw new Error("GLiNER2-multi needs at least one label");
  }

  const words = splitGliner2Words(text);
  const schemaTokens = ["(", "[P]", buildDescriptionBlob(labelMap), "("];
  for (const label of labels) {
    schemaTokens.push("[E]", label);
  }
  schemaTokens.push(")", ")");

  const full = [...schemaTokens, "[SEP_TEXT]", ...words.map((word) => word.text)];
  const inputIds = [];
  const wordFirstToken = [];

  for (let index = 0; index < full.length; index += 1) {
    wordFirstToken[index] = inputIds.length;
    inputIds.push(...(await encodeWord(tokenizer, full[index])));
  }

  const schemaPositions = [];
  for (let index = 0; index < schemaTokens.length; index += 1) {
    if (schemaTokens[index] === "[P]" || schemaTokens[index] === "[E]") {
      schemaPositions.push(wordFirstToken[index]);
    }
  }

  const wordPositions = words.map(
    (_, index) => wordFirstToken[schemaTokens.length + 1 + index],
  );

  return {
    labels,
    words,
    inputIds,
    attentionMask: inputIds.map(() => 1),
    wordPositions,
    schemaPositions,
    startMapping: words.map((word) => word.start),
    endMapping: words.map((word) => word.end),
    maxWidth: GLINER2_MULTI_MAX_WIDTH,
  };
}

function sigmoid(value) {
  return 1 / (1 + Math.exp(-value));
}

function reshapeSpanLogits(flat, dims) {
  const labelCount = dims.length === 4 ? dims[1] : dims[0];
  const wordCount = dims.length === 4 ? dims[2] : dims[1];
  const widthCount = dims.length === 4 ? dims[3] : dims[2];
  const scores = [];
  let offset = 0;
  for (let labelIndex = 0; labelIndex < labelCount; labelIndex += 1) {
    const rows = [];
    for (let wordIndex = 0; wordIndex < wordCount; wordIndex += 1) {
      rows.push(Array.from(flat.slice(offset, offset + widthCount)));
      offset += widthCount;
    }
    scores.push(rows);
  }
  return scores;
}

export function decodeGliner2MultiSpanLogits({
  text,
  labels,
  countLogits,
  spanLogitsFlat,
  spanLogitsDims,
  startMapping,
  endMapping,
  threshold,
}) {
  const countArgmax = countLogits.reduce(
    (bestIndex, value, index) => (value > countLogits[bestIndex] ? index : bestIndex),
    0,
  );
  if (countArgmax <= 0) {
    return [];
  }

  const spanLogits = reshapeSpanLogits(spanLogitsFlat, spanLogitsDims);
  const textLen = startMapping.length;
  const entities = [];

  for (let labelIndex = 0; labelIndex < labels.length; labelIndex += 1) {
    const candidates = [];
    for (let start = 0; start < textLen; start += 1) {
      for (let width = 0; width < GLINER2_MULTI_MAX_WIDTH; width += 1) {
        const endWord = start + width;
        if (endWord >= textLen) {
          continue;
        }
        const score = sigmoid(spanLogits[labelIndex][start][width]);
        if (score < threshold) {
          continue;
        }
        const charStart = startMapping[start];
        const charEnd = endMapping[endWord];
        const surface = text.slice(charStart, charEnd).trim();
        if (!surface) {
          continue;
        }
        candidates.push({
          start: charStart,
          end: charEnd,
          text: surface,
          label: labels[labelIndex],
          score,
        });
      }
    }

    candidates.sort((left, right) => right.score - left.score);
    const selected = [];
    for (const candidate of candidates) {
      const overlaps = selected.some(
        (item) => !(candidate.end <= item.start || candidate.start >= item.end),
      );
      if (!overlaps) {
        selected.push(candidate);
      }
    }
    entities.push(...selected);
  }

  entities.sort((left, right) => left.start - right.start || left.end - right.end);
  return entities;
}
