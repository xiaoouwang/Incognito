/** Soft page size for long interview / field-note review in the UI. */
export const TEXT_PAGE_TARGET_CHARS = 4500;

/**
 * Split source text into contiguous pages near `targetChars`, preferring
 * paragraph, line, then sentence boundaries so pages stay readable.
 * @returns {{ start: number, end: number, text: string }[]}
 */
export function splitTextIntoPages(text, targetChars = TEXT_PAGE_TARGET_CHARS) {
  const source = String(text || "");
  if (!source) {
    return [];
  }
  if (source.length <= targetChars) {
    return [{ start: 0, end: source.length, text: source }];
  }

  const pages = [];
  let cursor = 0;

  while (cursor < source.length) {
    const remaining = source.length - cursor;
    if (remaining <= targetChars) {
      pages.push({
        start: cursor,
        end: source.length,
        text: source.slice(cursor),
      });
      break;
    }

    const idealEnd = cursor + targetChars;
    let breakAt = findPageBreak(source, cursor, idealEnd);

    // Avoid a tiny final page: merge the remainder into this page.
    if (source.length - breakAt < Math.floor(targetChars * 0.3)) {
      breakAt = source.length;
    }

    if (breakAt <= cursor) {
      breakAt = Math.min(source.length, cursor + targetChars);
    }

    pages.push({
      start: cursor,
      end: breakAt,
      text: source.slice(cursor, breakAt),
    });
    cursor = breakAt;
  }

  return pages;
}

function findPageBreak(text, start, idealEnd) {
  const minBreak = start + Math.floor((idealEnd - start) * 0.55);
  const windowText = text.slice(minBreak, idealEnd + 1);

  const paragraph = windowText.lastIndexOf("\n\n");
  if (paragraph >= 0) {
    return minBreak + paragraph + 2;
  }

  const line = windowText.lastIndexOf("\n");
  if (line >= 0) {
    return minBreak + line + 1;
  }

  for (const marker of [". ", "! ", "? ", "; ", ": ", ", "]) {
    const index = windowText.lastIndexOf(marker);
    if (index >= 0) {
      return minBreak + index + marker.length;
    }
  }

  const space = windowText.lastIndexOf(" ");
  if (space >= 0) {
    return minBreak + space + 1;
  }

  return idealEnd;
}

/**
 * Clip entities to a source page and shift offsets to page-local coordinates.
 */
export function sliceEntitiesForPage(entities, pageStart, pageEnd) {
  const start = Number(pageStart) || 0;
  const end = Number(pageEnd) || 0;
  if (end <= start) {
    return [];
  }

  return (entities || [])
    .filter((entity) => {
      const entityStart = Number(entity.start);
      const entityEnd = Number(entity.end);
      return (
        Number.isFinite(entityStart) &&
        Number.isFinite(entityEnd) &&
        entityEnd > start &&
        entityStart < end
      );
    })
    .map((entity) => {
      const clippedStart = Math.max(Number(entity.start), start);
      const clippedEnd = Math.min(Number(entity.end), end);
      return {
        ...entity,
        start: clippedStart - start,
        end: clippedEnd - start,
        text:
          clippedStart !== Number(entity.start) || clippedEnd !== Number(entity.end)
            ? String(entity.text || "").slice(
                clippedStart - Number(entity.start),
                clippedEnd - Number(entity.start),
              )
            : entity.text,
      };
    });
}

/**
 * Shift absolute focus ranges into page-local coordinates (dropped if outside).
 */
export function sliceFocusRangesForPage(ranges, pageStart, pageEnd) {
  const start = Number(pageStart) || 0;
  const end = Number(pageEnd) || 0;
  return (ranges || [])
    .filter((range) => range && range.end > start && range.start < end)
    .map((range) => ({
      ...range,
      start: Math.max(range.start, start) - start,
      end: Math.min(range.end, end) - start,
    }));
}
