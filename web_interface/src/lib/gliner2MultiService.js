/**
 * Pythonless browser GLiNER2-multi NER (onnx-community fp16 + transformers.js).
 */

import * as ort from "onnxruntime-web";
import { AutoTokenizer, env as transformersEnv } from "@huggingface/transformers";
import {
  GLINER2_MULTI_BASIC_LABEL_MAP,
  GLINER2_MULTI_CACHE_NAME,
  GLINER2_MULTI_DATA_FILE,
  GLINER2_MULTI_DATA_URL,
  GLINER2_MULTI_DEFAULT_THRESHOLD,
  GLINER2_MULTI_MODEL_FILE,
  GLINER2_MULTI_MODEL_ID,
  GLINER2_MULTI_MODEL_URL,
  GLINER2_MULTI_TOKENIZER_ID,
} from "./gliner2MultiConstants.js";
import {
  buildGliner2MultiFeed,
  decodeGliner2MultiSpanLogits,
} from "./gliner2MultiPreprocess.js";
import { splitTextForGlinerDetection } from "./glinerUtils.js";

transformersEnv.allowRemoteModels = true;
transformersEnv.backends.onnx.wasm.numThreads = 1;

ort.env.wasm.numThreads = 1;
ort.env.wasm.simd = true;
// Keep wasm binaries aligned with the installed onnxruntime-web major.
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
    const cache = await caches.open(GLINER2_MULTI_CACHE_NAME);
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
    const cache = await caches.open(GLINER2_MULTI_CACHE_NAME);
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

async function createSession(modelBuffer, dataBuffer) {
  // Prefer WASM over WebGPU: fp16 GLiNER2-multi on WebGPU collapses age-span
  // scores (e.g. "43 ans" ~0.06 vs ~0.79 on CPU/WASM), so ages vanish at threshold.
  const options = {
    executionProviders: ["wasm"],
  };
  if (dataBuffer) {
    const dataName = GLINER2_MULTI_DATA_FILE.split("/").pop();
    options.externalData = [
      { path: dataName, data: dataBuffer },
      // Some ORT builds resolve the path as stored in the proto.
      { path: GLINER2_MULTI_DATA_FILE, data: dataBuffer },
    ];
  }

  return ort.InferenceSession.create(new Uint8Array(modelBuffer), options);
}

/** Drop cached session/tokenizer (e.g. after EP / model changes). */
export function resetGliner2MultiRuntime() {
  runtimeCache.initPromise = null;
  runtimeCache.session = null;
  runtimeCache.tokenizer = null;
}

if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    resetGliner2MultiRuntime();
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
    const tokenizer = await AutoTokenizer.from_pretrained(GLINER2_MULTI_TOKENIZER_ID);

    onProgress?.({ phase: "init", detail: "onnx" });
    const [modelBuffer, dataBuffer] = await Promise.all([
      loadBuffer(GLINER2_MULTI_MODEL_URL, GLINER2_MULTI_MODEL_FILE, onProgress),
      loadBuffer(GLINER2_MULTI_DATA_URL, GLINER2_MULTI_DATA_FILE, onProgress),
    ]);

    const session = await createSession(modelBuffer, dataBuffer);
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

async function inferChunk(runtime, text, labelMap, threshold) {
  const feed = await buildGliner2MultiFeed(runtime.tokenizer, text, labelMap);
  if (!feed.words.length) {
    return [];
  }

  const outputs = await runtime.session.run({
    input_ids: toInt64Tensor(feed.inputIds, [1, feed.inputIds.length]),
    attention_mask: toInt64Tensor(feed.attentionMask, [1, feed.attentionMask.length]),
    word_positions: toInt64Tensor(feed.wordPositions, [1, feed.wordPositions.length]),
    schema_positions: toInt64Tensor(feed.schemaPositions, [1, feed.schemaPositions.length]),
  });

  return decodeGliner2MultiSpanLogits({
    text,
    labels: feed.labels,
    countLogits: Array.from(outputs.count_logits.data),
    spanLogitsFlat: Array.from(outputs.span_logits.data),
    spanLogitsDims: outputs.span_logits.dims,
    startMapping: feed.startMapping,
    endMapping: feed.endMapping,
    threshold,
  });
}

function offsetEntities(entities, offset) {
  return entities.map((entity, index) => ({
    ...entity,
    id: entity.id || `gliner2-multi-${offset}-${index}-${entity.start}-${entity.end}`,
    start: entity.start + offset,
    end: entity.end + offset,
    source: "gliner2-multi",
  }));
}

/**
 * Browser GLiNER2-multi entity detection (no Python).
 * @returns {{ entities: Array, model: string, relations: [] }}
 */
export async function runGliner2MultiDetection({
  text,
  labelMap = GLINER2_MULTI_BASIC_LABEL_MAP,
  threshold = GLINER2_MULTI_DEFAULT_THRESHOLD,
  onProgress,
} = {}) {
  const source = String(text || "");
  if (!source.trim()) {
    return { entities: [], relations: [], model: GLINER2_MULTI_MODEL_ID };
  }

  const runtime = await ensureRuntime(onProgress);
  onProgress?.({ phase: "infer", detail: "gliner2-multi" });

  const chunks = splitTextForGlinerDetection(source);
  const entities = [];
  for (let index = 0; index < chunks.length; index += 1) {
    const chunk = chunks[index];
    const chunkText = typeof chunk === "string" ? chunk : chunk.text;
    const offset = typeof chunk === "string" ? 0 : Number(chunk.start) || 0;
    const found = await inferChunk(runtime, chunkText, labelMap, threshold);
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
    model: GLINER2_MULTI_MODEL_ID,
  };
}
