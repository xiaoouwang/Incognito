/**
 * Albert LLM entity detection for Advanced generative mode.
 * Returns exact substrings + labels; the client resolves offsets locally.
 */

import { GLINER_LABELS, GLINER_LABEL_DESCRIPTIONS } from "./glinerConstants.js";
import { ALBERT_MAX_INPUT_CHARS } from "./albertConstants.js";
import {
  findAllOccurrenceRanges,
  formatCategoryDisplayName,
  inferCustomCategoriesFromEntities,
  normalizeEntities,
  slugifyCategoryId,
} from "./entityUtils.js";
import { mergeEntities } from "./ruleDetection.js";

const KNOWN_LABELS = new Set(GLINER_LABELS);

const LABEL_ALIASES = {
  people: "person",
  persons: "person",
  personne: "person",
  personnes: "person",
  name: "person",
  names: "person",
  nom: "person",
  org: "organization",
  organisation: "organization",
  organizations: "organization",
  company: "organization",
  lieu: "location",
  lieux: "location",
  place: "location",
  places: "location",
  city: "location",
  adresse: "address",
  addresses: "address",
  mail: "email",
  e_mail: "email",
  telephone: "phone number",
  téléphone: "phone number",
  phone: "phone number",
  phones: "phone number",
  tel: "phone number",
  passport: "identity document number",
  "passport number": "identity document number",
  "social security number": "identity document number",
  "national id": "identity document number",
  "identity document": "identity document number",
  "identity document number": "identity document number",
  nir: "identity document number",
  "numéro de sécurité sociale": "identity document number",
  "numero de securite sociale": "identity document number",
  "numéro de passeport": "identity document number",
  "numero de passeport": "identity document number",
  dates: "date",
  âge: "age",
  ages: "age",
  job: "profession",
  jobs: "profession",
  role: "job title or project role",
  roles: "job title or project role",
  "job title": "job title or project role",
  "job titles": "job title or project role",
  école: "school",
  schools: "school",
  university: "school",
  hopital: "hospital",
  hôpital: "hospital",
  hospitals: "hospital",
  family: "family member",
  relative: "family member",
  nationalite: "nationality",
  nationalité: "nationality",
  maladie: "disease",
  diseases: "disease",
  diplome: "diploma",
  diplôme: "diploma",
  diplomas: "diploma",
  link: "url",
  links: "url",
};

export function buildDefaultAlbertDetectionLabels() {
  return [...GLINER_LABELS];
}

export function formatAlbertDetectionLabelList(labels = GLINER_LABELS) {
  return labels
    .map((label) => {
      const description = GLINER_LABEL_DESCRIPTIONS[label];
      return description ? `- ${label}: ${description}` : `- ${label}`;
    })
    .join("\n");
}

export function normalizeAlbertDetectionLabel(raw) {
  const trimmed = String(raw || "").trim();
  if (!trimmed) {
    return "misc";
  }

  const lower = trimmed.toLowerCase();
  if (KNOWN_LABELS.has(lower)) {
    return lower;
  }
  if (LABEL_ALIASES[lower]) {
    return LABEL_ALIASES[lower];
  }

  const slug = slugifyCategoryId(trimmed).replace(/_/g, " ");
  if (KNOWN_LABELS.has(slug)) {
    return slug;
  }
  if (LABEL_ALIASES[slug]) {
    return LABEL_ALIASES[slug];
  }

  // Prefer snake_case custom ids for CSS / menus.
  const customId = slugifyCategoryId(trimmed);
  return customId === "custom" ? "misc" : customId.replace(/_/g, " ");
}

/**
 * Parse Albert NER JSON into [{ label, text }] rows.
 * Accepts {"e":[[label,text],...]} or {"entities":[{label,text},...]}.
 */
export function parseAlbertEntityDetections(parsed) {
  if (!parsed || typeof parsed !== "object") {
    return [];
  }

  const rows = [];
  const list = Array.isArray(parsed.e)
    ? parsed.e
    : Array.isArray(parsed.entities)
      ? parsed.entities
      : Array.isArray(parsed)
        ? parsed
        : null;

  if (!list) {
    return [];
  }

  for (const item of list) {
    if (Array.isArray(item) && item.length >= 2) {
      const label = normalizeAlbertDetectionLabel(item[0]);
      const text = String(item[1] ?? "").trim();
      if (label && text) {
        rows.push({ label, text });
      }
      continue;
    }
    if (item && typeof item === "object") {
      const label = normalizeAlbertDetectionLabel(item.label || item.type || item.category);
      const text = String(item.text || item.value || item.span || "").trim();
      if (label && text) {
        rows.push({ label, text });
      }
    }
  }

  return rows;
}

/**
 * Resolve exact substrings onto source offsets (all occurrences).
 */
export function albertDetectionsToEntities(sourceText, detections) {
  if (!sourceText || !detections?.length) {
    return [];
  }

  const raw = [];
  const seenValue = new Set();

  for (const detection of detections) {
    const label = normalizeAlbertDetectionLabel(detection.label);
    const surface = String(detection.text || "").trim();
    if (!label || !surface) {
      continue;
    }

    const valueKey = `${label}:${surface.toLocaleLowerCase()}`;
    if (seenValue.has(valueKey)) {
      continue;
    }
    seenValue.add(valueKey);

    const ranges = findAllOccurrenceRanges(sourceText, surface);
    if (!ranges.length) {
      continue;
    }

    for (const range of ranges) {
      raw.push({
        start: range.start,
        end: range.end,
        text: range.text,
        label,
        source: "albert",
      });
    }
  }

  return normalizeEntities(mergeEntities(raw), sourceText);
}

export function buildCustomCategoriesFromAlbertEntities(entities, existing = {}) {
  const inferred = inferCustomCategoriesFromEntities(entities, existing);
  // Prefer readable names for snake_case / spaced custom labels.
  for (const entity of entities) {
    const id = entity.label;
    if (!id || KNOWN_LABELS.has(id) || inferred[id]) {
      continue;
    }
    inferred[id] = formatCategoryDisplayName(id);
  }
  return inferred;
}

export const ALBERT_ENTITY_DETECTION_SYSTEM_PROMPT = `Tu es un extracteur d'entites pour l'anonymisation. JSON seul, aucun commentaire.

Schema EXACT:
{"e":[["person","Marie Curie"],["age","45 ans"],["organization","CNRS"]]}

Regles:
- Chaque 2e element DOIT etre une sous-chaine EXACTE du texte (casse, accents, espaces inclus).
- N'invente aucune chaine absente du texte.
- Une seule entree par couple (label, valeur) meme si la valeur se repete.
- Utilise de preference les labels fournis.
- Pour des categories supplementaires demandees, invente un label court en snake_case ou mots simples (ex. "military rank", "religion").
- Ignore le bruit non sensible.`;

export function buildAlbertEntityDetectionUserPrompt({
  sourceText,
  labels = GLINER_LABELS,
  categoryInstructions = "",
}) {
  const parts = [
    "Extrais toutes les entites a anonymiser. Reponds avec {\"e\":[[label,sous-chaine],...]}.",
    `Labels de reference (Basic + Advanced):\n${formatAlbertDetectionLabelList(labels)}`,
  ];

  if (categoryInstructions.trim()) {
    parts.push(
      `Categories / consignes supplementaires (langage naturel — cree des labels adaptes si besoin):\n${categoryInstructions.trim()}`,
    );
  }

  parts.push(`Texte:\n${sourceText}`);
  return parts.join("\n\n");
}

export function assertAlbertDetectionInput(text) {
  const sourceText = text?.trim() || "";
  if (!sourceText) {
    throw new Error("Empty text.");
  }
  if (sourceText.length > ALBERT_MAX_INPUT_CHARS) {
    throw new Error(
      `Text is too long (${sourceText.length} characters). Please keep it under ${ALBERT_MAX_INPUT_CHARS}.`,
    );
  }
  return sourceText;
}
