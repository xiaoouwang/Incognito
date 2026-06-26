import { useCallback, useRef, useState } from "react";
import { GLINER_DEFAULT_THRESHOLD } from "../lib/glinerConstants.js";
import { runGlinerDetection } from "../lib/glinerRuntime.js";

export function useGlinerWorker() {
  const runIdRef = useRef(0);
  const [jobProgress, setJobProgress] = useState(null);

  const detectEntities = useCallback((text, labels, threshold = GLINER_DEFAULT_THRESHOLD) => {
    const runId = runIdRef.current + 1;
    runIdRef.current = runId;

    setJobProgress({
      phase: "prepare",
      overallPercent: 0,
      indeterminate: false,
    });

    return runGlinerDetection(text, labels, (progress) => {
      if (runIdRef.current !== runId) {
        return;
      }
      setJobProgress(progress);
    }, threshold).finally(() => {
      if (runIdRef.current === runId) {
        setJobProgress(null);
      }
    });
  }, []);

  return {
    detectEntities,
    jobProgress,
  };
}
