/** Soft warning before running NER on long interviews / field notes. */
export const LONG_TEXT_WARN_CHARS = 15_000;

/** Optional truncated analysis size when the user chooses “first N characters”. */
export const LONG_TEXT_SAMPLE_CHARS = 20_000;

export function estimateGlinerChunkCount(textLength, chunkChars = 1000) {
  const n = Number(textLength) || 0;
  if (n <= 0) {
    return 0;
  }
  return Math.max(1, Math.ceil(n / chunkChars));
}

export function formatCharCount(count) {
  return new Intl.NumberFormat().format(Math.max(0, Math.floor(Number(count) || 0)));
}
