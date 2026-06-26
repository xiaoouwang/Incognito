import {
  GLINER_DEFAULT_THRESHOLD,
  GLINER_MODEL_FILE,
  GLINER_MODEL_ID,
  GLINER_MODEL_URL,
  GLINER_RULE_LABELS,
} from "./glinerConstants.js";
import {
  dedupeGlinerEntities,
  offsetGlinerEntities,
  splitTextForGlinerDetection,
} from "./glinerUtils.js";
import { detectWithGlinerRules, mergeEntities } from "./ruleDetection.js";

const FETCH_TIMEOUT_MS = 15 * 60 * 1000;
const GLINER_MODEL_CACHE_NAME = "incognito-gliner-v1";

const PHASE_RANGES_COLD = {
  prepare: [0, 2],
  "load-module": [2, 8],
  "download-onnx": [8, 65],
  "load-tokenizer": [65, 78],
  "init-runtime": [78, 88],
  detect: [88, 100],
};

const PHASE_RANGES_MEDIUM = {
  prepare: [0, 2],
  "load-module": [2, 8],
  "download-onnx": [8, 12],
  "load-tokenizer": [12, 20],
  "init-runtime": [20, 28],
  detect: [28, 100],
};

const PHASE_RANGES_WARM = {
  detect: [0, 100],
};

let activePhaseRanges = PHASE_RANGES_COLD;

function getRuntimeCache() {
  if (!globalThis.__incognitoGlinerRuntime) {
    globalThis.__incognitoGlinerRuntime = {
      instance: null,
      modelBuffer: null,
      modelFile: null,
      initPromise: null,
    };
  }

  return globalThis.__incognitoGlinerRuntime;
}

function resetModelCacheIfNeeded(cache) {
  if (cache.modelFile !== GLINER_MODEL_FILE) {
    cache.instance = null;
    cache.modelBuffer = null;
    cache.initPromise = null;
    cache.modelFile = GLINER_MODEL_FILE;
  }
}

function setProgressMode(mode) {
  if (mode === "warm") {
    activePhaseRanges = PHASE_RANGES_WARM;
    return;
  }

  if (mode === "medium") {
    activePhaseRanges = PHASE_RANGES_MEDIUM;
    return;
  }

  activePhaseRanges = PHASE_RANGES_COLD;
}

function phasePercent(phase, localPercent = 0) {
  const [start, end] = activePhaseRanges[phase] ?? [0, 100];
  const bounded = Math.min(100, Math.max(0, localPercent));
  return Math.round(start + (bounded / 100) * (end - start));
}

function report(progressCallback, payload) {
  progressCallback?.({
    ...payload,
    indeterminate: payload.indeterminate ?? false,
    overallPercent: phasePercent(payload.phase, payload.localPercent ?? 0),
  });
}

function partitionGlinerLabels(labels) {
  const ruleLabelSet = new Set(GLINER_RULE_LABELS);
  const regexLabels = labels.filter((label) => ruleLabelSet.has(label));
  const modelLabels = labels.filter((label) => !ruleLabelSet.has(label));
  return { regexLabels, modelLabels };
}

function reportDetectProgress(progressCallback, completedChunks, total) {
  const safeTotal = Math.max(total, 1);
  const localPercent = (completedChunks / safeTotal) * 100;
  report(progressCallback, {
    phase: "detect",
    localPercent,
    detail: "segment",
    current: completedChunks > 0 ? Math.min(completedChunks, safeTotal) : 1,
    total: safeTotal,
  });
}

async function readPersistentModelBuffer(url) {
  if (typeof caches === "undefined") {
    return null;
  }

  try {
    const cache = await caches.open(GLINER_MODEL_CACHE_NAME);
    const response = await cache.match(url);
    if (!response) {
      return null;
    }

    return response.arrayBuffer();
  } catch {
    return null;
  }
}

async function writePersistentModelBuffer(url, buffer) {
  if (typeof caches === "undefined") {
    return;
  }

  try {
    const cache = await caches.open(GLINER_MODEL_CACHE_NAME);
    await cache.put(url, new Response(buffer.slice(0)));
  } catch {
    // Quota or private browsing — in-memory cache still helps within the session.
  }
}

function reportCachedModel(progressCallback, buffer) {
  report(progressCallback, {
    phase: "download-onnx",
    localPercent: 100,
    detail: GLINER_MODEL_FILE,
    loaded: buffer.byteLength,
    total: buffer.byteLength,
    fromCache: true,
  });
}

async function fetchArrayBufferWithProgress(url, progressCallback) {
  report(progressCallback, {
    phase: "download-onnx",
    localPercent: 0,
    detail: GLINER_MODEL_FILE,
    loaded: 0,
    total: null,
  });

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  let response;
  try {
    response = await fetch(url, { signal: controller.signal });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error("GLiNER model download timed out. Check your connection and try again.");
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }

  if (!response.ok) {
    throw new Error(`Failed to download ${GLINER_MODEL_FILE} (${response.status})`);
  }

  const total = Number(response.headers.get("content-length")) || 0;
  const reader = response.body?.getReader();

  if (!reader) {
    const buffer = await response.arrayBuffer();
    report(progressCallback, {
      phase: "download-onnx",
      localPercent: 100,
      detail: GLINER_MODEL_FILE,
      loaded: buffer.byteLength,
      total: buffer.byteLength,
    });
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

    const localPercent = total > 0 ? (loaded / total) * 100 : Math.min(95, (loaded / 480_000_000) * 100);
    report(progressCallback, {
      phase: "download-onnx",
      localPercent,
      detail: GLINER_MODEL_FILE,
      loaded,
      total: total || null,
    });
  }

  const merged = new Uint8Array(loaded);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.length;
  }

  report(progressCallback, {
    phase: "download-onnx",
    localPercent: 100,
    detail: GLINER_MODEL_FILE,
    loaded,
    total: total || loaded,
  });

  return merged.buffer;
}

async function loadModelBuffer(progressCallback, cache) {
  if (cache.modelBuffer) {
    reportCachedModel(progressCallback, cache.modelBuffer);
    return cache.modelBuffer;
  }

  const persistentBuffer = await readPersistentModelBuffer(GLINER_MODEL_URL);
  if (persistentBuffer) {
    cache.modelBuffer = persistentBuffer;
    reportCachedModel(progressCallback, persistentBuffer);
    return persistentBuffer;
  }

  const buffer = await fetchArrayBufferWithProgress(GLINER_MODEL_URL, progressCallback);
  cache.modelBuffer = buffer;
  await writePersistentModelBuffer(GLINER_MODEL_URL, buffer);
  return buffer;
}

async function loadGlinerModule(progressCallback) {
  report(progressCallback, {
    phase: "load-module",
    localPercent: 0,
    detail: "gliner",
  });

  const { Gliner } = await import("gliner");

  report(progressCallback, {
    phase: "load-module",
    localPercent: 100,
    detail: "gliner",
  });

  return Gliner;
}

async function initGliner(progressCallback) {
  const cache = getRuntimeCache();
  resetModelCacheIfNeeded(cache);

  report(progressCallback, {
    phase: "prepare",
    localPercent: 100,
    detail: GLINER_MODEL_ID,
  });

  const Gliner = await loadGlinerModule(progressCallback);
  const modelBuffer = await loadModelBuffer(progressCallback, cache);

  report(progressCallback, {
    phase: "load-tokenizer",
    localPercent: 0,
    detail: "tokenizer",
  });

  const gliner = new Gliner({
    tokenizerPath: GLINER_MODEL_ID,
    onnxSettings: {
      modelPath: modelBuffer,
      executionProvider: "wasm",
      multiThread: false,
    },
    transformersSettings: {
      allowLocalModels: false,
      useBrowserCache: true,
    },
  });

  report(progressCallback, {
    phase: "load-tokenizer",
    localPercent: 100,
    detail: "tokenizer",
  });

  report(progressCallback, {
    phase: "init-runtime",
    localPercent: 0,
    detail: "onnxruntime-wasm",
  });

  await gliner.initialize();

  report(progressCallback, {
    phase: "init-runtime",
    localPercent: 100,
    detail: "onnxruntime-wasm",
  });

  cache.instance = gliner;
  return gliner;
}

async function resolveProgressMode(cache) {
  if (cache.instance) {
    return "warm";
  }

  if (cache.modelBuffer) {
    return "medium";
  }

  const persistentBuffer = await readPersistentModelBuffer(GLINER_MODEL_URL);
  return persistentBuffer ? "medium" : "cold";
}

async function getGliner(progressCallback) {
  const cache = getRuntimeCache();
  resetModelCacheIfNeeded(cache);

  if (cache.instance) {
    setProgressMode("warm");
    return cache.instance;
  }

  setProgressMode(await resolveProgressMode(cache));

  if (!cache.initPromise) {
    cache.initPromise = initGliner(progressCallback).catch((error) => {
      cache.initPromise = null;
      cache.instance = null;
      throw error;
    });
  }

  return cache.initPromise;
}

async function runGlinerModelDetection(gliner, text, modelLabels, threshold, progressCallback) {
  const chunks = splitTextForGlinerDetection(text);
  const entities = [];

  for (let index = 0; index < chunks.length; index += 1) {
    reportDetectProgress(progressCallback, index, chunks.length);

    const chunk = chunks[index];
    const [chunkEntities] = await gliner.inference({
      texts: [chunk.text],
      entities: modelLabels,
      threshold,
      flatNer: false,
    });

    entities.push(
      ...offsetGlinerEntities(
        chunkEntities.map((entity) => ({
          text: entity.spanText,
          label: entity.label,
          start: entity.start,
          end: entity.end,
          score: entity.score,
          source: "gliner",
        })),
        chunk.start,
      ),
    );

    reportDetectProgress(progressCallback, index + 1, chunks.length);
  }

  return { entities, chunkCount: chunks.length };
}

export async function runGlinerDetection(text, labels, progressCallback, threshold = GLINER_DEFAULT_THRESHOLD) {
  const { regexLabels, modelLabels } = partitionGlinerLabels(labels);
  const ruleEntities = detectWithGlinerRules(text, regexLabels);
  let modelEntities = [];
  let chunkCount = 0;

  if (modelLabels.length > 0) {
    const gliner = await getGliner(progressCallback);
    const modelResult = await runGlinerModelDetection(
      gliner,
      text,
      modelLabels,
      threshold,
      progressCallback,
    );
    modelEntities = modelResult.entities;
    chunkCount = modelResult.chunkCount;
  } else if (regexLabels.length > 0) {
    setProgressMode("warm");
    reportDetectProgress(progressCallback, 0, 1);
    reportDetectProgress(progressCallback, 1, 1);
    chunkCount = 1;
  }

  const entities = mergeEntities([...modelEntities, ...ruleEntities]);

  return {
    model: GLINER_MODEL_ID,
    modelFile: GLINER_MODEL_FILE,
    entities: dedupeGlinerEntities(entities),
    chunkCount,
    threshold,
  };
}
