import {
  CUSTOM_BACKEND_ID,
  CUSTOM_MODEL_EXAMPLE,
  NER_BACKENDS,
  NER_MODEL_IDS,
  NER_MODEL_PIPELINE_OPTIONS,
} from "./constants.js";

export { CUSTOM_MODEL_EXAMPLE };

export function resolveModelId(backend, customModelId) {
  if (backend === CUSTOM_BACKEND_ID) {
    const trimmed = customModelId?.trim();
    const validationError = validateCustomModelId(trimmed);
    if (validationError) {
      throw new Error(validationError);
    }
    return trimmed;
  }

  const modelId = NER_MODEL_IDS[backend];
  if (!modelId) {
    throw new Error(`Unknown NER backend: ${backend}`);
  }

  return modelId;
}

export function validateCustomModelId(modelId) {
  const trimmed = modelId?.trim();
  if (!trimmed) {
    return `Enter a Hugging Face model id (for example ${CUSTOM_MODEL_EXAMPLE}).`;
  }

  if (/\s/.test(trimmed) || !trimmed.includes("/")) {
    return `Use the form organization/model-name (for example ${CUSTOM_MODEL_EXAMPLE}).`;
  }

  return null;
}

export function resolvePipelineOptions(backend) {
  if (NER_MODEL_PIPELINE_OPTIONS[backend]) {
    return NER_MODEL_PIPELINE_OPTIONS[backend];
  }

  if (backend === CUSTOM_BACKEND_ID) {
    return { dtype: "q8" };
  }

  return {};
}

export function backendDisplayLabel(backend, customModelId = "") {
  if (backend === CUSTOM_BACKEND_ID) {
    const trimmed = customModelId.trim();
    return trimmed ? `Custom: ${trimmed}` : "Custom Hugging Face model";
  }

  return NER_BACKENDS[backend] || backend;
}
