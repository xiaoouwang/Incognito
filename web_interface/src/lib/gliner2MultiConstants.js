/** Browser GLiNER2-multi (onnx-community fp16) — Pythonless, dynamic labels. */

import {
  GLINER_LABELS,
  GLINER_LABEL_DESCRIPTIONS,
} from "./glinerConstants.js";

export const GLINER2_MULTI_REPO = "onnx-community/gliner2-multi-v1-agent-ONNX";
export const GLINER2_MULTI_MODEL_ID = GLINER2_MULTI_REPO;
/** Model card / hub page (for UI links). */
export const GLINER2_MULTI_HF_URL = `https://huggingface.co/${GLINER2_MULTI_REPO}`;

export const GLINER2_MULTI_MODEL_FILE = "onnx/model_fp16.onnx";
export const GLINER2_MULTI_DATA_FILE = "onnx/model_fp16.onnx_data";

export const GLINER2_MULTI_MODEL_URL = `https://huggingface.co/${GLINER2_MULTI_REPO}/resolve/main/${GLINER2_MULTI_MODEL_FILE}`;
export const GLINER2_MULTI_DATA_URL = `https://huggingface.co/${GLINER2_MULTI_REPO}/resolve/main/${GLINER2_MULTI_DATA_FILE}`;
export const GLINER2_MULTI_TOKENIZER_ID = GLINER2_MULTI_REPO;

export const GLINER2_MULTI_CACHE_NAME = "incognito-gliner2-multi-v1";
export const GLINER2_MULTI_DEFAULT_THRESHOLD = 0.3;
export const GLINER2_MULTI_MAX_WIDTH = 8;

/**
 * Same label set as Advanced mode (`GLINER_LABELS`), with GLiNER2 descriptions.
 */
export const GLINER2_MULTI_BASIC_LABEL_MAP = Object.fromEntries(
  GLINER_LABELS.map((label) => [
    label,
    GLINER_LABEL_DESCRIPTIONS[label] || label,
  ]),
);

export const GLINER2_MULTI_BASIC_LABELS = [...GLINER_LABELS];

/** Build GLiNER2 description map for a selected label list. */
export function buildGliner2LabelMap(labels) {
  const map = {};
  for (const label of labels || []) {
    const key = String(label || "").trim();
    if (!key || map[key]) {
      continue;
    }
    map[key] = GLINER_LABEL_DESCRIPTIONS[key] || `a ${key}`;
  }
  return map;
}
