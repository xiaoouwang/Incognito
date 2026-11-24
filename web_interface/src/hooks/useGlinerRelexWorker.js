import { useCallback, useEffect, useRef } from "react";

/**
 * Run GLiNER ReLex relation extraction off the main thread.
 */
export function useGlinerRelexWorker() {
  const workerRef = useRef(null);
  const pendingRef = useRef(new Map());

  useEffect(() => {
    const worker = new Worker(new URL("../glinerRelexWorker.js", import.meta.url), {
      type: "module",
    });
    workerRef.current = worker;

    const onMessage = (event) => {
      const data = event.data;
      const pending = pendingRef.current.get(data.id);
      if (!pending) {
        return;
      }

      if (data.type === "progress") {
        pending.onProgress?.(data.progress);
        return;
      }

      if (data.type === "result") {
        pending.resolve(data.result || []);
        pendingRef.current.delete(data.id);
      } else if (data.type === "error") {
        pending.reject(new Error(data.error || "GLiNER ReLex failed."));
        pendingRef.current.delete(data.id);
      }
    };

    worker.addEventListener("message", onMessage);
    return () => {
      worker.removeEventListener("message", onMessage);
      worker.terminate();
      workerRef.current = null;
      pendingRef.current.clear();
    };
  }, []);

  const extractRelations = useCallback(({ text, entities, onProgress } = {}) => {
    const worker = workerRef.current;
    if (!worker) {
      return Promise.reject(new Error("GLiNER ReLex worker is not available."));
    }

    return new Promise((resolve, reject) => {
      const id = crypto.randomUUID();
      pendingRef.current.set(id, { resolve, reject, onProgress });
      worker.postMessage({
        type: "relex",
        id,
        text,
        entities,
      });
    });
  }, []);

  return { extractRelations };
}
