/**
 * Incognito session document — round-trip save/open for Basic & Advanced
 * (single current document). Separate from Label Studio export JSON.
 */

import packageJson from "../../package.json";
import { downloadFile, normalizeEntities } from "./entityUtils.js";

export const SESSION_FORMAT = "incognito.session";
export const SESSION_VERSION = 1;

const SUPPORTED_WORKFLOWS = new Set(["basic", "advanced"]);

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function cloneJson(value, fallback) {
  if (value == null) {
    return fallback;
  }
  try {
    return JSON.parse(JSON.stringify(value));
  } catch {
    return fallback;
  }
}

function sanitizeEntityList(entities, sourceText) {
  if (!Array.isArray(entities)) {
    return [];
  }
  return normalizeEntities(
    entities.map((entity) => ({
      start: Number(entity?.start),
      end: Number(entity?.end),
      text: String(entity?.text ?? ""),
      label: String(entity?.label ?? "misc"),
      source: entity?.source || "session",
      id: entity?.id,
    })),
    sourceText,
  );
}

function sanitizeStringKeyMap(value) {
  if (!isPlainObject(value)) {
    return {};
  }
  const next = {};
  for (const [key, entry] of Object.entries(value)) {
    if (!key) {
      continue;
    }
    if (entry === true || entry === 1) {
      next[key] = true;
    } else if (isPlainObject(entry)) {
      next[key] = cloneJson(entry, entry);
    } else if (typeof entry === "string") {
      next[key] = entry;
    }
  }
  return next;
}

function sanitizeCategorySelection(value) {
  if (!isPlainObject(value)) {
    return {};
  }
  const next = {};
  for (const [key, enabled] of Object.entries(value)) {
    if (key) {
      next[key] = Boolean(enabled);
    }
  }
  return next;
}

function sanitizeCustomCategories(value) {
  if (!isPlainObject(value)) {
    return {};
  }
  const next = {};
  for (const [key, label] of Object.entries(value)) {
    if (key && typeof label === "string" && label.trim()) {
      next[key] = label.trim();
    }
  }
  return next;
}

/** Build a versioned session object from live UI state. */
export function buildSessionDocument({
  workflow,
  text,
  entities,
  removedEntities = [],
  modelName = null,
  nerEngine = null,
  threshold = null,
  customCategories = {},
  selectedCategories = {},
  excludedEntityKeys = {},
  categoryMethods = {},
  surfaceOverrides = {},
  distinctOccurrenceKeys = {},
  linkedValueKeys = {},
  anonymizedTextOverride = null,
  activeLabels = null,
  customDetectionLabels = null,
  personGraph = null,
} = {}) {
  const workflowId = workflow === "advanced" ? "advanced" : "basic";
  const sourceText = String(text || "");

  return {
    format: SESSION_FORMAT,
    version: SESSION_VERSION,
    appVersion: packageJson.version || null,
    exportedAt: new Date().toISOString(),
    workflow: workflowId,
    document: {
      text: sourceText,
      entities: sanitizeEntityList(entities, sourceText),
      removedEntities: sanitizeEntityList(removedEntities, sourceText),
      modelName: modelName || null,
      nerEngine: nerEngine || null,
      threshold: typeof threshold === "number" ? threshold : null,
      customCategories: sanitizeCustomCategories(customCategories),
      selectedCategories: sanitizeCategorySelection(selectedCategories),
      excludedEntityKeys: sanitizeStringKeyMap(excludedEntityKeys),
      categoryMethods: cloneJson(categoryMethods, {}),
      surfaceOverrides: cloneJson(surfaceOverrides, {}),
      distinctOccurrenceKeys: sanitizeStringKeyMap(distinctOccurrenceKeys),
      linkedValueKeys: cloneJson(linkedValueKeys, {}),
      anonymizedTextOverride:
        typeof anonymizedTextOverride === "string" ? anonymizedTextOverride : null,
      activeLabels: Array.isArray(activeLabels)
        ? activeLabels.map((label) => String(label)).filter(Boolean)
        : null,
      customDetectionLabels: Array.isArray(customDetectionLabels)
        ? customDetectionLabels.map((label) => String(label)).filter(Boolean)
        : null,
    },
    personGraph: personGraph
      ? {
          persons: cloneJson(personGraph.persons, []),
          excludedPlaceholders: sanitizeStringKeyMap(personGraph.excludedPlaceholders),
          excludedSurfaces: sanitizeStringKeyMap(personGraph.excludedSurfaces),
          relationOverrides: cloneJson(personGraph.relationOverrides, {}),
          edgeLabelOverrides: cloneJson(personGraph.edgeLabelOverrides, {}),
          edgeValueOverrides: cloneJson(personGraph.edgeValueOverrides, {}),
          note: typeof personGraph.note === "string" ? personGraph.note : "",
        }
      : null,
  };
}

function looksLikeLabelStudioExport(value) {
  if (!Array.isArray(value) || !value.length) {
    return false;
  }
  const first = value[0];
  return Boolean(
    isPlainObject(first) &&
      isPlainObject(first.data) &&
      typeof first.data.text === "string" &&
      Array.isArray(first.predictions),
  );
}

/**
 * Parse and validate a session JSON string or object.
 * @returns {{ ok: true, session: object } | { ok: false, errorKey: string, errorDetail?: string }}
 */
export function parseSessionDocument(raw) {
  let value = raw;
  if (typeof raw === "string") {
    try {
      value = JSON.parse(raw);
    } catch {
      return { ok: false, errorKey: "sessionImportInvalidJson" };
    }
  }

  if (looksLikeLabelStudioExport(value)) {
    return { ok: false, errorKey: "sessionImportLabelStudio" };
  }

  if (!isPlainObject(value)) {
    return { ok: false, errorKey: "sessionImportNotSession" };
  }

  if (value.format !== SESSION_FORMAT) {
    return { ok: false, errorKey: "sessionImportNotSession" };
  }

  const version = Number(value.version);
  if (!Number.isFinite(version) || version < 1) {
    return { ok: false, errorKey: "sessionImportUnsupportedVersion" };
  }
  if (version > SESSION_VERSION) {
    return {
      ok: false,
      errorKey: "sessionImportUnsupportedVersion",
      errorDetail: String(version),
    };
  }

  if (!SUPPORTED_WORKFLOWS.has(value.workflow)) {
    return { ok: false, errorKey: "sessionImportUnsupportedWorkflow" };
  }

  const document = value.document;
  if (!isPlainObject(document) || typeof document.text !== "string") {
    return { ok: false, errorKey: "sessionImportMissingDocument" };
  }

  const sourceText = document.text;
  const session = {
    format: SESSION_FORMAT,
    version,
    appVersion: value.appVersion || null,
    exportedAt: value.exportedAt || null,
    workflow: value.workflow,
    document: {
      text: sourceText,
      entities: sanitizeEntityList(document.entities, sourceText),
      removedEntities: sanitizeEntityList(document.removedEntities, sourceText),
      modelName: document.modelName || null,
      nerEngine: document.nerEngine || null,
      threshold: typeof document.threshold === "number" ? document.threshold : null,
      customCategories: sanitizeCustomCategories(document.customCategories),
      selectedCategories: sanitizeCategorySelection(document.selectedCategories),
      excludedEntityKeys: sanitizeStringKeyMap(document.excludedEntityKeys),
      categoryMethods: isPlainObject(document.categoryMethods)
        ? cloneJson(document.categoryMethods, {})
        : {},
      surfaceOverrides: isPlainObject(document.surfaceOverrides)
        ? cloneJson(document.surfaceOverrides, {})
        : {},
      distinctOccurrenceKeys: sanitizeStringKeyMap(document.distinctOccurrenceKeys),
      linkedValueKeys: isPlainObject(document.linkedValueKeys)
        ? cloneJson(document.linkedValueKeys, {})
        : {},
      anonymizedTextOverride:
        typeof document.anonymizedTextOverride === "string"
          ? document.anonymizedTextOverride
          : null,
      activeLabels: Array.isArray(document.activeLabels)
        ? document.activeLabels.map((label) => String(label)).filter(Boolean)
        : null,
      customDetectionLabels: Array.isArray(document.customDetectionLabels)
        ? document.customDetectionLabels.map((label) => String(label)).filter(Boolean)
        : null,
    },
    personGraph: null,
  };

  if (isPlainObject(value.personGraph)) {
    session.personGraph = {
      persons: Array.isArray(value.personGraph.persons)
        ? cloneJson(value.personGraph.persons, [])
        : [],
      excludedPlaceholders: sanitizeStringKeyMap(value.personGraph.excludedPlaceholders),
      excludedSurfaces: sanitizeStringKeyMap(value.personGraph.excludedSurfaces),
      relationOverrides: isPlainObject(value.personGraph.relationOverrides)
        ? cloneJson(value.personGraph.relationOverrides, {})
        : {},
      edgeLabelOverrides: isPlainObject(value.personGraph.edgeLabelOverrides)
        ? cloneJson(value.personGraph.edgeLabelOverrides, {})
        : {},
      edgeValueOverrides: isPlainObject(value.personGraph.edgeValueOverrides)
        ? cloneJson(value.personGraph.edgeValueOverrides, {})
        : {},
      note: typeof value.personGraph.note === "string" ? value.personGraph.note : "",
    };
  }

  return { ok: true, session };
}

export function sessionFileName(workflow = "basic", date = new Date()) {
  const stamp = date.toISOString().slice(0, 10);
  const mode = workflow === "advanced" ? "advanced" : "basic";
  return `incognito-session-${mode}-${stamp}.json`;
}

export function downloadSessionDocument(session, fileName) {
  const payload = JSON.stringify(session, null, 2);
  downloadFile(
    payload,
    fileName || sessionFileName(session.workflow),
    "application/json;charset=utf-8",
  );
}
