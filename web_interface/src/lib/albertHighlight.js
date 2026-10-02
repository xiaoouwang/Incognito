/**
 * Build highlight spans + relation edges for generative source view.
 */

const PERSON_COLOR_COUNT = 8;

export function personColorIndex(personIndex) {
  return ((personIndex % PERSON_COLOR_COUNT) + PERSON_COLOR_COUNT) % PERSON_COLOR_COUNT;
}

function findOccurrences(text, needle) {
  if (!text || !needle) {
    return [];
  }
  const hits = [];
  let from = 0;
  while (from < text.length) {
    const index = text.indexOf(needle, from);
    if (index < 0) {
      break;
    }
    hits.push({ start: index, end: index + needle.length, text: needle });
    from = index + Math.max(1, needle.length);
  }
  return hits;
}

function uniqueLongestFirst(values) {
  const seen = new Set();
  const unique = [];
  for (const value of values) {
    if (!value || seen.has(value)) {
      continue;
    }
    seen.add(value);
    unique.push(value);
  }
  return unique.sort((left, right) => right.length - left.length);
}

/**
 * @returns {{
 *   segments: Array<{start:number,end:number,text:string,entity?:object}>,
 *   relations: Array<{id:string,fromPerson:number,toPerson:number,label:string,colorIndex:number}>,
 *   personMeta: Array<{index:number,name:string,placeholder:string,colorIndex:number}>
 * }}
 */
export function buildGenerativeHighlightModel(
  text,
  persons = [],
  excludedPlaceholders = {},
  excludedSurfaces = {},
) {
  if (!text || !persons.length) {
    return {
      segments: text ? [{ start: 0, end: text.length, text }] : [],
      relations: [],
      personMeta: [],
    };
  }

  const personMeta = persons.map((person, index) => ({
    index,
    name: person.name,
    placeholder: person.placeholder,
    colorIndex: personColorIndex(index),
    excluded: Boolean(excludedPlaceholders[person.placeholder]),
  }));

  /** @type {Array<{start:number,end:number,text:string,kind:string,personIndex:number,label:string,placeholder:string,excluded:boolean}>} */
  const rawSpans = [];

  persons.forEach((person, personIndex) => {
    const surfaces = uniqueLongestFirst([
      person.name,
      ...(person.aliases || []),
      ...(person.corefs || []),
    ]);
    for (const surface of surfaces) {
      const surfaceExcluded =
        Boolean(excludedPlaceholders[person.placeholder]) ||
        Boolean(excludedSurfaces[`${person.placeholder}::${surface}`]);
      for (const hit of findOccurrences(text, surface)) {
        rawSpans.push({
          ...hit,
          kind: "person",
          personIndex,
          label: person.placeholder || `PER_${personIndex + 1}`,
          placeholder: person.placeholder,
          excluded: surfaceExcluded,
        });
      }
    }

    for (const attr of person.attrs || []) {
      if (!attr?.value || attr.inSource === false) {
        continue;
      }
      const attrExcluded =
        Boolean(excludedPlaceholders[attr.placeholder]) ||
        Boolean(excludedSurfaces[`${attr.placeholder || person.placeholder}::${attr.value}`]) ||
        Boolean(excludedPlaceholders[person.placeholder]);
      for (const hit of findOccurrences(text, attr.value)) {
        rawSpans.push({
          ...hit,
          kind: "attr",
          personIndex,
          label: attr.label || attr.key,
          placeholder: attr.placeholder || "",
          excluded: attrExcluded,
        });
      }
    }
  });

  rawSpans.sort((left, right) => right.end - right.start - (left.end - left.start) || left.start - right.start);
  const accepted = [];
  for (const span of rawSpans) {
    const overlaps = accepted.some(
      (other) => span.start < other.end && other.start < span.end,
    );
    if (!overlaps) {
      accepted.push(span);
    }
  }
  accepted.sort((left, right) => left.start - right.start || right.end - left.end);

  const segments = [];
  let cursor = 0;
  for (const span of accepted) {
    if (span.start > cursor) {
      segments.push({
        start: cursor,
        end: span.start,
        text: text.slice(cursor, span.start),
      });
    }
    segments.push({
      start: span.start,
      end: span.end,
      text: span.text,
      entity: {
        kind: span.kind,
        personIndex: span.personIndex,
        colorIndex: personColorIndex(span.personIndex),
        label: span.label,
        placeholder: span.placeholder,
        excluded: span.excluded,
      },
    });
    cursor = span.end;
  }
  if (cursor < text.length) {
    segments.push({
      start: cursor,
      end: text.length,
      text: text.slice(cursor),
    });
  }

  return { segments, relations: [], personMeta };
}
