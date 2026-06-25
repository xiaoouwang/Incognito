import { useEffect, useMemo, useRef, useState } from "react";
import AuditReportWindow from "./components/AuditReportWindow.jsx";
import CategoryReview from "./components/CategoryReview.jsx";
import EntityEditMenu from "./components/EntityEditMenu.jsx";
import HighlightedText from "./components/HighlightedText.jsx";
import ModelProgress from "./components/ModelProgress.jsx";
import BatchJobProgress from "./components/BatchJobProgress.jsx";
import InstallAppBanner from "./components/InstallAppBanner.jsx";
import { useNerWorker } from "./hooks/useNerWorker.js";
import { createLabelStudioExport } from "./labelStudioExport.js";
import { createAuditReport } from "./lib/auditReport.js";
import { downloadBatchZip, downloadLabelStudioBundle } from "./lib/batchZip.js";
import {
  BATCH_EMPTY_MESSAGE,
  batchSourceLabel,
  readDocumentsFromDirectoryPicker,
  readDocumentsFromFilePicker,
  readDocumentsFromFolderInput,
} from "./lib/batchLoad.js";
import { NER_BACKENDS, SAMPLE_TEXT } from "./lib/constants.js";
import { backendDisplayLabel, CUSTOM_MODEL_EXAMPLE } from "./lib/modelRegistry.js";
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
  normalizeEntities,
  removeEntityById,
  replaceSelectedCategories,
} from "./lib/entityUtils.js";

export default function App() {
  const { detectEntities: detectEntitiesInWorker, progressItems, modelReady } = useNerWorker();
  const folderInputRef = useRef(null);
  const filesInputRef = useRef(null);
  const fileStatesRef = useRef({});
  const batchCustomCategoriesRef = useRef({});
  const entityMenuRef = useRef(null);

  const [text, setText] = useState(SAMPLE_TEXT);
  const [entities, setEntities] = useState([]);
  const [modelName, setModelName] = useState(null);
  const [nerBackend, setNerBackend] = useState("camembert-dates");
  const [customModelId, setCustomModelId] = useState(CUSTOM_MODEL_EXAMPLE);
  const [selectedCategories, setSelectedCategories] = useState({});
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
  const [status, setStatus] = useState(
    "Paste or load your text, choose a model, then run detection. Everything stays on your computer.",
  );
  const [error, setError] = useState("");
  const [entityMenu, setEntityMenu] = useState(null);
  const [customCategories, setCustomCategories] = useState({});

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
      const normalized = normalizeEntities(result.entities || [], textToAnalyze);
      const categorySelection = createCategorySelectionFromEntities(normalized);

      setEntities(normalized);
      setSelectedCategories(categorySelection);
      setExcludedEntityKeys({});
      setModelName(result.model);

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
          current: index + 1,
          total: files.length,
          fileName: file.name,
        });
        setStatus(`Detecting entities: ${index + 1} of ${files.length} — ${file.name}`);

        const result = await detectEntitiesInWorker(file.text, backend, customModelId);
        const normalized = normalizeEntities(result.entities || [], file.text);
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
    setText(SAMPLE_TEXT);
    setEntities([]);
    setSelectedCategories({});
    setExcludedEntityKeys({});
    setModelName(null);
    setCustomCategories({});
    setEntityMenu(null);
    setReportOpen(false);
    setStatus("Batch mode closed. Restored the sample text.");
    setError("");
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
    setReportOpen(false);
    setStatus("Session cleared.");
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

    const next = removeEntityById(entities, entityMenu.entity.id);
    setEntities(next);
    closeEntityMenu();
    setStatus(`Removed entity "${entityMenu.entity.text}".`);
  }

  return (
    <main className="app">
      <header className="hero">
        <div>
          <div className="hero-brand">
            <img className="hero-logo" src="./logo.png" alt="" width={72} height={72} />
            <div className="hero-brand-text">
              <h1>Incognito</h1>
              <p className="hero-tagline">Privacy-first text anonymization in your browser</p>
              <p className="privacy-promise">
                Everything runs locally — your data never leaves your computer.
              </p>
            </div>
          </div>

          <p>
            🕵️‍♂️ Detect named entities in your text<br />
            👀 Review the identified occurrences<br />
            📄 Generate an anonymized audit report
          </p>
          <p className="credits">
            👨‍💻 Developed by{" "}
            <a href="https://xiaoouwang.github.io/" target="_blank" rel="noreferrer">
              Xiaoou Wang
            </a>
            {" · "}Digital Humanities Engineer{" · "}
            <a href="https://mshs.univ-cotedazur.fr/" target="_blank" rel="noreferrer">
              MSHS Sud-Est
            </a>
            {" · "}
            <a href="https://univ-cotedazur.fr/" target="_blank" rel="noreferrer">
              Université Côte d&apos;Azur
            </a>
          </p>
          <p className="credits">
            🖥️ Need spaCy, offline installers? See the{" "}
            <a
              href="https://github.com/xiaoouwang/Incognito"
              target="_blank"
              rel="noreferrer"
            >
              Incognito desktop app
            </a>
            {" · "}
            <a
              href="https://github.com/xiaoouwang/Incognito/releases"
              target="_blank"
              rel="noreferrer"
            >
              download releases
            </a>
          </p>
        </div>
        <aside className="privacy-note">
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <span role="img" aria-label="lock" style={{ fontSize: "2em" }}>
              🔒
            </span>
            <div>
              <strong style={{ fontSize: "1.1em" }}>
                Everything runs locally — your data never leaves your computer.
              </strong>
              <div style={{ fontSize: "0.95em", marginTop: 6 }}>
                Your text is analyzed inside the browser, not on a remote server. The only
                internet connection is a one-time download of the detection model — your
                documents are never uploaded.
              </div>
            </div>
          </div>
        </aside>
      </header>

      <InstallAppBanner />

      <ModelProgress progressItems={progressItems} modelReady={modelReady} />

      <BatchJobProgress progress={batchJobProgress} />

      <section className="controls">
        <label className="backend-select">
          NER model
          <select
            value={nerBackend}
            onChange={(event) => {
              const nextBackend = event.target.value;
              setNerBackend(nextBackend);
              setEntities([]);
              setSelectedCategories({});
              setExcludedEntityKeys({});
              setModelName(null);
              setStatus(
                `Model set to ${backendDisplayLabel(nextBackend, customModelId)}. Run detection again.`,
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
            Model id
            <input
              type="text"
              value={customModelId}
              onChange={(event) => {
                setCustomModelId(event.target.value);
                setEntities([]);
                setSelectedCategories({});
                setExcludedEntityKeys({});
                setModelName(null);
              }}
              placeholder={`e.g. ${CUSTOM_MODEL_EXAMPLE}`}
              spellCheck={false}
              disabled={isDetecting}
            />
          </label>
        ) : null}
        <button onClick={detectEntities} disabled={!text.trim() || isDetecting}>
          {isDetecting ? "Detecting..." : "Run NER"}
        </button>
        <button onClick={copyAnonymizedText} disabled={!entities.length}>
          Copy anonymized text
        </button>
        <button onClick={() => setReportOpen(true)} disabled={!entities.length}>
          Show audit report
        </button>
        <button
          className="secondary"
          onClick={downloadLabelStudioExport}
          disabled={!entities.length || isBatchLoading}
        >
          Export to Label Studio
        </button>
        {batchMode ? (
          <button
            className="secondary"
            onClick={downloadAllBatchOutputs}
            disabled={isDownloadingZip || isDetecting}
          >
            {isDownloadingZip ? "Building ZIP..." : "Download batch ZIP"}
          </button>
        ) : null}
        {batchMode ? (
          <>
            <button
              className="secondary"
              onClick={() => goToFile(currentFileIndex - 1)}
              disabled={currentFileIndex === 0 || isBatchLoading || isDetecting}
            >
              Previous file
            </button>
            <button
              className="secondary"
              onClick={() => goToFile(currentFileIndex + 1)}
              disabled={currentFileIndex >= batchFiles.length - 1 || isBatchLoading || isDetecting}
            >
              Next file
            </button>
          </>
        ) : null}
        <button className="secondary" onClick={clearSession} disabled={isBatchLoading}>
          {batchMode ? "Close batch" : "Clear"}
        </button>
        <span className="status">{status}</span>
      </section>

      <section className="batch-panel panel">
        <div className="batch-panel-intro">
          <h2>Batch processing</h2>
          <p className="batch-description">
            Anonymize several qualitative documents in one session. Load a whole folder or pick
            specific <code>.txt</code> / <code>.docx</code> files, run named-entity detection,
            review and correct each text interactively, then download a ZIP with anonymized versions,
            audit reports, and Label Studio exports.
          </p>
        </div>

        <div className="batch-load-actions">
          <button onClick={openBatchFolderPicker} disabled={isDetecting || isBatchLoading}>
            {isBatchLoading ? "Loading…" : "Choose folder"}
          </button>
          <button
            className="secondary"
            onClick={openBatchFilePicker}
            disabled={isDetecting || isBatchLoading}
          >
            Choose files…
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
                  Previous file
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
                  Next file
                </button>
              </div>

              <div className="batch-jump-controls">
                <form className="batch-jump-field" onSubmit={handleJumpToFileNumber}>
                  <label htmlFor="batch-jump-number">Go to file #</label>
                  <div className="batch-jump-row">
                    <input
                      id="batch-jump-number"
                      type="number"
                      min={1}
                      max={batchFiles.length}
                      value={jumpFileNumber}
                      onChange={(event) => setJumpFileNumber(event.target.value)}
                      disabled={isBatchLoading || isDetecting}
                    />
                    <button type="submit" disabled={isBatchLoading || isDetecting}>
                      Go
                    </button>
                  </div>
                </form>

                <form className="batch-jump-field" onSubmit={handleJumpToFileName}>
                  <label htmlFor="batch-jump-name">Go to file name</label>
                  <div className="batch-jump-row">
                    <input
                      id="batch-jump-name"
                      list="batch-file-list"
                      value={jumpFileName}
                      onChange={(event) => setJumpFileName(event.target.value)}
                      placeholder="File name"
                      disabled={isBatchLoading || isDetecting}
                    />
                    <datalist id="batch-file-list">
                      {batchFiles.map((file, index) => (
                        <option key={file.id} value={file.name}>
                          {index + 1}. {file.name}
                        </option>
                      ))}
                    </datalist>
                    <button type="submit" disabled={isBatchLoading || isDetecting}>
                      Go
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
            Auto-run default model when opening an unprocessed file
            <small>Uses {backendDisplayLabel(nerBackend, customModelId)} for files without saved detections.</small>
          </span>
        </label>

        <p className="batch-output-note">
          ZIP contents per file: <code>*-anonymized.txt</code>, <code>*-report.md</code>, and{" "}
          <code>*-label-studio.json</code>, plus shared <code>label-studio-ner-config.xml</code>.
          Files you leave during navigation are marked with a <code>_modified</code> suffix in the
          archive.
        </p>
      </section>

      {error ? (
        <section className="error-card">
          <strong>Something went wrong</strong>
          <p>{error}</p>
          <p>
            Ensure you have a network connection for the first model download. ONNX weights are
            cached in the browser afterward. NERmembert large uses full-precision weights (larger
            download). If detection keeps failing, try reloading the page or switching to a CamemBERT
            model.
          </p>
        </section>
      ) : null}

      <section className="workspace">
        <div className="panel">
          <div className="panel-header">
            <h2>{batchMode ? "1. Source Text" : "1. Paste Text"}</h2>
            <span>
              {batchMode && currentFile ? `${currentFile.name} · ` : ""}
              {text.length} characters
            </span>
          </div>
          <textarea
            value={text}
            onChange={(event) => {
              setText(event.target.value);
              setEntities([]);
              setSelectedCategories({});
              setExcludedEntityKeys({});
              setModelName(null);
              setEntityMenu(null);
            }}
            placeholder="Paste interview transcript or field notes here..."
          />
        </div>

        <div className="panel">
          <div className="panel-header">
            <h2>2. Replace Categories?</h2>
            <span>
              {modelName
                ? `Model: ${modelName} (${backendDisplayLabel(nerBackend, customModelId)}) · click entities to toggle`
                : `Backend: ${backendDisplayLabel(nerBackend, customModelId)}`}
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
      </section>

      <section className="preview-grid">
        <div className="panel">
          <div className="panel-header">
            <h2>3. Highlighted Entities</h2>
            <span>
              {entities.length} spans · select text to add (all word matches by default) · click
              highlight to remove
            </span>
          </div>
          <HighlightedText
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
        </div>

        <div className="panel">
          <div className="panel-header">
            <h2>4. Anonymized Preview</h2>
            <span>Selected categories only</span>
          </div>
          <pre className="text-preview">{anonymizedText || "Run detection to preview replacements."}</pre>
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
    </main>
  );
}
