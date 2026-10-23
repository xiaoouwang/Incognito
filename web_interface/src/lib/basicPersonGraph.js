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
  age: { key: "age", label: "âge" },
  email: { key: "em", label: "email" },
  phone: { key: "tel", label: "téléphone" },
  "phone number": { key: "tel", label: "téléphone" },
  address: { key: "addr", label: "adresse" },
  // GLiNER2-PII okasi SPY labels mapped in the sidecar
  username: { key: "misc", label: "identifiant" },
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

function surfaceMatchesPerson(person, surfaceLower) {
  if (String(person.name || "").toLocaleLowerCase() === surfaceLower) {
    return true;
  }
  if ((person.aliases || []).some((alias) => String(alias).toLocaleLowerCase() === surfaceLower)) {
    return true;
  }
  if ((person.corefs || []).some((coref) => String(coref).toLocaleLowerCase() === surfaceLower)) {
    return true;
  }
  if ((person.attrs || []).some((attr) => String(attr.value || "").toLocaleLowerCase() === surfaceLower)) {
    return true;
  }
  if (
    (person.rels || []).some(
      (rel) => String(rel.target || "").toLocaleLowerCase() === surfaceLower,
    )
  ) {
    return true;
  }
  return false;
}

/** First graph owner of a surface (legacy helper). */
export function findSurfaceOwnerPlaceholder(persons, surface) {
  const owners = findSurfaceOwnerPlaceholders(persons, surface);
  return owners[0] || null;
}

/** All person placeholders that currently own this surface (alias / attr / name). */
export function findSurfaceOwnerPlaceholders(persons, surface) {
  const surfaceLower = String(surface || "").toLocaleLowerCase();
  if (!surfaceLower) {
    return [];
  }
  const owners = [];
  for (const person of persons || []) {
    if (surfaceMatchesPerson(person, surfaceLower)) {
      owners.push(person.placeholder);
    }
  }
  return owners;
}

/** Key for a renamed edge label or surface value on a person card. */
export function edgeLabelOverrideKey(placeholder, kind, value) {
  return `${placeholder}::${kind}::${String(value || "").toLocaleLowerCase()}`;
}

/**
 * Re-apply user-renamed edge labels after graph rebuilds.
 * overrides: { [edgeLabelOverrideKey]: displayLabel }
 * Alias/coref labels are attached as aliasLabels/corefLabels maps.
 */
export function applyEdgeLabelOverrides(persons, overrides) {
  if (!persons?.length || !overrides || !Object.keys(overrides).length) {
    return persons;
  }
  return persons.map((person) => {
    const placeholder = person.placeholder;
    const aliasLabels = {};
    const corefLabels = {};
    for (const [key, label] of Object.entries(overrides)) {
      const aliasPrefix = `${placeholder}::alias::`;
      const corefPrefix = `${placeholder}::coref::`;
      if (key.startsWith(aliasPrefix)) {
        aliasLabels[key.slice(aliasPrefix.length)] = label;
      } else if (key.startsWith(corefPrefix)) {
        corefLabels[key.slice(corefPrefix.length)] = label;
      }
    }
    const attrs = (person.attrs || []).map((attr) => {
      const custom = overrides[edgeLabelOverrideKey(placeholder, "attr", attr.value)];
      return custom ? { ...attr, label: custom } : attr;
    });
    const rels = (person.rels || []).map((rel) => {
      const custom = overrides[edgeLabelOverrideKey(placeholder, "rel", rel.target)];
      return custom ? { ...rel, label: custom } : rel;
    });
    return {
      ...person,
      attrs,
      rels,
      aliasLabels,
      corefLabels,
    };
  });
}

/**
 * Re-apply user-renamed surfaces (alias / coref / attr value / rel target / name).
 * overrides: { [edgeLabelOverrideKey]: newSurface }
 * Keys stay tied to the original/model surface so rebuilds still match.
 */
export function applyEdgeValueOverrides(persons, overrides) {
  if (!persons?.length || !overrides || !Object.keys(overrides).length) {
    return persons;
  }
  return persons.map((person) => {
    const placeholder = person.placeholder;
    const remap = (kind, surface) => {
      const key = edgeLabelOverrideKey(placeholder, kind, surface);
      return overrides[key] || surface;
    };
    const name = remap("name", person.name);
    const nameLower = String(name || "").toLocaleLowerCase();
    const aliases = (person.aliases || [])
      .map((alias) => remap("alias", alias))
      .filter((alias) => String(alias || "").toLocaleLowerCase() !== nameLower);
    const corefs = (person.corefs || [])
      .map((coref) => remap("coref", coref))
      .filter((coref) => String(coref || "").toLocaleLowerCase() !== nameLower);
    const attrs = (person.attrs || []).map((attr) => ({
      ...attr,
      value: remap("attr", attr.value),
    }));
    const rels = (person.rels || []).map((rel) => ({
      ...rel,
      target: remap("rel", rel.target),
    }));
    return {
      ...person,
      name,
      aliases,
      corefs,
      attrs,
      rels,
    };
  });
}

/** Flatten override map values (single entry or array) into a list. */
export function listRelationOverrideEntries(overrides) {
  const entries = [];
  for (const value of Object.values(overrides || {})) {
    if (Array.isArray(value)) {
      for (const item of value) {
        if (item?.placeholder && item?.surface) {
          entries.push(item);
        }
      }
    } else if (value?.placeholder && value?.surface) {
      entries.push(value);
    }
  }
  return entries;
}

/**
 * Manual relation pins that survive auto rebuilds.
 * overrides: {
 *   [surfaceLower]: { placeholder, surface, entityLabel, asAlias?, asRel?, relLabel? }
 *     | Array<{ placeholder, surface, entityLabel, asAlias?, asRel?, relLabel? }>
 * }
 * One surface may be related to several persons (editing only).
 * Person↔person links use asRel (graph `rels`); asAlias merges names.
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
    rels: [...(person.rels || [])],
  }));
  const entries = listRelationOverrideEntries(overrides);
  if (!entries.length) {
    return next;
  }

  // Attr/alias overrides replace ownership. Person↔person (asRel) is additive —
  // never strip existing rels when pinning another relation to the same person.
  const attrAliasLowers = new Set(
    entries
      .filter((item) => !item.asRel)
      .map((item) => String(item.surface || "").toLocaleLowerCase())
      .filter(Boolean),
  );

  for (const person of next) {
    if (!attrAliasLowers.size) {
      continue;
    }
    person.attrs = person.attrs.filter(
      (attr) => !attrAliasLowers.has(String(attr.value || "").toLocaleLowerCase()),
    );
    person.aliases = person.aliases.filter(
      (alias) => !attrAliasLowers.has(String(alias || "").toLocaleLowerCase()),
    );
    person.corefs = person.corefs.filter(
      (coref) => !attrAliasLowers.has(String(coref || "").toLocaleLowerCase()),
    );
  }

  for (const override of entries) {
    const target = next.find((person) => person.placeholder === override.placeholder);
    if (!target) {
      continue;
    }
    const surface = override.surface || "";
    if (!surface) {
      continue;
    }
    const surfaceLower = surface.toLocaleLowerCase();
    const asRel = Boolean(override.asRel);
    const asAlias =
      !asRel && (Boolean(override.asAlias) || isPersonLabel(override.entityLabel));

    if (asRel) {
      const other =
        next.find((person) => String(person.name || "").toLocaleLowerCase() === surfaceLower) ||
        next.find((person) =>
          (person.aliases || []).some(
            (alias) => String(alias || "").toLocaleLowerCase() === surfaceLower,
          ),
        );
      const relLabel = String(override.relLabel || "related to").trim() || "related to";
      const relKey = `${relLabel.toLocaleLowerCase()}:${surfaceLower}`;
      const exists = (target.rels || []).some(
        (rel) =>
          `${String(rel.label || "").toLocaleLowerCase()}:${String(rel.target || "").toLocaleLowerCase()}` ===
          relKey,
      );
      if (!exists) {
        target.rels = [
          ...(target.rels || []),
          {
            label: relLabel,
            target: surface,
            placeholder: other?.placeholder || "",
            source: "manual",
          },
        ];
      }
      continue;
    }

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
      source: "manual",
    });
  }

  return next.filter((person) => {
    const nameLower = String(person.name || "").toLocaleLowerCase();
    const aliasOverrides = entries.filter(
      (item) =>
        String(item.surface || "").toLocaleLowerCase() === nameLower &&
        !item.asRel &&
        (Boolean(item.asAlias) || isPersonLabel(item.entityLabel)),
    );
    if (!aliasOverrides.length) {
      return true;
    }
    // Drop a person card when their name is only kept as someone else's alias.
    return !aliasOverrides.some((item) => item.placeholder !== person.placeholder);
  });
}

/** Remove a surface from aliases / corefs / attrs / rel targets on every person. */
export function clearSurfaceFromPersons(persons, surface) {
  const surfaceLower = String(surface || "").toLocaleLowerCase();
  if (!surfaceLower || !persons?.length) {
    return persons || [];
  }
  return persons.map((person) => ({
    ...person,
    aliases: (person.aliases || []).filter(
      (alias) => String(alias || "").toLocaleLowerCase() !== surfaceLower,
    ),
    corefs: (person.corefs || []).filter(
      (coref) => String(coref || "").toLocaleLowerCase() !== surfaceLower,
    ),
    attrs: (person.attrs || []).filter(
      (attr) => String(attr.value || "").toLocaleLowerCase() !== surfaceLower,
    ),
    rels: (person.rels || []).filter(
      (rel) => String(rel.target || "").toLocaleLowerCase() !== surfaceLower,
    ),
  }));
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

/** Max gap (chars) between name parts that should form one person, e.g. "Marie" + " " + "Dupont". */
const PERSON_NAME_PART_GAP = 2;

/**
 * True when two spans are close enough to be name parts and the gap is only whitespace.
 * Rejects punctuation gaps so "Marie, Hélène" stays two people.
 */
function gapIsNameJoiner(sourceText, leftEnd, rightStart) {
  if (leftEnd > rightStart) {
    return false;
  }
  const gapLength = rightStart - leftEnd;
  if (gapLength > PERSON_NAME_PART_GAP) {
    return false;
  }
  const gap = String(sourceText || "").slice(leftEnd, rightStart);
  return gapLength <= PERSON_NAME_PART_GAP && /^\s*$/u.test(gap);
}

function nameTokens(value) {
  return String(value || "")
    .trim()
    .split(/[\s-]+/)
    .filter(Boolean);
}

/**
 * Compatible person surfaces for coreference — not bare substring.
 * "Marie" ↔ "Marie Dupont" ✓  |  "Dupont" ↔ "Marie Dupont" ✗ (surname alone)
 * "Jean Dupont" ↔ "Marie Dupont" ✗
 */
export function personSurfacesMatch(left, right) {
  const a = String(left || "")
    .trim()
    .toLocaleLowerCase();
  const b = String(right || "")
    .trim()
    .toLocaleLowerCase();
  if (!a || !b) {
    return false;
  }
  if (a === b) {
    return true;
  }

  const aTokens = nameTokens(a);
  const bTokens = nameTokens(b);
  if (!aTokens.length || !bTokens.length) {
    return false;
  }

  // Shorter form is the leading given-name token(s) of the longer form.
  if (aTokens.length < bTokens.length) {
    return bTokens.slice(0, aTokens.length).join(" ") === aTokens.join(" ");
  }
  if (bTokens.length < aTokens.length) {
    return aTokens.slice(0, bTokens.length).join(" ") === bTokens.join(" ");
  }

  return false;
}

function clusterMatchesSurface(cluster, surface) {
  if (personSurfacesMatch(cluster.name, surface)) {
    return true;
  }
  return (cluster.aliases || []).some((alias) => personSurfacesMatch(alias, surface));
}

function mentionsAdjacentOrOverlap(left, right, sourceText) {
  if (overlaps(left.start, left.end, right.start, right.end)) {
    return true;
  }
  const [earlier, later] = left.start <= right.start ? [left, right] : [right, left];
  return gapIsNameJoiner(sourceText, earlier.end, later.start);
}

function clusterTouchesSpan(cluster, start, end, sourceText) {
  return (cluster.mentions || []).some((mention) => {
    if (overlaps(mention.start, mention.end, start, end)) {
      return true;
    }
    const [earlierEnd, laterStart] =
      mention.start <= start ? [mention.end, start] : [end, mention.start];
    return gapIsNameJoiner(sourceText, earlierEnd, laterStart);
  });
}

function pickClusterDisplayName(cluster, sourceText = "") {
  const surfaces = [
    cluster.name,
    ...(cluster.aliases || []),
    ...(cluster.mentions || []).map((mention) => mention.text),
  ]
    .map((value) => String(value || "").trim())
    .filter(Boolean);

  if (!surfaces.length) {
    return cluster.name || "";
  }

  // Prefer a multi-token surface already present (full name).
  const multi = surfaces
    .filter((value) => nameTokens(value).length > 1)
    .sort((left, right) => right.length - left.length || left.localeCompare(right));
  if (multi.length) {
    return multi[0];
  }

  // Otherwise stitch contiguous mention parts in reading order ("Marie"+"Dupont").
  const ordered = [...(cluster.mentions || [])].sort(
    (left, right) => left.start - right.start || left.end - right.end,
  );
  if (ordered.length > 1) {
    const joined = [];
    let cursor = -1;
    for (const mention of ordered) {
      const part = String(mention.text || "").trim();
      if (!part) {
        continue;
      }
      if (!joined.length) {
        joined.push(part);
        cursor = mention.end;
        continue;
      }
      if (gapIsNameJoiner(sourceText, cursor, mention.start)) {
        joined.push(part);
        cursor = mention.end;
      }
    }
    if (joined.length > 1) {
      return joined.join(" ");
    }
  }

  return surfaces.sort((left, right) => right.length - left.length)[0];
}

function mergeTwoPersonClusters(left, right, sourceText = "") {
  const mentions = [...(left.mentions || []), ...(right.mentions || [])];
  const aliases = [...(left.aliases || []), ...(right.aliases || [])];
  uniquePush(aliases, left.name);
  uniquePush(aliases, right.name);
  for (const mention of mentions) {
    uniquePush(aliases, mention.text);
  }
  const merged = { name: left.name, aliases, mentions };
  merged.name = pickClusterDisplayName(merged, sourceText);
  const nameLower = merged.name.toLocaleLowerCase();
  merged.aliases = aliases.filter((alias) => alias.toLocaleLowerCase() !== nameLower);
  return merged;
}

function unionAdjacentPersonClusters(clusters, sourceText = "") {
  const next = [...clusters];
  let changed = true;
  while (changed) {
    changed = false;
    outer: for (let i = 0; i < next.length; i += 1) {
      for (let j = i + 1; j < next.length; j += 1) {
        const linked = (next[i].mentions || []).some((leftMention) =>
          (next[j].mentions || []).some((rightMention) =>
            mentionsAdjacentOrOverlap(leftMention, rightMention, sourceText),
          ),
        );
        if (!linked) {
          continue;
        }
        next[i] = mergeTwoPersonClusters(next[i], next[j], sourceText);
        next.splice(j, 1);
        changed = true;
        break outer;
      }
    }
  }
  return next;
}

function mergePersonMentions(personEntities, sourceText = "") {
  const clusters = [];

  // Longer spans first so full names become the cluster seed when possible.
  const sorted = [...personEntities].sort(
    (left, right) => right.text.length - left.text.length || left.start - right.start,
  );

  for (const entity of sorted) {
    const text = entity.text.trim();
    if (!text) {
      continue;
    }
    const lower = text.toLocaleLowerCase();
    let cluster =
      clusters.find((item) => clusterMatchesSurface(item, text)) ||
      clusters.find((item) => clusterTouchesSpan(item, entity.start, entity.end, sourceText));

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

  const unified = unionAdjacentPersonClusters(clusters, sourceText).map((cluster) => {
    const name = pickClusterDisplayName(cluster, sourceText);
    const nameLower = name.toLocaleLowerCase();
    const aliases = [...(cluster.aliases || [])];
    for (const mention of cluster.mentions || []) {
      uniquePush(aliases, mention.text);
    }
    return {
      name,
      aliases: aliases.filter((alias) => alias.toLocaleLowerCase() !== nameLower),
      mentions: cluster.mentions,
    };
  });

  // Chip / person order = first appearance in the source text.
  unified.sort((left, right) => {
    const minStart = (cluster) =>
      cluster.mentions.length
        ? Math.min(...cluster.mentions.map((mention) => mention.start))
        : Number.POSITIVE_INFINITY;
    return minStart(left) - minStart(right);
  });

  return unified;
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
  const clusters = mergePersonMentions(personEntities, text);
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
