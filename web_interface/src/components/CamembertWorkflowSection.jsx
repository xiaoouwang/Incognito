import { useEffect, useMemo, useRef, useState } from "react";
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
import { downloadBatchZip, downloadLabelStudioBundle } from "../lib/batchZip.js";
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
  BASIC_NER_ENGINE_DEFAULT,
  BASIC_NER_ENGINE_MULTI,
  BASIC_NER_ENGINE_PII_ONNX,
  GLINER2_PII_ONNX_DEFAULT_THRESHOLD,
  GLINER2_PII_ONNX_HF_URL,
  GLINER2_PII_ONNX_MODEL_ID,
} from "../lib/gliner2PiiOnnxConstants.js";
import { GLINER_LABELS, GLINER_RULE_LABELS } from "../lib/glinerConstants.js";
import { useGeneralizationLadders } from "../hooks/useGeneralizationLadders.js";
import { usePersonGraphPanel } from "../hooks/usePersonGraphPanel.js";
import {
  addEntitySpans,
  buildCategoryLabels,
  buildMenuCategories,
  createCategorySelectionFromEntities,
  createCustomCategoryId,
  createHighlightSegments,
  downloadFile,
  findAllOccurrenceRanges,
  findBatchFileIndex,
  formatBatchOutputTimestamp,
  getCategoryLabel,
  getEntityValueKey,
  groupEntities,
  inferCustomCategoriesFromEntities,
  isEntityActive,
  finalizeDetectedEntities,
  removeEntityById,
  buildAnonymizedPreviewModel,
} from "../lib/entityUtils.js";
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
  /** Browser ONNX NER for Basic and Advanced (GLiNER2-multi or GLiNER2-PII). */
  const [nerEngine, setNerEngine] = useState(BASIC_NER_ENGINE_DEFAULT);
  const activeNerEngine = nerEngine;
  const [threshold, setThreshold] = useState(GLINER2_MULTI_DEFAULT_THRESHOLD);
  const [isEditingSource, setIsEditingSource] = useState(false);
  const [categoryMethods, setCategoryMethods] = useState({});
  const [surfaceOverrides, setSurfaceOverrides] = useState({});
  const [anonymizedTextOverride, setAnonymizedTextOverride] = useState(null);
  const [showAnonymizedPersonGraph, setShowAnonymizedPersonGraph] = useState(true);

  const {
    persons,
    excludedPlaceholders,
    excludedSurfaces,
    personGraphNote,
    pinnedPersonPlaceholder,
    focusedPersonPlaceholder,
    personFocusRanges,
    setHoveredPersonPlaceholder,
    setPinnedPersonPlaceholder,
    refreshPersonGraph,
    applyRelexPersonGraph,
    clearPersonGraph,
    handleTogglePerson,
    handleToggleGraphSurface,
    syncEntityChipToGraph,
    relateEntityToPerson,
    relatePersonToPerson,
    moveSurfaceToPerson,
    renameEdgeLabel,
    renameEdgeValue,
    getRelatedPlaceholdersForSurface,
  } = usePersonGraphPanel({
    text,
    entities,
    t,
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
          const { extractGlinerRelexRelations } = await import("../lib/glinerRelexService.js");
          return extractGlinerRelexRelations(sourceText, nextEntities);
        }
      : null,
  });
  const [graphDropTarget, setGraphDropTarget] = useState(null);

  const showSourceHighlight = entities.length > 0 && !isEditingSource;

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
        downloadHint: "Running GLiNER2-PII ONNX in the browser (first run downloads ~426 MB quantized into cache)…",
        downloadLabel: "GLiNER2-PII",
        detectLabel: "GLiNER2-PII",
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
    };
  }, [activeNerEngine]);

  function handleNerEngineChange(nextEngine) {
    setNerEngine(nextEngine);
    setThreshold(
      nextEngine === BASIC_NER_ENGINE_PII_ONNX
        ? GLINER2_PII_ONNX_DEFAULT_THRESHOLD
        : GLINER2_MULTI_DEFAULT_THRESHOLD,
    );
  }

  async function runSelectedNerDetection({ text: sourceText, onProgress }) {
    if (activeNerEngine === BASIC_NER_ENGINE_PII_ONNX) {
      const { runGliner2PiiOnnxDetection } = await import("../lib/gliner2PiiOnnxService.js");
      return runGliner2PiiOnnxDetection({
        text: sourceText,
        labels: selectedDetectionLabels,
        threshold,
        onProgress,
      });
    }
    const { runGliner2MultiDetection } = await import("../lib/gliner2MultiService.js");
    return runGliner2MultiDetection({
      text: sourceText,
      labelMap: detectionLabelMap,
      threshold,
      onProgress,
    });
  }

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
  const highlightedSegments = useMemo(
    () => createHighlightSegments(text, entities),
    [text, entities],
  );
  const anonymizedPreview = useMemo(
    () =>
      buildAnonymizedPreviewModel(
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
        },
      ),
    [
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
    ],
  );
  const anonymizedText =
    anonymizedTextOverride != null ? anonymizedTextOverride : anonymizedPreview.anonymizedText;
  const anonymizedSegments = anonymizedPreview.segments;
  const anonymizedGraphModel = useMemo(
    () =>
      resolveAnonymizedPersonGraph({
        text,
        entities,
        groupedEntities,
        selectedCategories,
        customCategories,
        persons,
        excludedPlaceholders,
        excludedSurfaces,
        categoryMethods,
        generalizationLadders,
        salt: text,
        surfaceOverrides,
      }),
    [
      text,
      entities,
      groupedEntities,
      selectedCategories,
      customCategories,
      persons,
      excludedPlaceholders,
      excludedSurfaces,
      categoryMethods,
      generalizationLadders,
      surfaceOverrides,
    ],
  );
  const anonymizedPersons = anonymizedGraphModel.persons;
  const anonymizedReplacementMap = anonymizedGraphModel.replacementMap;
  const activeEntities = useMemo(
    () =>
      entities.filter((entity) =>
        isEntityActive(entity, selectedCategories, excludedEntityKeys),
      ),
    [entities, selectedCategories, excludedEntityKeys],
  );
  const auditReport = useMemo(
    () =>
      createAuditReport({
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
      }),
    [
      text,
      entities,
      anonymizedText,
      groupedEntities,
      selectedCategories,
      excludedEntityKeys,
      modelName,
      currentFile,
      categoryMethods,
      generalizationLadders,
      persons,
      batchMode,
      customCategories,
      surfaceOverrides,
      activeNerEngine,
    ],
  );
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

    if (!selectedDetectionLabels.length) {
      setError(t("glinerStatusNoLabels"));
      setStatus(t("glinerStatusNoLabels"));
      return null;
    }

    setError("");
    setIsDetecting(true);
    setStatus(nerEngineMeta.downloadHint);

    try {
      const result = await runSelectedNerDetection({
        text: textToAnalyze,
        onProgress: (progress) => {
          if (progress?.phase === "download") {
            const pct =
              typeof progress.percent === "number" ? ` ${Math.round(progress.percent)}%` : "";
            setStatus(
              `Downloading ${nerEngineMeta.downloadLabel} (${progress.file || "model"})${pct}…`,
            );
          }
        },
      });
      const resolvedModel = result.model || nerEngineMeta.id;
      const normalized = finalizeDetectedEntities(textToAnalyze, result.entities || [], {
        ruleLabels: selectedDetectionLabels.filter((label) =>
          GLINER_RULE_LABELS.includes(label),
        ),
      });
      const categorySelection = createCategorySelectionFromEntities(normalized);

      setEntities(normalized);
      setSelectedCategories(categorySelection);
      setExcludedEntityKeys({});
      setModelName(resolvedModel);
      setIsDemoMode(false);
      setIsEditingSource(false);

      let relations = [];
      let graphNote = "";
      if (showPersonGraph) {
        setStatus("Linking person graph with GLiNER ReLex…");
        const { extractGlinerRelexRelations } = await import("../lib/glinerRelexService.js");
        graphNote = "ReLex graph";
        try {
          relations = await extractGlinerRelexRelations(textToAnalyze, normalized, (progress) => {
            if (progress?.phase === "download") {
              const pct =
                typeof progress.percent === "number" ? ` ${Math.round(progress.percent)}%` : "";
              setStatus(`Downloading GLiNER ReLex (${progress.file || "model"})${pct}…`);
            }
          });
          applyRelexPersonGraph(textToAnalyze, normalized, relations, { resetExclusions: true });
        } catch (graphError) {
          refreshPersonGraph(textToAnalyze, normalized, { resetExclusions: true });
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
      const extractGlinerRelexRelations = showPersonGraph
        ? (await import("../lib/glinerRelexService.js")).extractGlinerRelexRelations
        : null;

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

        const result = await runSelectedNerDetection({ text: file.text });
        const resolvedModel = result.model || nerEngineMeta.id;
        const normalized = finalizeDetectedEntities(file.text, result.entities || [], {
          ruleLabels: selectedDetectionLabels.filter((label) =>
            GLINER_RULE_LABELS.includes(label),
          ),
        });
        const categorySelection = createCategorySelectionFromEntities(normalized);

        let relations = [];
        if (extractGlinerRelexRelations) {
          try {
            setStatus(
              `Linking person graph (ReLex): ${index + 1} of ${files.length} — ${file.name}`,
            );
            await new Promise((resolve) => setTimeout(resolve, 0));
            relations = await extractGlinerRelexRelations(file.text, normalized);
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
    setStatus("Building ZIP archive…");

    try {
      await downloadBatchZip({
        files: batchFiles,
        fileStates: fileStatesRef.current,
        nerBackend: activeNerEngine,
        outputLabel: batchOutputLabel,
        categoryMethods,
        generalizationLadders,
      });
      setStatus(`Downloaded ${batchOutputLabel}.zip with anonymized outputs and reports.`);
    } catch (caughtError) {
      setError(caughtError.message);
      setStatus("ZIP download failed.");
    } finally {
      setIsDownloadingZip(false);
    }
  }

  function restoreSampleDemo() {
    const demo = buildSampleDemoPersonGraph();
    setText(demo.text);
    setEntities(demo.entities);
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
    syncEntityChipToGraph(category, entityText, excluding);
  }

  function copyAnonymizedText() {
    navigator.clipboard.writeText(anonymizedText);
    setStatus("Anonymized text copied to clipboard.");
  }

  function copyAuditReport() {
    navigator.clipboard.writeText(auditReport);
    setStatus("Audit report copied to clipboard.");
  }

  function downloadAuditReport() {
    downloadFile(auditReport, "anonymization-audit-report.md", "text/markdown;charset=utf-8");
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
        : findAllOccurrenceRanges(text, menu.text);

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
    if (!entityMenu || entityMenu.mode !== "remove") return;

    const next = removeEntityById(entities, entityMenu.entity.id, entityMenu.entity);
    setEntities(next);
    if (showPersonGraph) {
      refreshPersonGraph(text, next, { resetExclusions: false });
    }
    closeEntityMenu();
    setStatus(`Removed entity "${entityMenu.entity.text}".`);
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
          onClick={detectEntities}
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
        <button onClick={() => setReportOpen(true)} disabled={!entities.length}>
          {t("showAuditReport")}
        </button>
        <button
          className="secondary"
          onClick={downloadLabelStudioExport}
          disabled={!entities.length || isBatchLoading}
        >
          {t("exportLabelStudio")}
        </button>
        {batchMode ? (
          <button
            className="secondary"
            onClick={downloadAllBatchOutputs}
            disabled={isDownloadingZip || isDetecting}
          >
            {isDownloadingZip ? t("buildingZip") : t("exportAnonymizedData")}
          </button>
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
            </span>
          </label>
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
            </span>
          </label>
        </div>
      </div>

      <div className="panel gliner-labels-panel">
        <div className="panel-header">
          <h3>{t("glinerLabelsTitle")}</h3>
          <span>{t("glinerLabelsHint", { count: selectedDetectionLabels.length })}</span>
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
            categoryLabels={categoryLabels}
            selectedCategories={selectedCategories}
            excludedEntityKeys={excludedEntityKeys}
            onToggleCategory={toggleCategory}
            onToggleEntity={toggleEntityValue}
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
            <span className="panel-header-meta">
              {batchMode && currentFile ? `${currentFile.name} · ` : ""}
              {showSourceHighlight
                ? t("panel3Hint", { count: entities.length })
                : t("characters", { count: text.length })}
            </span>
          </div>
          <DomReconcileErrorBoundary
            onRecover={() =>
              setStatus(
                "Recovered from a browser DOM glitch in the source panel — try again if the text looks wrong.",
              )
            }
          >
            <div
              key={`${showSourceHighlight ? "highlight" : "edit"}-${sourceBodyKey}`}
              className="workspace-source-body"
              translate="no"
            >
              {showSourceHighlight ? (
                <HighlightedText
                  ref={sourceScrollRef}
                  text={text}
                  segments={highlightedSegments}
                  categoryLabels={categoryLabels}
                  selectedCategories={selectedCategories}
                  excludedEntityKeys={excludedEntityKeys}
                  focusRanges={personFocusRanges}
                  persons={persons}
                  pinnedPlaceholder={pinnedPersonPlaceholder}
                  onPinPerson={setPinnedPersonPlaceholder}
                  onAddSelection={(selection) => {
                    const nextMenu = {
                      mode: "add",
                      scope: "all",
                      ...selection,
                    };
                    entityMenuRef.current = nextMenu;
                    setEntityMenu(nextMenu);
                  }}
                  onEntityClick={(entity, position) => {
                    const nextMenu = {
                      mode: "remove",
                      entity,
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
                    clearPersonGraph();
                    setSelectedCategories({});
                    setExcludedEntityKeys({});
                    setModelName(null);
                    setIsDemoMode(false);
                    setIsEditingSource(true);
                    setEntityMenu(null);
                  }}
                  placeholder={t("textPlaceholder")}
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
                <p className="gen-maps-empty">{t("generativeGraphEmpty")}</p>
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
                text={text}
                entities={entities}
                segments={highlightedSegments}
                categoryLabels={categoryLabels}
                selectedCategories={selectedCategories}
                excludedEntityKeys={excludedEntityKeys}
                categoryMethods={categoryMethods}
                onCategoryMethodChange={setCategoryMethods}
                anonymizedText={anonymizedPreview.anonymizedText}
                anonymizedSegments={anonymizedSegments}
                surfaceOverrides={surfaceOverrides}
                onSurfaceOverrideChange={setSurfaceOverrides}
                anonymizedTextOverride={anonymizedTextOverride}
                onAnonymizedTextOverrideChange={setAnonymizedTextOverride}
                emptyLabel={t("panel4Empty")}
                previewRef={previewScrollRef}
                generalizationMode={generalizationMode}
                generalizationLoading={generalizationLoading}
                generalizationError={generalizationError}
              />
            </DomReconcileErrorBoundary>
          </div>
          {showPersonGraph && showAnonymizedPersonGraph ? (
            <AnonymizedPersonGraphPanel
              persons={anonymizedPersons}
              excludedPlaceholders={excludedPlaceholders}
              excludedSurfaces={excludedSurfaces}
              onHide={() => setShowAnonymizedPersonGraph(false)}
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
                  generatedAnonymizedText: anonymizedPreview.anonymizedText,
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
          persons={persons}
          relatedPlaceholders={
            entityMenu.entity?.text
              ? getRelatedPlaceholdersForSurface(entityMenu.entity.text)
              : []
          }
          onScopeChange={setEntityMenuScope}
          onAdd={handleAddEntity}
          onAddCustom={handleAddCustomCategory}
          onRelateToPerson={handleRelateEntityToPerson}
          onRemove={handleRemoveEntity}
          onClose={closeEntityMenu}
        />
      ) : null}

      {reportOpen ? (
        <AuditReportWindow
          report={auditReport}
          onClose={() => setReportOpen(false)}
          onCopy={copyAuditReport}
          onDownload={downloadAuditReport}
        />
      ) : null}
    </section>
  );
}
