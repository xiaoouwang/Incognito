import createUDPipe from "udpipe-wasm/udpipe.glue.cjs";
import wasmUrl from "udpipe-wasm/udpipe.wasm?url";
import {
  UDPIPE_CACHE_NAME,
  UDPIPE_FRENCH_MODEL_URL,
} from "./lib/udpipeConstants.js";
import { alignTokensToText, parseConlluSentences } from "./lib/udpipeAlign.js";

let modulePromise = null;
let modelReady = false;

async function fetchModelBytes(url, onProgress) {
  if (typeof caches !== "undefined") {
    try {
      const cache = await caches.open(UDPIPE_CACHE_NAME);
      const cached = await cache.match(url);
      if (cached) {
        onProgress?.({ status: "ready", file: "french-gsd.udpipe", fromCache: true });
        return new Uint8Array(await cached.arrayBuffer());
      }
    } catch {
      // Cache API may be unavailable in some worker contexts.
    }
  }

  onProgress?.({ status: "initiate", file: "french-gsd.udpipe", name: "UDPipe French-GSD" });
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`UDPipe model fetch failed (${response.status})`);
  }

  const total = Number(response.headers.get("content-length") || 0);
  if (!response.body || !total) {
    const bytes = new Uint8Array(await response.arrayBuffer());
    await storeModel(url, bytes);
    onProgress?.({ status: "done", file: "french-gsd.udpipe" });
    return bytes;
  }

  const reader = response.body.getReader();
  const chunks = [];
  let received = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }
    chunks.push(value);
    received += value.length;
    onProgress?.({
      status: "progress",
      file: "french-gsd.udpipe",
      name: "UDPipe French-GSD",
      progress: Math.min(100, Math.round((received / total) * 100)),
      loaded: received,
      total,
    });
  }

  const bytes = new Uint8Array(received);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  await storeModel(url, bytes);
  onProgress?.({ status: "done", file: "french-gsd.udpipe" });
  return bytes;
}

async function storeModel(url, bytes) {
  if (typeof caches === "undefined") {
    return;
  }
  try {
    const cache = await caches.open(UDPIPE_CACHE_NAME);
    await cache.put(url, new Response(bytes, { headers: { "Content-Type": "application/octet-stream" } }));
  } catch {
    // Ignore cache write failures.
  }
}

async function getModule(onProgress) {
  if (!modulePromise) {
    modulePromise = (async () => {
      const mod = await createUDPipe({
        locateFile: (file) => (file.endsWith(".wasm") ? wasmUrl : file),
      });
      const bytes = await fetchModelBytes(UDPIPE_FRENCH_MODEL_URL, onProgress);
      mod.FS.writeFile("/model.udpipe", bytes);
      if (!mod.initModel("/model.udpipe")) {
        modulePromise = null;
        throw new Error("UDPipe French model failed to initialize.");
      }
      modelReady = true;
      onProgress?.({ status: "ready", file: "french-gsd.udpipe" });
      return mod;
    })().catch((error) => {
      modulePromise = null;
      modelReady = false;
      throw error;
    });
  }
  return modulePromise;
}

function parseTextToSentences(mod, text) {
  const conllu = mod.parseToConllu(text);
  if (typeof conllu === "string" && conllu.startsWith("ERROR:")) {
    throw new Error(conllu.slice(7).trim());
  }

  const sentenceTokenLists = parseConlluSentences(conllu);
  const sentences = [];
  let cursor = 0;

  for (const tokens of sentenceTokenLists) {
    const slice = text.slice(cursor);
    const aligned = alignTokensToText(slice, tokens).map((token) =>
      token.start >= 0
        ? {
            ...token,
            start: token.start + cursor,
            end: token.end + cursor,
          }
        : token,
    );

    const valid = aligned.filter((token) => token.start >= 0);
    if (valid.length) {
      cursor = Math.max(cursor, ...valid.map((token) => token.end));
    }

    sentences.push({
      tokens: aligned,
      start: valid.length ? Math.min(...valid.map((token) => token.start)) : cursor,
      end: valid.length ? Math.max(...valid.map((token) => token.end)) : cursor,
    });
  }

  return sentences;
}

self.addEventListener("message", async (event) => {
  const { type, id, text } = event.data || {};

  if (type === "warmup") {
    try {
      await getModule((progress) => {
        self.postMessage({ type: "model-progress", id, progress });
      });
      self.postMessage({ type: "result", id, result: { ready: true } });
    } catch (error) {
      self.postMessage({
        type: "error",
        id,
        error: error instanceof Error ? error.message : String(error),
      });
    }
    return;
  }

  if (type !== "parse") {
    return;
  }

  try {
    const mod = await getModule((progress) => {
      self.postMessage({ type: "model-progress", id, progress });
    });
    const sentences = parseTextToSentences(mod, String(text || ""));
    self.postMessage({
      type: "result",
      id,
      result: {
        ready: modelReady,
        sentences,
      },
    });
  } catch (error) {
    self.postMessage({
      type: "error",
      id,
      error: error instanceof Error ? error.message : String(error),
    });
  }
});
