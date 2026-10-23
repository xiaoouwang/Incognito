/** Browser GLiNER2-PII ONNX (yethdev) — Pythonless, schema-agnostic labels. */

export const GLINER2_PII_ONNX_REPO = "yethdev/gliner2-pii-onnx";
export const GLINER2_PII_ONNX_MODEL_ID = GLINER2_PII_ONNX_REPO;
/** Model card / hub page (for UI links). */
export const GLINER2_PII_ONNX_HF_URL = `https://huggingface.co/${GLINER2_PII_ONNX_REPO}`;

export const GLINER2_PII_ONNX_MODEL_FILE = "model.quantized.onnx";
export const GLINER2_PII_ONNX_MODEL_URL = `https://huggingface.co/${GLINER2_PII_ONNX_REPO}/resolve/main/${GLINER2_PII_ONNX_MODEL_FILE}`;
export const GLINER2_PII_ONNX_TOKENIZER_ID = GLINER2_PII_ONNX_REPO;

export const GLINER2_PII_ONNX_CACHE_NAME = "incognito-gliner2-pii-onnx-v1";
export const GLINER2_PII_ONNX_DEFAULT_THRESHOLD = 0.3;
export const GLINER2_PII_ONNX_MAX_WIDTH = 8;

/** Basic-mode engine ids. */
export const BASIC_NER_ENGINE_MULTI = "gliner2-multi";
export const BASIC_NER_ENGINE_PII_ONNX = "gliner2-pii-onnx";
export const BASIC_NER_ENGINE_DEFAULT = BASIC_NER_ENGINE_MULTI;
