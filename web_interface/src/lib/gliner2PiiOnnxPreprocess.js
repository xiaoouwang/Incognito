/**
 * GLiNER2-PII ONNX feed (yethdev/gliner2-pii-onnx).
 * Schema-agnostic host linearization — no [DESCRIPTION] blobs.
 * Inputs use text_word_indices / schema_special_indices (rank-1).
 * Outputs span_probs already in [0,1] with layout [words, width, labels].
 */

import { splitGliner2Words } from "./gliner2MultiPreprocess.js";
import { GLINER2_PII_ONNX_MAX_WIDTH } from "./gliner2PiiOnnxConstants.js";

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

async function encodeWord(tokenizer, word) {
  const input = SPECIAL_TOKENS.has(word) ? word : `\u2581${word}`;
  const encoded = await tokenizer(input, { add_special_tokens: false });
  return Array.from(encoded.input_ids.data ?? encoded.input_ids, Number);
}

/**
 * @param {object} tokenizer transformers.js AutoTokenizer
 * @param {string} text
 * @param {string[]} labels
 */
export async function buildGliner2PiiOnnxFeed(tokenizer, text, labels) {
  const cleanLabels = (labels || [])
    .map((label) => String(label || "").trim())
    .filter(Boolean);
  if (!cleanLabels.length) {
    throw new Error("GLiNER2-PII ONNX needs at least one label");
  }

  const words = splitGliner2Words(text);
  const schemaTokens = ["(", "[P]", "entities", "("];
  for (const label of cleanLabels) {
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

  const schemaSpecialIndices = [];
  for (let index = 0; index < schemaTokens.length; index += 1) {
    if (schemaTokens[index] === "[P]" || schemaTokens[index] === "[E]") {
      schemaSpecialIndices.push(wordFirstToken[index]);
    }
  }

  const textWordIndices = words.map(
    (_, index) => wordFirstToken[schemaTokens.length + 1 + index],
  );

  return {
    labels: cleanLabels,
    words,
    inputIds,
    attentionMask: inputIds.map(() => 1),
    textWordIndices,
    schemaSpecialIndices,
    startMapping: words.map((word) => word.start),
    endMapping: words.map((word) => word.end),
    maxWidth: GLINER2_PII_ONNX_MAX_WIDTH,
  };
}

function reshapeSpanProbs(flat, dims) {
  // Expected: [num_words, width, num_labels]
  if (dims.length === 3) {
    const [wordCount, widthCount, labelCount] = dims;
    const byLabel = [];
    for (let labelIndex = 0; labelIndex < labelCount; labelIndex += 1) {
      const rows = [];
      for (let wordIndex = 0; wordIndex < wordCount; wordIndex += 1) {
        const row = [];
        for (let width = 0; width < widthCount; width += 1) {
          row.push(flat[wordIndex * widthCount * labelCount + width * labelCount + labelIndex]);
        }
        rows.push(row);
      }
      byLabel.push(rows);
    }
    return byLabel;
  }

  // Fallback: [labels, words, width] like multi logits layout
  const labelCount = dims[0];
  const wordCount = dims[1];
  const widthCount = dims[2];
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

export function decodeGliner2PiiOnnxSpanProbs({
  text,
  labels,
  countLogits,
  spanProbsFlat,
  spanProbsDims,
  startMapping,
  endMapping,
  threshold,
}) {
  const countArgmax = countLogits.reduce(
    (bestIndex, value, index) => (value > countLogits[bestIndex] ? index : bestIndex),
    0,
  );
  // Soft gate: only skip when the head predicts zero entities.
  if (countArgmax <= 0) {
    return [];
  }

  const spanScores = reshapeSpanProbs(spanProbsFlat, spanProbsDims);
  const textLen = startMapping.length;
  const maxWidth = Math.min(
    GLINER2_PII_ONNX_MAX_WIDTH,
    spanProbsDims.length === 3 ? spanProbsDims[1] : spanProbsDims[2] || GLINER2_PII_ONNX_MAX_WIDTH,
  );
  const entities = [];

  for (let labelIndex = 0; labelIndex < labels.length; labelIndex += 1) {
    const candidates = [];
    for (let start = 0; start < textLen; start += 1) {
      for (let width = 0; width < maxWidth; width += 1) {
        const endWord = start + width;
        if (endWord >= textLen) {
          continue;
        }
        const score = spanScores[labelIndex]?.[start]?.[width];
        if (typeof score !== "number" || score < threshold) {
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
