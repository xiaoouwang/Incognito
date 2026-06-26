import { useEffect, useMemo, useRef, useState } from "react";
import AuditReportWindow from "./AuditReportWindow.jsx";
import CategoryReview from "./CategoryReview.jsx";
import EntityEditMenu from "./EntityEditMenu.jsx";
import HighlightedText from "./HighlightedText.jsx";
import ModelProgress from "./ModelProgress.jsx";
import BatchJobProgress from "./BatchJobProgress.jsx";
import WorkflowSectionHeader from "./WorkflowSectionHeader.jsx";
import { useUiLocale } from "../context/UiLocaleContext.jsx";
import { useNerWorker } from "../hooks/useNerWorker.js";
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
import { NER_BACKENDS } from "../lib/constants.js";
import { buildSampleDemoState } from "../lib/sampleDemo.js";
import { backendDisplayLabel, CUSTOM_MODEL_EXAMPLE } from "../lib/modelRegistry.js";
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
  replaceSelectedCategories,
} from "../lib/entityUtils.js";

export default function CamembertWorkflowSection() {
  const { detectEntities: detectEntitiesInWorker, progressItems, modelReady } = useNerWorker();
  const { t } = useUiLocale();
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
  const [isDemoMode, setIsDemoMode] = useState(true);
  const [nerBackend, setNerBackend] = useState("camembert-dates");
  const [customModelId, setCustomModelId] = useState(CUSTOM_MODEL_EXAMPLE);
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
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [entityMenu, setEntityMenu] = useState(null);
  const [customCategories, setCustomCategories] = useState({});
  const [isEditingSource, setIsEditingSource] = useState(false);

  const showSourceHighlight = entities.length > 0 && !isEditingSource;

  useSyncedScroll(sourceScrollRef, previewScrollRef, showSourceHighlight);

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
  const highlightedSegments = useMemo(
    () => createHighlightSegments(text, entities),
    [text, entities],
  );
  const anonymizedText = useMemo(
    () =>
      replaceSelectedCategories(
        text,
        entities,
        groupedEntities,
        selectedCategories,
        excludedEntityKeys,
        customCategories,
      ),
    [text, entities, groupedEntities, selectedCategories, excludedEntityKeys, customCategories],
  );
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
        nerBackend: batchMode ? nerBackend : null,
        batchMode,
        customCategories,
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
      nerBackend,
      batchMode,
      customCategories,
    ],
  );
  const labelStudioExport = useMemo(
    () =>
      createLabelStudioExport({
        text,
        entities: activeEntities,
        modelName,
        nerBackend,
        sourceFile: currentFile?.name || null,
        customCategories,
      }),
    [text, activeEntities, modelName, nerBackend, currentFile, customCategories],
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
    };
  }

  function applyFileState(file, savedState, options = {}) {
    const { isBatchNavigation = batchMode } = options;
    const nextEntities = savedState?.entities ?? [];
    setText(savedState?.text ?? file.text);
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
  }

  async function runNerDetection({
    sourceText = text,
    backend = nerBackend,
    fileName = null,
    filePosition = null,
  } = {}) {
    const textToAnalyze = sourceText ?? text;
    if (!textToAnalyze.trim()) {
      return null;
    }

    setError("");
    setIsDetecting(true);
    setStatus(
      `Running ${backendDisplayLabel(backend, customModelId)}. The first run downloads ONNX weights into your browser cache…`,
    );

    try {
      const result = await detectEntitiesInWorker(textToAnalyze, backend, customModelId);
      const normalized = finalizeDetectedEntities(textToAnalyze, result.entities || []);
      const categorySelection = createCategorySelectionFromEntities(normalized);

      setEntities(normalized);
      setSelectedCategories(categorySelection);
      setExcludedEntityKeys({});
      setModelName(result.model);
      setIsDemoMode(false);
      setIsEditingSource(false);

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
        `Detected ${normalized.length} entities (${uniqueCount} unique value${uniqueCount === 1 ? "" : "s"}) using ${result.model} (${backend})${fileNote}.`,
      );

      return {
        entities: normalized,
        selectedCategories: categorySelection,
        modelName: result.model,
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

  async function processInitialBatchFolder(files, backend) {
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

        const result = await detectEntitiesInWorker(file.text, backend, customModelId);
        const normalized = finalizeDetectedEntities(file.text, result.entities || []);
        const categorySelection = createCategorySelectionFromEntities(normalized);

        fileStatesRef.current[file.id] = {
          text: file.text,
          entities: normalized,
          selectedCategories: categorySelection,
          excludedEntityKeys: {},
          modelName: result.model,
          customCategories: {},
          outputsModified: false,
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
    setBatchMode(true);
    setBatchFolderLabel(sourceLabel);
    setBatchOutputLabel(outputLabel);
    setBatchFiles(files);
    setCurrentFileIndex(0);
    syncCustomCategories({});
    setEntityMenu(null);
    setReportOpen(false);

    applyFileState(files[0], null, { isBatchNavigation: true });
    setStatus(`Loaded ${files.length} text file(s). Running NER on each file…`);
    setIsBatchLoading(false);

    await processInitialBatchFolder(files, nerBackend);

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
        nerBackend,
        outputLabel: batchOutputLabel,
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
    const demo = buildSampleDemoState();
    setText(demo.text);
    setEntities(demo.entities);
    setSelectedCategories(demo.selectedCategories);
    setExcludedEntityKeys(demo.excludedEntityKeys);
    setModelName(demo.modelName);
    setCustomCategories({});
    setEntityMenu(null);
    setReportOpen(false);
    setError("");
    setIsDemoMode(true);
    setIsEditingSource(false);
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
    setSelectedCategories({});
    setExcludedEntityKeys({});
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
    setExcludedEntityKeys((current) => {
      const next = { ...current };
      if (next[key]) {
        delete next[key];
      } else {
        next[key] = true;
      }
      return next;
    });
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
    closeEntityMenu();
    setStatus(`Removed entity "${entityMenu.entity.text}".`);
  }

  return (
    <section className="workflow-section camembert-section" aria-labelledby="camembert-section-title">
      <WorkflowSectionHeader
        id="camembert-section-title"
        eyebrow={t("camembertEyebrow")}
        title={t("camembertTitle")}
        steps={[t("camembertStep1"), t("camembertStep2"), t("camembertStep3")]}
        badge={t("camembertBadge")}
      />

      <ModelProgress progressItems={progressItems} modelReady={modelReady} />

      <BatchJobProgress progress={batchJobProgress} />

      <section className="controls">
        <label className="backend-select">
          {t("nerModel")}
          <select
            value={nerBackend}
            onChange={(event) => {
              const nextBackend = event.target.value;
              setNerBackend(nextBackend);
              if (!isDemoMode) {
                setEntities([]);
                setSelectedCategories({});
                setExcludedEntityKeys({});
                setModelName(null);
              }
              setStatus(
                isDemoMode
                  ? `Model set to ${backendDisplayLabel(nextBackend, customModelId)}. Run Anonymization when you are ready.`
                  : `Model set to ${backendDisplayLabel(nextBackend, customModelId)}. Run detection again.`,
              );
            }}
            disabled={isDetecting}
          >
            <option value="camembert-dates">{NER_BACKENDS["camembert-dates"]}</option>
            <option value="camembert">{NER_BACKENDS.camembert}</option>
            <option value="bert-en">{NER_BACKENDS["bert-en"]}</option>
            <option value="custom">{NER_BACKENDS.custom}</option>
          </select>
        </label>
        {nerBackend === "custom" ? (
          <label className="backend-select custom-model-field">
            {t("modelId")}
            <input
              type="text"
              value={customModelId}
              onChange={(event) => {
                setCustomModelId(event.target.value);
                if (!isDemoMode) {
                  setEntities([]);
                  setSelectedCategories({});
                  setExcludedEntityKeys({});
                  setModelName(null);
                }
              }}
              placeholder={`e.g. ${CUSTOM_MODEL_EXAMPLE}`}
              spellCheck={false}
              disabled={isDetecting}
            />
          </label>
        ) : null}
        <button onClick={detectEntities} disabled={!text.trim() || isDetecting}>
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
        <span className="status">{status}</span>
      </section>

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
            <small>
              {t("autoRunNerHint", { model: backendDisplayLabel(nerBackend, customModelId) })}
            </small>
          </span>
        </label>
      </section>

      {error ? (
        <section className="error-card">
          <strong>{t("errorTitle")}</strong>
          <p>{error}</p>
          <p>{t("errorHint")}</p>
        </section>
      ) : null}

      <section className="workspace workspace-three-col">
        <div className="panel workspace-sidebar">
          <div className="panel-header">
            <h2>{t("panel2Title")}</h2>
            <span>
              {isDemoMode
                ? `${t("demoModelLabel")} — ${t("demoPanelHint")}`
                : modelName
                  ? t("modelLine", {
                      model: modelName,
                      backend: backendDisplayLabel(nerBackend, customModelId),
                    })
                  : t("backendLine", {
                      backend: backendDisplayLabel(nerBackend, customModelId),
                    })}
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
              ) : null}
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

        <div className="panel workspace-preview">
          <div className="panel-header">
            <h2>{t("panel4Title")}</h2>
            <span>{t("panel4Subtitle")}</span>
          </div>
          <pre className="text-preview" ref={previewScrollRef}>
            {anonymizedText || t("panel4Empty")}
          </pre>
        </div>
      </section>

      {entityMenu ? (
        <EntityEditMenu
          menu={entityMenu}
          sourceText={text}
          menuCategories={menuCategories}
          categoryLabels={categoryLabels}
          onScopeChange={setEntityMenuScope}
          onAdd={handleAddEntity}
          onAddCustom={handleAddCustomCategory}
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
