import { pipeline, env } from "@huggingface/transformers";
import { detectWithRules, mergeEntities } from "./lib/ruleDetection.js";
import { splitEntitiesAtNewlines } from "./lib/entityUtils.js";
import { mapRawTokenEntities } from "./lib/tokenAggregation.js";
import { resolveModelId, resolvePipelineOptions } from "./lib/modelRegistry.js";

env.allowLocalModels = false;

class NerPipelineManager {
  static instances = new Map();

  static async getInstance(modelId, pipelineOptions, progressCallback) {
    if (!this.instances.has(modelId)) {
      const instance = await pipeline("token-classification", modelId, {
        progress_callback: progressCallback,
        ...pipelineOptions,
      });
      this.instances.set(modelId, instance);
    }

    return this.instances.get(modelId);
  }
}

async function detectEntities(text, backend, customModelId, progressCallback) {
  const modelId = resolveModelId(backend, customModelId);
  const pipelineOptions = resolvePipelineOptions(backend);
  const ner = await NerPipelineManager.getInstance(modelId, pipelineOptions, progressCallback);
  const raw = await ner(text);
  const modelEntities = mapRawTokenEntities(text, raw, modelId);

  let entities = [...modelEntities, ...detectWithRules(text)];
  entities = splitEntitiesAtNewlines(text, entities);
  entities = mergeEntities(entities);

  return {
    backend,
    model: modelId,
    entities,
  };
}

self.addEventListener("message", async (event) => {
  const { type, id, text, backend, customModelId } = event.data;

  if (type !== "detect") {
    return;
  }

  try {
    const result = await detectEntities(text, backend, customModelId, (progress) => {
      self.postMessage({ type: "model-progress", id, progress });
    });
    self.postMessage({ type: "result", id, result });
  } catch (error) {
    self.postMessage({
      type: "error",
      id,
      error: error instanceof Error ? error.message : String(error),
    });
  }
});
