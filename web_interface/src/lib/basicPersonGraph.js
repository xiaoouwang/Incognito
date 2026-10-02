/**
 * Build a generative-style person graph from Basic NER spans + optional UDPipe deps.
 *
 * UDPipe alone rarely links attributes *directly* under a person (e.g. Paris is obl of
 * the verb, Claire is nsubj). We therefore also:
 * - share arguments under the same verbal governor
 * - always merge same-sentence / nearby NER proximity attachments
 */

import { childrenOf } from "./udpipeAlign.js";

const PERSON_LABELS = new Set(["person"]);

const LABEL_TO_ATTR = {
  location: { key: "loc", label: "lieu" },
  organization: { key: "org", label: "organisation" },
  date: { key: "dob", label: "date" },
  email: { key: "em", label: "email" },
  phone: { key: "tel", label: "téléphone" },
  "phone number": { key: "tel", label: "téléphone" },
  address: { key: "addr", label: "adresse" },
  url: { key: "url", label: "url" },
  profession: { key: "job", label: "profession" },
  "job title or project role": { key: "job", label: "fonction" },
  school: { key: "org", label: "école" },
  hospital: { key: "org", label: "hôpital" },
  "family member": { key: "family", label: "famille" },
  nationality: { key: "nat", label: "nationalité" },
  disease: { key: "misc", label: "maladie" },
  diploma: { key: "misc", label: "diplôme" },
  misc: { key: "misc", label: "autre" },
};

export function isPersonLabel(label) {
  return PERSON_LABELS.has(label);
}

export function attrMetaForLabel(label) {
  return LABEL_TO_ATTR[label] || LABEL_TO_ATTR.misc;
}

export function findSurfaceOwnerPlaceholder(persons, surface) {
  const lower = String(surface || "").toLocaleLowerCase();
  if (!lower) {
    return null;
  }
  for (const person of persons || []) {
    if (String(person.name || "").toLocaleLowerCase() === lower) {
      return person.placeholder;
    }
    if ((person.aliases || []).some((alias) => String(alias).toLocaleLowerCase() === lower)) {
      return person.placeholder;
    }
    if ((person.corefs || []).some((coref) => String(coref).toLocaleLowerCase() === lower)) {
      return person.placeholder;
    }
    if ((person.attrs || []).some((attr) => String(attr.value || "").toLocaleLowerCase() === lower)) {
      return person.placeholder;
    }
  }
  return null;
}

/**
 * Manual relation pins that survive auto rebuilds.
 * overrides: { [surfaceLower]: { placeholder, surface, entityLabel, asAlias? } }
 */
export function applyRelationOverrides(persons, overrides) {
  if (!persons?.length || !overrides || !Object.keys(overrides).length) {
    return persons;
  }

  const next = persons.map((person) => ({
    ...person,
    aliases: [...(person.aliases || [])],
    corefs: [...(person.corefs || [])],
    attrs: [...(person.attrs || [])],
  }));
  const overrideLowers = new Set(Object.keys(overrides));

  for (const person of next) {
    person.attrs = person.attrs.filter(
      (attr) => !overrideLowers.has(String(attr.value || "").toLocaleLowerCase()),
    );
    person.aliases = person.aliases.filter(
      (alias) => !overrideLowers.has(String(alias || "").toLocaleLowerCase()),
    );
    person.corefs = person.corefs.filter(
      (coref) => !overrideLowers.has(String(coref || "").toLocaleLowerCase()),
    );
  }

  for (const override of Object.values(overrides)) {
    const target = next.find((person) => person.placeholder === override.placeholder);
    if (!target) {
      continue;
    }
    const surface = override.surface || "";
    if (!surface) {
      continue;
    }
    const surfaceLower = surface.toLocaleLowerCase();
    const asAlias = Boolean(override.asAlias) || isPersonLabel(override.entityLabel);

    if (asAlias) {
      if (String(target.name || "").toLocaleLowerCase() !== surfaceLower) {
        uniquePush(target.aliases, surface);
      }
      continue;
    }

    if (target.attrs.some((attr) => String(attr.value || "").toLocaleLowerCase() === surfaceLower)) {
      continue;
    }
    const meta = attrMetaForLabel(override.entityLabel);
    target.attrs.push({
      key: meta.key,
      label: meta.label,
      value: surface,
      inSource: true,
      entityLabel: override.entityLabel || "misc",
    });
  }

  return next.filter((person) => {
    const override = overrides[String(person.name || "").toLocaleLowerCase()];
    if (!override) {
      return true;
    }
    const asAlias = Boolean(override.asAlias) || isPersonLabel(override.entityLabel);
    return !(asAlias && override.placeholder !== person.placeholder);
  });
}

const ATTACH_DEPRELS = new Set([
  "nmod",
  "nmod:arg",
  "nmod:poss",
  "obl",
  "obl:arg",
  "obl:mod",
  "appos",
  "amod",
  "acl",
  "acl:relcl",
  "conj",
  "obj",
  "iobj",
  "xcomp",
]);

const NAME_DEPRELS = new Set(["flat", "flat:name", "fixed", "compound"]);

const GOVERNOR_SHARE_DEPRELS = new Set([
  "obl",
  "obl:arg",
  "obl:mod",
  "nmod",
  "nmod:arg",
  "nmod:poss",
  "obj",
  "iobj",
  "xcomp",
  "appos",
]);

const PROXIMITY_CHAR_LIMIT = 280;

function uniquePush(list, value) {
  if (!value) {
    return;
  }
  if (!list.some((item) => item.toLocaleLowerCase() === value.toLocaleLowerCase())) {
    list.push(value);
  }
}

function overlaps(aStart, aEnd, bStart, bEnd) {
  return aStart < bEnd && bStart < aEnd;
}

function spanDistance(aStart, aEnd, bStart, bEnd) {
  if (overlaps(aStart, aEnd, bStart, bEnd)) {
    return 0;
  }
  if (aEnd <= bStart) {
    return bStart - aEnd;
  }
  return aStart - bEnd;
}

function nextPersonPlaceholder(index) {
  return `[PER_${index}]`;
}

function findTokensCoveringSpan(tokens, start, end) {
  return tokens.filter(
    (token) => token.start >= 0 && overlaps(token.start, token.end, start, end),
  );
}

function collectSubtreeForms(tokens, rootId, depth = 0) {
  if (depth > 4) {
    return [];
  }
  const forms = [];
  for (const child of childrenOf(tokens, rootId)) {
    if (child.deprel === "punct") {
      continue;
    }
    forms.push(child.form);
    forms.push(...collectSubtreeForms(tokens, child.id, depth + 1));
  }
  return forms;
}

function pushAttr(attrs, usedEntityKeys, key, meta, value, extra = {}) {
  if (!value || usedEntityKeys.has(key)) {
    return;
  }
  usedEntityKeys.add(key);
  attrs.push({
    key: meta.key,
    label: meta.label,
    value,
    inSource: true,
    ...extra,
  });
}

function mergePersonMentions(personEntities) {
  const clusters = [];

  const sorted = [...personEntities].sort(
    (left, right) => right.text.length - left.text.length || left.start - right.start,
  );

  for (const entity of sorted) {
    const text = entity.text.trim();
    if (!text) {
      continue;
    }
    const lower = text.toLocaleLowerCase();
    let cluster = clusters.find((item) => {
      const nameLower = item.name.toLocaleLowerCase();
      return (
        nameLower === lower ||
        nameLower.includes(lower) ||
        lower.includes(nameLower) ||
        item.aliases.some((alias) => alias.toLocaleLowerCase() === lower)
      );
    });

    if (!cluster) {
      cluster = {
        name: text,
        aliases: [],
        mentions: [],
      };
      clusters.push(cluster);
    } else if (cluster.name.toLocaleLowerCase() !== lower) {
      uniquePush(cluster.aliases, text);
      if (text.length > cluster.name.length) {
        uniquePush(cluster.aliases, cluster.name);
        cluster.name = text;
      }
    }

    cluster.mentions.push({ start: entity.start, end: entity.end, text });
  }

  return clusters;
}

function sentenceForSpan(sentences, start, end) {
  if (!sentences?.length) {
    return null;
  }
  return (
    sentences.find((sentence) => start >= sentence.start && end <= sentence.end + 1) ||
    sentences.find((sentence) =>
      sentence.tokens.some(
        (token) => token.start >= 0 && overlaps(token.start, token.end, start, end),
      ),
    ) ||
    null
  );
}

function expandPersonTokenIds(sentence, personTokens) {
  const personIds = new Set(personTokens.map((token) => token.id));
  for (const token of personTokens) {
    if (token.head && NAME_DEPRELS.has(token.deprel)) {
      personIds.add(token.head);
    }
    for (const child of childrenOf(sentence.tokens, token.id)) {
      if (NAME_DEPRELS.has(child.deprel)) {
        personIds.add(child.id);
      }
    }
  }
  return personIds;
}

function collectGovernors(sentence, personIds) {
  const governors = new Set();
  for (const token of sentence.tokens) {
    if (!personIds.has(token.id)) {
      continue;
    }
    if (token.head > 0) {
      governors.add(token.head);
    }
  }
  return governors;
}

function attachNerOrSubtree(attrs, usedEntityKeys, entities, sentence, token) {
  const nerHit = entities.find(
    (entity) =>
      !PERSON_LABELS.has(entity.label) &&
      overlaps(entity.start, entity.end, token.start, token.end),
  );

  if (nerHit) {
    const key = `${nerHit.label}:${nerHit.text.toLocaleLowerCase()}`;
    const meta = LABEL_TO_ATTR[nerHit.label] || LABEL_TO_ATTR.misc;
    pushAttr(attrs, usedEntityKeys, key, meta, nerHit.text, {
      entityLabel: nerHit.label,
    });
    return;
  }

  if (!["PROPN", "NOUN", "NUM"].includes(token.upos)) {
    return;
  }
  if (!ATTACH_DEPRELS.has(token.deprel) && !GOVERNOR_SHARE_DEPRELS.has(token.deprel)) {
    return;
  }

  const subtree = [token.form, ...collectSubtreeForms(sentence.tokens, token.id)]
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
  if (subtree.length < 2 || subtree.length > 80) {
    return;
  }
  const key = `dep:${subtree.toLocaleLowerCase()}`;
  pushAttr(attrs, usedEntityKeys, key, LABEL_TO_ATTR.misc, subtree, {
    entityLabel: "misc",
  });
}

function attachViaDependencies(cluster, entities, sentences, usedEntityKeys) {
  const attrs = [];
  if (!sentences?.length) {
    return attrs;
  }

  for (const mention of cluster.mentions) {
    const sentence = sentenceForSpan(sentences, mention.start, mention.end);
    if (!sentence) {
      continue;
    }
    const personTokens = findTokensCoveringSpan(sentence.tokens, mention.start, mention.end);
    if (!personTokens.length) {
      continue;
    }

    for (const token of personTokens) {
      for (const child of childrenOf(sentence.tokens, token.id)) {
        if (NAME_DEPRELS.has(child.deprel) && child.form) {
          uniquePush(cluster.aliases, child.form);
        }
      }
    }

    const personIds = expandPersonTokenIds(sentence, personTokens);
    const governors = collectGovernors(sentence, personIds);

    for (const token of sentence.tokens) {
      if (token.start < 0 || personIds.has(token.id)) {
        continue;
      }

      const directChild = personIds.has(token.head);
      const sharedGovernor =
        governors.has(token.head) && GOVERNOR_SHARE_DEPRELS.has(token.deprel);

      if (!directChild && !sharedGovernor) {
        continue;
      }

      attachNerOrSubtree(attrs, usedEntityKeys, entities, sentence, token);
    }
  }

  return attrs;
}

function paragraphBounds(text, index) {
  const before = text.lastIndexOf("\n\n", Math.max(0, index - 1));
  const after = text.indexOf("\n\n", index);
  let start = before === -1 ? 0 : before + 2;
  let end = after === -1 ? text.length : after;

  // Merge a tiny name-only paragraph with the following block
  // (e.g. "Julien…\n\nInterviewé : …").
  const body = text.slice(start, end).trim();
  if (body.length > 0 && body.length <= 40 && after !== -1) {
    const nextAfter = text.indexOf("\n\n", after + 2);
    end = nextAfter === -1 ? text.length : nextAfter;
  }
  // If we're inside a following block and the previous paragraph was tiny,
  // absorb that previous name line.
  if (before !== -1) {
    const prevStart =
      text.lastIndexOf("\n\n", Math.max(0, before - 1)) === -1
        ? 0
        : text.lastIndexOf("\n\n", Math.max(0, before - 1)) + 2;
    const prevBody = text.slice(prevStart, before).trim();
    if (prevBody.length > 0 && prevBody.length <= 40) {
      start = prevStart;
    }
  }

  return { start, end };
}

function attachViaProximity(cluster, entities, sentences, usedEntityKeys, sourceText = "") {
  const attrs = [];
  const nonPersons = entities.filter((entity) => !PERSON_LABELS.has(entity.label));

  for (const entity of nonPersons) {
    const key = `${entity.label}:${entity.text.toLocaleLowerCase()}`;
    if (usedEntityKeys.has(key)) {
      continue;
    }

    let best = null;
    for (const mention of cluster.mentions) {
      const personSentence = sentenceForSpan(sentences, mention.start, mention.end);
      const entitySentence = sentenceForSpan(sentences, entity.start, entity.end);
      const sameSentence = Boolean(
        personSentence && entitySentence && personSentence === entitySentence,
      );

      const personPara = sourceText ? paragraphBounds(sourceText, mention.start) : null;
      const entityPara = sourceText ? paragraphBounds(sourceText, entity.start) : null;
      const sameParagraph = Boolean(
        personPara &&
          entityPara &&
          personPara.start === entityPara.start &&
          personPara.end === entityPara.end,
      );

      const distance = spanDistance(mention.start, mention.end, entity.start, entity.end);

      if (sentences?.length) {
        if (!sameSentence && distance > 48) {
          continue;
        }
      } else if (!sameParagraph) {
        continue;
      } else if (distance > PROXIMITY_CHAR_LIMIT * 2) {
        continue;
      }

      const score =
        (sameSentence ? 0 : 500) + (sameParagraph ? 0 : 500) + distance;
      if (!best || score < best.score) {
        best = { score, distance, entity, sameSentence, sameParagraph };
      }
    }

    if (!best) {
      continue;
    }

    let nearestOther = Infinity;
    for (const other of entities.filter((item) => PERSON_LABELS.has(item.label))) {
      if (
        cluster.mentions.some(
          (mention) => mention.start === other.start && mention.end === other.end,
        )
      ) {
        continue;
      }
      if (sourceText && best.sameParagraph) {
        const otherPara = paragraphBounds(sourceText, other.start);
        const entityPara = paragraphBounds(sourceText, entity.start);
        if (
          otherPara.start !== entityPara.start ||
          otherPara.end !== entityPara.end
        ) {
          // Another person in a different paragraph should not steal this entity.
          continue;
        }
      }
      const distance = spanDistance(other.start, other.end, entity.start, entity.end);
      nearestOther = Math.min(nearestOther, distance);
    }
    if (best.distance > nearestOther) {
      continue;
    }

    const meta = LABEL_TO_ATTR[entity.label] || LABEL_TO_ATTR.misc;
    pushAttr(attrs, usedEntityKeys, key, meta, entity.text, {
      entityLabel: entity.label,
    });
  }

  return attrs;
}

/**
 * @param {string} text
 * @param {Array} entities NER entities with label/start/end/text
 * @param {{ sentences?: Array }|null} depResult from depWorker
 */
export function buildBasicPersonGraph(text, entities = [], depResult = null) {
  const personEntities = entities.filter((entity) => PERSON_LABELS.has(entity.label));
  const clusters = mergePersonMentions(personEntities);
  const sentences = depResult?.sentences || null;

  const persons = [];
  const groups = [];

  clusters.forEach((cluster, index) => {
    const placeholder = nextPersonPlaceholder(index + 1);
    const localUsed = new Set();
    const depAttrs = attachViaDependencies(cluster, entities, sentences, localUsed);
    const proxAttrs = attachViaProximity(cluster, entities, sentences, localUsed, text);
    const attrs = [...depAttrs, ...proxAttrs];

    persons.push({
      name: cluster.name,
      placeholder,
      aliases: cluster.aliases,
      corefs: [],
      attrs,
      rels: [],
      mentions: cluster.mentions,
    });

    groups.push({
      type: "PER",
      category: "person",
      placeholder,
      aliases: [cluster.name, ...cluster.aliases],
      original: cluster.name,
    });
  });

  // Keep each NER surface on the nearest person only.
  const surfaceOwners = new Map();
  for (const person of persons) {
    for (const attr of person.attrs || []) {
      if (!attr.entityLabel) {
        continue;
      }
      const key = `${attr.entityLabel}:${attr.value.toLocaleLowerCase()}`;
      const entity = entities.find(
        (item) =>
          item.label === attr.entityLabel &&
          item.text.toLocaleLowerCase() === attr.value.toLocaleLowerCase(),
      );
      if (!entity) {
        continue;
      }
      let bestDistance = Infinity;
      for (const mention of person.mentions || []) {
        bestDistance = Math.min(
          bestDistance,
          spanDistance(mention.start, mention.end, entity.start, entity.end),
        );
      }
      const existing = surfaceOwners.get(key);
      if (!existing || bestDistance < existing.distance) {
        surfaceOwners.set(key, { placeholder: person.placeholder, distance: bestDistance });
      }
    }
  }

  for (const person of persons) {
    person.attrs = (person.attrs || []).filter((attr) => {
      if (!attr.entityLabel) {
        return true;
      }
      const key = `${attr.entityLabel}:${attr.value.toLocaleLowerCase()}`;
      const owner = surfaceOwners.get(key);
      return !owner || owner.placeholder === person.placeholder;
    });
    delete person.mentions;
  }

  const seenSurfaces = new Set(
    groups.flatMap((group) => group.aliases.map((alias) => alias.toLocaleLowerCase())),
  );

  let loc = 0;
  let org = 0;
  let dat = 0;
  let misc = 0;

  for (const entity of entities) {
    if (PERSON_LABELS.has(entity.label)) {
      continue;
    }
    const lower = entity.text.toLocaleLowerCase();
    if (seenSurfaces.has(lower)) {
      continue;
    }
    seenSurfaces.add(lower);

    let type = "OTH";
    let category = entity.label || "misc";
    if (entity.label === "location") {
      loc += 1;
      type = "LOC";
      category = "location";
    } else if (entity.label === "organization") {
      org += 1;
      type = "ORG";
      category = "organization";
    } else if (entity.label === "date") {
      dat += 1;
      type = "DAT";
      category = "date";
    } else {
      misc += 1;
      type = "OTH";
      category = entity.label || "misc";
    }

    const n =
      type === "LOC" ? loc : type === "ORG" ? org : type === "DAT" ? dat : misc;
    groups.push({
      type,
      category,
      placeholder: `[${type}_${n}]`,
      aliases: [entity.text],
      original: entity.text,
    });
  }

  return {
    persons,
    groups,
    usedDependencyParse: Boolean(sentences?.length),
  };
}
