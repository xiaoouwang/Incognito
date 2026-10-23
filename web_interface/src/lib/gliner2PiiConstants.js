/** GLiNER2-PII via local ONNX sidecar (okasi export). */

export const GLINER2_PII_MODEL_ID = "okasi/gliner2-privacy-filter-pii-multi-onnx";

/** Vite-dev proxy path → local Python server on :8765 */
export const GLINER2_PII_API_BASE =
  typeof import.meta !== "undefined" && import.meta.env?.VITE_GLINER2_PII_API
    ? import.meta.env.VITE_GLINER2_PII_API
    : "/gliner2-pii-api";

export const GLINER2_PII_DEFAULT_THRESHOLD = 0.5;

/**
 * Export-fixed SPY labels (order matters for the ONNX package).
 * Sidecar maps them to Incognito categories (name→person, phone_num→phone, …).
 */
export const GLINER2_PII_ENTITY_LABELS = [
  "name",
  "address",
  "email",
  "phone_num",
  "id_num",
  "url",
  "username",
];

/** @deprecated use GLINER2_PII_ENTITY_LABELS — kept for older callers */
export const GLINER2_PII_BASIC_LABELS = GLINER2_PII_ENTITY_LABELS;
