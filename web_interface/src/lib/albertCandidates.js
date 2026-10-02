/**
 * Lightweight candidate span extraction for Albert generative mode.
 * The model only returns candidate IDs; the client resolves substrings.
 */

const EMAIL_RE = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
const PHONE_RE = /(?:\+33|0)\s*[1-9](?:[\s.-]*\d{2}){4}/g;
const IBAN_RE = /\b[A-Z]{2}\d{2}(?:\s*\d{4}){2,8}\b/g;
const ID_RE = /\b[A-Z]{1,4}-\d{4}-\d{2,6}\b/g;
const DATE_LONG_RE =
  /\b\d{1,2}\s+(?:janvier|février|fevrier|mars|avril|mai|juin|juillet|août|aout|septembre|octobre|novembre|décembre|decembre)\s+\d{4}\b/gi;
const DATE_YEAR_RE = /\b(?:19|20)\d{2}\b/g;
const MONTH_YEAR_RE =
  /\b(?:janvier|février|fevrier|mars|avril|mai|juin|juillet|août|aout|septembre|octobre|novembre|décembre|decembre)\s+\d{4}\b/gi;
const ADDR_RE =
  /\b\d{1,4}\s+(?:rue|avenue|av\.|bd|boulevard|impasse|place|chemin|allée|allee|cours)\b[^,.\n]{3,60}(?:,\s*\d{5}\s+[A-ZÀ-Ü][A-Za-zà-ü'-]+)?/gi;
/** Proper-name-like sequences, allowing de/du/des connectors. */
const NAME_RE =
  /\b(?:[A-ZÀ-Ü](?:\.|[a-zà-ü'’-]*)(?:\s+(?:de|du|des|la|le)\s+[A-ZÀ-Ü](?:\.|[a-zà-ü'’-]*)|\s+[A-ZÀ-Ü](?:\.|[a-zà-ü'’-]*)){0,5})\b/g;
/** All-caps orgs / acronyms (LIRIS, CNRS, …). */
const ALLCAPS_RE = /\b[A-Z]{2,12}\b/g;
const ALLCAPS_STOP = new Set([
  "RH",
  "IBAN",
  "FR",
  "CM",
  "DR",
  "PDF",
  "OK",
  "CE",
  "SE",
  "LE",
  "LA",
  "LES",
  "DES",
  "UNE",
  "UN",
]);
const CORE_PHRASE_RE =
  /\b(?:l['’]intéressée|la titulaire du dossier\s+[A-Z0-9-]+|M(?:me|\.)\s+[A-ZÀ-Ü][a-zà-ü'’-]+)\b/gi;
const ROOM_RE = /\bbureau\s+(\d{2,4})\b/gi;

function pushSpan(spans, start, end, text, kind) {
  if (start < 0 || end <= start || end > text.length) {
    return;
  }
  const value = text.slice(start, end);
  if (!value.trim()) {
    return;
  }
  spans.push({ start, end, text: value, kind });
}

function collectRegex(spans, text, regex, kind) {
  regex.lastIndex = 0;
  let match = regex.exec(text);
  while (match) {
    pushSpan(spans, match.index, match.index + match[0].length, text, kind);
    match = regex.exec(text);
  }
}

function overlaps(left, right) {
  return left.start < right.end && right.start < left.end;
}

/**
 * Extract candidate spans, longest-first, de-duplicated by exact range.
 * Returns [{ id, start, end, text, kind }]
 */
export function extractAlbertCandidates(sourceText) {
  if (!sourceText) {
    return [];
  }

  const raw = [];
  collectRegex(raw, sourceText, EMAIL_RE, "em");
  collectRegex(raw, sourceText, PHONE_RE, "tel");
  collectRegex(raw, sourceText, IBAN_RE, "iban");
  collectRegex(raw, sourceText, ID_RE, "id");
  collectRegex(raw, sourceText, DATE_LONG_RE, "dat");
  collectRegex(raw, sourceText, MONTH_YEAR_RE, "dat");
  collectRegex(raw, sourceText, ADDR_RE, "addr");
  collectRegex(raw, sourceText, CORE_PHRASE_RE, "coref");
  collectRegex(raw, sourceText, NAME_RE, "name");
  collectRegex(raw, sourceText, DATE_YEAR_RE, "yob");

  ALLCAPS_RE.lastIndex = 0;
  let caps = ALLCAPS_RE.exec(sourceText);
  while (caps) {
    if (!ALLCAPS_STOP.has(caps[0])) {
      pushSpan(raw, caps.index, caps.index + caps[0].length, sourceText, "org");
    }
    caps = ALLCAPS_RE.exec(sourceText);
  }

  ROOM_RE.lastIndex = 0;
  let room = ROOM_RE.exec(sourceText);
  while (room) {
    const digits = room[1];
    const start = room.index + room[0].indexOf(digits);
    pushSpan(raw, start, start + digits.length, sourceText, "room");
    room = ROOM_RE.exec(sourceText);
  }

  // Prefer longer spans; drop exact duplicate ranges; keep nested shorter
  // forms when useful (e.g. "Claire" inside "Claire Martin") via separate
  // single-token names already captured by NAME_RE.
  raw.sort((a, b) => b.end - b.start - (a.end - a.start) || a.start - b.start);

  const unique = [];
  const seenRange = new Set();
  for (const span of raw) {
    const key = `${span.start}:${span.end}`;
    if (seenRange.has(key)) {
      continue;
    }
    seenRange.add(key);
    unique.push(span);
  }

  // Stable reading order for model + ids
  unique.sort((a, b) => a.start - b.start || b.end - a.end);

  return unique.map((span, id) => ({
    id,
    start: span.start,
    end: span.end,
    text: span.text,
    kind: span.kind,
  }));
}

/** Compact list for the prompt — one candidate per line: id|text */
export function formatAlbertCandidateList(candidates, { maxChars = 8000 } = {}) {
  const lines = [];
  let used = 0;
  for (const candidate of candidates) {
    const line = `${candidate.id}|${candidate.text}`;
    if (used + line.length + 1 > maxChars) {
      break;
    }
    lines.push(line);
    used += line.length + 1;
  }
  return lines.join("\n");
}

export function candidateMap(candidates) {
  const byId = new Map();
  for (const candidate of candidates) {
    byId.set(candidate.id, candidate);
  }
  return byId;
}
