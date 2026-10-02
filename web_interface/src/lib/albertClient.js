import {
  ALBERT_API_ORIGIN,
  ALBERT_DEFAULT_MODEL,
  ALBERT_DEFAULT_MODELS,
  ALBERT_KEY_STORAGE_KEY,
  ALBERT_MAX_INPUT_CHARS,
} from "./albertConstants.js";
import {
  candidateMap,
  extractAlbertCandidates,
  formatAlbertCandidateList,
} from "./albertCandidates.js";

export function getAlbertBaseUrl() {
  if (typeof window !== "undefined") {
    const host = window.location.hostname;
    if (host === "localhost" || host === "127.0.0.1") {
      return "/albert-api/v1";
    }
  }

  const configured = import.meta.env.VITE_ALBERT_BASE_URL;
  if (configured) {
    return configured.replace(/\/$/, "");
  }

  return `${ALBERT_API_ORIGIN}/v1`;
}

export function loadStoredAlbertApiKey() {
  if (typeof window === "undefined") {
    return "";
  }

  try {
    return window.sessionStorage.getItem(ALBERT_KEY_STORAGE_KEY) || "";
  } catch {
    return "";
  }
}

export function storeAlbertApiKey(apiKey) {
  if (typeof window === "undefined") {
    return;
  }

  try {
    if (apiKey) {
      window.sessionStorage.setItem(ALBERT_KEY_STORAGE_KEY, apiKey);
    } else {
      window.sessionStorage.removeItem(ALBERT_KEY_STORAGE_KEY);
    }
  } catch {
    // Private browsing / quota — ignore.
  }
}

export function resolveInitialAlbertApiKey() {
  const fromEnv = import.meta.env.VITE_ALBERT_API_KEY;
  if (typeof fromEnv === "string" && fromEnv.trim()) {
    return fromEnv.trim();
  }
  return loadStoredAlbertApiKey();
}

async function albertFetch(path, { apiKey, method = "GET", body } = {}) {
  if (!apiKey?.trim()) {
    throw new Error("Missing Albert API key.");
  }

  const response = await fetch(`${getAlbertBaseUrl()}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${apiKey.trim()}`,
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  let payload = null;
  const text = await response.text();
  try {
    payload = text ? JSON.parse(text) : null;
  } catch {
    payload = { raw: text };
  }

  if (!response.ok) {
    const detail =
      payload?.detail ||
      payload?.error?.message ||
      payload?.message ||
      `HTTP ${response.status}`;
    const error = new Error(String(detail));
    error.status = response.status;
    error.payload = payload;
    throw error;
  }

  return payload;
}

export async function listAlbertChatModels(apiKey) {
  const payload = await albertFetch("/models", { apiKey });
  const models = Array.isArray(payload?.data) ? payload.data : [];
  const chatModels = models
    .filter((model) => {
      const type = model?.type || model?.object;
      return !type || type === "text-generation" || type === "model";
    })
    .map((model) => model.id)
    .filter(Boolean);

  if (chatModels.length) {
    return chatModels;
  }

  return [...ALBERT_DEFAULT_MODELS];
}

/** Short attr key → mask type + display label */
export const ATTR_META = {
  dob: { type: "DAT", label: "date_naissance" },
  yob: { type: "DAT", label: "année_naissance" },
  pob: { type: "LOC", label: "lieu_naissance" },
  addr: { type: "ADR", label: "adresse_actuelle" },
  addr0: { type: "ADR", label: "ancienne_adresse" },
  tel: { type: "PHO", label: "téléphone" },
  em: { type: "EMA", label: "email" },
  id: { type: "ID", label: "dossier" },
  id0: { type: "ID", label: "ancien_document" },
  iban: { type: "IBAN", label: "IBAN" },
  org: { type: "ORG", label: "travaille_dans" },
  job: { type: "PRO", label: "fonction" },
  loc: { type: "LOC", label: "domicile" },
  room: { type: "ID", label: "bureau" },
};

/** Short relation key → display label */
export const REL_META = {
  resp: "responsable",
  col: "collègue",
  fr: "frère",
  of: "responsable_de",
  urg: "contact_urgence",
  bureau: "partage_bureau_avec",
  col_de: "collègue_de",
};

/**
 * Ultra-compact schema: model returns ONLY candidate IDs (integers).
 * Client already has id → {start,end,text} from extractAlbertCandidates.
 *
 * {"p":[[4,16,27],[24,57],[43,45],[67]],"x":[[0,"dob",5],[0,"tel",14],[0,"em",15],[1,"tel",26]],"r":[[0,"resp",1],[0,"col",2],[0,"fr",3]],"o":[9,19],"l":[8,13],"d":[1]}
 */
const SYSTEM_PROMPT = `Groupe des ids candidats. Aucune chaine du texte. JSON seul.

Schema EXACT (x = lignes plates [personne,cle,id], PAS de listes imbriquees):
{"p":[[4,16,27],[24,57],[43,45],[67]],"x":[[0,"dob",5],[0,"tel",14],[0,"em",15],[1,"tel",26]],"r":[[0,"resp",1],[0,"col",2],[0,"fr",3]],"o":[9],"l":[8],"d":[1]}

- p[i]=ids meme personne (nom puis aliases/corefs)
- x=UNIQUEMENT [i,"dob"|"yob"|"pob"|"addr"|"addr0"|"tel"|"em"|"id"|"id0"|"iban"|"org"|"job"|"loc"|"room",id]
- r=UNIQUEMENT [i,"resp"|"col"|"fr"|"of"|"urg"|"bureau"|"col_de",j]
- o/l/d=ids orgs/lieux/dates
INTERDIT: texte, offsets, placeholders, x imbrique, relations dans x. Max ~40 lignes x.`;

function messageContentToString(content) {
  if (typeof content === "string") {
    return content;
  }

  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (typeof part === "string") return part;
        if (part && typeof part.text === "string") return part.text;
        if (part && typeof part.content === "string") return part.content;
        return "";
      })
      .join("");
  }

  if (content && typeof content === "object" && typeof content.text === "string") {
    return content.text;
  }

  return "";
}

function stripCodeFences(raw) {
  const trimmed = raw.trim();
  const fenced = trimmed.match(/^```(?:json|JSON)?\s*([\s\S]*?)\s*```$/);
  if (fenced) {
    return fenced[1].trim();
  }
  return trimmed
    .replace(/^```(?:json|JSON)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
}

function tryParseJson(candidate) {
  try {
    return JSON.parse(candidate);
  } catch {
    return null;
  }
}

function repairTruncatedJson(raw) {
  let text = raw.trim();
  if (!text.startsWith("{") && !text.startsWith("[")) {
    return null;
  }

  text = text.replace(/,\s*"[^"]*$/u, "");
  text = text.replace(/,\s*\d+$/u, "");
  text = text.replace(/,\s*\[$/u, "");
  text = text.replace(/,\s*\{$/u, "");
  text = text.replace(/,\s*$/u, "");

  const openSquare = (text.match(/\[/g) || []).length;
  const closeSquare = (text.match(/\]/g) || []).length;
  const openCurly = (text.match(/\{/g) || []).length;
  const closeCurly = (text.match(/\}/g) || []).length;

  text += "]".repeat(Math.max(0, openSquare - closeSquare));
  text += "}".repeat(Math.max(0, openCurly - closeCurly));

  return tryParseJson(text);
}

function extractJsonObject(raw, { finishReason } = {}) {
  const asString = messageContentToString(raw);
  if (!asString.trim()) {
    throw new Error("Empty model response.");
  }

  const cleaned = stripCodeFences(asString);
  const direct = tryParseJson(cleaned);
  if (direct) {
    return Array.isArray(direct) ? { p: direct } : direct;
  }

  const objStart = cleaned.indexOf("{");
  const objEnd = cleaned.lastIndexOf("}");
  if (objStart >= 0 && objEnd > objStart) {
    const sliced = tryParseJson(cleaned.slice(objStart, objEnd + 1));
    if (sliced) {
      return sliced;
    }
  }

  const arrStart = cleaned.indexOf("[");
  const arrEnd = cleaned.lastIndexOf("]");
  if (arrStart >= 0 && arrEnd > arrStart) {
    const sliced = tryParseJson(cleaned.slice(arrStart, arrEnd + 1));
    if (Array.isArray(sliced)) {
      return { p: sliced };
    }
  }

  const repaired = repairTruncatedJson(cleaned);
  if (repaired) {
    return Array.isArray(repaired) ? { p: repaired } : repaired;
  }

  const preview = cleaned.slice(0, 280).replace(/\s+/g, " ");
  if (finishReason === "length") {
    throw new Error(
      `Model response was truncated (finish_reason=length). Preview: ${preview}`,
    );
  }

  throw new Error(
    `Model did not return valid JSON. Preview: ${preview}${cleaned.length > 280 ? "…" : ""}`,
  );
}

function normalizeType(type) {
  const raw = String(type || "OTH")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z]/g, "");
  if (!raw) {
    return "OTH";
  }
  return raw.slice(0, 4);
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

function asIdList(value) {
  if (value == null) {
    return [];
  }
  if (Array.isArray(value)) {
    return value
      .map((item) => {
        if (typeof item === "number" && Number.isFinite(item)) {
          return item;
        }
        if (typeof item === "string" && /^\d+$/.test(item.trim())) {
          return Number(item.trim());
        }
        return null;
      })
      .filter((item) => item != null);
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return [value];
  }
  return [];
}

function resolveCandidate(byId, id) {
  if (typeof id !== "number" || !Number.isFinite(id)) {
    return null;
  }
  return byId.get(id) || null;
}

/**
 * Expand compact ID-based graph using client-side candidates.
 * Also accepts legacy string / span formats when present.
 */
export function expandAlbertGraph(parsed, sourceText, candidates = []) {
  const byId = candidateMap(candidates);
  const persons = [];
  const valueToPlaceholder = new Map();
  const counters = {};
  const groups = [];

  function nextPlaceholder(type) {
    const normalized = normalizeType(type);
    counters[normalized] = (counters[normalized] || 0) + 1;
    return `[${normalized}_${counters[normalized]}]`;
  }

  function registerValue(type, value) {
    const text = String(value ?? "").trim();
    if (!text || !sourceText.includes(text)) {
      return null;
    }
    if (valueToPlaceholder.has(text)) {
      return valueToPlaceholder.get(text);
    }
    const placeholder = nextPlaceholder(type);
    valueToPlaceholder.set(text, placeholder);
    groups.push({
      type: normalizeType(type),
      category: normalizeType(type).toLowerCase(),
      placeholder,
      aliases: [text],
      original: text,
    });
    return placeholder;
  }

  function mergeAliases(placeholder, extraAliases) {
    const group = groups.find((item) => item.placeholder === placeholder);
    if (!group) {
      return;
    }
    const merged = uniqueLongestFirst([
      ...group.aliases,
      ...extraAliases.filter((alias) => sourceText.includes(alias)),
    ]);
    group.aliases = merged;
    for (const alias of merged) {
      valueToPlaceholder.set(alias, placeholder);
    }
  }

  function textsFromIds(ids) {
    const texts = [];
    for (const id of ids) {
      const candidate = resolveCandidate(byId, id);
      if (candidate?.text) {
        texts.push(candidate.text);
      }
    }
    return uniquePreserveOrder(texts);
  }

  function pickDisplayName(surfaces) {
    if (!surfaces.length) {
      return "";
    }
    const scored = surfaces.map((value) => {
      const lower = value.toLowerCase();
      let score = 0;
      if (/^(l['’]|la |le |les |son |sa |ses )/i.test(value)) score -= 5;
      if (/titulaire|intéressée|interessee|dossier|contact/i.test(lower)) score -= 4;
      if (/^[A-ZÀ-Ü][a-zà-ü'’-]+(?:\s+[A-ZÀ-Ü][a-zà-ü'’-]+)+$/.test(value)) score += 6;
      if (/^(?:M(?:me|\.)\s+)/.test(value)) score += 3;
      if (/^[A-ZÀ-Ü]\.\s+[A-ZÀ-Ü]/.test(value)) score += 2;
      if (value.length <= 40) score += 1;
      if (value.length > 60) score -= 3;
      return { value, score };
    });
    scored.sort((left, right) => right.score - left.score || left.value.length - right.value.length);
    return scored[0].value;
  }

  function uniquePreserveOrder(values) {
    const seen = new Set();
    const unique = [];
    for (const value of values) {
      if (!value || seen.has(value)) {
        continue;
      }
      seen.add(value);
      unique.push(value);
    }
    return unique;
  }

  const personEntries = Array.isArray(parsed?.p) ? parsed.p : [];

  for (const entry of personEntries) {
    // New format: [id, id, ...] OR legacy tuple with strings
    let surfaceTexts = [];
    let attrs = {};
    let rels = [];

    if (Array.isArray(entry) && entry.every((item) => typeof item === "number")) {
      surfaceTexts = textsFromIds(entry);
    } else if (Array.isArray(entry)) {
      if (typeof entry[0] === "number" || Array.isArray(entry[0])) {
        // [ids[], attrs?, rels?] or flat ids then objects
        if (Array.isArray(entry[0])) {
          surfaceTexts = textsFromIds(asIdList(entry[0]));
          attrs =
            entry[1] && typeof entry[1] === "object" && !Array.isArray(entry[1])
              ? entry[1]
              : {};
          rels = Array.isArray(entry[2]) ? entry[2] : [];
        } else {
          const ids = [];
          for (const item of entry) {
            if (typeof item === "number") {
              ids.push(item);
            }
          }
          surfaceTexts = textsFromIds(ids);
        }
      } else if (typeof entry[0] === "string") {
        // Legacy string tuple
        surfaceTexts = uniqueLongestFirst([
          String(entry[0] || "").trim(),
          ...(Array.isArray(entry[1]) ? entry[1].map(String) : []),
          ...(Array.isArray(entry[2]) ? entry[2].map(String) : []),
        ]).filter((value) => sourceText.includes(value));
        attrs =
          entry[3] && typeof entry[3] === "object" && !Array.isArray(entry[3])
            ? entry[3]
            : {};
        rels = Array.isArray(entry[4]) ? entry[4] : [];
      }
    } else if (entry && typeof entry === "object") {
      surfaceTexts = textsFromIds(asIdList(entry.ids ?? entry.s ?? entry.a));
      if (!surfaceTexts.length && entry.n) {
        surfaceTexts = [String(entry.n)];
      }
      attrs = entry.x || entry.attrs || {};
      rels = entry.r || entry.rels || [];
    }

    if (!surfaceTexts.length) {
      continue;
    }

    const displayName = pickDisplayName(surfaceTexts);
    const maskAliases = uniqueLongestFirst(surfaceTexts);

    let placeholder = valueToPlaceholder.get(displayName) || valueToPlaceholder.get(maskAliases[0]);
    if (!placeholder) {
      placeholder = nextPlaceholder("PER");
      groups.push({
        type: "PER",
        category: "per",
        placeholder,
        aliases: maskAliases,
        original: displayName,
      });
      for (const form of maskAliases) {
        valueToPlaceholder.set(form, placeholder);
      }
    } else {
      mergeAliases(placeholder, maskAliases);
    }

    persons.push({
      name: displayName,
      placeholder,
      aliases: maskAliases.filter((value) => value !== displayName),
      corefs: [],
      attrs: [],
      rels: [],
      _rawAttrs: attrs,
      _rawRels: rels,
    });
  }

  // Attributes: prefer compact x rows [personIndex, key, candidateId]
  // Also accept nested [[personIndex, [key,id], [key,id], ...]]
  const xRows = Array.isArray(parsed?.x) ? parsed.x : [];
  const flatXRows = [];
  for (const row of xRows) {
    if (!Array.isArray(row) || row.length < 2) {
      continue;
    }
    if (
      typeof row[0] === "number" &&
      row.length >= 3 &&
      typeof row[1] === "string" &&
      typeof row[2] === "number"
    ) {
      flatXRows.push(row);
      continue;
    }
    if (typeof row[0] === "number" && row.slice(1).every((item) => Array.isArray(item))) {
      const personIndex = Number(row[0]);
      for (const pair of row.slice(1)) {
        if (Array.isArray(pair) && pair.length >= 2) {
          flatXRows.push([personIndex, pair[0], pair[1]]);
        }
      }
    }
  }
  if (flatXRows.length) {
    for (const row of flatXRows) {
      const personIndex = Number(row[0]);
      const key = String(row[1] || "").trim();
      const candidateId = Number(row[2]);
      const person = persons[personIndex];
      if (!person || !key || !(key in ATTR_META)) {
        // Skip relation keys mistakenly placed in x
        if (key in REL_META && persons[candidateId]) {
          person?.rels.push({
            key,
            label: REL_META[key],
            target: persons[candidateId].name,
            placeholder: persons[candidateId].placeholder,
          });
        }
        continue;
      }
      const meta = ATTR_META[key];
      const candidate = resolveCandidate(byId, candidateId);
      const value = candidate?.text || "";
      if (!value) {
        continue;
      }
      const valuePlaceholder =
        valueToPlaceholder.get(value) || registerValue(meta.type, value);
      person.attrs.push({
        key,
        label: meta.label,
        value,
        placeholder: valuePlaceholder,
        inSource: true,
      });
    }
  } else {
    // Legacy object attrs on person
    for (const person of persons) {
      const attrs = person._rawAttrs || {};
      for (const [key, raw] of Object.entries(attrs)) {
        const meta = ATTR_META[key] || { type: "OTH", label: key };
        let value = "";
        if (typeof raw === "number") {
          value = resolveCandidate(byId, raw)?.text || "";
        } else {
          value = String(raw ?? "").trim();
        }
        if (!value || !sourceText.includes(value)) {
          continue;
        }
        const valuePlaceholder =
          valueToPlaceholder.get(value) || registerValue(meta.type, value);
        person.attrs.push({
          key,
          label: meta.label,
          value,
          placeholder: valuePlaceholder,
          inSource: true,
        });
      }
    }
  }

  // Relations: compact r rows [personIndex, key, targetPersonIndex]
  const rRows = Array.isArray(parsed?.r) ? parsed.r : [];
  if (rRows.length) {
    for (const row of rRows) {
      if (!Array.isArray(row) || row.length < 3) {
        continue;
      }
      const personIndex = Number(row[0]);
      const key = String(row[1] || "").trim();
      const targetIndex = Number(row[2]);
      const person = persons[personIndex];
      const target = persons[targetIndex];
      if (!person || !key || !target) {
        continue;
      }
      person.rels.push({
        key,
        label: REL_META[key] || key,
        target: target.name,
        placeholder: target.placeholder,
      });
    }
  } else {
    for (const person of persons) {
      for (const rel of person._rawRels || []) {
        if (!Array.isArray(rel) || rel.length < 2) {
          continue;
        }
        const key = String(rel[0] || "").trim();
        const targetRaw = rel[1];
        let targetName = "";
        let targetPlaceholder = null;
        if (typeof targetRaw === "number" && persons[targetRaw]) {
          targetName = persons[targetRaw].name;
          targetPlaceholder = persons[targetRaw].placeholder;
        } else {
          targetName = String(targetRaw ?? "").trim();
          targetPlaceholder = valueToPlaceholder.get(targetName) || null;
        }
        if (!key || !targetName) {
          continue;
        }
        person.rels.push({
          key,
          label: REL_META[key] || key,
          target: targetName,
          placeholder: targetPlaceholder,
        });
      }
    }
  }

  for (const id of asIdList(parsed?.o)) {
    const text = resolveCandidate(byId, id)?.text;
    if (text) {
      registerValue("ORG", text);
    }
  }
  for (const id of asIdList(parsed?.l)) {
    const text = resolveCandidate(byId, id)?.text;
    if (text) {
      registerValue("LOC", text);
    }
  }
  for (const id of asIdList(parsed?.d)) {
    const text = resolveCandidate(byId, id)?.text;
    if (text) {
      registerValue("DAT", text);
    }
  }

  // Legacy flat g format
  if (!persons.length && Array.isArray(parsed?.g)) {
    for (const entry of parsed.g) {
      if (!Array.isArray(entry) || entry.length < 2) {
        continue;
      }
      const type = normalizeType(entry[0]);
      let aliases = [];
      if (Array.isArray(entry[1]) && entry[1].every((item) => typeof item === "number")) {
        aliases = textsFromIds(entry[1]);
      } else {
        aliases = (Array.isArray(entry[1]) ? entry[1] : [entry[1]])
          .map((value) => String(value ?? "").trim())
          .filter((value) => value && sourceText.includes(value));
      }
      if (!aliases.length) {
        continue;
      }
      const placeholder = nextPlaceholder(type);
      groups.push({
        type,
        category: type.toLowerCase(),
        placeholder,
        aliases: uniqueLongestFirst(aliases),
        original: aliases[0],
      });
      for (const alias of aliases) {
        valueToPlaceholder.set(alias, placeholder);
      }
      if (type === "PER") {
        persons.push({
          name: aliases[0],
          placeholder,
          aliases: aliases.slice(1),
          corefs: [],
          attrs: [],
          rels: [],
        });
      }
    }
  }

  for (const person of persons) {
    delete person._rawAttrs;
    delete person._rawRels;
  }

  return {
    persons,
    groups: groups.map((group) => ({
      ...group,
      aliases: uniqueLongestFirst(group.aliases),
    })),
    candidates,
  };
}

export function applyAlbertReplacements(sourceText, groupsWithPlaceholders) {
  if (!sourceText) {
    return "";
  }

  const pairs = [];
  for (const group of groupsWithPlaceholders) {
    for (const alias of group.aliases) {
      pairs.push({ alias, placeholder: group.placeholder });
    }
  }

  pairs.sort((left, right) => right.alias.length - left.alias.length);

  let output = sourceText;
  for (const pair of pairs) {
    if (!pair.alias) {
      continue;
    }
    output = output.split(pair.alias).join(pair.placeholder);
  }
  return output;
}

export function groupsToReplacementRows(groupsWithPlaceholders) {
  return groupsWithPlaceholders.map((group, index) => ({
    id: `rep-${index}`,
    original: group.aliases.join(" · "),
    placeholder: group.placeholder,
    category: group.category,
    note: group.aliases.length > 1 ? `${group.aliases.length} forms` : "",
  }));
}

/** Prefer a high completion ceiling; fall back if the API rejects the value. */
const MAX_TOKEN_CANDIDATES = [16384, 8192, 4096, 2048];

async function chatCompletionWithMaxTokens({ apiKey, requestBody, withJsonObject }) {
  let lastError = null;

  for (const maxTokens of MAX_TOKEN_CANDIDATES) {
    const body = {
      ...requestBody,
      max_tokens: maxTokens,
      ...(withJsonObject ? { response_format: { type: "json_object" } } : {}),
    };

    try {
      return await albertFetch("/chat/completions", {
        apiKey,
        method: "POST",
        body,
      });
    } catch (error) {
      lastError = error;
      const message = error instanceof Error ? error.message : String(error);
      const isTokenLimit = /max_tokens|maximum context|context length|too many tokens|completion length/i.test(
        message,
      );
      if (!isTokenLimit || maxTokens === MAX_TOKEN_CANDIDATES[MAX_TOKEN_CANDIDATES.length - 1]) {
        throw error;
      }
    }
  }

  throw lastError || new Error("Albert chat completion failed.");
}

export async function runAlbertGenerativeAnonymization({
  apiKey,
  model = ALBERT_DEFAULT_MODEL,
  text,
  extraInstructions = "",
}) {
  const sourceText = text?.trim() || "";
  if (!sourceText) {
    throw new Error("Empty text.");
  }

  if (sourceText.length > ALBERT_MAX_INPUT_CHARS) {
    throw new Error(
      `Text is too long (${sourceText.length} characters). Please keep it under ${ALBERT_MAX_INPUT_CHARS}.`,
    );
  }

  const candidates = extractAlbertCandidates(sourceText);
  if (!candidates.length) {
    throw new Error("No candidate spans found in the text.");
  }

  const candidateList = formatAlbertCandidateList(candidates);

  const userParts = [
    "Reponds avec un OBJET JSON {\"p\":[[ids...],...],\"x\":[[i,\"tel\",id],...],\"r\":[[i,\"resp\",j],...],\"o\":[],\"l\":[],\"d\":[]}. Uniquement des ids entiers de Candidats. Aucune chaine du texte.",
    extraInstructions.trim()
      ? `Consignes:\n${extraInstructions.trim()}`
      : null,
    `Candidats (id|texte):\n${candidateList}`,
    `Texte:\n${sourceText}`,
  ].filter(Boolean);

  const messages = [
    { role: "system", content: SYSTEM_PROMPT },
    { role: "user", content: userParts.join("\n\n") },
  ];

  const requestBody = {
    model,
    messages,
    temperature: 0,
    stream: false,
  };

  let payload;
  try {
    payload = await chatCompletionWithMaxTokens({
      apiKey,
      requestBody,
      withJsonObject: true,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!/response_format|json_object|unsupported|400|422/i.test(message)) {
      throw error;
    }

    payload = await chatCompletionWithMaxTokens({
      apiKey,
      requestBody,
      withJsonObject: false,
    });
  }

  const choice = payload?.choices?.[0];
  const content = choice?.message?.content;
  const finishReason = choice?.finish_reason || choice?.finishReason;
  let parsed = extractJsonObject(content, { finishReason });
  if (Array.isArray(parsed)) {
    parsed = { p: parsed };
  }
  const { persons, groups } = expandAlbertGraph(parsed, sourceText, candidates);

  if (!groups.length) {
    throw new Error("Model returned no usable candidate ids to mask.");
  }

  const anonymizedText = applyAlbertReplacements(sourceText, groups);
  const replacements = groupsToReplacementRows(groups);

  return {
    sourceText,
    anonymizedText,
    replacements,
    persons,
    groups,
    candidates,
    model: payload?.model || model,
    usage: payload?.usage || null,
    finishReason: finishReason || null,
  };
}
