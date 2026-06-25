import { useCallback, useEffect, useRef, useState } from "react";

export function useNerWorker() {
  const workerRef = useRef(null);
  const pendingRef = useRef(new Map());
  const [progressItems, setProgressItems] = useState([]);
  const [modelReady, setModelReady] = useState(null);

  useEffect(() => {
    const worker = new Worker(new URL("../nerWorker.js", import.meta.url), {
      type: "module",
    });
    workerRef.current = worker;

    const onMessage = (event) => {
      const data = event.data;

      if (data.type === "model-progress") {
        const progress = data.progress;
        if (!progress?.status) {
          return;
        }

        switch (progress.status) {
          case "initiate":
            setModelReady(false);
            setProgressItems((current) => {
              const exists = current.some(
                (item) => item.file === progress.file || item.name === progress.name,
              );
              if (exists) {
                return current;
              }
              return [...current, { ...progress, progress: 0 }];
            });
            break;
          case "progress":
            setProgressItems((current) =>
              current.map((item) =>
                item.file === progress.file || item.name === progress.name
                  ? { ...item, ...progress }
                  : item,
              ),
            );
            break;
          case "done":
            setProgressItems((current) =>
              current.filter((item) => item.file !== progress.file),
            );
            break;
          case "ready":
            setModelReady(true);
            break;
          default:
            break;
        }
        return;
      }

      const pending = pendingRef.current.get(data.id);
      if (!pending) {
        return;
      }

      if (data.type === "result") {
        pending.resolve(data.result);
        pendingRef.current.delete(data.id);
      } else if (data.type === "error") {
        pending.reject(new Error(data.error || "NER detection failed."));
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

  const detectEntities = useCallback((text, backend, customModelId = "") => {
    const worker = workerRef.current;
    if (!worker) {
      return Promise.reject(new Error("NER worker is not available."));
    }

    return new Promise((resolve, reject) => {
      const id = crypto.randomUUID();
      pendingRef.current.set(id, { resolve, reject });
      worker.postMessage({ type: "detect", id, text, backend, customModelId });
    });
  }, []);

  return {
    detectEntities,
    progressItems,
    modelReady,
  };
}
