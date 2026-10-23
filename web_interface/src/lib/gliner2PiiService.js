/**
 * Client for the local GLiNER2-PII ONNX sidecar used by Basic mode.
 */

import {
  GLINER2_PII_API_BASE,
  GLINER2_PII_DEFAULT_THRESHOLD,
  GLINER2_PII_ENTITY_LABELS,
  GLINER2_PII_MODEL_ID,
} from "./gliner2PiiConstants.js";

function apiUrl(path) {
  return `${GLINER2_PII_API_BASE.replace(/\/$/, "")}${path}`;
}

export async function checkGliner2PiiHealth() {
  const response = await fetch(apiUrl("/health"));
  if (!response.ok) {
    throw new Error(`GLiNER2-PII health check failed (${response.status})`);
  }
  return response.json();
}

/**
 * Run GLiNER2-PII entity detection via the local ONNX sidecar.
 * @returns {{ entities: Array, model: string, relations: [] }}
 */
export async function runGliner2PiiDetection({
  text,
  labels = GLINER2_PII_ENTITY_LABELS,
  threshold = GLINER2_PII_DEFAULT_THRESHOLD,
  onProgress,
} = {}) {
  const source = String(text || "").trim();
  if (!source) {
    return { entities: [], relations: [], model: GLINER2_PII_MODEL_ID };
  }

  onProgress?.({ phase: "init", detail: "gliner2-pii" });

  let response;
  try {
    response = await fetch(apiUrl("/detect"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        text: source,
        labels,
        threshold,
      }),
    });
  } catch (error) {
    const hint =
      "Start the sidecar: npm run gliner2-pii-server (okasi ONNX, first run downloads ~510 MB).";
    throw new Error(
      `GLiNER2-PII server unreachable at ${GLINER2_PII_API_BASE}. ${hint} (${error.message})`,
    );
  }

  if (!response.ok) {
    let detail = `${response.status}`;
    try {
      const payload = await response.json();
      detail = payload.detail || JSON.stringify(payload);
    } catch {
      // ignore
    }
    throw new Error(`GLiNER2-PII detection failed: ${detail}`);
  }

  onProgress?.({ phase: "infer", detail: "gliner2-pii" });
  const payload = await response.json();
  const entities = (payload.entities || []).map((entity, index) => ({
    id: entity.id || `gliner2-pii-${index}-${entity.start}-${entity.end}`,
    start: Number(entity.start),
    end: Number(entity.end),
    text: entity.text || "",
    label: entity.label || "misc",
    score: entity.score,
    source: entity.source || "gliner2-pii",
  }));

  return {
    entities,
    relations: [],
    model: payload.model || GLINER2_PII_MODEL_ID,
  };
}
