/**
 * Off-main-thread GLiNER2-PII ONNX / GLiNER2-multi detection.
 * Keeps WASM inference from freezing the UI on long interviews.
 */

self.addEventListener("message", async (event) => {
  const { type, id, engine, text, labels, labelMap, threshold } = event.data || {};
  if (type !== "detect" || !id) {
    return;
  }

  const onProgress = (progress) => {
    self.postMessage({ type: "progress", id, progress });
  };

  try {
    let result;
    if (engine === "gliner2-pii-onnx") {
      const { runGliner2PiiOnnxDetection } = await import("./lib/gliner2PiiOnnxService.js");
      result = await runGliner2PiiOnnxDetection({
        text,
        labels,
        threshold,
        onProgress,
      });
    } else {
      const { runGliner2MultiDetection } = await import("./lib/gliner2MultiService.js");
      result = await runGliner2MultiDetection({
        text,
        labelMap,
        threshold,
        onProgress,
      });
    }
    self.postMessage({ type: "result", id, result });
  } catch (error) {
    self.postMessage({
      type: "error",
      id,
      error: error instanceof Error ? error.message : String(error),
    });
  }
});
