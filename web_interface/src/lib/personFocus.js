import { findAllOccurrenceRanges } from "./entityUtils.js";

export function collectPersonSurfaces(person) {
  const surfaces = [];
  const seen = new Set();
  function push(value) {
    const text = String(value || "").trim();
    if (!text) {
      return;
    }
    const key = text.toLocaleLowerCase();
    if (seen.has(key)) {
      return;
    }
    seen.add(key);
    surfaces.push(text);
  }

  push(person?.name);
  for (const alias of person?.aliases || []) {
    push(alias);
  }
  for (const coref of person?.corefs || []) {
    push(coref);
  }
  for (const attr of person?.attrs || []) {
    push(attr.value);
  }
  return surfaces.sort((left, right) => right.length - left.length);
}

function mergeCharRanges(ranges) {
  if (!ranges.length) {
    return [];
  }
  const ordered = [...ranges].sort(
    (left, right) => left.start - right.start || left.end - right.end,
  );
  const merged = [{ ...ordered[0] }];
  for (let index = 1; index < ordered.length; index += 1) {
    const current = ordered[index];
    const last = merged[merged.length - 1];
    if (current.start <= last.end) {
      last.end = Math.max(last.end, current.end);
      continue;
    }
    merged.push({ ...current });
  }
  return merged;
}

/**
 * Character ranges in `text` that belong to a person node (name, aliases, attrs).
 * Longer surfaces are matched first so "Claire Martin" wins over "Claire".
 */
export function buildPersonFocusRanges(text, person) {
  if (!text || !person) {
    return [];
  }
  const ranges = [];
  for (const surface of collectPersonSurfaces(person)) {
    ranges.push(...findAllOccurrenceRanges(text, surface));
  }
  return mergeCharRanges(ranges.map((range) => ({ start: range.start, end: range.end })));
}

export function rangeOverlaps(start, end, ranges) {
  return (ranges || []).some((range) => start < range.end && range.start < end);
}

/** Split a plain [start,end) interval against focus ranges; focused pieces get focused:true. */
export function splitRangeByFocus(start, end, focusRanges) {
  if (!focusRanges?.length || start >= end) {
    return [{ start, end, focused: false }];
  }

  const cuts = new Set([start, end]);
  for (const range of focusRanges) {
    if (range.end <= start || range.start >= end) {
      continue;
    }
    cuts.add(Math.max(start, range.start));
    cuts.add(Math.min(end, range.end));
  }
  const points = [...cuts].sort((left, right) => left - right);
  const pieces = [];
  for (let index = 0; index < points.length - 1; index += 1) {
    const pieceStart = points[index];
    const pieceEnd = points[index + 1];
    if (pieceStart >= pieceEnd) {
      continue;
    }
    pieces.push({
      start: pieceStart,
      end: pieceEnd,
      focused: rangeOverlaps(pieceStart, pieceEnd, focusRanges),
    });
  }
  return pieces.length ? pieces : [{ start, end, focused: false }];
}
