/**
 * Build a person graph from GLiNER-relex relations (Basic & Advanced).
 *
 * ReLex is the source of truth for person↔attribute links. Proximity from the
 * basic graph only fills gaps for surfaces ReLex did not attach. Each attribute
 * surface is owned by at most one person (best score / nearest mention).
 */

import {
  attrMetaForLabel,
  buildBasicPersonGraph,
  isPersonLabel,
  personSurfacesMatch,
} from "./basicPersonGraph.js";
import { GLINER_RELEX_ATTR_RELATIONS } from "./glinerRelexConstants.js";

function lower(value) {
  return String(value || "").toLocaleLowerCase();
}

function spanDistance(a0, a1, b0, b1) {
  if (a1 < b0) {
    return b0 - a1;
  }
  if (b1 < a0) {
    return a0 - b1;
  }
  return 0;
}

function findPersonIndex(persons, surface) {
  const target = String(surface || "").trim();
  if (!target) {
    return -1;
  }
  return persons.findIndex((person) => {
    if (personSurfacesMatch(person.name, target)) {
      return true;
    }
    return (person.aliases || []).some((alias) => personSurfacesMatch(alias, target));
  });
}

function pushUniqueAttr(person, attr) {
  const key = `${attr.key}:${lower(attr.value)}`;
  const exists = (person.attrs || []).some(
    (item) => `${item.key}:${lower(item.value)}` === key,
  );
  if (!exists) {
    person.attrs = [...(person.attrs || []), attr];
  }
}

function pushUniqueRel(person, rel) {
  const key = `${lower(rel.label)}:${lower(rel.target)}`;
  const exists = (person.rels || []).some(
    (item) => `${lower(item.label)}:${lower(item.target)}` === key,
  );
  if (!exists) {
    person.rels = [...(person.rels || []), rel];
  }
}

function ensurePerson(persons, surface, entities) {
  let index = findPersonIndex(persons, surface);
  if (index >= 0) {
    return index;
  }

  const entityHit = (entities || []).find(
    (entity) => isPersonLabel(entity.label) && lower(entity.text) === lower(surface),
  );
  if (!entityHit && !surface) {
    return -1;
  }

  const placeholder = `[PER_${persons.length + 1}]`;
  persons.push({
    name: surface,
    placeholder,
    aliases: [],
    corefs: [],
    attrs: [],
    rels: [],
    mentions: entityHit
      ? [{ start: entityHit.start, end: entityHit.end, text: entityHit.text }]
      : [],
  });
  return persons.length - 1;
}

function minDistanceToPerson(person, entities, surface) {
  const target = lower(surface);
  const surfaceSpans = (entities || []).filter(
    (entity) => lower(entity.text) === target,
  );
  const mentions =
    person.mentions ||
    (entities || []).filter(
      (entity) =>
        isPersonLabel(entity.label) &&
        (lower(entity.text) === lower(person.name) ||
          (person.aliases || []).some((alias) => lower(alias) === lower(entity.text))),
    );

  if (!surfaceSpans.length || !mentions.length) {
    return Number.POSITIVE_INFINITY;
  }

  let best = Number.POSITIVE_INFINITY;
  for (const mention of mentions) {
    for (const span of surfaceSpans) {
      best = Math.min(
        best,
        spanDistance(mention.start, mention.end, span.start, span.end),
      );
    }
  }
  return best;
}

/**
 * Keep each attribute surface on a single person.
 * Prefer ReLex over proximity, then higher score, then nearer mention.
 */
function enforceExclusiveAttributeOwnership(persons, entities) {
  const claims = new Map();

  persons.forEach((person, personIndex) => {
    (person.attrs || []).forEach((attr, attrIndex) => {
      const surface = lower(attr.value);
      if (!surface) {
        return;
      }
      const score = Number(attr.score);
      const entry = {
        personIndex,
        attrIndex,
        source: attr.source || "",
        score: Number.isFinite(score) ? score : 0,
        distance: minDistanceToPerson(person, entities, attr.value),
      };
      const list = claims.get(surface) || [];
      list.push(entry);
      claims.set(surface, list);
    });
  });

  const winners = new Map();
  for (const [surface, list] of claims.entries()) {
    if (list.length === 1) {
      winners.set(surface, list[0]);
      continue;
    }
    list.sort((left, right) => {
      const leftRelex = left.source === "gliner-relex" ? 0 : 1;
      const rightRelex = right.source === "gliner-relex" ? 0 : 1;
      if (leftRelex !== rightRelex) {
        return leftRelex - rightRelex;
      }
      if (right.score !== left.score) {
        return right.score - left.score;
      }
      return left.distance - right.distance;
    });
    winners.set(surface, list[0]);
  }

  for (const person of persons) {
    person.attrs = (person.attrs || []).filter((attr) => {
      const surface = lower(attr.value);
      const winner = winners.get(surface);
      if (!winner) {
        return true;
      }
      return persons[winner.personIndex] === person;
    });
  }
}

/**
 * @param {string} text
 * @param {Array} entities NER entities with label/start/end/text
 * @param {Array} relations ReLex relations: { head, tail, relation, score }
 * @param {{ fillProximity?: boolean }} [options]
 *   fillProximity — when false, skip proximity gap-fill entirely (ReLex-only).
 *   Default true: ReLex wins on claimed surfaces; proximity fills everyone else
 *   so PER_2+ are not left empty when ReLex only linked the first person.
 */
export function buildPersonGraphFromRelex(text, entities = [], relations = [], options = {}) {
  const fillProximity = options.fillProximity !== false;
  const base = buildBasicPersonGraph(text, entities, null);

  // Person clusters from entities; linking comes from ReLex first.
  // (buildBasicPersonGraph drops mentions — rebuild them for distance scoring.)
  const persons = base.persons.map((person) => {
    const nameKeys = new Set([
      lower(person.name),
      ...(person.aliases || []).map((alias) => lower(alias)),
    ]);
    const mentions = (entities || [])
      .filter(
        (entity) => isPersonLabel(entity.label) && nameKeys.has(lower(entity.text)),
      )
      .map((entity) => ({
        start: entity.start,
        end: entity.end,
        text: entity.text,
      }));
    return {
      ...person,
      aliases: [...(person.aliases || [])],
      corefs: [...(person.corefs || [])],
      attrs: [],
      rels: [],
      mentions,
    };
  });

  let applied = 0;

  for (const relation of relations || []) {
    const headText = relation?.head?.text || relation?.head?.spanText || "";
    const tailText = relation?.tail?.text || relation?.tail?.spanText || "";
    const relName = String(relation?.relation || "").trim();
    if (!headText || !tailText || !relName) {
      continue;
    }

    const headIsPerson =
      isPersonLabel(relation?.head?.label) ||
      isPersonLabel(relation?.head?.type) ||
      findPersonIndex(persons, headText) >= 0 ||
      (entities || []).some(
        (entity) => isPersonLabel(entity.label) && lower(entity.text) === lower(headText),
      );
    const tailIsPerson =
      isPersonLabel(relation?.tail?.label) ||
      isPersonLabel(relation?.tail?.type) ||
      findPersonIndex(persons, tailText) >= 0 ||
      (entities || []).some(
        (entity) => isPersonLabel(entity.label) && lower(entity.text) === lower(tailText),
      );

    if (!headIsPerson && !tailIsPerson) {
      continue;
    }

    let personSurface = headText;
    let otherSurface = tailText;
    let attrSideIsTail = true;
    if (!headIsPerson && tailIsPerson) {
      personSurface = tailText;
      otherSurface = headText;
      attrSideIsTail = false;
    }

    const personIndex = ensurePerson(persons, personSurface, entities);
    if (personIndex < 0) {
      continue;
    }
    const person = persons[personIndex];

    if (headIsPerson && tailIsPerson) {
      const otherIndex = ensurePerson(persons, otherSurface, entities);
      const other = otherIndex >= 0 ? persons[otherIndex] : null;
      pushUniqueRel(person, {
        label: relName,
        target: otherSurface,
        placeholder: other?.placeholder || "",
        score: relation.score,
        source: "gliner-relex",
      });
      applied += 1;
      continue;
    }

    const attrMeta =
      GLINER_RELEX_ATTR_RELATIONS[relName] ||
      attrMetaForLabel(
        attrSideIsTail
          ? relation?.tail?.label || relation?.tail?.type || "misc"
          : relation?.head?.label || relation?.head?.type || "misc",
      );

    pushUniqueAttr(person, {
      key: attrMeta.key,
      label: attrMeta.label || relName,
      value: otherSurface,
      score: relation.score,
      source: "gliner-relex",
      relation: relName,
      entityLabel: attrSideIsTail
        ? relation?.tail?.label || relation?.tail?.type
        : relation?.head?.label || relation?.head?.type,
    });
    applied += 1;
  }

  // Proximity gap-fill: surfaces ReLex already claimed stay on their owner;
  // everyone else still gets local proximity attrs (fixes empty PER_2+ cards
  // when ReLex only returned edges for the first person).
  if (fillProximity) {
    const claimed = new Set();
    for (const person of persons) {
      for (const attr of person.attrs || []) {
        claimed.add(lower(attr.value));
      }
      for (const rel of person.rels || []) {
        claimed.add(lower(rel.target));
      }
    }
    for (const basePerson of base.persons) {
      const person = persons.find((item) => item.placeholder === basePerson.placeholder);
      if (!person) {
        continue;
      }
      for (const attr of basePerson.attrs || []) {
        const surface = lower(attr.value);
        if (!surface || claimed.has(surface)) {
          continue;
        }
        const relexHasKey = (person.attrs || []).some(
          (item) => item.source === "gliner-relex" && item.key === attr.key,
        );
        if (relexHasKey) {
          continue;
        }
        pushUniqueAttr(person, { ...attr, source: attr.source || "proximity" });
        claimed.add(surface);
      }
    }

    enforceExclusiveAttributeOwnership(persons, entities);
  }

  // ReLex may append people via ensurePerson; keep chip order = first in text.
  persons.sort((left, right) => {
    const minStart = (person) =>
      person.mentions?.length
        ? Math.min(...person.mentions.map((mention) => mention.start))
        : Number.POSITIVE_INFINITY;
    return minStart(left) - minStart(right);
  });

  for (const person of persons) {
    delete person.mentions;
  }

  return {
    persons,
    groups: base.groups,
    usedDependencyParse: false,
    usedRelex: true,
    relexRelationCount: applied,
  };
}
