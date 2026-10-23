/**
 * Pythonless browser GLiNER2-PII NER (yethdev/gliner2-pii-onnx quantized).
 */

import * as ort from "onnxruntime-web";
import { AutoTokenizer, env as transformersEnv } from "@huggingface/transformers";
import {
  GLINER2_PII_ONNX_CACHE_NAME,
  GLINER2_PII_ONNX_DEFAULT_THRESHOLD,
  GLINER2_PII_ONNX_MODEL_FILE,
  GLINER2_PII_ONNX_MODEL_ID,
  GLINER2_PII_ONNX_MODEL_URL,
  GLINER2_PII_ONNX_TOKENIZER_ID,
} from "./gliner2PiiOnnxConstants.js";
import {
  buildGliner2PiiOnnxFeed,
  decodeGliner2PiiOnnxSpanProbs,
} from "./gliner2PiiOnnxPreprocess.js";
import { splitTextForGlinerDetection } from "./glinerUtils.js";

transformersEnv.allowRemoteModels = true;
transformersEnv.backends.onnx.wasm.numThreads = 1;

ort.env.wasm.numThreads = 1;
ort.env.wasm.simd = true;
ort.env.wasm.wasmPaths =
  "https://cdn.jsdelivr.net/npm/onnxruntime-web@1.22.0/dist/";

const runtimeCache = {
  initPromise: null,
  session: null,
  tokenizer: null,
};

async function readCachedBuffer(url) {
  if (typeof caches === "undefined") {
    return null;
  }
  try {
    const cache = await caches.open(GLINER2_PII_ONNX_CACHE_NAME);
    const hit = await cache.match(url);
    return hit ? hit.arrayBuffer() : null;
  } catch {
    return null;
  }
}

async function writeCachedBuffer(url, buffer) {
  if (typeof caches === "undefined") {
    return;
  }
  try {
    const cache = await caches.open(GLINER2_PII_ONNX_CACHE_NAME);
    await cache.put(url, new Response(buffer.slice(0)));
  } catch {
    // ignore quota errors
  }
}

async function loadBuffer(url, label, onProgress) {
  const cached = await readCachedBuffer(url);
  if (cached) {
    onProgress?.({ phase: "download", file: label, fromCache: true, percent: 100 });
    return cached;
  }

  onProgress?.({ phase: "download", file: label, fromCache: false, percent: 0 });
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to download ${label} (${response.status})`);
  }

  const total = Number(response.headers.get("content-length")) || 0;
  const reader = response.body?.getReader();
  if (!reader) {
    const buffer = await response.arrayBuffer();
    await writeCachedBuffer(url, buffer);
    onProgress?.({ phase: "download", file: label, percent: 100, loaded: buffer.byteLength });
    return buffer;
  }

  const chunks = [];
  let loaded = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }
    chunks.push(value);
    loaded += value.length;
    const percent =
      total > 0 ? Math.min(99, (loaded / total) * 100) : Math.min(95, loaded / 8_000_000);
    onProgress?.({ phase: "download", file: label, percent, loaded, total: total || null });
  }

  const merged = new Uint8Array(loaded);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.length;
  }
  const buffer = merged.buffer;
  await writeCachedBuffer(url, buffer);
  onProgress?.({ phase: "download", file: label, percent: 100, loaded, total: total || loaded });
  return buffer;
}

/** Drop cached session/tokenizer (e.g. after EP / model changes). */
export function resetGliner2PiiOnnxRuntime() {
  runtimeCache.initPromise = null;
  runtimeCache.session = null;
  runtimeCache.tokenizer = null;
}

if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    resetGliner2PiiOnnxRuntime();
  });
}

async function ensureRuntime(onProgress) {
  if (runtimeCache.session && runtimeCache.tokenizer) {
    return runtimeCache;
  }
  if (runtimeCache.initPromise) {
    return runtimeCache.initPromise;
  }

  runtimeCache.initPromise = (async () => {
    onProgress?.({ phase: "init", detail: "tokenizer" });
    const tokenizer = await AutoTokenizer.from_pretrained(GLINER2_PII_ONNX_TOKENIZER_ID);

    onProgress?.({ phase: "init", detail: "onnx" });
    const modelBuffer = await loadBuffer(
      GLINER2_PII_ONNX_MODEL_URL,
      GLINER2_PII_ONNX_MODEL_FILE,
      onProgress,
    );

    const session = await ort.InferenceSession.create(new Uint8Array(modelBuffer), {
      executionProviders: ["wasm"],
    });
    runtimeCache.tokenizer = tokenizer;
    runtimeCache.session = session;
    return runtimeCache;
  })();

  try {
    return await runtimeCache.initPromise;
  } catch (error) {
    runtimeCache.initPromise = null;
    throw error;
  }
}

function toInt64Tensor(values, dims) {
  return new ort.Tensor("int64", BigInt64Array.from(values.map(BigInt)), dims);
}

async function inferChunk(runtime, text, labels, threshold) {
  const feed = await buildGliner2PiiOnnxFeed(runtime.tokenizer, text, labels);
  if (!feed.words.length) {
    return [];
  }

  // text_word_indices / schema_special_indices are rank-1 in this export.
  const outputs = await runtime.session.run({
    input_ids: toInt64Tensor(feed.inputIds, [1, feed.inputIds.length]),
    attention_mask: toInt64Tensor(feed.attentionMask, [1, feed.attentionMask.length]),
    text_word_indices: toInt64Tensor(feed.textWordIndices, [feed.textWordIndices.length]),
    schema_special_indices: toInt64Tensor(feed.schemaSpecialIndices, [
      feed.schemaSpecialIndices.length,
    ]),
  });

  return decodeGliner2PiiOnnxSpanProbs({
    text,
    labels: feed.labels,
    countLogits: Array.from(outputs.count_logits.data),
    spanProbsFlat: Array.from(outputs.span_probs.data),
    spanProbsDims: outputs.span_probs.dims,
    startMapping: feed.startMapping,
    endMapping: feed.endMapping,
    threshold,
  });
}

function offsetEntities(entities, offset) {
  return entities.map((entity, index) => ({
    ...entity,
    id: entity.id || `gliner2-pii-onnx-${offset}-${index}-${entity.start}-${entity.end}`,
    start: entity.start + offset,
    end: entity.end + offset,
    source: "gliner2-pii-onnx",
  }));
}

/**
 * Browser GLiNER2-PII ONNX entity detection (no Python).
 * @returns {{ entities: Array, model: string, relations: [] }}
 */
export async function runGliner2PiiOnnxDetection({
  text,
  labels = [],
  labelMap = null,
  threshold = GLINER2_PII_ONNX_DEFAULT_THRESHOLD,
  onProgress,
} = {}) {
  const source = String(text || "");
  if (!source.trim()) {
    return { entities: [], relations: [], model: GLINER2_PII_ONNX_MODEL_ID };
  }

  const resolvedLabels = labels?.length
    ? labels
    : labelMap
      ? Object.keys(labelMap)
      : [];
  if (!resolvedLabels.length) {
    throw new Error("GLiNER2-PII ONNX needs at least one label");
  }

  const runtime = await ensureRuntime(onProgress);
  onProgress?.({ phase: "infer", detail: "gliner2-pii-onnx" });

  const chunks = splitTextForGlinerDetection(source);
  const entities = [];
  for (let index = 0; index < chunks.length; index += 1) {
    const chunk = chunks[index];
    const chunkText = typeof chunk === "string" ? chunk : chunk.text;
    const offset = typeof chunk === "string" ? 0 : Number(chunk.start) || 0;
    const found = await inferChunk(runtime, chunkText, resolvedLabels, threshold);
    entities.push(...offsetEntities(found, offset));
    onProgress?.({
      phase: "infer",
      detail: "segment",
      current: index + 1,
      total: chunks.length,
    });
  }

  return {
    entities,
    relations: [],
    model: GLINER2_PII_ONNX_MODEL_ID,
  };
}
