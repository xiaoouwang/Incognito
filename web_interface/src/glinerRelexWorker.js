/**
 * Off-main-thread GLiNER ReLex relation extraction (Advanced person graph).
 */

self.addEventListener("message", async (event) => {
  const { type, id, text, entities } = event.data || {};
  if (type !== "relex" || !id) {
    return;
  }

  const onProgress = (progress) => {
    self.postMessage({ type: "progress", id, progress });
  };

  try {
    const { extractGlinerRelexRelations } = await import("./lib/glinerRelexService.js");
    const relations = await extractGlinerRelexRelations(text, entities, onProgress);
    self.postMessage({ type: "result", id, result: relations });
  } catch (error) {
    self.postMessage({
      type: "error",
      id,
      error: error instanceof Error ? error.message : String(error),
    });
  }
});
