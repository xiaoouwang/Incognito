/** Browser GLiNER-relex — joint NER + relation extraction for Basic & Advanced. */

export const GLINER_RELEX_REPO = "g-gonzalez-brena/gliner-relex-base-onnx";

/** Display id shown in the UI / status line. */
export const GLINER_RELEX_MODEL_ID = GLINER_RELEX_REPO;

/**
 * Person-graph ReLex runs on short overlapping windows (not the full document).
 * Shorter windows keep span/pair budgets local and improve attribute linking.
 */
export const GLINER_RELEX_CHUNK_CHARS = 750;
export const GLINER_RELEX_CHUNK_OVERLAP = 160;

export const GLINER_RELEX_ENTITY_MODEL_FILE = "entity_model.fp16.onnx";
export const GLINER_RELEX_RELATION_MODEL_FILE = "relation_model.fp16.onnx";

export const GLINER_RELEX_ENTITY_MODEL_URL = `https://huggingface.co/${GLINER_RELEX_REPO}/resolve/main/${GLINER_RELEX_ENTITY_MODEL_FILE}`;
export const GLINER_RELEX_RELATION_MODEL_URL = `https://huggingface.co/${GLINER_RELEX_REPO}/resolve/main/${GLINER_RELEX_RELATION_MODEL_FILE}`;
export const GLINER_RELEX_SPECIAL_TOKENS_URL = `https://huggingface.co/${GLINER_RELEX_REPO}/resolve/main/special_tokens.json`;

/**
 * Entity labels for Basic mode (CamemBERT-like set + contacts).
 * Advanced passes its chip selection instead.
 */
export const GLINER_RELEX_BASIC_ENTITY_LABELS = [
  "person",
  "organization",
  "location",
  "address",
  "date",
  "email",
  "phone number",
  "identity document number",
  "url",
];

/** Zero-shot relation labels for qualitative anonymization graphs. */
export const GLINER_RELEX_RELATION_LABELS = [
  "lives at",
  "lives in",
  "resides at",
  "located in",
  "born in",
  "born on",
  "works for",
  "works at",
  "employed by",
  "studied at",
  "colleague of",
  "family of",
  "spouse of",
  "child of",
  "parent of",
  "sibling of",
  "mother of",
  "father of",
  "son of",
  "daughter of",
  "brother of",
  "sister of",
  "reports to",
  "manages",
  "has email",
  "has phone",
  "has nationality",
  "suffers from",
  "has diploma",
  "graduated from",
  "has age",
  "aged",
  "has profession",
  "works as",
  "has job title",
];

/**
 * Relation → person-graph attribute key/label when the tail is not another person.
 * Person–person relations stay as `rels`.
 */
export const GLINER_RELEX_ATTR_RELATIONS = {
  "lives at": { key: "addr", label: "adresse" },
  "lives in": { key: "loc", label: "lieu" },
  "resides at": { key: "addr", label: "adresse" },
  "located in": { key: "loc", label: "lieu" },
  "born in": { key: "pob", label: "lieu de naissance" },
  "born on": { key: "dob", label: "date de naissance" },
  "works for": { key: "org", label: "employeur" },
  "works at": { key: "org", label: "lieu de travail" },
  "employed by": { key: "org", label: "employeur" },
  "studied at": { key: "org", label: "école" },
  "has email": { key: "em", label: "email" },
  "has phone": { key: "tel", label: "téléphone" },
  "has nationality": { key: "nat", label: "nationalité" },
  "suffers from": { key: "misc", label: "maladie" },
  "has diploma": { key: "misc", label: "diplôme" },
  "graduated from": { key: "org", label: "école" },
  "has age": { key: "age", label: "âge" },
  aged: { key: "age", label: "âge" },
  "has profession": { key: "job", label: "profession" },
  "works as": { key: "job", label: "profession" },
  "has job title": { key: "job", label: "fonction" },
};

export const GLINER_RELEX_DEFAULT_ENTITY_THRESHOLD = 0.3;
export const GLINER_RELEX_DEFAULT_RELATION_THRESHOLD = 0.5;
export const GLINER_RELEX_DEFAULT_ADJACENCY_THRESHOLD = 0.5;

export const GLINER_RELEX_CACHE_NAME = "incognito-gliner-relex-v1";
