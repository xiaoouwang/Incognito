import { startTransition, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { yieldToMain } from "../lib/yieldToMain.js";
import AuditReportWindow from "./AuditReportWindow.jsx";
import CategoryReview from "./CategoryReview.jsx";
import EntityEditMenu from "./EntityEditMenu.jsx";
import HighlightedText from "./HighlightedText.jsx";
import BatchJobProgress from "./BatchJobProgress.jsx";
import PersonGraphCard, { MOVE_MIME } from "./PersonGraphCard.jsx";
import PersonGraphExportButton from "./PersonGraphExportButton.jsx";
import WorkflowSectionHeader from "./WorkflowSectionHeader.jsx";
import { useUiLocale } from "../context/UiLocaleContext.jsx";
import { useSyncedScroll } from "../hooks/useSyncedScroll.js";
import { createLabelStudioExport } from "../labelStudioExport.js";
import { createAuditReport } from "../lib/auditReport.js";
import { downloadBatchZip, downloadLabelStudioBundle, downloadSingleExportZip } from "../lib/batchZip.js";
import { buildCorrespondenceCsv } from "../lib/correspondenceExport.js";
import {
  buildSessionDocument,
  downloadSessionDocument,
  parseSessionDocument,
  sessionFileName,
} from "../lib/sessionDocument.js";
import {
  buildPersonGraphByPersonCsv,
  buildPersonGraphCsv,
} from "../lib/personGraphCsv.js";
import {
  BATCH_EMPTY_MESSAGE,
  batchSourceLabel,
  readDocumentsFromDirectoryPicker,
  readDocumentsFromFilePicker,
  readDocumentsFromFolderInput,
} from "../lib/batchLoad.js";
import {
  buildSampleDemoPersonGraph,
  buildSampleDemoState,
  getSampleDemoRelexRelations,
} from "../lib/sampleDemo.js";
import {
  buildGliner2LabelMap,
  GLINER2_MULTI_DEFAULT_THRESHOLD,
  GLINER2_MULTI_HF_URL,
  GLINER2_MULTI_MODEL_ID,
} from "../lib/gliner2MultiConstants.js";
import {
  BASIC_NER_ENGINE_CAMEMBERT,
  BASIC_NER_ENGINE_DEFAULT,
  BASIC_NER_ENGINE_MULTI,
  BASIC_NER_ENGINE_PII_ONNX,
  GLINER2_PII_ONNX_DEFAULT_THRESHOLD,
  GLINER2_PII_ONNX_HF_URL,
  GLINER2_PII_ONNX_MODEL_ID,
} from "../lib/gliner2PiiOnnxConstants.js";
import { NER_MODEL_IDS } from "../lib/constants.js";
import { GLINER_LABELS, GLINER_RULE_LABELS } from "../lib/glinerConstants.js";
import { useNerWorker } from "../hooks/useNerWorker.js";
import { useGliner2DetectWorker } from "../hooks/useGliner2DetectWorker.js";
import { useGlinerRelexWorker } from "../hooks/useGlinerRelexWorker.js";
import { useGeneralizationLadders } from "../hooks/useGeneralizationLadders.js";
import { usePersonGraphPanel } from "../hooks/usePersonGraphPanel.js";
import { LONG_TEXT_WARN_CHARS } from "../lib/textLimits.js";
import {
  sliceEntitiesForPage,
  sliceFocusRangesForPage,
  splitTextIntoPages,
} from "../lib/textPages.js";
import TextPageNav from "./TextPageNav.jsx";
import {
  addEntitySpans,
  buildCategoryLabels,
  buildMenuCategories,
  createCategorySelectionFromEntities,
  createCustomCategoryId,
  createHighlightSegments,
  downloadFile,
  findAddableOccurrenceRanges,
  findBatchFileIndex,
  formatBatchOutputTimestamp,
  getCategoryLabel,
  getEntityValueKey,
  groupEntities,
  inferCustomCategoriesFromEntities,
  isEntityActive,
  finalizeDetectedEntities,
  removeEntitiesByScope,
  retargetEntityCategory,
  extractEntitiesByValue,
  mergeEntitiesBySpan,
  pruneSelectedCategories,
  migrateSurfaceOverrideOnRetarget,
  buildAnonymizedPreviewModel,
  buildPlaceholderHintMap,
  getEntityOccurrenceKey,
  toggleLinkedValueKeys,
} from "../lib/entityUtils.js";
import { filterPronounPersonEntities } from "../lib/personMentionFilter.js";
import AnonymizedSplitPreview from "./AnonymizedSplitPreview.jsx";
import AnonymizedPersonGraphPanel from "./AnonymizedPersonGraphPanel.jsx";
import DomReconcileErrorBoundary from "./DomReconcileErrorBoundary.jsx";
import PersonGraphViewButton from "./PersonGraphViewButton.jsx";
import {
  applyAnonymizedGraphValueEdit,
  resolveAnonymizedGraphEdgeOrigin,
  resolveAnonymizedPersonGraph,
} from "../lib/anonymizedPersonGraph.js";
import "./generativeWorkflow.css";

/**
 * @param {{ variant?: "basic" | "advanced" }} props
 * basic — NER only (no person graph / ReLex)
 * advanced — NER + ReLex person graph (former Basic stack)
 */
export default function CamembertWorkflowSection({ variant = "advanced" }) {
  const { t } = useUiLocale();
  const showPersonGraph = variant === "advanced";
  const folderInputRef = useRef(null);
  const filesInputRef = useRef(null);
  const sessionInputRef = useRef(null);
  const fileStatesRef = useRef({});
  const batchCustomCategoriesRef = useRef({});
  const entityMenuRef = useRef(null);
  const sourceScrollRef = useRef(null);
  const previewScrollRef = useRef(null);
  const initialDemo = buildSampleDemoState();

  const [text, setText] = useState(initialDemo.text);
  const [entities, setEntities] = useState(initialDemo.entities);
  const [modelName, setModelName] = useState(initialDemo.modelName);
  const [isDemoMode, setIsDemoModeState] = useState(true);
  const isDemoModeRef = useRef(true);
  function setIsDemoMode(next) {
    isDemoModeRef.current = next;
    setIsDemoModeState(next);
  }
  const [selectedCategories, setSelectedCategories] = useState(initialDemo.selectedCategories);
  const [excludedEntityKeys, setExcludedEntityKeys] = useState({});
  const [reportOpen, setReportOpen] = useState(false);
  const [auditReportText, setAuditReportText] = useState("");
  const [auditReportBusy, setAuditReportBusy] = useState(false);
  const [isDetecting, setIsDetecting] = useState(false);
  const [isBatchLoading, setIsBatchLoading] = useState(false);
  const [batchJobProgress, setBatchJobProgress] = useState(null);
  const [isDownloadingZip, setIsDownloadingZip] = useState(false);
  const [batchMode, setBatchMode] = useState(false);
  const [batchFolderLabel, setBatchFolderLabel] = useState(null);
  const [batchOutputLabel, setBatchOutputLabel] = useState(null);
  const [currentFileOutputsModified, setCurrentFileOutputsModified] = useState(false);
  const [jumpFileNumber, setJumpFileNumber] = useState("1");
  const [jumpFileName, setJumpFileName] = useState("");
  const [batchFiles, setBatchFiles] = useState([]);
  const [currentFileIndex, setCurrentFileIndex] = useState(0);
  const [autoRunNer, setAutoRunNer] = useState(true);
  /** Chunk size while processing a folder: "all" | "1" | "5" | "10" | "25". */
  const [batchProcessCount, setBatchProcessCount] = useState("all");
  const [sourceBodyKey, setSourceBodyKey] = useState(0);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [entityMenu, setEntityMenu] = useState(null);
  const [customCategories, setCustomCategories] = useState({});
  const [activeLabels, setActiveLabels] = useState(() => new Set(GLINER_LABELS));
  const [customDetectionLabels, setCustomDetectionLabels] = useState([]);
  const [newLabelDraft, setNewLabelDraft] = useState("");
  /** Browser ONNX NER for Basic and Advanced (PII, CamemBERT, or GLiNER2-multi). */
  const [nerEngine, setNerEngine] = useState(BASIC_NER_ENGINE_DEFAULT);
  const activeNerEngine = nerEngine;
  const usesGlinerLabels =
    activeNerEngine === BASIC_NER_ENGINE_MULTI || activeNerEngine === BASIC_NER_ENGINE_PII_ONNX;
  const [threshold, setThreshold] = useState(GLINER2_PII_ONNX_DEFAULT_THRESHOLD);
  const { detectEntities: detectWithCamembert, progressItems: camembertProgressItems } =
    useNerWorker();
  const { detectEntities: detectWithGliner2Worker } = useGliner2DetectWorker();
  const { extractRelations: extractRelexWithWorker } = useGlinerRelexWorker();
  const [isEditingSource, setIsEditingSource] = useState(false);
  const [categoryMethods, setCategoryMethods] = useState({});
  const [surfaceOverrides, setSurfaceOverrides] = useState({});
  const [anonymizedTextOverride, setAnonymizedTextOverride] = useState(null);
  const [showAnonymizedPersonGraph, setShowAnonymizedPersonGraph] = useState(true);
  const [isRegeneratingPersonGraph, setIsRegeneratingPersonGraph] = useState(false);
  const [isExportingPackage, setIsExportingPackage] = useState(false);
  const [textPageIndex, setTextPageIndex] = useState(0);
  const [removedEntities, setRemovedEntities] = useState([]);
  const [distinctOccurrenceKeys, setDistinctOccurrenceKeys] = useState({});
  const [linkedValueKeys, setLinkedValueKeys] = useState({});

  const {
    persons,
    excludedPlaceholders,
    excludedSurfaces,
    personGraphNote,
    pinnedPersonPlaceholder,
    focusedPersonPlaceholder,
    personFocusRanges,
    relationOverrides,
    edgeLabelOverrides,
    edgeValueOverrides,
    setHoveredPersonPlaceholder,
    setPinnedPersonPlaceholder,
    refreshPersonGraph,
    applyRelexPersonGraph,
    clearPersonGraph,
    restorePersonGraphSnapshot,
    handleTogglePerson,
    handleToggleGraphSurface,
    syncEntityChipToGraph,
    relateEntityToPerson,
    relatePersonToPerson,
    moveSurfaceToPerson,
    removeSurfaceRelation,
    renameEdgeLabel,
    renameEdgeValue,
    getRelatedPlaceholdersForSurface,
  } = usePersonGraphPanel({
    text,
    entities,
    t,
    distinctOccurrenceKeys,
    // Advanced: ReLex person graph after NER (demo uses captured fixture).
    extractRelations: showPersonGraph
      ? async (sourceText, nextEntities) => {
          if (isDemoModeRef.current) {
            return {
              relations: getSampleDemoRelexRelations(),
              fillProximity: true,
              noteKey: "personGraphRelexDemoReady",
            };
          }
          return extractRelexWithWorker({ text: sourceText, entities: nextEntities });
        }
      : null,
  });
  const [graphDropTarget, setGraphDropTarget] = useState(null);

  // During detection, show the highlight pane early so segment results can paint live.
  const showSourceHighlight =
    !isEditingSource && (entities.length > 0 || isDetecting);

  const availableDetectionLabels = useMemo(() => {
    const extras = customDetectionLabels.filter((label) => !GLINER_LABELS.includes(label));
    return [...GLINER_LABELS, ...extras];
  }, [customDetectionLabels]);

  const selectedDetectionLabels = useMemo(
    () => availableDetectionLabels.filter((label) => activeLabels.has(label)),
    [activeLabels, availableDetectionLabels],
  );

  const detectionLabelMap = useMemo(
    () => buildGliner2LabelMap(selectedDetectionLabels),
    [selectedDetectionLabels],
  );

  const nerEngineMeta = useMemo(() => {
    if (activeNerEngine === BASIC_NER_ENGINE_PII_ONNX) {
      return {
        id: GLINER2_PII_ONNX_MODEL_ID,
        hfUrl: GLINER2_PII_ONNX_HF_URL,
        shortNameKey: "gliner2PiiOnnxShortName",
        downloadHint:
          "Running GLiNER2-PII ONNX in the browser (first run downloads ~426 MB quantized into cache)…",
        downloadLabel: "GLiNER2-PII",
        detectLabel: "GLiNER2-PII",
        speedKey: "basicNerModelSpeedFast",
      };
    }
    if (activeNerEngine === BASIC_NER_ENGINE_CAMEMBERT) {
      const modelId = NER_MODEL_IDS["camembert-dates"];
      return {
        id: modelId,
        hfUrl: `https://huggingface.co/${modelId}`,
        shortNameKey: "camembertShortName",
        downloadHint:
          "Running CamemBERT NER in the browser (first run downloads ONNX weights into cache)…",
        downloadLabel: "CamemBERT",
        detectLabel: "CamemBERT",
        speedKey: "basicNerModelSpeedFast",
      };
    }
    return {
      id: GLINER2_MULTI_MODEL_ID,
      hfUrl: GLINER2_MULTI_HF_URL,
      shortNameKey: "gliner2MultiShortName",
      downloadHint:
        "Running GLiNER2-multi in the browser (first run downloads ~614 MB fp16 ONNX into cache)…",
      downloadLabel: "GLiNER2-multi",
      detectLabel: "GLiNER2-multi",
      speedKey: "basicNerModelSpeedMedium",
    };
  }, [activeNerEngine]);

  function handleNerEngineChange(nextEngine) {
    setNerEngine(nextEngine);
    if (nextEngine === BASIC_NER_ENGINE_PII_ONNX) {
      setThreshold(GLINER2_PII_ONNX_DEFAULT_THRESHOLD);
    } else if (nextEngine === BASIC_NER_ENGINE_MULTI) {
      setThreshold(GLINER2_MULTI_DEFAULT_THRESHOLD);
    }
  }

  async function runSelectedNerDetection({ text: sourceText, onProgress }) {
    if (activeNerEngine === BASIC_NER_ENGINE_CAMEMBERT) {
      return detectWithCamembert(sourceText, BASIC_NER_ENGINE_CAMEMBERT);
    }
    // GLiNER2-PII / multi: dedicated worker so long interviews do not freeze the UI.
    return detectWithGliner2Worker({
      engine:
        activeNerEngine === BASIC_NER_ENGINE_PII_ONNX
          ? BASIC_NER_ENGINE_PII_ONNX
          : BASIC_NER_ENGINE_MULTI,
      text: sourceText,
      labels: selectedDetectionLabels,
      labelMap: detectionLabelMap,
      threshold,
      onProgress,
    });
  }

  function paintPartialEntities(partialEntities) {
    if (!Array.isArray(partialEntities)) {
      return;
    }
    // Sync updates so highlights paint as each worker segment lands (not deferred).
    const painted = filterPronounPersonEntities(partialEntities).map((entity, index) => ({
      ...entity,
      id: entity.id || `live-${index}-${entity.start ?? 0}`,
      source: entity.source || "gliner2",
    }));
    setEntities(painted);
    setSelectedCategories(createCategorySelectionFromEntities(painted));
  }

  function handleNerProgress(progress) {
    if (!progress) {
      return;
    }
    if (progress.phase === "download") {
      const pct =
        typeof progress.percent === "number" ? ` ${Math.round(progress.percent)}%` : "";
      setStatus(
        `Downloading ${nerEngineMeta.downloadLabel} (${progress.file || "model"})${pct}…`,
      );
      return;
    }
    if (progress.phase === "infer") {
      if (progress.entities) {
        paintPartialEntities(progress.entities);
      }
      if (progress.current && progress.total) {
        setStatus(
          t("detectingSegment", {
            current: progress.current,
            total: progress.total,
          }),
        );
      } else {
        setStatus(t("glinerStatusRunning"));
      }
    }
  }

  function handleRelexProgress(progress) {
    if (!progress) {
      return;
    }
    if (progress.phase === "download") {
      const pct =
        typeof progress.percent === "number" ? ` ${Math.round(progress.percent)}%` : "";
      setStatus(
        t("personGraphRelexLoading") +
          (progress.file ? ` (${progress.file}${pct})` : pct ? ` ${pct}` : ""),
      );
      return;
    }
    if (progress.phase === "infer" && progress.current && progress.total) {
      setStatus(
        t("personGraphRelexSegment", {
          current: progress.current,
          total: progress.total,
        }),
      );
    }
  }

  useEffect(() => {
    if (!isDetecting || activeNerEngine !== BASIC_NER_ENGINE_CAMEMBERT) {
      return;
    }
    const active = camembertProgressItems.find(
      (item) => typeof item.progress === "number" && item.progress < 100,
    );
    if (!active) {
      return;
    }
    const pct = Math.round(Number(active.progress) || 0);
    setStatus(`Downloading CamemBERT (${active.file || active.name || "model"}) ${pct}%…`);
  }, [isDetecting, activeNerEngine, camembertProgressItems]);

  // Split preview syncs its own panes; dual sync on previewScrollRef crashes Chromium.
  useSyncedScroll(sourceScrollRef, previewScrollRef, false);

  function toggleDetectionLabel(label) {
    setActiveLabels((current) => {
      const next = new Set(current);
      if (next.has(label)) {
        next.delete(label);
      } else {
        next.add(label);
      }
      return next;
    });
  }

  function selectAllDetectionLabels() {
    setActiveLabels(new Set(availableDetectionLabels));
  }

  function deselectAllDetectionLabels() {
    setActiveLabels(new Set());
  }

  function handleAddDetectionLabel(event) {
    event.preventDefault();
    const normalized = newLabelDraft.trim().toLocaleLowerCase().replace(/\s+/g, " ");
    if (!normalized) {
      return;
    }
    if (!GLINER_LABELS.includes(normalized)) {
      setCustomDetectionLabels((current) =>
        current.includes(normalized) ? current : [...current, normalized],
      );
    }
    setActiveLabels((current) => new Set(current).add(normalized));
    setNewLabelDraft("");
  }

  function removeCustomDetectionLabel(label) {
    if (GLINER_LABELS.includes(label)) {
      return;
    }
    setCustomDetectionLabels((current) => current.filter((item) => item !== label));
    setActiveLabels((current) => {
      const next = new Set(current);
      next.delete(label);
      return next;
    });
  }

  const currentFile = batchFiles[currentFileIndex] || null;

  function syncCustomCategories(next, batchScoped = batchMode) {
    setCustomCategories(next);
    if (batchScoped) {
      batchCustomCategoriesRef.current = next;
    }
  }

  function mergeCustomCategories(partial) {
    const base = batchMode ? batchCustomCategoriesRef.current : customCategories;
    const next = { ...base, ...partial };
    syncCustomCategories(next, batchMode);
    return next;
  }

  function resolveCustomCategoriesForBatch(nextEntities, savedState) {
    return inferCustomCategoriesFromEntities(nextEntities, {
      ...batchCustomCategoriesRef.current,
      ...(savedState?.customCategories ?? {}),
    });
  }

  useEffect(() => {
    entityMenuRef.current = entityMenu;
  }, [entityMenu]);

  useEffect(() => {
    if (showPersonGraph) {
      // Synchronous demo seed so person cards + "Show person graph" work before any model run.
      const demoGraph = buildSampleDemoPersonGraph();
      applyRelexPersonGraph(demoGraph.text, demoGraph.entities, demoGraph.relations, {
        resetExclusions: true,
        fillProximity: true,
        noteKey: "personGraphRelexDemoReady",
      });
    } else {
      clearPersonGraph();
    }
    // Initial demo graph only once on mount (Advanced only).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!batchMode || !currentFile) {
      return;
    }

    setJumpFileNumber(String(currentFileIndex + 1));
    setJumpFileName(currentFile.name);
  }, [batchMode, currentFile, currentFileIndex]);

  const categoryLabels = useMemo(
    () => buildCategoryLabels(customCategories),
    [customCategories],
  );
  const menuCategories = useMemo(
    () => buildMenuCategories(customCategories),
    [customCategories],
  );
  const groupedEntities = useMemo(() => groupEntities(entities), [entities]);
  const placeholderHints = useMemo(
    () =>
      buildPlaceholderHintMap(groupedEntities, customCategories, {
        entities,
        distinctOccurrenceKeys,
        linkedValueKeys,
      }),
    [groupedEntities, customCategories, entities, distinctOccurrenceKeys, linkedValueKeys],
  );
  const textPages = useMemo(() => splitTextIntoPages(text), [text]);
  const textPageCount = textPages.length;
  const safeTextPageIndex = Math.min(
    Math.max(0, textPageIndex),
    Math.max(0, textPageCount - 1),
  );
  const currentTextPage = textPages[safeTextPageIndex] || {
    start: 0,
    end: text.length,
    text,
  };

  useEffect(() => {
    setTextPageIndex(0);
  }, [text]);

  useEffect(() => {
    if (textPageIndex > 0 && textPageIndex >= textPageCount) {
      setTextPageIndex(Math.max(0, textPageCount - 1));
    }
  }, [textPageIndex, textPageCount]);

  const pageEntities = useMemo(
    () => sliceEntitiesForPage(entities, currentTextPage.start, currentTextPage.end),
    [entities, currentTextPage.start, currentTextPage.end],
  );
  const pageFocusRanges = useMemo(
    () =>
      sliceFocusRangesForPage(personFocusRanges, currentTextPage.start, currentTextPage.end),
    [personFocusRanges, currentTextPage.start, currentTextPage.end],
  );
  const pageHighlightedSegments = useMemo(
    () => createHighlightSegments(currentTextPage.text, pageEntities),
    [currentTextPage.text, pageEntities],
  );

  const {
    ladders: generalizationLadders,
    loading: generalizationLoading,
    mode: generalizationMode,
    error: generalizationError,
  } = useGeneralizationLadders({
    entities,
    categoryMethods,
    selectedCategories,
  });

  // Page-scoped anonymized preview — small enough to update immediately on chip clicks.
  const pageAnonymizedPreview = useMemo(
    () =>
      buildAnonymizedPreviewModel(
        currentTextPage.text,
        pageEntities,
        groupedEntities,
        selectedCategories,
        excludedEntityKeys,
        customCategories,
        {
          categoryMethods,
          salt: text,
          generalizationLadders,
          persons,
          surfaceOverrides,
          distinctOccurrenceKeys,
          linkedValueKeys,
        },
      ),
    [
      currentTextPage.text,
      pageEntities,
      groupedEntities,
      selectedCategories,
      excludedEntityKeys,
      customCategories,
      categoryMethods,
      generalizationLadders,
      persons,
      surfaceOverrides,
      distinctOccurrenceKeys,
      linkedValueKeys,
      text,
    ],
  );

  function buildFullAnonymizedPreview() {
    return buildAnonymizedPreviewModel(
      text,
      entities,
      groupedEntities,
      selectedCategories,
      excludedEntityKeys,
      customCategories,
      {
        categoryMethods,
        salt: text,
        generalizationLadders,
        persons,
        surfaceOverrides,
        distinctOccurrenceKeys,
        linkedValueKeys,
      },
    );
  }

  function getFullAnonymizedText() {
    if (anonymizedTextOverride != null) {
      return anonymizedTextOverride;
    }
    return buildFullAnonymizedPreview().anonymizedText;
  }

  // Person-graph anonymization can stay a step behind chip clicks.
  const deferredSelectedCategories = useDeferredValue(selectedCategories);
  const anonymizedGraphModel = useMemo(() => {
    if (!showPersonGraph || !showAnonymizedPersonGraph) {
      return { persons: [], replacementMap: new Map() };
    }
    return resolveAnonymizedPersonGraph({
      text,
      entities,
      groupedEntities,
      selectedCategories: deferredSelectedCategories,
      customCategories,
      persons,
      excludedPlaceholders,
      excludedSurfaces,
      categoryMethods,
      generalizationLadders,
      salt: text,
      surfaceOverrides,
    });
  }, [
    showPersonGraph,
    showAnonymizedPersonGraph,
    text,
    entities,
    groupedEntities,
    deferredSelectedCategories,
    customCategories,
    persons,
    excludedPlaceholders,
    excludedSurfaces,
    categoryMethods,
    generalizationLadders,
    surfaceOverrides,
  ]);
  const anonymizedPersons = anonymizedGraphModel.persons;
  const anonymizedReplacementMap = anonymizedGraphModel.replacementMap;
  const activeEntities = useMemo(
    () =>
      entities.filter((entity) =>
        isEntityActive(entity, selectedCategories, excludedEntityKeys),
      ),
    [entities, selectedCategories, excludedEntityKeys],
  );
  function buildAuditReportSnapshot() {
    return createAuditReport({
      text,
      entities,
      anonymizedText: getFullAnonymizedText(),
      groupedEntities,
      selectedCategories,
      excludedEntityKeys,
      modelName,
      sourceFile: currentFile?.name || null,
      nerBackend: batchMode ? activeNerEngine : null,
      batchMode,
      customCategories,
      categoryMethods,
      generalizationLadders,
      persons,
      surfaceOverrides,
      distinctOccurrenceKeys,
      linkedValueKeys,
    });
  }

  async function openAuditReport() {
    setReportOpen(true);
    setAuditReportBusy(true);
    setAuditReportText("");
    setStatus(t("auditBuilding"));
    try {
      await yieldToMain();
      const report = buildAuditReportSnapshot();
      await yieldToMain();
      setAuditReportText(report);
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : String(caughtError));
      setStatus("Audit report failed.");
      setReportOpen(false);
    } finally {
      setAuditReportBusy(false);
    }
  }

  const labelStudioExport = useMemo(
    () =>
      createLabelStudioExport({
        text,
        entities: activeEntities,
        modelName: modelName || nerEngineMeta.id,
        nerBackend: activeNerEngine,
        sourceFile: currentFile?.name || null,
        customCategories,
      }),
    [text, activeEntities, modelName, currentFile, customCategories, nerEngineMeta.id, activeNerEngine],
  );
  const labelStudioJson = useMemo(
    () => JSON.stringify(labelStudioExport, null, 2),
    [labelStudioExport],
  );

  function persistCurrentFileState() {
    if (!batchMode || !currentFile) {
      return;
    }

    fileStatesRef.current[currentFile.id] = {
      text,
      entities,
      selectedCategories,
      excludedEntityKeys,
      modelName,
      customCategories,
      outputsModified: currentFileOutputsModified,
      relations: fileStatesRef.current[currentFile.id]?.relations || [],
      excludedPlaceholders,
      excludedSurfaces,
      surfaceOverrides,
    };
  }

  function applyFileState(file, savedState, options = {}) {
    const { isBatchNavigation = batchMode } = options;
    const nextEntities = savedState?.entities ?? [];
    const nextText = savedState?.text ?? file.text;
    setText(nextText);
    setEntities(nextEntities);
    setSelectedCategories(savedState?.selectedCategories ?? {});
    setExcludedEntityKeys(savedState?.excludedEntityKeys ?? {});
    setModelName(savedState?.modelName ?? null);
    setCurrentFileOutputsModified(savedState?.outputsModified ?? false);

    if (isBatchNavigation) {
      syncCustomCategories(resolveCustomCategoriesForBatch(nextEntities, savedState), true);
    } else {
      syncCustomCategories(
        inferCustomCategoriesFromEntities(nextEntities, savedState?.customCategories ?? {}),
        false,
      );
      batchCustomCategoriesRef.current = {};
    }
    setEntityMenu(null);
    setReportOpen(false);
    setError("");
    setIsEditingSource(nextEntities.length === 0);

    if (!showPersonGraph) {
      clearPersonGraph();
    } else if (nextEntities.length && Array.isArray(savedState?.relations)) {
      applyRelexPersonGraph(nextText, nextEntities, savedState.relations, {
        resetExclusions: true,
      });
    } else if (nextEntities.length) {
      refreshPersonGraph(nextText, nextEntities, { resetExclusions: true });
    } else {
      clearPersonGraph();
    }
  }

  async function runNerDetection({
    sourceText = text,
    fileName = null,
    filePosition = null,
  } = {}) {
    const textToAnalyze = sourceText ?? text;
    if (!textToAnalyze.trim()) {
      return null;
    }

    if (usesGlinerLabels && !selectedDetectionLabels.length) {
      setError(t("glinerStatusNoLabels"));
      setStatus(t("glinerStatusNoLabels"));
      return null;
    }

    setError("");
    setIsDetecting(true);
    setIsDemoMode(false);
    setIsEditingSource(false);
    setEntities([]);
    setRemovedEntities([]);
    setDistinctOccurrenceKeys({});
    setLinkedValueKeys({});
    setSelectedCategories({});
    setExcludedEntityKeys({});
    clearPersonGraph();
    setStatus(nerEngineMeta.downloadHint);

    try {
      const result = await runSelectedNerDetection({
        text: textToAnalyze,
        onProgress: handleNerProgress,
      });
      const resolvedModel = result.model || nerEngineMeta.id;
      setStatus(t("glinerStatusRunning"));
      await yieldToMain();
      const normalized = finalizeDetectedEntities(textToAnalyze, result.entities || [], {
        ruleLabels: selectedDetectionLabels.filter((label) =>
          GLINER_RULE_LABELS.includes(label),
        ),
      });
      const categorySelection = createCategorySelectionFromEntities(normalized);
      await yieldToMain();

      // Unblock the UI first; commit the heavy final span tree as a transition.
      setIsDetecting(false);
      setModelName(resolvedModel);
      setIsEditingSource(false);
      startTransition(() => {
        setEntities(normalized);
        setSelectedCategories(categorySelection);
        setExcludedEntityKeys({});
      });
      await yieldToMain();

      let relations = [];
      let graphNote = "";
      if (showPersonGraph) {
        setStatus(t("personGraphRegenerateStatus"));
        graphNote = "person graph";
        try {
          relations = await extractRelexWithWorker({
            text: textToAnalyze,
            entities: normalized,
            onProgress: handleRelexProgress,
          });
          await yieldToMain();
          startTransition(() => {
            applyRelexPersonGraph(textToAnalyze, normalized, relations, {
              resetExclusions: true,
            });
          });
        } catch (graphError) {
          startTransition(() => {
            refreshPersonGraph(textToAnalyze, normalized, { resetExclusions: true });
          });
          graphNote = `proximity fallback (${
            graphError instanceof Error ? graphError.message : String(graphError)
          })`;
        }
      } else {
        clearPersonGraph();
      }

      if (batchMode && currentFile) {
        fileStatesRef.current[currentFile.id] = {
          ...fileStatesRef.current[currentFile.id],
          text: textToAnalyze,
          entities: normalized,
          selectedCategories: categorySelection,
          excludedEntityKeys: {},
          modelName: resolvedModel,
          relations,
        };
      }

      const uniqueCount = Object.values(
        normalized.reduce((groups, entity) => {
          const key = `${entity.label}:${entity.text.toLocaleLowerCase()}`;
          groups[key] = true;
          return groups;
        }, {}),
      ).length;
      const fileNote = fileName
        ? ` for ${fileName}${filePosition ? ` (${filePosition})` : ""}`
        : batchMode && currentFile
          ? ` for ${currentFile.name}`
          : "";
      setStatus(
        `Detected ${normalized.length} entities (${uniqueCount} unique value${
          uniqueCount === 1 ? "" : "s"
        }) with ${nerEngineMeta.detectLabel}${
          graphNote ? ` · ${graphNote}` : " (NER only)"
        }${fileNote}.`,
      );

      return {
        entities: normalized,
        selectedCategories: categorySelection,
        modelName: resolvedModel,
        relations,
      };
    } catch (caughtError) {
      setError(caughtError.message);
      setStatus("Detection failed.");
      return null;
    } finally {
      setIsDetecting(false);
    }
  }

  async function detectEntities() {
    await runNerDetection({
      sourceText: text,
      fileName: batchMode ? currentFile?.name : null,
      filePosition:
        batchMode && currentFile ? `${currentFileIndex + 1} of ${batchFiles.length}` : null,
    });
  }

  function seedBatchFileStates(files) {
    for (const file of files) {
      fileStatesRef.current[file.id] = {
        text: file.text,
        entities: [],
        selectedCategories: {},
        excludedEntityKeys: {},
        modelName: null,
        customCategories: {},
        outputsModified: false,
        relations: [],
      };
    }
  }

  function listUnprocessedBatchFiles(files = batchFiles) {
    return files.filter((file) => !fileStatesRef.current[file.id]?.modelName);
  }

  function resolveBatchChunkSize(total) {
    if (batchProcessCount === "all") {
      return total;
    }
    const parsed = Number(batchProcessCount);
    if (!Number.isFinite(parsed) || parsed < 1) {
      return total;
    }
    return Math.min(Math.floor(parsed), total);
  }

  function beginEditSourceText() {
    // Remount the source body so React is not removing highlight nodes that
    // Chromium (or extensions) may have rewritten — that throws removeChild.
    setEntityMenu(null);
    setPinnedPersonPlaceholder(null);
    setSourceBodyKey((current) => current + 1);
    setIsEditingSource(true);
    // Demo text is sample content — clear it so "Paste your own text" is a
    // blank paste surface. Keep real session text for editing in place.
    if (isDemoMode) {
      setText("");
      setEntities([]);
      setRemovedEntities([]);
      setDistinctOccurrenceKeys({});
      setLinkedValueKeys({});
      clearPersonGraph();
      setSelectedCategories({});
      setExcludedEntityKeys({});
      setCategoryMethods({});
      setSurfaceOverrides({});
      setAnonymizedTextOverride(null);
      setModelName(null);
      setIsDemoMode(false);
      setStatus(t("editSourceText"));
    }
  }

  /** Run NER (+ ReLex when Advanced) on the given files, in chunks of batchProcessCount. */
  async function processBatchFiles(files) {
    if (!files.length) {
      return;
    }

    setIsDetecting(true);
    setBatchJobProgress({
      phase: "detecting",
      current: 0,
      total: files.length,
      fileName: files[0]?.name || "",
    });

    if (!selectedDetectionLabels.length) {
      setError(t("glinerStatusNoLabels"));
      setStatus(t("glinerStatusNoLabels"));
      setIsDetecting(false);
      setBatchJobProgress(null);
      return;
    }

    const chunkSize = resolveBatchChunkSize(files.length);

    try {
      for (let index = 0; index < files.length; index += 1) {
        const file = files[index];
        const chunkIndex = Math.floor(index / chunkSize) + 1;
        const chunkTotal = Math.ceil(files.length / chunkSize);
        setBatchJobProgress({
          phase: "detecting",
          current: index,
          total: files.length,
          fileName: file.name,
        });
        setStatus(
          `Detecting with ${nerEngineMeta.detectLabel}: ${index + 1} of ${files.length} — ${file.name}${
            showPersonGraph ? "" : " (NER only)"
          }${chunkTotal > 1 ? ` · chunk ${chunkIndex}/${chunkTotal}` : ""}`,
        );
        // Let React paint progress between WASM-heavy inferences.
        await new Promise((resolve) => setTimeout(resolve, 0));

        const result = await runSelectedNerDetection({
          text: file.text,
          onProgress: handleNerProgress,
        });
        const resolvedModel = result.model || nerEngineMeta.id;
        const normalized = finalizeDetectedEntities(file.text, result.entities || [], {
          ruleLabels: selectedDetectionLabels.filter((label) =>
            GLINER_RULE_LABELS.includes(label),
          ),
        });
        const categorySelection = createCategorySelectionFromEntities(normalized);

        let relations = [];
        if (showPersonGraph) {
          try {
            setStatus(
              `Linking person graph (ReLex): ${index + 1} of ${files.length} — ${file.name}`,
            );
            await new Promise((resolve) => setTimeout(resolve, 0));
            relations = await extractRelexWithWorker({
              text: file.text,
              entities: normalized,
              onProgress: handleRelexProgress,
            });
          } catch {
            relations = [];
          }
        }

        const previous = fileStatesRef.current[file.id] || {};
        fileStatesRef.current[file.id] = {
          ...previous,
          text: file.text,
          entities: normalized,
          selectedCategories: categorySelection,
          excludedEntityKeys: previous.excludedEntityKeys || {},
          modelName: resolvedModel,
          customCategories: previous.customCategories || {},
          outputsModified: previous.outputsModified || false,
          relations,
        };

        setBatchJobProgress({
          phase: "detecting",
          current: index + 1,
          total: files.length,
          fileName: file.name,
        });

        // After each chunk, yield so the UI can breathe before the next wave.
        const finishedChunk = (index + 1) % chunkSize === 0 && index + 1 < files.length;
        if (finishedChunk) {
          setStatus(
            `Processed ${index + 1} of ${files.length} file(s) — starting next chunk of ${chunkSize}…`,
          );
          await new Promise((resolve) => setTimeout(resolve, 50));
        }
      }
    } finally {
      setIsDetecting(false);
      setBatchJobProgress(null);
    }
  }

  async function goToFile(index) {
    if (!batchMode || index < 0 || index >= batchFiles.length || index === currentFileIndex) {
      return;
    }

    persistCurrentFileState();
    fileStatesRef.current[currentFile.id] = {
      ...fileStatesRef.current[currentFile.id],
      outputsModified: true,
    };

    const file = batchFiles[index];
    const savedState = fileStatesRef.current[file.id];
    const fileText = savedState?.text ?? file.text;
    setCurrentFileIndex(index);
    applyFileState(file, savedState);

    if (autoRunNer && !savedState?.modelName) {
      await runNerDetection({
        sourceText: fileText,
        fileName: file.name,
        filePosition: `${index + 1} of ${batchFiles.length}`,
      });
      return;
    }

    setStatus(`File ${index + 1} of ${batchFiles.length}: ${file.name}`);
  }

  async function handleJumpToFileNumber(event) {
    event?.preventDefault();

    if (!batchMode || isBatchLoading || isDetecting) {
      return;
    }

    const parsed = Number(jumpFileNumber);
    if (!Number.isInteger(parsed) || parsed < 1 || parsed > batchFiles.length) {
      setStatus(`Enter a file number between 1 and ${batchFiles.length}.`);
      return;
    }

    await goToFile(parsed - 1);
  }

  async function handleJumpToFileName(event) {
    event?.preventDefault();

    if (!batchMode || isBatchLoading || isDetecting) {
      return;
    }

    const index = findBatchFileIndex(batchFiles, jumpFileName);
    if (index < 0) {
      setStatus(`No file matches "${jumpFileName.trim()}".`);
      return;
    }

    await goToFile(index);
  }

  async function loadBatchFiles(files, sourceLabel) {
    if (!files.length) {
      setError(BATCH_EMPTY_MESSAGE);
      setStatus("No documents were loaded. Pick a folder or individual files to continue.");
      return;
    }

    const outputLabel = `outputs-${formatBatchOutputTimestamp()}`;

    fileStatesRef.current = {};
    batchCustomCategoriesRef.current = {};
    seedBatchFileStates(files);
    setBatchMode(true);
    setBatchFolderLabel(sourceLabel);
    setBatchOutputLabel(outputLabel);
    setBatchFiles(files);
    setCurrentFileIndex(0);
    syncCustomCategories({});
    setEntityMenu(null);
    setReportOpen(false);

    applyFileState(files[0], fileStatesRef.current[files[0].id], {
      isBatchNavigation: true,
    });
    setIsBatchLoading(false);

    if (autoRunNer) {
      const chunkSize = resolveBatchChunkSize(files.length);
      setStatus(
        chunkSize < files.length
          ? `Loaded ${files.length} text file(s). Running NER in chunks of ${chunkSize}…`
          : `Loaded ${files.length} text file(s). Running NER on each file…`,
      );
      await processBatchFiles(files);
      applyFileState(files[0], fileStatesRef.current[files[0].id], {
        isBatchNavigation: true,
      });
      setStatus(
        `Loaded and processed ${files.length} file(s). Download outputs as a ZIP when review is complete (${outputLabel}).`,
      );
    } else {
      setStatus(
        `Loaded ${files.length} file(s). Open a file and run anonymization, or enable auto-run. Output folder: ${outputLabel}.`,
      );
    }
  }

  async function handleBatchFolderChange(event) {
    const input = event.target;
    const fileList = input.files;

    if (!fileList?.length) {
      return;
    }

    setError("");
    setIsBatchLoading(true);
    setBatchJobProgress({ phase: "loading", current: 0, total: 0, fileName: "" });
    setStatus("Reading documents from the selected folder...");

    try {
      const files = await readDocumentsFromFolderInput(fileList, setBatchJobProgress);
      if (!files.length) {
        setError(BATCH_EMPTY_MESSAGE);
        setStatus(
          `Folder opened, but none of the ${fileList.length} item(s) matched .txt or .docx.`,
        );
        return;
      }

      const folderLabel = files[0].path.includes("/")
        ? files[0].path.split("/")[0]
        : "Selected folder";

      await loadBatchFiles(files, folderLabel);
    } catch (caughtError) {
      setError(caughtError.message);
      setStatus("Batch folder loading failed.");
    } finally {
      setIsBatchLoading(false);
      setBatchJobProgress(null);
      input.value = "";
    }
  }

  async function handleBatchFilesChange(event) {
    const input = event.target;
    const fileList = input.files;

    if (!fileList?.length) {
      return;
    }

    setError("");
    setIsBatchLoading(true);
    setBatchJobProgress({ phase: "loading", current: 0, total: 0, fileName: "" });
    setStatus("Reading selected documents...");

    try {
      const files = await readDocumentsFromFilePicker(fileList, setBatchJobProgress);
      if (!files.length) {
        setError(BATCH_EMPTY_MESSAGE);
        setStatus("No .txt or .docx files were selected.");
        return;
      }

      await loadBatchFiles(files, batchSourceLabel(files));
    } catch (caughtError) {
      setError(caughtError.message);
      setStatus("Batch file loading failed.");
    } finally {
      setIsBatchLoading(false);
      setBatchJobProgress(null);
      input.value = "";
    }
  }

  async function openBatchFolderPicker() {
    setError("");

    if (window.showDirectoryPicker) {
      setIsBatchLoading(true);
      setBatchJobProgress({ phase: "loading", current: 0, total: 0, fileName: "" });
      setStatus("Choose a folder with .txt or .docx documents...");

      try {
        const result = await readDocumentsFromDirectoryPicker(setBatchJobProgress);
        if (!result) {
          folderInputRef.current?.click();
          return;
        }

        if (!result.files.length) {
          setError(BATCH_EMPTY_MESSAGE);
          setStatus("Folder opened, but no .txt or .docx files were found inside.");
          return;
        }

        await loadBatchFiles(result.files, result.folderLabel);
        return;
      } catch (caughtError) {
        if (caughtError?.name === "AbortError") {
          setStatus(batchMode ? `Batch mode: ${batchFiles.length} file(s) loaded.` : "Folder selection canceled.");
          return;
        }

        setError(caughtError.message);
        setStatus("Batch folder loading failed.");
        return;
      } finally {
        setIsBatchLoading(false);
        setBatchJobProgress(null);
      }
    }

    folderInputRef.current?.click();
  }

  function openBatchFilePicker() {
    setError("");
    filesInputRef.current?.click();
  }

  async function downloadAllBatchOutputs() {
    if (!batchMode || !batchFiles.length) {
      return;
    }

    persistCurrentFileState();
    if (currentFile) {
      fileStatesRef.current[currentFile.id] = {
        ...fileStatesRef.current[currentFile.id],
        text,
        entities,
        selectedCategories,
        excludedEntityKeys,
        modelName,
        customCategories,
        outputsModified: true,
        excludedPlaceholders,
        excludedSurfaces,
        surfaceOverrides,
      };
    }

    const pending = listUnprocessedBatchFiles();
    if (pending.length) {
      setStatus(
        `Running NER on ${pending.length} unprocessed file(s) before building the ZIP…`,
      );
      await processBatchFiles(pending);
      if (currentFile && fileStatesRef.current[currentFile.id]) {
        applyFileState(currentFile, fileStatesRef.current[currentFile.id], {
          isBatchNavigation: true,
        });
      }
    }

    setIsDownloadingZip(true);
    setStatus(t("buildingZip"));

    try {
      await downloadBatchZip({
        files: batchFiles,
        fileStates: fileStatesRef.current,
        nerBackend: activeNerEngine,
        outputLabel: batchOutputLabel,
        categoryMethods,
        generalizationLadders,
        includePersonGraph: showPersonGraph,
        surfaceOverrides,
      });
      setStatus(t("exportBatchDone"));
    } catch (caughtError) {
      setError(caughtError.message);
      setStatus("ZIP download failed.");
    } finally {
      setIsDownloadingZip(false);
    }
  }

  async function exportEverythingPackage() {
    if (!entities.length || isExportingPackage || batchMode) {
      return;
    }
    setIsExportingPackage(true);
    setStatus(t("buildingZip"));
    try {
      const graphOptions = { excludedPlaceholders, excludedSurfaces };
      await yieldToMain();
      const anonymizedText = getFullAnonymizedText();
      await yieldToMain();
      const auditReport = createAuditReport({
        text,
        entities,
        anonymizedText,
        groupedEntities,
        selectedCategories,
        excludedEntityKeys,
        modelName,
        sourceFile: currentFile?.name || null,
        nerBackend: batchMode ? activeNerEngine : null,
        batchMode,
        customCategories,
        categoryMethods,
        generalizationLadders,
        persons,
        surfaceOverrides,
        distinctOccurrenceKeys,
        linkedValueKeys,
      });
      await yieldToMain();
      const correspondenceCsv = buildCorrespondenceCsv({
        text,
        entities,
        groupedEntities,
        selectedCategories,
        excludedEntityKeys,
        customCategories,
        categoryMethods,
        generalizationLadders,
        persons,
        surfaceOverrides,
        distinctOccurrenceKeys,
        linkedValueKeys,
      });
      await yieldToMain();
      const personGraphCsv =
        showPersonGraph && persons.length ? buildPersonGraphCsv(persons, graphOptions) : "";
      const personGraphByPersonCsv =
        showPersonGraph && persons.length
          ? buildPersonGraphByPersonCsv(persons, graphOptions)
          : "";
      await yieldToMain();
      await downloadSingleExportZip({
        baseName: "incognito-export",
        originalText: text,
        anonymizedText,
        auditReport,
        correspondenceCsv,
        personGraphCsv,
        personGraphByPersonCsv,
        labelStudioJson,
      });
      setStatus(t("exportEverythingDone"));
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : String(caughtError));
      setStatus("Export failed.");
    } finally {
      setIsExportingPackage(false);
    }
  }

  function restoreSampleDemo() {
    const demo = buildSampleDemoPersonGraph();
    setText(demo.text);
    setEntities(demo.entities);
    setRemovedEntities([]);
    setDistinctOccurrenceKeys({});
    setLinkedValueKeys({});
    setSelectedCategories(demo.selectedCategories);
    setExcludedEntityKeys(demo.excludedEntityKeys);
    setCategoryMethods({});
    setSurfaceOverrides({});
    setAnonymizedTextOverride(null);
    setModelName(demo.modelName);
    setCustomCategories({});
    setEntityMenu(null);
    setReportOpen(false);
    setError("");
    setIsDemoMode(true);
    setIsEditingSource(false);
    if (showPersonGraph) {
      applyRelexPersonGraph(demo.text, demo.entities, demo.relations, {
        resetExclusions: true,
        fillProximity: true,
        noteKey: "personGraphRelexDemoReady",
      });
    } else {
      clearPersonGraph();
    }
    setStatus(t("statusDemoRestored"));
  }

  async function exitBatchMode() {
    if (batchMode && currentFile) {
      persistCurrentFileState();
      fileStatesRef.current[currentFile.id] = {
        ...fileStatesRef.current[currentFile.id],
        outputsModified: true,
      };
    }

    fileStatesRef.current = {};
    batchCustomCategoriesRef.current = {};
    setBatchMode(false);
    setBatchFolderLabel(null);
    setBatchOutputLabel(null);
    setBatchFiles([]);
    setCurrentFileIndex(0);
    setCurrentFileOutputsModified(false);
    restoreSampleDemo();
    setStatus(t("batchModeClosed"));
  }

  async function clearSession() {
    if (batchMode) {
      await exitBatchMode();
      return;
    }

    setText("");
    setEntities([]);
    setRemovedEntities([]);
    setDistinctOccurrenceKeys({});
    setLinkedValueKeys({});
    clearPersonGraph();
    setSelectedCategories({});
    setExcludedEntityKeys({});
    setCategoryMethods({});
    setSurfaceOverrides({});
    setAnonymizedTextOverride(null);
    setModelName(null);
    setIsDemoMode(false);
    setIsEditingSource(true);
    setReportOpen(false);
    setStatus(t("sessionCleared"));
    setError("");
  }

  function saveSessionDocument() {
    if (batchMode) {
      setStatus(t("sessionSaveBatchBlocked"));
      return;
    }
    if (!String(text || "").trim() && !entities.length) {
      setStatus(t("sessionSaveEmpty"));
      return;
    }

    const workflow = variant === "advanced" ? "advanced" : "basic";
    const session = buildSessionDocument({
      workflow,
      text,
      entities,
      removedEntities,
      modelName,
      nerEngine: activeNerEngine,
      threshold,
      customCategories,
      selectedCategories,
      excludedEntityKeys,
      categoryMethods,
      surfaceOverrides,
      distinctOccurrenceKeys,
      linkedValueKeys,
      anonymizedTextOverride,
      activeLabels: [...activeLabels],
      customDetectionLabels,
      personGraph: showPersonGraph
        ? {
            persons,
            excludedPlaceholders,
            excludedSurfaces,
            relationOverrides,
            edgeLabelOverrides,
            edgeValueOverrides,
            note: personGraphNote,
          }
        : null,
    });
    downloadSessionDocument(session, sessionFileName(workflow));
    setStatus(t("sessionSaved"));
    setError("");
  }

  function openSessionPicker() {
    if (batchMode) {
      setStatus(t("sessionOpenBatchBlocked"));
      return;
    }
    sessionInputRef.current?.click();
  }

  function applySessionDocument(session) {
    const doc = session.document;
    setIsDemoMode(false);
    setBatchMode(false);
    setBatchFolderLabel(null);
    setBatchOutputLabel(null);
    setBatchFiles([]);
    setCurrentFileIndex(0);
    setCurrentFileOutputsModified(false);
    fileStatesRef.current = {};
    batchCustomCategoriesRef.current = {};

    setText(doc.text);
    setEntities(doc.entities);
    setRemovedEntities(doc.removedEntities);
    setModelName(doc.modelName);
    if (doc.nerEngine) {
      setNerEngine(doc.nerEngine);
    }
    if (typeof doc.threshold === "number") {
      setThreshold(doc.threshold);
    }
    setCustomCategories(doc.customCategories);
    setSelectedCategories(
      Object.keys(doc.selectedCategories || {}).length
        ? doc.selectedCategories
        : createCategorySelectionFromEntities(doc.entities),
    );
    setExcludedEntityKeys(doc.excludedEntityKeys);
    setCategoryMethods(doc.categoryMethods);
    setSurfaceOverrides(doc.surfaceOverrides);
    setDistinctOccurrenceKeys(doc.distinctOccurrenceKeys);
    setLinkedValueKeys(doc.linkedValueKeys);
    setAnonymizedTextOverride(doc.anonymizedTextOverride);
    if (Array.isArray(doc.activeLabels) && doc.activeLabels.length) {
      setActiveLabels(new Set(doc.activeLabels));
    }
    if (Array.isArray(doc.customDetectionLabels)) {
      setCustomDetectionLabels(doc.customDetectionLabels);
    }

    setEntityMenu(null);
    setReportOpen(false);
    setError("");
    setIsEditingSource(doc.entities.length === 0);
    setTextPageIndex(0);
    setSourceBodyKey((key) => key + 1);

    if (showPersonGraph) {
      if (session.personGraph?.persons?.length) {
        restorePersonGraphSnapshot(session.personGraph);
      } else if (doc.entities.length) {
        refreshPersonGraph(doc.text, doc.entities, { resetExclusions: true });
      } else {
        clearPersonGraph();
      }
    } else {
      clearPersonGraph();
    }

    setStatus(
      t("sessionOpened", {
        count: String(doc.entities.length),
        workflow: session.workflow,
      }),
    );
  }

  async function handleSessionFileChange(event) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) {
      return;
    }

    try {
      const raw = await file.text();
      const parsed = parseSessionDocument(raw);
      if (!parsed.ok) {
        setError(
          t(parsed.errorKey, {
            version: parsed.errorDetail ? ` (${parsed.errorDetail})` : "",
          }),
        );
        setStatus(t("sessionImportFailed"));
        return;
      }

      const hasWork =
        Boolean(String(text || "").trim()) ||
        entities.length > 0 ||
        removedEntities.length > 0;
      if (hasWork && !window.confirm(t("sessionImportConfirm"))) {
        setStatus(t("sessionImportCancelled"));
        return;
      }

      applySessionDocument(parsed.session);
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : String(caughtError));
      setStatus(t("sessionImportFailed"));
    }
  }

  function toggleAutoRunNer(enabled) {
    setAutoRunNer(enabled);

    if (!enabled || !batchMode || !currentFile || isDetecting) {
      return;
    }

    const savedState = fileStatesRef.current[currentFile.id];
    if (savedState?.modelName) {
      return;
    }

    void runNerDetection({
      sourceText: text,
      fileName: currentFile.name,
      filePosition: `${currentFileIndex + 1} of ${batchFiles.length}`,
    });
  }

  function toggleCategory(category) {
    setSelectedCategories((current) => ({
      ...current,
      [category]: !current[category],
    }));
  }

  function toggleEntityValue(category, entityText) {
    const key = getEntityValueKey(category, entityText);
    const excluding = !excludedEntityKeys[key];
    setExcludedEntityKeys((current) => {
      const next = { ...current };
      if (excluding) {
        next[key] = true;
      } else {
        delete next[key];
      }
      return next;
    });
    // Graph surface sync can wait; keep the chip click itself urgent.
    startTransition(() => {
      syncEntityChipToGraph(category, entityText, excluding);
    });
  }

  function removeEntityValue(category, entityText) {
    const key = getEntityValueKey(category, entityText);
    const { kept, extracted } = extractEntitiesByValue(entities, category, entityText);
    if (!extracted.length) {
      return;
    }
    setEntities(kept);
    setRemovedEntities((current) => mergeEntitiesBySpan(current, extracted));
    setExcludedEntityKeys((current) => {
      if (!current[key]) {
        return current;
      }
      const updated = { ...current };
      delete updated[key];
      return updated;
    });
    setSelectedCategories((current) => {
      if (kept.some((entity) => entity.label === category)) {
        return current;
      }
      const updated = { ...current };
      delete updated[category];
      return updated;
    });
    setAnonymizedTextOverride(null);
    if (showPersonGraph) {
      startTransition(() => {
        refreshPersonGraph(text, kept, { resetExclusions: false });
      });
    }
    setStatus(
      t("chipRemovedStatus", {
        text: entityText,
        count: extracted.length,
      }),
    );
  }

  function restoreEntityValue(category, entityText) {
    const { kept, extracted } = extractEntitiesByValue(removedEntities, category, entityText);
    if (!extracted.length) {
      return;
    }
    const next = mergeEntitiesBySpan(entities, extracted);
    setRemovedEntities(kept);
    setEntities(next);
    setSelectedCategories((current) =>
      category in current ? current : { ...current, [category]: true },
    );
    setAnonymizedTextOverride(null);
    if (showPersonGraph) {
      startTransition(() => {
        refreshPersonGraph(text, next, { resetExclusions: false });
      });
    }
    setStatus(
      t("chipRestoredStatus", {
        text: entityText,
        count: extracted.length,
      }),
    );
  }

  function copyAnonymizedText() {
    navigator.clipboard.writeText(getFullAnonymizedText());
    setStatus("Anonymized text copied to clipboard.");
  }

  function handleTextPageChange(nextIndex) {
    setTextPageIndex(nextIndex);
    if (sourceScrollRef.current) {
      sourceScrollRef.current.scrollTop = 0;
    }
    if (previewScrollRef.current) {
      previewScrollRef.current.scrollTop = 0;
    }
  }

  function copyAuditReport() {
    if (!auditReportText) {
      return;
    }
    navigator.clipboard.writeText(auditReportText);
    setStatus("Audit report copied to clipboard.");
  }

  function downloadAuditReport() {
    if (!auditReportText) {
      return;
    }
    downloadFile(auditReportText, "anonymization-audit-report.md", "text/markdown;charset=utf-8");
    setStatus("Audit report downloaded.");
  }

  function downloadLabelStudioExport() {
    const stamp = new Date().toISOString().slice(0, 10);
    const defaultBaseName = `label-studio-ner-${stamp}`;
    downloadLabelStudioBundle({
      jsonContent: labelStudioJson,
      defaultBaseName,
    });
    setStatus(`Exported ${entities.length} pre-annotations and Label Studio config.`);
  }

  function closeEntityMenu() {
    entityMenuRef.current = null;
    setEntityMenu(null);
  }

  function handleRelateEntityToPerson(personPlaceholder, options = {}) {
    const entity = entityMenuRef.current?.entity;
    if (!entity?.text || !personPlaceholder) {
      return;
    }
    const result = relateEntityToPerson(entity, personPlaceholder, options);
    if (!result) {
      return;
    }
    if (result.mode === "alias" && result.name) {
      const fromKey = getEntityValueKey(entity.label || "person", entity.text);
      const toKey = getEntityValueKey("person", result.name);
      if (result.removed) {
        setLinkedValueKeys((current) => {
          const next = { ...current };
          delete next[fromKey];
          delete next[toKey];
          for (const [key, target] of Object.entries(next)) {
            if (target === fromKey || target === toKey) {
              delete next[key];
            }
          }
          return next;
        });
      } else {
        const { next } = toggleLinkedValueKeys({}, fromKey, toKey, entities);
        setLinkedValueKeys((current) => ({ ...current, ...next }));
      }
      setAnonymizedTextOverride(null);
    }
    const statusKey = result.removed
      ? result.mode === "alias"
        ? "entityMenuUnaliasStatus"
        : "entityMenuUnrelatedStatus"
      : result.mode === "alias"
        ? "entityMenuAliasStatus"
        : "entityMenuRelatedStatus";
    setStatus(t(statusKey, { text: entity.text, person: result.name }));
  }

  function setEntityMenuScope(scope) {
    setEntityMenu((current) => {
      if (!current) {
        return current;
      }

      const next = { ...current, scope };
      entityMenuRef.current = next;
      return next;
    });
  }

  function addManualEntity(categoryId, displayLabel = null) {
    const menu = entityMenuRef.current;
    if (!menu || menu.mode !== "add") return;

    const scope = menu.scope === "single" ? "single" : "all";
    const spans =
      scope === "single"
        ? [{ start: menu.start, end: menu.end, text: menu.text }]
        : findAddableOccurrenceRanges(text, menu.text, entities);

    const previousKeys = new Set(
      entities.map((entity) => `${entity.start}:${entity.end}:${entity.label}`),
    );
    const next = addEntitySpans(entities, spans, categoryId, text);
    const addedCount = next.filter(
      (entity) => !previousKeys.has(`${entity.start}:${entity.end}:${entity.label}`),
    ).length;
    const skippedCount = Math.max(0, spans.length - addedCount);

    setEntities(next);
    setSelectedCategories((current) => ({
      ...current,
      [categoryId]: current[categoryId] ?? true,
    }));
    if (showPersonGraph) {
      refreshPersonGraph(text, next, { resetExclusions: false });
    }
    closeEntityMenu();
    const labelName = displayLabel || getCategoryLabel(categoryId, customCategories);
    if (!addedCount) {
      setStatus(
        `Kept existing detections — "${menu.text}" already overlaps annotated spans (nothing added).`,
      );
      return;
    }
    const scopeNote =
      addedCount === 1 && scope === "single"
        ? " (this selection only)"
        : addedCount === 1
          ? ""
          : ` (${addedCount} occurrence${addedCount === 1 ? "" : "s"})`;
    const skipNote =
      skippedCount > 0
        ? ` · left ${skippedCount} overlapping span${skippedCount === 1 ? "" : "s"} unchanged`
        : "";
    setStatus(`Added ${labelName} entity "${menu.text}"${scopeNote}${skipNote}.`);
  }

  function handleAddEntity(label) {
    addManualEntity(label);
  }

  function handleAddCustomCategory(displayName) {
    const trimmed = displayName.trim();
    const menu = entityMenuRef.current;
    if (!trimmed || !menu || menu.mode !== "add") {
      return;
    }

    const categoryId = createCustomCategoryId(
      trimmed,
      batchMode ? batchCustomCategoriesRef.current : customCategories,
    );
    addManualEntity(categoryId, trimmed);
    mergeCustomCategories({ [categoryId]: trimmed });
  }

  function handleRemoveEntity() {
    const menu = entityMenuRef.current;
    if (!menu || menu.mode !== "remove" || !menu.entity) {
      return;
    }

    const scope = menu.scope === "single" ? "single" : "all";
    const entityText = menu.entity.text;
    const category = menu.entity.label;
    const { entities: next, removed } = removeEntitiesByScope(entities, menu.entity, scope);
    if (!removed.length) {
      closeEntityMenu();
      return;
    }

    const key = getEntityValueKey(category, entityText);
    setEntities(next);
    setRemovedEntities((current) => mergeEntitiesBySpan(current, removed));
    setExcludedEntityKeys((current) => {
      if (!current[key]) {
        return current;
      }
      const stillPresent = next.some(
        (entity) =>
          entity.label === category &&
          String(entity.text || "").toLocaleLowerCase() ===
            String(entityText || "").toLocaleLowerCase(),
      );
      if (stillPresent) {
        return current;
      }
      const updated = { ...current };
      delete updated[key];
      return updated;
    });
    setSelectedCategories((current) => {
      if (next.some((entity) => entity.label === category)) {
        return current;
      }
      const updated = { ...current };
      delete updated[category];
      return updated;
    });
    setAnonymizedTextOverride(null);
    if (showPersonGraph) {
      refreshPersonGraph(text, next, { resetExclusions: false });
    }
    closeEntityMenu();
    setStatus(
      t("entityMenuRemoveStatus", {
        text: entityText,
        count: removed.length,
      }),
    );
  }

  function changeEntityCategory(categoryId, displayLabel = null) {
    const menu = entityMenuRef.current;
    if (!menu || menu.mode !== "remove" || !menu.entity) {
      return;
    }
    if (menu.entity.label === categoryId) {
      closeEntityMenu();
      return;
    }

    const scope = menu.scope === "single" ? "single" : "all";
    const previousLabel = menu.entity.label;
    const entityText = menu.entity.text;
    const { entities: next, changedCount } = retargetEntityCategory(
      entities,
      menu.entity,
      categoryId,
      scope,
    );
    if (!changedCount) {
      closeEntityMenu();
      return;
    }

    const oldKey = getEntityValueKey(previousLabel, entityText);
    const newKey = getEntityValueKey(categoryId, entityText);
    const stillInOld = next.some(
      (entity) =>
        entity.label === previousLabel &&
        String(entity.text || "").toLocaleLowerCase() ===
          String(entityText || "").toLocaleLowerCase(),
    );
    setEntities(next);
    setSelectedCategories((current) =>
      pruneSelectedCategories(
        {
          ...current,
          [categoryId]: current[categoryId] ?? true,
        },
        next,
        categoryId,
      ),
    );
    setExcludedEntityKeys((current) => {
      if (!current[oldKey]) {
        return current;
      }
      const updated = { ...current };
      if (!stillInOld) {
        delete updated[oldKey];
      }
      updated[newKey] = true;
      return updated;
    });
    setSurfaceOverrides((current) =>
      migrateSurfaceOverrideOnRetarget(current, oldKey, newKey, categoryId, {
        keepOldKey: stillInOld,
      }),
    );
    setAnonymizedTextOverride(null);
    if (showPersonGraph) {
      refreshPersonGraph(text, next, { resetExclusions: false });
    }
    closeEntityMenu();
    const labelName = displayLabel || getCategoryLabel(categoryId, customCategories);
    setStatus(
      t("entityMenuChangedStatus", {
        text: entityText,
        category: labelName,
        count: changedCount,
        scopeNote:
          scope === "single"
            ? t("entityMenuChangedScopeSingle")
            : changedCount > 1
              ? t("entityMenuChangedScopeAll")
              : "",
      }),
    );
  }

  function handleChangeEntityCategory(categoryId) {
    changeEntityCategory(categoryId);
  }

  function handleChangeEntityCategoryCustom(displayName) {
    const trimmed = String(displayName || "").trim();
    const menu = entityMenuRef.current;
    if (!trimmed || !menu || menu.mode !== "remove" || !menu.entity) {
      return;
    }
    const categoryId = createCustomCategoryId(
      trimmed,
      batchMode ? batchCustomCategoriesRef.current : customCategories,
    );
    mergeCustomCategories({ [categoryId]: trimmed });
    changeEntityCategory(categoryId, trimmed);
  }

  function handleToggleDistinctOccurrence() {
    const menu = entityMenuRef.current;
    if (!menu?.entity) {
      return;
    }
    const occKey = getEntityOccurrenceKey(menu.entity);
    if (!occKey) {
      return;
    }
    const enabling = !distinctOccurrenceKeys[occKey];
    setDistinctOccurrenceKeys((current) => {
      const next = { ...current };
      if (next[occKey]) {
        delete next[occKey];
      } else {
        next[occKey] = true;
      }
      return next;
    });
    setAnonymizedTextOverride(null);
    closeEntityMenu();
    setStatus(
      t(enabling ? "entityMenuDistinctStatusOn" : "entityMenuDistinctStatusOff", {
        text: menu.entity.text,
      }),
    );
  }

  function handleLinkSameCode(targetText) {
    const menu = entityMenuRef.current;
    if (!menu?.entity || !targetText) {
      return;
    }
    const fromKey = getEntityValueKey(menu.entity.label, menu.entity.text);
    const toKey = getEntityValueKey(menu.entity.label, targetText);
    const { next, linked } = toggleLinkedValueKeys(
      linkedValueKeys,
      fromKey,
      toKey,
      entities,
    );
    setLinkedValueKeys(next);
    setAnonymizedTextOverride(null);
    closeEntityMenu();
    setStatus(
      t(linked ? "entityMenuSameCodeStatusOn" : "entityMenuSameCodeStatusOff", {
        text: menu.entity.text,
        other: targetText,
      }),
    );
  }

  async function handleRegeneratePersonGraph() {
    if (!showPersonGraph || isRegeneratingPersonGraph || !entities.length) {
      return;
    }
    setIsRegeneratingPersonGraph(true);
    // Leave demo fixture mode so regenerate re-links from the current entities.
    setIsDemoMode(false);
    setStatus(t("personGraphRegenerateStatus"));
    try {
      const relations = await extractRelexWithWorker({
        text,
        entities,
        onProgress: handleRelexProgress,
      });
      applyRelexPersonGraph(text, entities, relations, {
        resetExclusions: false,
        fillProximity: true,
        noteKey: "personGraphRelexReady",
      });
      setStatus(t("personGraphRegenerateDone"));
    } catch (caughtError) {
      applyRelexPersonGraph(text, entities, [], {
        resetExclusions: false,
        fillProximity: true,
        noteKey: "personGraphRelexFallback",
      });
      setStatus(
        `${t("personGraphRegenerateDone")} (${
          caughtError instanceof Error ? caughtError.message : String(caughtError)
        })`,
      );
    } finally {
      setIsRegeneratingPersonGraph(false);
    }
  }

  const sectionId =
    variant === "basic" ? "basic-ner-section-title" : "camembert-section-title";

  return (
    <section
      className="workflow-section camembert-section"
      aria-labelledby={sectionId}
      translate="no"
    >
      <WorkflowSectionHeader
        id={sectionId}
        eyebrow={t(variant === "basic" ? "basicNerEyebrow" : "camembertEyebrow")}
        title={t(variant === "basic" ? "basicNerTitle" : "camembertTitle")}
        steps={
          variant === "basic"
            ? [t("basicNerStep1"), t("basicNerStep2"), t("basicNerStep3")]
            : [t("camembertStep1"), t("camembertStep2"), t("camembertStep3")]
        }
        badge={t(variant === "basic" ? "basicNerBadge" : "camembertBadge")}
      />

      <BatchJobProgress progress={batchJobProgress} />

      <section className="controls">
        <button
          onClick={() => void detectEntities()}
          disabled={!text.trim() || isDetecting || !selectedDetectionLabels.length}
        >
          {isDetecting ? t("anonymizing") : t("runAnonymization")}
        </button>
        {!batchMode && !isDemoMode ? (
          <button type="button" className="secondary" onClick={restoreSampleDemo}>
            {t("loadSampleDemo")}
          </button>
        ) : null}
        <button onClick={copyAnonymizedText} disabled={!entities.length}>
          {t("copyAnonymized")}
        </button>
        <button onClick={openAuditReport} disabled={!entities.length || auditReportBusy}>
          {auditReportBusy ? t("auditBuilding") : t("showAuditReport")}
        </button>
        <button
          className="secondary"
          onClick={downloadLabelStudioExport}
          disabled={!entities.length || isBatchLoading}
        >
          {t("exportLabelStudio")}
        </button>
        {!batchMode ? (
          <button
            className="secondary"
            onClick={() => void exportEverythingPackage()}
            disabled={!entities.length || isExportingPackage || isDetecting}
            title={t("exportEverythingHint")}
          >
            {isExportingPackage ? t("buildingZip") : t("exportEverything")}
          </button>
        ) : (
          <button
            className="secondary"
            onClick={downloadAllBatchOutputs}
            disabled={isDownloadingZip || isDetecting}
          >
            {isDownloadingZip ? t("buildingZip") : t("exportAnonymizedData")}
          </button>
        )}
        {!batchMode ? (
          <>
            <button
              className="secondary"
              type="button"
              onClick={saveSessionDocument}
              disabled={isDetecting || (!String(text || "").trim() && !entities.length)}
              title={t("sessionSaveHint")}
            >
              {t("sessionSave")}
            </button>
            <button
              className="secondary"
              type="button"
              onClick={openSessionPicker}
              disabled={isDetecting || isBatchLoading}
              title={t("sessionOpenHint")}
            >
              {t("sessionOpen")}
            </button>
            <input
              ref={sessionInputRef}
              type="file"
              accept="application/json,.json"
              hidden
              onChange={(event) => void handleSessionFileChange(event)}
            />
          </>
        ) : null}
        {batchMode ? (
          <>
            <button
              className="secondary"
              onClick={() => goToFile(currentFileIndex - 1)}
              disabled={currentFileIndex === 0 || isBatchLoading || isDetecting}
            >
              {t("previousFile")}
            </button>
            <button
              className="secondary"
              onClick={() => goToFile(currentFileIndex + 1)}
              disabled={currentFileIndex >= batchFiles.length - 1 || isBatchLoading || isDetecting}
            >
              {t("nextFile")}
            </button>
          </>
        ) : null}
        <button className="secondary" onClick={clearSession} disabled={isBatchLoading}>
          {batchMode ? t("closeBatch") : t("clear")}
        </button>
        {usesGlinerLabels ? (
          <label className="backend-select gliner-threshold-field">
            <span>{t("glinerThreshold")}</span>
            <input
              type="range"
              min="0.2"
              max="0.7"
              step="0.05"
              value={threshold}
              disabled={isDetecting}
              onChange={(event) => setThreshold(Number(event.target.value))}
            />
            <span className="gliner-threshold-value">{threshold.toFixed(2)}</span>
          </label>
        ) : null}
        <span className="status">{status}</span>
      </section>

      <section className="batch-panel panel">
        <div className="batch-panel-intro">
          <h2>{t("batchProcessing")}</h2>
          <div className="batch-load-actions">
            <button onClick={openBatchFolderPicker} disabled={isDetecting || isBatchLoading}>
              {isBatchLoading ? t("loading") : t("chooseFolder")}
            </button>
            <button
              className="secondary"
              onClick={openBatchFilePicker}
              disabled={isDetecting || isBatchLoading}
            >
              {t("chooseFiles")}
            </button>
          </div>
        </div>

        <input
          ref={folderInputRef}
          type="file"
          multiple
          webkitdirectory=""
          mozdirectory=""
          style={{ display: "none" }}
          onChange={handleBatchFolderChange}
        />

        <input
          ref={filesInputRef}
          type="file"
          multiple
          accept=".txt,.text,.docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain"
          style={{ display: "none" }}
          onChange={handleBatchFilesChange}
        />

        {batchMode ? (
          <div className="batch-navigation">
            <div className="batch-navigation-main">
              <button
                onClick={() => goToFile(currentFileIndex - 1)}
                disabled={currentFileIndex === 0 || isBatchLoading || isDetecting}
              >
                {t("previousFile")}
              </button>
              <div
                className="batch-file-indicator"
                title={[batchFolderLabel, batchOutputLabel ? `${batchOutputLabel}.zip` : ""]
                  .filter(Boolean)
                  .join(" · ")}
              >
                <strong>
                  {currentFileIndex + 1} / {batchFiles.length}
                </strong>
                <span>{currentFile?.name}</span>
              </div>
              <button
                onClick={() => goToFile(currentFileIndex + 1)}
                disabled={currentFileIndex >= batchFiles.length - 1 || isBatchLoading || isDetecting}
              >
                {t("nextFile")}
              </button>
            </div>

            <div className="batch-jump-controls">
              <form className="batch-jump-field" onSubmit={handleJumpToFileNumber}>
                <label htmlFor="camembert-batch-jump-number">{t("goToFileNumber")}</label>
                <div className="batch-jump-row">
                  <input
                    id="camembert-batch-jump-number"
                    type="number"
                    min={1}
                    max={batchFiles.length}
                    value={jumpFileNumber}
                    onChange={(event) => setJumpFileNumber(event.target.value)}
                    disabled={isBatchLoading || isDetecting}
                  />
                  <button type="submit" disabled={isBatchLoading || isDetecting}>
                    {t("batchGo")}
                  </button>
                </div>
              </form>

              <form className="batch-jump-field" onSubmit={handleJumpToFileName}>
                <label htmlFor="camembert-batch-jump-name">{t("goToFileName")}</label>
                <div className="batch-jump-row">
                  <input
                    id="camembert-batch-jump-name"
                    list="camembert-batch-file-list"
                    value={jumpFileName}
                    onChange={(event) => setJumpFileName(event.target.value)}
                    placeholder={t("fileNamePlaceholder")}
                    disabled={isBatchLoading || isDetecting}
                  />
                  <datalist id="camembert-batch-file-list">
                    {batchFiles.map((file, index) => (
                      <option key={file.id} value={file.name}>
                        {index + 1}. {file.name}
                      </option>
                    ))}
                  </datalist>
                  <button type="submit" disabled={isBatchLoading || isDetecting}>
                    {t("batchGo")}
                  </button>
                </div>
              </form>
            </div>
          </div>
        ) : null}

        <div className="batch-options-row">
          <label
            className="batch-auto-ner"
            title={t("autoRunNerHint", { model: nerEngineMeta.id })}
          >
            <input
              type="checkbox"
              checked={autoRunNer}
              onChange={(event) => toggleAutoRunNer(event.target.checked)}
              disabled={isDetecting}
            />
            <span>{t("autoRunNer")}</span>
          </label>

          <label
            className="batch-auto-ner batch-process-count"
            title={t("batchProcessCountHint")}
          >
            <span>{t("batchProcessCount")}</span>
            <select
              value={batchProcessCount}
              onChange={(event) => setBatchProcessCount(event.target.value)}
              disabled={isDetecting || isBatchLoading}
              aria-label={t("batchProcessCount")}
            >
              <option value="all">{t("batchProcessAll")}</option>
              <option value="1">1</option>
              <option value="5">5</option>
              <option value="10">10</option>
              <option value="25">25</option>
            </select>
          </label>
        </div>
      </section>

      <div className="panel basic-ner-engine-panel">
        <div className="panel-header">
          <h3>{t("basicNerModelTitle")}</h3>
          <span>{t("basicNerModelHint")}</span>
        </div>
        <div
          className="basic-ner-engine-options"
          role="radiogroup"
          aria-label={t("basicNerModelTitle")}
        >
          <label className="basic-ner-engine-option">
            <input
              type="radio"
              name={`ner-engine-${variant}`}
              value={BASIC_NER_ENGINE_PII_ONNX}
              checked={nerEngine === BASIC_NER_ENGINE_PII_ONNX}
              disabled={isDetecting}
              onChange={() => handleNerEngineChange(BASIC_NER_ENGINE_PII_ONNX)}
            />
            <span>
              {t("basicNerModelPiiOption")}{" "}
              <a
                className="model-hub-link"
                href={GLINER2_PII_ONNX_HF_URL}
                target="_blank"
                rel="noreferrer"
                onClick={(event) => event.stopPropagation()}
              >
                {t("gliner2PiiOnnxShortName")}
              </a>
              <span className="basic-ner-engine-speed">{t("basicNerModelSpeedFast")}</span>
            </span>
          </label>
          <label className="basic-ner-engine-option">
            <input
              type="radio"
              name={`ner-engine-${variant}`}
              value={BASIC_NER_ENGINE_CAMEMBERT}
              checked={nerEngine === BASIC_NER_ENGINE_CAMEMBERT}
              disabled={isDetecting}
              onChange={() => handleNerEngineChange(BASIC_NER_ENGINE_CAMEMBERT)}
            />
            <span>
              {t("basicNerModelCamembertOption")}{" "}
              <a
                className="model-hub-link"
                href={`https://huggingface.co/${NER_MODEL_IDS["camembert-dates"]}`}
                target="_blank"
                rel="noreferrer"
                onClick={(event) => event.stopPropagation()}
              >
                {t("camembertShortName")}
              </a>
              <span className="basic-ner-engine-speed">{t("basicNerModelSpeedFast")}</span>
            </span>
          </label>
          <label className="basic-ner-engine-option">
            <input
              type="radio"
              name={`ner-engine-${variant}`}
              value={BASIC_NER_ENGINE_MULTI}
              checked={nerEngine === BASIC_NER_ENGINE_MULTI}
              disabled={isDetecting}
              onChange={() => handleNerEngineChange(BASIC_NER_ENGINE_MULTI)}
            />
            <span>
              {t("basicNerModelMultiOption")}{" "}
              <a
                className="model-hub-link"
                href={GLINER2_MULTI_HF_URL}
                target="_blank"
                rel="noreferrer"
                onClick={(event) => event.stopPropagation()}
              >
                {t("gliner2MultiShortName")}
              </a>
              <span className="basic-ner-engine-speed">{t("basicNerModelSpeedMedium")}</span>
            </span>
          </label>
        </div>
      </div>

      {usesGlinerLabels ? (
      <div className="panel gliner-labels-panel">
        <div className="panel-header">
          <div className="gliner-labels-header-left">
            <h3>{t("glinerLabelsTitle")}</h3>
            <div className="gliner-labels-bulk-actions">
              <button
                type="button"
                className="link-button"
                disabled={isDetecting || selectedDetectionLabels.length === availableDetectionLabels.length}
                onClick={selectAllDetectionLabels}
              >
                {t("glinerLabelsSelectAll")}
              </button>
              <button
                type="button"
                className="link-button"
                disabled={isDetecting || selectedDetectionLabels.length === 0}
                onClick={deselectAllDetectionLabels}
              >
                {t("glinerLabelsDeselectAll")}
              </button>
            </div>
          </div>
          <span className="gliner-labels-count">
            {t("glinerLabelsHint", { count: selectedDetectionLabels.length })}
          </span>
        </div>
        <div className="gliner-label-list">
          {availableDetectionLabels.map((label) => {
            const active = activeLabels.has(label);
            const isCustom = !GLINER_LABELS.includes(label);
            return (
              <span key={label} className="gliner-label-chip-wrap">
                <button
                  type="button"
                  className={`gliner-label-chip${active ? " is-active" : ""}`}
                  disabled={isDetecting}
                  onClick={() => toggleDetectionLabel(label)}
                >
                  {label}
                </button>
                {isCustom ? (
                  <button
                    type="button"
                    className="gliner-label-remove"
                    disabled={isDetecting}
                    aria-label={t("basicRemoveLabel", { label })}
                    title={t("basicRemoveLabel", { label })}
                    onClick={() => removeCustomDetectionLabel(label)}
                  >
                    ×
                  </button>
                ) : null}
              </span>
            );
          })}
        </div>
        <form className="gliner-add-label-row" onSubmit={handleAddDetectionLabel}>
          <input
            id="basic-add-label"
            type="text"
            value={newLabelDraft}
            disabled={isDetecting}
            aria-label={t("basicAddLabel")}
            placeholder={t("basicAddLabelPlaceholder")}
            onChange={(event) => setNewLabelDraft(event.target.value)}
          />
          <button type="submit" className="secondary" disabled={isDetecting || !newLabelDraft.trim()}>
            {t("basicAddLabel")}
          </button>
        </form>
        <p className="category-hint gliner-labels-footnote">
          {t("basicLabelsFootnoteBefore")}
          <a
            className="model-hub-link"
            href={nerEngineMeta.hfUrl}
            target="_blank"
            rel="noreferrer"
            title={nerEngineMeta.id}
          >
            {t(nerEngineMeta.shortNameKey)}
          </a>
          {t("basicLabelsFootnoteAfter")}
        </p>
      </div>
      ) : null}

      {error ? (
        <section className="error-card">
          <strong>{t("errorTitle")}</strong>
          <p>{error}</p>
          <p>{t("errorHint")}</p>
        </section>
      ) : null}

      <section
        className={`workspace gen-workspace ${
          showPersonGraph ? "workspace-four-col" : "workspace-three-col"
        }`}
      >
        <div className="panel workspace-sidebar gen-sidebar">
          <div className="panel-header">
            <h2>{t("panel2Title")}</h2>
            <span>
              {isDemoMode ? (
                `${t("demoModelLabel")} — ${t("demoPanelHint")}`
              ) : modelName ? (
                <>
                  {t("modelLinePrefix")}{" "}
                  <a
                    className="model-hub-link"
                    href={nerEngineMeta.hfUrl}
                    target="_blank"
                    rel="noreferrer"
                    title={modelName}
                  >
                    {t(nerEngineMeta.shortNameKey)}
                  </a>{" "}
                  {t("modelLineSuffix")}
                </>
              ) : (
                <>
                  {t("backendLinePrefix")}{" "}
                  <a
                    className="model-hub-link"
                    href={nerEngineMeta.hfUrl}
                    target="_blank"
                    rel="noreferrer"
                    title={nerEngineMeta.id}
                  >
                    {t(nerEngineMeta.shortNameKey)}
                  </a>
                </>
              )}
            </span>
          </div>
          <CategoryReview
            entities={entities}
            groupedEntities={groupedEntities}
            removedEntities={removedEntities}
            categoryLabels={categoryLabels}
            selectedCategories={selectedCategories}
            excludedEntityKeys={excludedEntityKeys}
            onToggleCategory={toggleCategory}
            onToggleEntity={toggleEntityValue}
            onRemoveEntity={removeEntityValue}
            onRestoreEntity={restoreEntityValue}
          />
        </div>

        <div className="panel workspace-source">
          <div className="panel-header workspace-source-header">
            <h2>
              {showSourceHighlight
                ? t("panelSourceHighlight")
                : batchMode
                  ? t("panel1Batch")
                  : t("panel1Single")}
            </h2>
            <div className="workspace-source-header-center">
              {showSourceHighlight ? (
                <button
                  type="button"
                  className="link-button"
                  onClick={beginEditSourceText}
                >
                  {t("editSourceText")}
                </button>
              ) : (
                <span className="workspace-source-header-spacer" aria-hidden="true">
                  {t("editSourceText")}
                </span>
              )}
            </div>
            <div className="panel-header-meta workspace-source-header-meta">
              {showSourceHighlight && textPageCount > 1 ? (
                <TextPageNav
                  pageIndex={safeTextPageIndex}
                  pageCount={textPageCount}
                  onPageChange={handleTextPageChange}
                  disabled={isDetecting}
                />
              ) : null}
              <span>
                {batchMode && currentFile ? `${currentFile.name} · ` : ""}
                {showSourceHighlight
                  ? t("panel3Hint", { count: entities.length })
                  : t("characters", { count: text.length })}
              </span>
            </div>
          </div>
          <DomReconcileErrorBoundary
            onRecover={() =>
              setStatus(
                "Recovered from a browser DOM glitch in the source panel — try again if the text looks wrong.",
              )
            }
          >
            <div
              key={`${showSourceHighlight ? "highlight" : "edit"}-${sourceBodyKey}-${safeTextPageIndex}`}
              className="workspace-source-body"
              translate="no"
            >
              {showSourceHighlight ? (
                <HighlightedText
                  ref={sourceScrollRef}
                  text={currentTextPage.text}
                  segments={pageHighlightedSegments}
                  categoryLabels={categoryLabels}
                  selectedCategories={selectedCategories}
                  excludedEntityKeys={excludedEntityKeys}
                  placeholderHints={placeholderHints}
                  focusRanges={pageFocusRanges}
                  persons={persons}
                  pinnedPlaceholder={pinnedPersonPlaceholder}
                  onPinPerson={setPinnedPersonPlaceholder}
                  onAddSelection={(selection) => {
                    const pageOffset = currentTextPage.start || 0;
                    const nextMenu = {
                      mode: "add",
                      scope: "all",
                      ...selection,
                      start: selection.start + pageOffset,
                      end: selection.end + pageOffset,
                    };
                    entityMenuRef.current = nextMenu;
                    setEntityMenu(nextMenu);
                  }}
                  onEntityClick={(entity, position) => {
                    const pageOffset = currentTextPage.start || 0;
                    const documentEntity = {
                      ...entity,
                      start: Number(entity.start) + pageOffset,
                      end: Number(entity.end) + pageOffset,
                    };
                    const nextMenu = {
                      mode: "remove",
                      entity: documentEntity,
                      scope: "all",
                      ...position,
                    };
                    entityMenuRef.current = nextMenu;
                    setEntityMenu(nextMenu);
                  }}
                />
              ) : (
                <textarea
                  value={text}
                  onChange={(event) => {
                    setText(event.target.value);
                    setEntities([]);
                    setRemovedEntities([]);
                    setDistinctOccurrenceKeys({});
                    setLinkedValueKeys({});
                    clearPersonGraph();
                    setSelectedCategories({});
                    setExcludedEntityKeys({});
                    setModelName(null);
                    setIsDemoMode(false);
                    setIsEditingSource(true);
                    setEntityMenu(null);
                  }}
                  placeholder={t("textPlaceholder")}
                  autoComplete="off"
                  autoCorrect="off"
                  autoCapitalize="off"
                  spellCheck={text.length < LONG_TEXT_WARN_CHARS}
                  data-1p-ignore="true"
                  data-lpignore="true"
                />
              )}
            </div>
          </DomReconcileErrorBoundary>
        </div>

        {showPersonGraph ? (
          <div className="panel workspace-graph">
            <div className="panel-header">
              <h2>{t("generativeGraphTitle")}</h2>
              <div className="panel-header-actions">
                <button
                  type="button"
                  className="secondary person-graph-export"
                  onClick={() => void handleRegeneratePersonGraph()}
                  disabled={!entities.length || isRegeneratingPersonGraph || isDetecting}
                  title={t("personGraphRegenerateHint")}
                >
                  {isRegeneratingPersonGraph
                    ? t("personGraphRegenerateStatus")
                    : t("personGraphRegenerate")}
                </button>
                <PersonGraphViewButton
                  persons={persons}
                  excludedPlaceholders={excludedPlaceholders}
                  excludedSurfaces={excludedSurfaces}
                  title={t("personGraphViewWindowTitle")}
                  subtitle={t("personGraphViewWindowSubtitle", { count: persons.length })}
                />
                <PersonGraphExportButton
                  persons={persons}
                  excludedPlaceholders={excludedPlaceholders}
                  excludedSurfaces={excludedSurfaces}
                  onExported={(mode) =>
                    setStatus(
                      t(
                        mode === "byPerson"
                          ? "personGraphExportByPersonDone"
                          : "personGraphExportDone",
                      ),
                    )
                  }
                />
              </div>
              <span>
                {personGraphNote || t("generativeGraphHint", { count: persons.length })}
              </span>
            </div>
            <div className="workspace-graph-body">
              {persons.length ? (
                <div className="gen-graph-list gen-graph-list-sidebar">
                  {persons.map((person, personIndex) => (
                    <PersonGraphCard
                      key={`${person.placeholder}-${person.name}-${personIndex}`}
                      person={person}
                      persons={persons}
                      excluded={Boolean(excludedPlaceholders[person.placeholder])}
                      excludedSurfaces={excludedSurfaces}
                      focused={focusedPersonPlaceholder === person.placeholder}
                      pinned={pinnedPersonPlaceholder === person.placeholder}
                      dropActive={graphDropTarget === person.placeholder}
                      onHoverPerson={setHoveredPersonPlaceholder}
                      onPinPerson={(placeholder) => {
                        setPinnedPersonPlaceholder((current) =>
                          current === placeholder ? null : placeholder,
                        );
                      }}
                      onTogglePerson={(placeholder) =>
                        handleTogglePerson(placeholder, setExcludedEntityKeys)
                      }
                      onToggleSurface={(placeholder, surface, attrKey, entityLabel) =>
                        handleToggleGraphSurface(
                          placeholder,
                          surface,
                          setExcludedEntityKeys,
                          attrKey,
                          entityLabel,
                        )
                      }
                      onToggleAttr={(placeholder, value) => {
                        const personMatch = persons.find((item) =>
                          (item.attrs || []).some((attr) => attr.value === value),
                        );
                        const attr = personMatch?.attrs?.find((item) => item.value === value);
                        handleToggleGraphSurface(
                          placeholder || personMatch?.placeholder,
                          value,
                          setExcludedEntityKeys,
                          attr?.key,
                          attr?.entityLabel,
                        );
                      }}
                      onMoveSurface={(fromPlaceholder, toPlaceholder, surface, meta) => {
                        const result = moveSurfaceToPerson(
                          fromPlaceholder,
                          toPlaceholder,
                          surface,
                          meta,
                        );
                        if (result) {
                          setStatus(
                            t("personGraphMoved", {
                              surface,
                              person: result.name,
                            }),
                          );
                        }
                      }}
                      onRemoveSurface={(fromPlaceholder, surface, meta) => {
                        const result = removeSurfaceRelation(fromPlaceholder, surface, meta);
                        if (result) {
                          setStatus(
                            t("personGraphRelationRemoved", {
                              surface,
                            }),
                          );
                        }
                      }}
                      onRelatePerson={(fromPlaceholder, toPlaceholder) => {
                        const from = persons.find((item) => item.placeholder === fromPlaceholder);
                        const to = persons.find((item) => item.placeholder === toPlaceholder);
                        const result = relatePersonToPerson(fromPlaceholder, toPlaceholder);
                        if (result && from && to) {
                          setStatus(
                            t(result.removed ? "personGraphUnrelated" : "personGraphRelated", {
                              from: from.name,
                              to: to.name,
                            }),
                          );
                        }
                      }}
                      onRenameEdgeLabel={(placeholder, kind, value, nextLabel) => {
                        const result = renameEdgeLabel(placeholder, kind, value, nextLabel);
                        if (result) {
                          setStatus(
                            t("personGraphRenamedLabel", {
                              label: result.label,
                              value: result.value,
                            }),
                          );
                        }
                      }}
                      onRenameEdgeValue={(placeholder, kind, currentValue, nextValue) => {
                        const result = renameEdgeValue(
                          placeholder,
                          kind,
                          currentValue,
                          nextValue,
                        );
                        if (result) {
                          setStatus(
                            t("personGraphRenamedValue", {
                              previous: result.previous,
                              value: result.value,
                            }),
                          );
                        }
                      }}
                      onDragSurfaceStart={() => setGraphDropTarget(null)}
                      onDragSurfaceEnd={() => setGraphDropTarget(null)}
                      onDragOverPerson={setGraphDropTarget}
                      onDragLeavePerson={(placeholder) => {
                        setGraphDropTarget((current) =>
                          current === placeholder ? null : current,
                        );
                      }}
                      onDropOnPerson={(toPlaceholder, event) => {
                        setGraphDropTarget(null);
                        let payload = null;
                        try {
                          payload = JSON.parse(event.dataTransfer.getData(MOVE_MIME) || "null");
                        } catch {
                          payload = null;
                        }
                        if (!payload?.surface || !payload?.fromPlaceholder) {
                          return;
                        }
                        const result = moveSurfaceToPerson(
                          payload.fromPlaceholder,
                          toPlaceholder,
                          payload.surface,
                          payload,
                        );
                        if (result) {
                          setStatus(
                            t("personGraphMoved", {
                              surface: payload.surface,
                              person: result.name,
                            }),
                          );
                        }
                      }}
                    />
                  ))}
                </div>
              ) : (
                <p className="gen-maps-empty">
                  {isRegeneratingPersonGraph || isDetecting
                    ? t("personGraphBuilding")
                    : t("personGraphEmpty")}
                </p>
              )}
              <p className="category-hint">{t("personGraphMoveHint")}</p>
              <p className="category-hint">{t("personGraphFocusHint")}</p>
              <p className="category-hint">
                {t("personGraphGliner2MultiHintBefore")}
                <a
                  className="model-hub-link"
                  href={nerEngineMeta.hfUrl}
                  target="_blank"
                  rel="noreferrer"
                  title={nerEngineMeta.id}
                >
                  {nerEngineMeta.id}
                </a>
                {t("personGraphGliner2MultiHintAfter")}
              </p>
            </div>
          </div>
        ) : null}

        <div
          className={`workspace-preview-row${
            showPersonGraph && showAnonymizedPersonGraph ? "" : " is-anon-graph-hidden"
          }`}
        >
          <div className="panel workspace-preview">
            <div className="panel-header">
              <h2>{t("panel4Title")}</h2>
              <div className="panel-header-actions">
                {showPersonGraph && !showAnonymizedPersonGraph ? (
                  <button
                    type="button"
                    className="secondary"
                    onClick={() => setShowAnonymizedPersonGraph(true)}
                  >
                    {t("anonymizedPersonGraphShow")}
                  </button>
                ) : null}
              </div>
              <span>{t("panel4Subtitle")}</span>
            </div>
            <DomReconcileErrorBoundary>
              <AnonymizedSplitPreview
                text={currentTextPage.text}
                entities={pageEntities}
                segments={pageHighlightedSegments}
                categoryLabels={categoryLabels}
                selectedCategories={selectedCategories}
                excludedEntityKeys={excludedEntityKeys}
                categoryMethods={categoryMethods}
                onCategoryMethodChange={setCategoryMethods}
                anonymizedText={pageAnonymizedPreview.anonymizedText}
                anonymizedSegments={pageAnonymizedPreview.segments}
                surfaceOverrides={surfaceOverrides}
                onSurfaceOverrideChange={setSurfaceOverrides}
                anonymizedTextOverride={textPageCount > 1 ? null : anonymizedTextOverride}
                onAnonymizedTextOverrideChange={setAnonymizedTextOverride}
                emptyLabel={t("panel4Empty")}
                previewRef={previewScrollRef}
                generalizationMode={generalizationMode}
                generalizationLoading={generalizationLoading}
                generalizationError={generalizationError}
                pageIndex={safeTextPageIndex}
                pageCount={textPageCount}
                onPageChange={handleTextPageChange}
              />
            </DomReconcileErrorBoundary>
          </div>
          {showPersonGraph && showAnonymizedPersonGraph ? (
            <AnonymizedPersonGraphPanel
              persons={anonymizedPersons}
              excludedPlaceholders={excludedPlaceholders}
              excludedSurfaces={excludedSurfaces}
              onHide={() => setShowAnonymizedPersonGraph(false)}
              onRegenerate={() => void handleRegeneratePersonGraph()}
              isRegenerating={isRegeneratingPersonGraph}
              canRegenerate={Boolean(entities.length) && !isDetecting}
              onRenameEdgeValue={(placeholder, kind, currentValue, nextValue) => {
                const person = anonymizedPersons.find(
                  (item) => item.placeholder === placeholder,
                );
                const origin = resolveAnonymizedGraphEdgeOrigin(person, kind, currentValue);
                if (!origin) {
                  return;
                }
                const result = applyAnonymizedGraphValueEdit({
                  surfaceOverrides,
                  replacementMap: anonymizedReplacementMap,
                  category: origin.category,
                  originalSurface: origin.originalSurface,
                  previousReplacement: origin.previousReplacement || currentValue,
                  nextReplacement: nextValue,
                  anonymizedTextOverride,
                  generatedAnonymizedText: getFullAnonymizedText(),
                });
                if (!result) {
                  return;
                }
                setSurfaceOverrides(result.surfaceOverrides);
                if (result.anonymizedTextOverride != null) {
                  setAnonymizedTextOverride(result.anonymizedTextOverride);
                }
                setStatus(
                  t("personGraphRenamedValue", {
                    previous: currentValue,
                    value: nextValue,
                  }),
                );
              }}
              onExported={(mode) =>
                setStatus(
                  t(
                    mode === "byPerson"
                      ? "anonymizedPersonGraphExportByPersonDone"
                      : "anonymizedPersonGraphExportDone",
                  ),
                )
              }
            />
          ) : null}
        </div>
      </section>

      {entityMenu ? (
        <EntityEditMenu
          menu={entityMenu}
          sourceText={text}
          menuCategories={menuCategories}
          categoryLabels={categoryLabels}
          entities={entities}
          persons={persons}
          relatedPlaceholders={
            entityMenu.entity?.text
              ? getRelatedPlaceholdersForSurface(entityMenu.entity.text)
              : []
          }
          onScopeChange={setEntityMenuScope}
          onAdd={handleAddEntity}
          onAddCustom={handleAddCustomCategory}
          onChangeCategory={handleChangeEntityCategory}
          onChangeCategoryCustom={handleChangeEntityCategoryCustom}
          distinctOccurrenceKeys={distinctOccurrenceKeys}
          linkedValueKeys={linkedValueKeys}
          onToggleDistinctOccurrence={handleToggleDistinctOccurrence}
          onLinkSameCode={handleLinkSameCode}
          onRelateToPerson={handleRelateEntityToPerson}
          onRemove={handleRemoveEntity}
          onClose={closeEntityMenu}
        />
      ) : null}

      {reportOpen ? (
        <AuditReportWindow
          report={auditReportText}
          busy={auditReportBusy}
          onClose={() => {
            setReportOpen(false);
            setAuditReportBusy(false);
          }}
          onCopy={copyAuditReport}
          onDownload={downloadAuditReport}
        />
      ) : null}
    </section>
  );
}
