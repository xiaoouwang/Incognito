/**
 * Incognito session document — round-trip save/open for Basic & Advanced.
 * One JSON = one document (also used per file in batch mode).
 * Separate from Label Studio export JSON.
 */

import packageJson from "../../package.json";
import { buildBatchOutputBaseName, downloadFile, normalizeEntities } from "./entityUtils.js";

export const SESSION_FORMAT = "incognito.session";
export const BATCH_SESSION_FORMAT = "incognito.session.batch";
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

function normalizeFileName(name) {
  return String(name || "")
    .trim()
    .toLocaleLowerCase();
}

function fileNameStem(name) {
  return buildBatchOutputBaseName(String(name || "").trim()).toLocaleLowerCase();
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
  sourceFile = null,
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
  relations = null,
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
      sourceFile: sourceFile ? String(sourceFile) : null,
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
      relations: Array.isArray(relations) ? cloneJson(relations, []) : null,
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
      sourceFile:
        typeof document.sourceFile === "string" && document.sourceFile.trim()
          ? document.sourceFile.trim()
          : null,
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
      relations: Array.isArray(document.relations) ? cloneJson(document.relations, []) : null,
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

  return { ok: true, kind: "single", session };
}

/** Build one document session from a batch file + saved fileState. */
export function buildSessionFromFileState(
  file,
  savedState = {},
  {
    workflow = "basic",
    nerEngine = null,
    threshold = null,
    categoryMethods = {},
    activeLabels = null,
    customDetectionLabels = null,
  } = {},
) {
  const personGraph = savedState.personGraph || null;
  return buildSessionDocument({
    workflow,
    text: savedState.text ?? file?.text ?? "",
    sourceFile: file?.name || savedState.sourceFile || null,
    entities: savedState.entities || [],
    removedEntities: savedState.removedEntities || [],
    modelName: savedState.modelName || null,
    nerEngine: savedState.nerEngine || nerEngine,
    threshold: typeof savedState.threshold === "number" ? savedState.threshold : threshold,
    customCategories: savedState.customCategories || {},
    selectedCategories: savedState.selectedCategories || {},
    excludedEntityKeys: savedState.excludedEntityKeys || {},
    categoryMethods: savedState.categoryMethods || categoryMethods || {},
    surfaceOverrides: savedState.surfaceOverrides || {},
    distinctOccurrenceKeys: savedState.distinctOccurrenceKeys || {},
    linkedValueKeys: savedState.linkedValueKeys || {},
    anonymizedTextOverride: savedState.anonymizedTextOverride ?? null,
    activeLabels: savedState.activeLabels || activeLabels,
    customDetectionLabels: savedState.customDetectionLabels || customDetectionLabels,
    relations: savedState.relations || [],
    personGraph,
  });
}

/** Multi-document session covering every file in a batch. */
export function buildBatchSessionDocument({
  workflow = "basic",
  label = null,
  files = [],
  fileStates = {},
  nerEngine = null,
  threshold = null,
  categoryMethods = {},
  activeLabels = null,
  customDetectionLabels = null,
} = {}) {
  const workflowId = workflow === "advanced" ? "advanced" : "basic";
  const documents = (files || []).map((file) =>
    buildSessionFromFileState(file, fileStates[file.id] || {}, {
      workflow: workflowId,
      nerEngine,
      threshold,
      categoryMethods,
      activeLabels,
      customDetectionLabels,
    }),
  );

  return {
    format: BATCH_SESSION_FORMAT,
    version: SESSION_VERSION,
    appVersion: packageJson.version || null,
    exportedAt: new Date().toISOString(),
    workflow: workflowId,
    label: label ? String(label) : null,
    documents,
  };
}

/**
 * Parse a single-document or batch session JSON.
 * @returns {{ ok: true, kind: "single"|"batch", session?: object, batch?: object } | { ok: false, errorKey: string, errorDetail?: string }}
 */
export function parseAnySessionDocument(raw) {
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

  if (value.format === BATCH_SESSION_FORMAT) {
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
    if (!Array.isArray(value.documents) || !value.documents.length) {
      return { ok: false, errorKey: "sessionImportMissingDocument" };
    }

    const documents = [];
    for (const entry of value.documents) {
      const parsed = parseSessionDocument(entry);
      if (!parsed.ok) {
        return parsed;
      }
      documents.push(parsed.session);
    }

    return {
      ok: true,
      kind: "batch",
      batch: {
        format: BATCH_SESSION_FORMAT,
        version,
        appVersion: value.appVersion || null,
        exportedAt: value.exportedAt || null,
        workflow: value.workflow,
        label: typeof value.label === "string" ? value.label : null,
        documents,
      },
    };
  }

  const single = parseSessionDocument(value);
  if (!single.ok) {
    return single;
  }
  return { ok: true, kind: "single", session: single.session };
}

/** Rebuild batch file entries + fileStates from a batch session. */
export function materializeBatchFromSession(batch) {
  const files = [];
  const fileStates = {};

  for (const [index, session] of (batch?.documents || []).entries()) {
    const sourceName =
      session.document?.sourceFile ||
      `document-${String(index + 1).padStart(3, "0")}.txt`;
    const id = sourceName;
    const text = session.document?.text || "";
    const file = {
      id,
      name: sourceName.includes("/") ? sourceName.split("/").pop() : sourceName,
      path: sourceName,
      text,
    };
    // Avoid id collisions when names repeat.
    let uniqueId = id;
    let suffix = 2;
    while (fileStates[uniqueId]) {
      uniqueId = `${id}#${suffix}`;
      suffix += 1;
    }
    file.id = uniqueId;
    files.push(file);
    fileStates[uniqueId] = fileStateFromSession(session, { outputsModified: true });
    fileStates[uniqueId].sourceFile = file.name;
    fileStates[uniqueId].text = text;
  }

  return { files, fileStates };
}

export function sessionFileName(workflow = "basic", date = new Date(), sourceFile = null) {
  const stamp = date.toISOString().slice(0, 10);
  const mode = workflow === "advanced" ? "advanced" : "basic";
  if (sourceFile) {
    const base = buildBatchOutputBaseName(String(sourceFile)).replace(/[^\w.\-]+/g, "_");
    return `${base}-incognito-session-${mode}-${stamp}.json`;
  }
  return `incognito-session-${mode}-${stamp}.json`;
}

export function downloadSessionDocument(session, fileName) {
  const payload = JSON.stringify(session, null, 2);
  downloadFile(
    payload,
    fileName ||
      sessionFileName(session.workflow, new Date(), session.document?.sourceFile || null),
    "application/json;charset=utf-8",
  );
}

export function batchSessionFileName(workflow = "basic", date = new Date(), label = null) {
  const stamp = date.toISOString().slice(0, 10);
  const mode = workflow === "advanced" ? "advanced" : "basic";
  const safeLabel = label
    ? String(label)
        .replace(/[^\w.\-]+/g, "_")
        .replace(/^_+|_+$/g, "")
        .slice(0, 40)
    : "";
  return safeLabel
    ? `incognito-batch-session-${mode}-${safeLabel}-${stamp}.json`
    : `incognito-batch-session-${mode}-${stamp}.json`;
}

export function downloadBatchSessionDocument(batchSession, fileName) {
  const payload = JSON.stringify(batchSession, null, 2);
  downloadFile(
    payload,
    fileName ||
      batchSessionFileName(batchSession.workflow, new Date(), batchSession.label || null),
    "application/json;charset=utf-8",
  );
}

/** Convert a parsed session into batch `fileStates` shape. */
export function fileStateFromSession(session, { outputsModified = true } = {}) {
  const doc = session?.document || {};
  return {
    text: doc.text || "",
    entities: Array.isArray(doc.entities) ? doc.entities : [],
    removedEntities: Array.isArray(doc.removedEntities) ? doc.removedEntities : [],
    selectedCategories: doc.selectedCategories || {},
    excludedEntityKeys: doc.excludedEntityKeys || {},
    modelName: doc.modelName || null,
    nerEngine: doc.nerEngine || null,
    threshold: typeof doc.threshold === "number" ? doc.threshold : null,
    customCategories: doc.customCategories || {},
    categoryMethods: doc.categoryMethods || {},
    surfaceOverrides: doc.surfaceOverrides || {},
    distinctOccurrenceKeys: doc.distinctOccurrenceKeys || {},
    linkedValueKeys: doc.linkedValueKeys || {},
    anonymizedTextOverride: doc.anonymizedTextOverride ?? null,
    activeLabels: Array.isArray(doc.activeLabels) ? doc.activeLabels : null,
    customDetectionLabels: Array.isArray(doc.customDetectionLabels)
      ? doc.customDetectionLabels
      : null,
    relations: Array.isArray(doc.relations) ? doc.relations : [],
    personGraph: session?.personGraph || null,
    excludedPlaceholders: session?.personGraph?.excludedPlaceholders || {},
    excludedSurfaces: session?.personGraph?.excludedSurfaces || {},
    outputsModified: Boolean(outputsModified),
    sourceFile: doc.sourceFile || null,
  };
}

/**
 * Match a session to an unmatched batch file.
 * Priority: sourceFile name → text equality → upload filename stem contains file stem.
 */
export function matchSessionToBatchFile(session, batchFiles, usedIds = new Set(), uploadName = "") {
  const available = (batchFiles || []).filter((file) => file && !usedIds.has(file.id));
  if (!available.length) {
    return null;
  }

  const sourceFile = session?.document?.sourceFile || "";
  const sourceNorm = normalizeFileName(sourceFile);
  const sourceStem = fileNameStem(sourceFile);

  if (sourceNorm) {
    const byName = available.find((file) => normalizeFileName(file.name) === sourceNorm);
    if (byName) {
      return byName;
    }
    if (sourceStem) {
      const byStem = available.find((file) => fileNameStem(file.name) === sourceStem);
      if (byStem) {
        return byStem;
      }
    }
  }

  const sessionText = String(session?.document?.text || "");
  if (sessionText) {
    const byText = available.find((file) => String(file.text || "") === sessionText);
    if (byText) {
      return byText;
    }
  }

  const uploadStem = fileNameStem(uploadName);
  if (uploadStem) {
    const byUpload = available.find((file) => {
      const stem = fileNameStem(file.name);
      return stem && (uploadStem === stem || uploadStem.includes(stem) || stem.includes(uploadStem));
    });
    if (byUpload) {
      return byUpload;
    }
  }

  return null;
}
