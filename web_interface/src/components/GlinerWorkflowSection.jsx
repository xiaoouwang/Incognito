import { useEffect, useMemo, useRef, useState } from "react";
import AuditReportWindow from "./AuditReportWindow.jsx";
import CategoryReview from "./CategoryReview.jsx";
import EntityEditMenu from "./EntityEditMenu.jsx";
import GlinerJobProgress from "./GlinerJobProgress.jsx";
import HighlightedText from "./HighlightedText.jsx";
import BatchJobProgress from "./BatchJobProgress.jsx";
import PersonGraphCard, { MOVE_MIME } from "./PersonGraphCard.jsx";
import PersonGraphExportButton from "./PersonGraphExportButton.jsx";
import PersonGraphViewButton from "./PersonGraphViewButton.jsx";
import WorkflowSectionHeader from "./WorkflowSectionHeader.jsx";
import { useUiLocale } from "../context/UiLocaleContext.jsx";
import { useGeneralizationLadders } from "../hooks/useGeneralizationLadders.js";
import { useGlinerWorker } from "../hooks/useGlinerWorker.js";
import { usePersonGraphPanel } from "../hooks/usePersonGraphPanel.js";
import { useSyncedScroll } from "../hooks/useSyncedScroll.js";
import { createLabelStudioExport } from "../labelStudioExport.js";
import { createAuditReport } from "../lib/auditReport.js";
import { downloadBatchZip, downloadLabelStudioBundle } from "../lib/batchZip.js";
import { buildGlinerBatchFileOutputs } from "../lib/glinerBatchOutputs.js";
import {
  BATCH_EMPTY_MESSAGE,
  batchSourceLabel,
  readDocumentsFromDirectoryPicker,
  readDocumentsFromFilePicker,
  readDocumentsFromFolderInput,
} from "../lib/batchLoad.js";
import {
  GLINER_DEFAULT_THRESHOLD,
  GLINER_LABELS,
  GLINER_MODEL_ID,
} from "../lib/glinerConstants.js";
import { buildGlinerSampleDemoState } from "../lib/glinerSampleDemo.js";
import {
  buildSampleDemoPersonGraph,
  getSampleDemoRelexRelations,
} from "../lib/sampleDemo.js";
import {
  buildGlinerCategoryLabels,
  buildGlinerMenuCategories,
  finalizeGlinerEntities,
  getGlinerLabelHighlightClass,
} from "../lib/glinerUtils.js";
import AnonymizedSplitPreview from "./AnonymizedSplitPreview.jsx";
import AnonymizedPersonGraphPanel from "./AnonymizedPersonGraphPanel.jsx";
import {
  applyAnonymizedGraphValueEdit,
  resolveAnonymizedGraphEdgeOrigin,
  resolveAnonymizedPersonGraph,
} from "../lib/anonymizedPersonGraph.js";
import {
  addEntitySpans,
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
  removeEntityById,
  buildAnonymizedPreviewModel,
} from "../lib/entityUtils.js";
import "./generativeWorkflow.css";

export default function GlinerWorkflowSection() {
  const { detectEntities: detectEntitiesWithGliner, jobProgress } = useGlinerWorker();
  const { t } = useUiLocale();
  const folderInputRef = useRef(null);
  const filesInputRef = useRef(null);
  const fileStatesRef = useRef({});
  const batchCustomCategoriesRef = useRef({});
  const entityMenuRef = useRef(null);
  const sourceScrollRef = useRef(null);
  const previewScrollRef = useRef(null);
  const initialDemo = buildGlinerSampleDemoState();

  const [text, setText] = useState(initialDemo.text);
  const [entities, setEntities] = useState(initialDemo.entities);
  const [modelName, setModelName] = useState(initialDemo.modelName);
  const [isDemoMode, setIsDemoModeState] = useState(true);
  const isDemoModeRef = useRef(true);
  function setIsDemoMode(next) {
    isDemoModeRef.current = next;
    setIsDemoModeState(next);
  }
  const [activeLabels, setActiveLabels] = useState(() => new Set(GLINER_LABELS));
  const [threshold, setThreshold] = useState(GLINER_DEFAULT_THRESHOLD);
  const [categoryMethods, setCategoryMethods] = useState({});
  const [surfaceOverrides, setSurfaceOverrides] = useState({});
  const [anonymizedTextOverride, setAnonymizedTextOverride] = useState(null);
  const [showAnonymizedPersonGraph, setShowAnonymizedPersonGraph] = useState(true);
  const [selectedCategories, setSelectedCategories] = useState(initialDemo.selectedCategories);
  const [excludedEntityKeys, setExcludedEntityKeys] = useState(initialDemo.excludedEntityKeys);
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
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [entityMenu, setEntityMenu] = useState(null);
  const [customCategories, setCustomCategories] = useState({});
  const [isEditingSource, setIsEditingSource] = useState(false);

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
    removeSurfaceRelation,
    renameEdgeLabel,
    renameEdgeValue,
    getRelatedPlaceholdersForSurface,
  } = usePersonGraphPanel({
    text,
    entities,
    t,
    // Advanced: GLiNER ReLex (demo uses the same captured fixture as Basic — no download).
    extractRelations: async (sourceText, nextEntities) => {
      if (isDemoModeRef.current) {
        return {
          relations: getSampleDemoRelexRelations(),
          fillProximity: true,
          noteKey: "personGraphRelexDemoReady",
        };
      }
      const { extractGlinerRelexRelations } = await import("../lib/glinerRelexService.js");
      return extractGlinerRelexRelations(sourceText, nextEntities);
    },
  });
  const [graphDropTarget, setGraphDropTarget] = useState(null);

  const showSourceHighlight = entities.length > 0 && !isEditingSource;

  // Split preview syncs its own panes; dual sync on previewScrollRef crashes Chromium.
  useSyncedScroll(sourceScrollRef, previewScrollRef, false);

  useEffect(() => {
    // Synchronous demo seed so person cards + "Show person graph" work before any model run.
    const demoGraph = buildSampleDemoPersonGraph();
    applyRelexPersonGraph(demoGraph.text, demoGraph.entities, demoGraph.relations, {
      resetExclusions: true,
      fillProximity: true,
      noteKey: "personGraphRelexDemoReady",
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

  const selectedDetectionLabels = useMemo(
    () => GLINER_LABELS.filter((label) => activeLabels.has(label)),
    [activeLabels],
  );

  useEffect(() => {
    entityMenuRef.current = entityMenu;
  }, [entityMenu]);

  useEffect(() => {
    if (!batchMode || !currentFile) {
      return;
    }

    setJumpFileNumber(String(currentFileIndex + 1));
    setJumpFileName(currentFile.name);
  }, [batchMode, currentFile, currentFileIndex]);

  const categoryLabels = useMemo(
    () => buildGlinerCategoryLabels(customCategories),
    [customCategories],
  );
  const menuCategories = useMemo(
    () => buildGlinerMenuCategories(activeLabels, customCategories),
    [activeLabels, customCategories],
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
        nerBackend: "gliner",
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
      batchMode,
      surfaceOverrides,
      customCategories,
      categoryMethods,
      generalizationLadders,
      persons,
    ],
  );
  const labelStudioExport = useMemo(
    () =>
      createLabelStudioExport({
        text,
        entities: activeEntities,
        modelName: modelName || GLINER_MODEL_ID,
        nerBackend: "gliner",
        sourceFile: currentFile?.name || null,
        customCategories,
      }),
    [text, activeEntities, modelName, currentFile, customCategories],
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

    if (nextEntities.length && Array.isArray(savedState?.relations)) {
      applyRelexPersonGraph(nextText, nextEntities, savedState.relations, {
        resetExclusions: true,
      });
    } else if (nextEntities.length) {
      refreshPersonGraph(nextText, nextEntities, { resetExclusions: true });
    } else {
      clearPersonGraph();
    }
  }

  async function runGlinerDetection({
    sourceText = text,
    fileName = null,
    filePosition = null,
  } = {}) {
    const textToAnalyze = sourceText ?? text;
    if (!textToAnalyze.trim()) {
      return null;
    }

    if (!selectedDetectionLabels.length) {
      setStatus(t("glinerStatusNoLabels"));
      return null;
    }

    setError("");
    setIsDetecting(true);
    setStatus(t("glinerStatusRunning"));

    try {
      const { runGlinerRelexDetection } = await import("../lib/glinerRelexService.js");
      const { GLINER_RELEX_MODEL_ID } = await import("../lib/glinerRelexConstants.js");
      const result = await runGlinerRelexDetection({
        text: textToAnalyze,
        entityLabels: selectedDetectionLabels,
      });
      const normalized = finalizeGlinerEntities(
        textToAnalyze,
        result.entities || [],
        "gliner-relex",
      );
      const categorySelection = createCategorySelectionFromEntities(normalized);

      setEntities(normalized);
      setSelectedCategories(categorySelection);
      setExcludedEntityKeys({});
      setModelName(GLINER_RELEX_MODEL_ID);
      setIsDemoMode(false);
      setIsEditingSource(false);
      applyRelexPersonGraph(textToAnalyze, normalized, result.relations || [], {
        resetExclusions: true,
      });

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
        `${t("glinerStatusDone", { count: normalized.length })} · ReLex · ${uniqueCount} unique${fileNote}`,
      );

      return {
        entities: normalized,
        selectedCategories: categorySelection,
        modelName: GLINER_RELEX_MODEL_ID,
      };
    } catch (caughtError) {
      setError(caughtError.message);
      setStatus("GLiNER ReLex detection failed.");
      return null;
    } finally {
      setIsDetecting(false);
    }
  }

  async function detectEntities() {
    await runGlinerDetection({
      sourceText: text,
      fileName: batchMode ? currentFile?.name : null,
      filePosition:
        batchMode && currentFile ? `${currentFileIndex + 1} of ${batchFiles.length}` : null,
    });
  }

  async function processInitialBatchFolder(files) {
    setIsDetecting(true);
    setBatchJobProgress({
      phase: "detecting",
      current: 0,
      total: files.length,
      fileName: files[0]?.name || "",
    });

    try {
      for (let index = 0; index < files.length; index += 1) {
        const file = files[index];
        setBatchJobProgress({
          phase: "detecting",
          current: index,
          total: files.length,
          fileName: file.name,
        });
        setStatus(`Detecting entities: ${index + 1} of ${files.length} — ${file.name}`);

        const { runGlinerRelexDetection } = await import("../lib/glinerRelexService.js");
        const { GLINER_RELEX_MODEL_ID } = await import("../lib/glinerRelexConstants.js");
        const result = await runGlinerRelexDetection({
          text: file.text,
          entityLabels: selectedDetectionLabels,
        });
        const normalized = finalizeGlinerEntities(
          file.text,
          result.entities || [],
          "gliner-relex",
        );
        const categorySelection = createCategorySelectionFromEntities(normalized);

        fileStatesRef.current[file.id] = {
          text: file.text,
          entities: normalized,
          selectedCategories: categorySelection,
          excludedEntityKeys: {},
          modelName: GLINER_RELEX_MODEL_ID,
          customCategories: {},
          outputsModified: false,
          relations: result.relations || [],
        };

        setBatchJobProgress({
          phase: "detecting",
          current: index + 1,
          total: files.length,
          fileName: file.name,
        });
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

    if (autoRunNer && !savedState?.entities?.length) {
      await runGlinerDetection({
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
    setBatchMode(true);
    setBatchFolderLabel(sourceLabel);
    setBatchOutputLabel(outputLabel);
    setBatchFiles(files);
    setCurrentFileIndex(0);
    syncCustomCategories({});
    setEntityMenu(null);
    setReportOpen(false);

    applyFileState(files[0], null, { isBatchNavigation: true });
    setStatus(`Loaded ${files.length} text file(s). Running GLiNER on each file…`);
    setIsBatchLoading(false);

    await processInitialBatchFolder(files);

    applyFileState(files[0], fileStatesRef.current[files[0].id], {
      isBatchNavigation: true,
    });
    setStatus(
      `Loaded and processed ${files.length} file(s). Download outputs as a ZIP when review is complete (${outputLabel}).`,
    );
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

    setIsDownloadingZip(true);
    setStatus("Building ZIP archive…");

    try {
      await downloadBatchZip({
        files: batchFiles,
        fileStates: fileStatesRef.current,
        outputLabel: batchOutputLabel,
        buildFileOutputs: (params) =>
          buildGlinerBatchFileOutputs({ ...params, categoryMethods, generalizationLadders }),
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
    applyRelexPersonGraph(demo.text, demo.entities, demo.relations, {
      resetExclusions: true,
      fillProximity: true,
      noteKey: "personGraphRelexDemoReady",
    });
    setStatus(t("glinerStatusDemoRestored"));
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
    setStatus(t("glinerBatchModeClosed"));
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

    if (!enabled || !batchMode || !currentFile || isDetecting || entities.length) {
      return;
    }

    const savedState = fileStatesRef.current[currentFile.id];
    if (savedState?.entities?.length) {
      return;
    }

    void runGlinerDetection({
      sourceText: text,
      fileName: currentFile.name,
      filePosition: `${currentFileIndex + 1} of ${batchFiles.length}`,
    });
  }

  function toggleLabel(label) {
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

    const next = addEntitySpans(entities, spans, categoryId, text);

    setEntities(next);
    setSelectedCategories((current) => ({
      ...current,
      [categoryId]: current[categoryId] ?? true,
    }));
    refreshPersonGraph(text, next, { resetExclusions: false });
    closeEntityMenu();
    const count = spans.length;
    const scopeNote =
      count === 1 ? "" : scope === "all" ? ` (${count} occurrences)` : " (this selection only)";
    setStatus(
      `Added ${displayLabel || getCategoryLabel(categoryId, customCategories)} entity "${menu.text}"${scopeNote}.`,
    );
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
    refreshPersonGraph(text, next, { resetExclusions: false });
    closeEntityMenu();
    setStatus(`Removed entity "${entityMenu.entity.text}".`);
  }

  return (
    <section className="workflow-section gliner-section" aria-labelledby="gliner-section-title">
      <WorkflowSectionHeader
        id="gliner-section-title"
        eyebrow={t("glinerEyebrow")}
        title={t("glinerTitle")}
        steps={[t("glinerStep1"), t("glinerStep2"), t("glinerStep3")]}
        badge={t("glinerBadge")}
        badgeClassName="gliner-badge"
      />

      {isDetecting || jobProgress ? <GlinerJobProgress jobProgress={jobProgress} /> : null}

      <BatchJobProgress progress={batchJobProgress} />

      <section className="controls gliner-controls">
        <button onClick={detectEntities} disabled={!text.trim() || isDetecting}>
          {isDetecting ? t("glinerRunning") : t("glinerRun")}
        </button>
        {!batchMode && !isDemoMode ? (
          <button type="button" className="secondary" onClick={restoreSampleDemo}>
            {t("glinerResetSample")}
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

      <div className="panel gliner-labels-panel">
        <div className="panel-header">
          <h3>{t("glinerLabelsTitle")}</h3>
          <span>{t("glinerLabelsHint", { count: selectedDetectionLabels.length })}</span>
        </div>
        <div className="gliner-label-list">
          {GLINER_LABELS.map((label) => {
            const active = activeLabels.has(label);
            return (
              <button
                key={label}
                type="button"
                className={`gliner-label-chip${active ? " is-active" : ""}`}
                disabled={isDetecting}
                onClick={() => toggleLabel(label)}
              >
                {label}
              </button>
            );
          })}
        </div>
      </div>

      <section className="batch-panel panel">
        <div className="batch-panel-intro">
          <h2>{t("batchProcessing")}</h2>
        </div>

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
          <>
            <div className="batch-navigation">
              <div className="batch-navigation-main">
                <button
                  onClick={() => goToFile(currentFileIndex - 1)}
                  disabled={currentFileIndex === 0 || isBatchLoading || isDetecting}
                >
                  {t("previousFile")}
                </button>
                <div className="batch-file-indicator">
                  <strong>
                    {currentFileIndex + 1} / {batchFiles.length}
                  </strong>
                  <span>{currentFile?.name}</span>
                  <small>{batchFolderLabel}</small>
                  {batchOutputLabel ? <small>{batchOutputLabel}.zip</small> : null}
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
                  <label htmlFor="gliner-batch-jump-number">{t("goToFileNumber")}</label>
                  <div className="batch-jump-row">
                    <input
                      id="gliner-batch-jump-number"
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
                  <label htmlFor="gliner-batch-jump-name">{t("goToFileName")}</label>
                  <div className="batch-jump-row">
                    <input
                      id="gliner-batch-jump-name"
                      list="gliner-batch-file-list"
                      value={jumpFileName}
                      onChange={(event) => setJumpFileName(event.target.value)}
                      placeholder={t("fileNamePlaceholder")}
                      disabled={isBatchLoading || isDetecting}
                    />
                    <datalist id="gliner-batch-file-list">
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
          </>
        ) : null}

        <label className="batch-auto-ner">
          <input
            type="checkbox"
            checked={autoRunNer}
            onChange={(event) => toggleAutoRunNer(event.target.checked)}
            disabled={isDetecting}
          />
          <span>
            {t("autoRunNer")}
            <small>{t("glinerAutoRunHint", { model: "GLiNER ReLex" })}</small>
          </span>
        </label>
      </section>

      {error ? (
        <section className="error-card">
          <strong>{t("errorTitle")}</strong>
          <p>{error}</p>
          <p>{t("glinerErrorHint")}</p>
        </section>
      ) : null}

      <section className="workspace workspace-four-col gen-workspace">
        <div className="panel workspace-sidebar gen-sidebar">
          <div className="panel-header">
            <h2>{t("panel2Title")}</h2>
            <span>
              {isDemoMode
                ? `${t("glinerDemoModelLabel")} — ${t("glinerDemoPanelHint")}`
                : modelName
                  ? t("glinerModelLine", { model: modelName })
                  : t("glinerModelLine", { model: modelName || "GLiNER ReLex" })}
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
                  onClick={() => setIsEditingSource(true)}
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
              getHighlightClass={getGlinerLabelHighlightClass}
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
                    t(mode === "byPerson" ? "personGraphExportByPersonDone" : "personGraphExportDone"),
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
              <p className="gen-maps-empty">{t("generativeGraphEmpty")}</p>
            )}
            <p className="category-hint">{t("personGraphMoveHint")}</p>
            <p className="category-hint">{t("personGraphFocusHint")}</p>
            <p className="category-hint">{t("personGraphRelexLicenseHint")}</p>
          </div>
        </div>

        <div
          className={`workspace-preview-row${
            showAnonymizedPersonGraph ? "" : " is-anon-graph-hidden"
          }`}
        >
          <div className="panel workspace-preview">
            <div className="panel-header">
              <h2>{t("panel4Title")}</h2>
              <div className="panel-header-actions">
                {!showAnonymizedPersonGraph ? (
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
          </div>
          {showAnonymizedPersonGraph ? (
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
