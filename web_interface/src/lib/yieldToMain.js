/**
 * Let the event loop paint / flush worker messages between heavy chunks.
 * Prefer scheduler.yield when available (Chrome); fall back to setTimeout(0).
 */
export function yieldToMain() {
  if (typeof scheduler !== "undefined" && typeof scheduler.yield === "function") {
    return scheduler.yield();
  }
  return new Promise((resolve) => {
    setTimeout(resolve, 0);
  });
}
