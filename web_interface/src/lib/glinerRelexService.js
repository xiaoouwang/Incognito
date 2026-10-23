/**
 * Lazy loader + joint NER/RE helper for GLiNER-relex (Basic & Advanced).
 */

import { OnnxRelexRuntime } from "./glinerRelexRuntime.js";
import {
  GLINER_RELEX_BASIC_ENTITY_LABELS,
  GLINER_RELEX_CACHE_NAME,
  GLINER_RELEX_CHUNK_CHARS,
  GLINER_RELEX_CHUNK_OVERLAP,
  GLINER_RELEX_DEFAULT_ADJACENCY_THRESHOLD,
  GLINER_RELEX_DEFAULT_ENTITY_THRESHOLD,
  GLINER_RELEX_DEFAULT_RELATION_THRESHOLD,
  GLINER_RELEX_ENTITY_MODEL_FILE,
  GLINER_RELEX_ENTITY_MODEL_URL,
  GLINER_RELEX_MODEL_ID,
  GLINER_RELEX_RELATION_LABELS,
  GLINER_RELEX_RELATION_MODEL_FILE,
  GLINER_RELEX_RELATION_MODEL_URL,
  GLINER_RELEX_REPO,
  GLINER_RELEX_SPECIAL_TOKENS_URL,
} from "./glinerRelexConstants.js";
import { GLINER_LABELS } from "./glinerConstants.js";

let runtimePromise = null;

async function readCachedBuffer(url) {
  if (typeof caches === "undefined") {
    return null;
  }
  try {
    const cache = await caches.open(GLINER_RELEX_CACHE_NAME);
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
    const cache = await caches.open(GLINER_RELEX_CACHE_NAME);
    await cache.put(url, new Response(buffer.slice(0)));
  } catch {
    // ignore quota
  }
}

async function loadModelBuffer(url, label, onProgress) {
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
    if (done) break;
    chunks.push(value);
    loaded += value.length;
    const percent = total > 0 ? Math.min(99, (loaded / total) * 100) : Math.min(95, loaded / 5_000_000);
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

async function createRuntime(onProgress) {
  onProgress?.({ phase: "init", detail: "models" });
  const [entityBuffer, relationBuffer] = await Promise.all([
    loadModelBuffer(GLINER_RELEX_ENTITY_MODEL_URL, GLINER_RELEX_ENTITY_MODEL_FILE, onProgress),
    loadModelBuffer(GLINER_RELEX_RELATION_MODEL_URL, GLINER_RELEX_RELATION_MODEL_FILE, onProgress),
  ]);

  const runtime = new OnnxRelexRuntime({
    entityModelUrl: entityBuffer,
    relationModelUrl: relationBuffer,
    tokenizerPath: GLINER_RELEX_REPO,
    specialTokensUrl: GLINER_RELEX_SPECIAL_TOKENS_URL,
    maxWidth: 12,
    maxEntities: 24,
    adjacencyThreshold: GLINER_RELEX_DEFAULT_ADJACENCY_THRESHOLD,
  });
  runtime.entityThreshold = GLINER_RELEX_DEFAULT_ENTITY_THRESHOLD;
  runtime.relationThreshold = GLINER_RELEX_DEFAULT_RELATION_THRESHOLD;

  onProgress?.({ phase: "init", detail: "sessions" });
  await runtime.init();
  return runtime;
}

export async function getGlinerRelexRuntime(onProgress) {
  if (!runtimePromise) {
    runtimePromise = createRuntime(onProgress).catch((error) => {
      runtimePromise = null;
      throw error;
    });
  }
  return runtimePromise;
}

function normalizeLabel(label) {
  if (typeof label === "string") {
    return label;
  }
  if (label && typeof label === "object") {
    return label.name || label.label || label.type || "misc";
  }
  return "misc";
}

function normalizeRelations(relations) {
  return (relations || []).map((relation) => ({
    head: {
      text: relation.head?.text || "",
      label: normalizeLabel(relation.head?.label ?? relation.head?.type),
      start: relation.head?.start,
      end: relation.head?.end,
      score: relation.head?.score,
    },
    tail: {
      text: relation.tail?.text || "",
      label: normalizeLabel(relation.tail?.label ?? relation.tail?.type),
      start: relation.tail?.start,
      end: relation.tail?.end,
      score: relation.tail?.score,
    },
    relation: relation.relation,
    score: relation.score,
  }));
}

function normalizeEntities(entities) {
  return (entities || [])
    .map((entity, index) => {
      const start = Number(entity.start);
      const end = Number(entity.end);
      const text = entity.text || "";
      if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start || !text) {
        return null;
      }
      return {
        id: entity.id || `relex-${index}-${start}-${end}`,
        start,
        end,
        text,
        label: normalizeLabel(entity.label),
        score: entity.score,
        source: "gliner-relex",
      };
    })
    .filter(Boolean);
}

function resolveEntityLabels(entityLabels) {
  const labels = (entityLabels || []).map(normalizeLabel).filter(Boolean);
  if (labels.length) {
    if (!labels.includes("person")) {
      labels.push("person");
    }
    return labels;
  }
  return [...GLINER_RELEX_BASIC_ENTITY_LABELS];
}

/**
 * Joint NER + relation extraction. One forward path for entities and the person graph.
 */
export async function runGlinerRelexDetection({
  text,
  entityLabels = GLINER_RELEX_BASIC_ENTITY_LABELS,
  relationLabels = GLINER_RELEX_RELATION_LABELS,
  onProgress,
} = {}) {
  const source = String(text || "").trim();
  if (!source) {
    return { entities: [], relations: [], model: GLINER_RELEX_MODEL_ID };
  }

  const runtime = await getGlinerRelexRuntime(onProgress);
  onProgress?.({ phase: "infer", detail: "relex" });

  const result = await runtime.run({
    text: source,
    entityLabels: resolveEntityLabels(entityLabels),
    relationLabels: relationLabels?.length ? relationLabels : GLINER_RELEX_RELATION_LABELS,
    return_relations: true,
  });

  return {
    entities: normalizeEntities(result.entities),
    relations: normalizeRelations(result.relations),
    model: GLINER_RELEX_MODEL_ID,
  };
}

/**
 * Split document into overlapping windows for ReLex (offsets stay absolute).
 * Prefers paragraph / sentence breaks so pairs stay in local context.
 */
export function splitTextForRelexChunks(
  text,
  maxChars = GLINER_RELEX_CHUNK_CHARS,
  overlap = GLINER_RELEX_CHUNK_OVERLAP,
) {
  const source = String(text || "");
  if (!source.length) {
    return [];
  }
  if (source.length <= maxChars) {
    return [{ text: source, start: 0 }];
  }

  const chunks = [];
  let start = 0;
  while (start < source.length) {
    let end = Math.min(source.length, start + maxChars);
    if (end < source.length) {
      const window = source.slice(start, end);
      const paraBreak = window.lastIndexOf("\n\n");
      const sentBreak = Math.max(
        window.lastIndexOf(". "),
        window.lastIndexOf("! "),
        window.lastIndexOf("? "),
        window.lastIndexOf(".\n"),
        window.lastIndexOf(";\n"),
      );
      const softMin = Math.floor(maxChars * 0.4);
      if (paraBreak >= softMin) {
        end = start + paraBreak + 2;
      } else if (sentBreak >= softMin) {
        end = start + sentBreak + 1;
      }
    }

    const slice = source.slice(start, end);
    if (slice.trim()) {
      chunks.push({ text: slice, start });
    }
    if (end >= source.length) {
      break;
    }
    const nextStart = Math.max(0, end - overlap);
    if (nextStart <= start) {
      start = end;
    } else {
      start = nextStart;
    }
  }

  return chunks;
}

function entitiesFullyInsideChunk(entities, chunkStart, chunkEnd) {
  return (entities || [])
    .filter((entity) => {
      const start = Number(entity.start);
      const end = Number(entity.end);
      return (
        Number.isFinite(start) &&
        Number.isFinite(end) &&
        end > start &&
        start >= chunkStart &&
        end <= chunkEnd
      );
    })
    .map((entity) => ({
      ...entity,
      start: Number(entity.start) - chunkStart,
      end: Number(entity.end) - chunkStart,
    }));
}

function offsetRelationsToDocument(relations, chunkStart) {
  return (relations || []).map((relation) => ({
    ...relation,
    head: {
      ...relation.head,
      start: Number.isFinite(relation.head?.start)
        ? Number(relation.head.start) + chunkStart
        : relation.head?.start,
      end: Number.isFinite(relation.head?.end)
        ? Number(relation.head.end) + chunkStart
        : relation.head?.end,
    },
    tail: {
      ...relation.tail,
      start: Number.isFinite(relation.tail?.start)
        ? Number(relation.tail.start) + chunkStart
        : relation.tail?.start,
      end: Number.isFinite(relation.tail?.end)
        ? Number(relation.tail.end) + chunkStart
        : relation.tail?.end,
    },
  }));
}

function dedupeRelationsByScore(relations) {
  const best = new Map();
  for (const relation of relations || []) {
    const key = [
      String(relation.relation || "").toLocaleLowerCase(),
      String(relation.head?.text || "").toLocaleLowerCase(),
      String(relation.tail?.text || "").toLocaleLowerCase(),
    ].join("\0");
    const previous = best.get(key);
    if (!previous || (Number(relation.score) || 0) > (Number(previous.score) || 0)) {
      best.set(key, relation);
    }
  }
  return [...best.values()];
}

/**
 * Relations over already-detected entities (Basic: GLiNER2-multi spans).
 * Runs ReLex on short overlapping windows — not the full document — so local
 * person↔attribute pairs are not drowned by document-wide entity/pair caps.
 * Does not replace the caller's NER list.
 */
export async function extractGlinerRelexRelations(text, entities = [], onProgress) {
  // Keep the exact document string used for NER offsets (do not trim).
  const source = String(text || "");
  if (!source.trim() || !entities?.length) {
    return [];
  }

  const labels = [];
  for (const entity of entities) {
    if (entity?.label) {
      labels.push(entity.label);
    }
  }
  if (!labels.length) {
    labels.push(...GLINER_LABELS);
  }
  const entityLabels = resolveEntityLabels(labels);

  const runtime = await getGlinerRelexRuntime(onProgress);
  const chunks = splitTextForRelexChunks(source);
  const collected = [];

  for (let index = 0; index < chunks.length; index += 1) {
    const chunk = chunks[index];
    const chunkEnd = chunk.start + chunk.text.length;
    const localEntities = entitiesFullyInsideChunk(entities, chunk.start, chunkEnd);
    if (localEntities.length < 2) {
      continue;
    }

    onProgress?.({
      phase: "infer",
      detail: "relex-relations",
      current: index + 1,
      total: chunks.length,
    });

    const result = await runtime.runRelationsOnEntities({
      text: chunk.text,
      entities: localEntities,
      entityLabels,
      relationLabels: GLINER_RELEX_RELATION_LABELS,
    });
    collected.push(
      ...offsetRelationsToDocument(normalizeRelations(result.relations), chunk.start),
    );
  }

  return dedupeRelationsByScore(collected);
}
