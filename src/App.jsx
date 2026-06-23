import { useEffect, useMemo, useRef, useState } from "react";
import {
  createLabelStudioExport,
  LABEL_STUDIO_NER_CONFIG,
} from "./labelStudioExport.js";

const SAMPLE_TEXT = `Extrait d'entretien :

La docteure Marie Dupont a rencontré Jean Martin à Paris le 12 mars 2022.
Marie travaille avec l'Université de Lyon. Son email est marie.dupont@example.com.
La participante a aussi mentionné +33 6 12 34 56 78 et https://example.org/project.

Marie vient d'effectuer un stage de 3 mois à Paris, Hôpital Saint-Louis.`;

const CATEGORY_LABELS = {
  person: "People",
  location: "Locations",
  organization: "Organizations",
  date: "Dates",
  email: "Emails",
  phone: "Phone numbers",
  url: "URLs",
  misc: "Other entities",
};

const CATEGORY_PREFIXES = {
  person: "PERSON",
  location: "LOCATION",
  organization: "ORG",
  date: "DATE",
  email: "EMAIL",
  phone: "PHONE",
  url: "URL",
  misc: "ENTITY",
};

const NER_BACKENDS = {
  "spacy-sm": "spaCy French small (fr_core_news_sm)",
  "spacy-lg": "spaCy French large (fr_core_news_lg)",
  camembert: "CamemBERT NER (Jean-Baptiste/camembert-ner)",
};


export default function App() {
  const [text, setText] = useState(SAMPLE_TEXT);
  const [entities, setEntities] = useState([]);
  const [modelName, setModelName] = useState(null);
  const [nerBackend, setNerBackend] = useState("spacy-lg");
  const [selectedCategories, setSelectedCategories] = useState({});
  const [excludedEntityKeys, setExcludedEntityKeys] = useState({});
  const [reportOpen, setReportOpen] = useState(false);
  const [isDetecting, setIsDetecting] = useState(false);
  const [isBatchLoading, setIsBatchLoading] = useState(false);
  const [batchMode, setBatchMode] = useState(false);
  const [batchFolder, setBatchFolder] = useState(null);
  const [batchFiles, setBatchFiles] = useState([]);
  const [currentFileIndex, setCurrentFileIndex] = useState(0);
  const [autoRunNer, setAutoRunNer] = useState(true);
  const [status, setStatus] = useState("Paste text, choose a NER backend, then run detection.");
  const [error, setError] = useState("");
  const [entityMenu, setEntityMenu] = useState(null);

  const fileStatesRef = useRef({});
  const writeTimeoutRef = useRef(null);
  const currentFile = batchFiles[currentFileIndex] || null;

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
      ),
    [text, entities, groupedEntities, selectedCategories, excludedEntityKeys],
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
        anonymizedText,
        groupedEntities,
        selectedCategories,
        excludedEntityKeys,
        modelName,
        sourceFile: currentFile?.name || null,
        nerBackend: batchMode ? nerBackend : null,
        batchMode,
      }),
    [
      text,
      anonymizedText,
      groupedEntities,
      selectedCategories,
      excludedEntityKeys,
      modelName,
      currentFile,
      nerBackend,
      batchMode,
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
      }),
    [text, activeEntities, modelName, nerBackend, currentFile],
  );
  const labelStudioJson = useMemo(
    () => JSON.stringify(labelStudioExport, null, 2),
    [labelStudioExport],
  );

  useEffect(() => {
    if (!batchMode || !currentFile || !window.nerApi?.writeBatchOutputs) {
      return undefined;
    }

    if (writeTimeoutRef.current) {
      clearTimeout(writeTimeoutRef.current);
    }

    writeTimeoutRef.current = setTimeout(async () => {
      try {
        await window.nerApi.writeBatchOutputs({
          sourcePath: currentFile.path,
          anonymizedText,
          auditReport,
          labelStudioJson,
          labelStudioConfig: LABEL_STUDIO_NER_CONFIG,
        });
      } catch (caughtError) {
        setError(caughtError.message);
      }
    }, 400);

    return () => {
      if (writeTimeoutRef.current) {
        clearTimeout(writeTimeoutRef.current);
      }
    };
  }, [batchMode, currentFile, anonymizedText, auditReport, labelStudioJson]);

  async function writeCurrentBatchOutputs() {
    if (!batchMode || !currentFile || !window.nerApi?.writeBatchOutputs) {
      return;
    }

    await window.nerApi.writeBatchOutputs({
      sourcePath: currentFile.path,
      anonymizedText,
      auditReport,
      labelStudioJson,
      labelStudioConfig: LABEL_STUDIO_NER_CONFIG,
    });
  }

  function persistCurrentFileState() {
    if (!batchMode || !currentFile) {
      return;
    }

    fileStatesRef.current[currentFile.path] = {
      text,
      entities,
      selectedCategories,
      excludedEntityKeys,
      modelName,
    };
  }

  function applyFileState(file, savedState) {
    setText(savedState?.text ?? file.text);
    setEntities(savedState?.entities ?? []);
    setSelectedCategories(savedState?.selectedCategories ?? {});
    setExcludedEntityKeys(savedState?.excludedEntityKeys ?? {});
    setModelName(savedState?.modelName ?? null);
    setEntityMenu(null);
    setReportOpen(false);
    setError("");
  }

  async function goToFile(index) {
    if (!batchMode || index < 0 || index >= batchFiles.length || index === currentFileIndex) {
      return;
    }

    persistCurrentFileState();

    try {
      await writeCurrentBatchOutputs();
    } catch (caughtError) {
      setError(caughtError.message);
    }

    const file = batchFiles[index];
    const savedState = fileStatesRef.current[file.path];
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

  async function loadBatchFolder() {
    setError("");

    if (!window.nerApi?.loadTextFolder) {
      setError("Batch folder loading is only available in the Electron app.");
      return;
    }

    setIsBatchLoading(true);
    setStatus("Choose a folder with text files...");

    try {
      const result = await window.nerApi.loadTextFolder();

      if (result.canceled) {
        setStatus(
          batchMode
            ? `Batch mode: ${batchFiles.length} file(s) loaded.`
            : "Batch folder loading canceled.",
        );
        return;
      }

      fileStatesRef.current = {};
      setBatchMode(true);
      setBatchFolder(result.folderPath);
      setBatchFiles(result.files);
      setCurrentFileIndex(0);
      applyFileState(result.files[0], null);
      setStatus(
        `Loaded ${result.files.length} file(s) from ${result.folderPath}. Outputs update live in the same folder.`,
      );

      if (autoRunNer) {
        await runNerDetection({
          sourceText: result.files[0].text,
          fileName: result.files[0].name,
          filePosition: `1 of ${result.files.length}`,
        });
      }
    } catch (caughtError) {
      setError(caughtError.message);
      setStatus("Batch folder loading failed.");
    } finally {
      setIsBatchLoading(false);
    }
  }

  async function exitBatchMode() {
    if (batchMode && currentFile) {
      persistCurrentFileState();

      try {
        await writeCurrentBatchOutputs();
      } catch (caughtError) {
        setError(caughtError.message);
      }
    }

    fileStatesRef.current = {};
    setBatchMode(false);
    setBatchFolder(null);
    setBatchFiles([]);
    setCurrentFileIndex(0);
    setText(SAMPLE_TEXT);
    setEntities([]);
    setSelectedCategories({});
    setExcludedEntityKeys({});
    setModelName(null);
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
      `Running ${NER_BACKENDS[backend]}. The first run can take 20-60 seconds while the model warms up...`,
    );

    try {
      if (!window.nerApi) {
        throw new Error("Electron preload API is unavailable. Start the app with npm run dev.");
      }

      const result = await window.nerApi.detectEntities(textToAnalyze, backend);
      const normalized = normalizeEntities(result.entities || [], textToAnalyze);
      const categorySelection = Object.fromEntries(
        [...new Set(normalized.map((entity) => entity.label))].map((label) => [label, true]),
      );

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

  function toggleAutoRunNer(enabled) {
    setAutoRunNer(enabled);

    if (!enabled || !batchMode || !currentFile || isDetecting || entities.length) {
      return;
    }

    const savedState = fileStatesRef.current[currentFile.path];
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

  async function downloadLabelStudioExport() {
    const exportData = createLabelStudioExport({
      text,
      entities: activeEntities,
      modelName,
      nerBackend,
    });
    const stamp = new Date().toISOString().slice(0, 10);
    const jsonContent = JSON.stringify(exportData, null, 2);
    const defaultBaseName = `label-studio-ner-${stamp}`;

    try {
      if (!window.nerApi?.exportLabelStudio) {
        throw new Error("Export API unavailable.");
      }

      const result = await window.nerApi.exportLabelStudio({
        jsonContent,
        configContent: LABEL_STUDIO_NER_CONFIG,
        defaultBaseName,
      });

      if (result.canceled) {
        setStatus("Label Studio export canceled.");
        return;
      }

      setStatus(
        `Exported ${entities.length} pre-annotations and config to ${result.jsonPath} and ${result.configPath}.`,
      );
    } catch {
      downloadFile(jsonContent, `${defaultBaseName}.json`, "application/json;charset=utf-8");
      setStatus(
        `Exported ${entities.length} annotations. Restart the app to also save the labeling config file.`,
      );
    }
  }

  async function batchAnonymizeFromLabelStudio() {
    setError("");

    if (!window.nerApi?.batchAnonymizeLabelStudio) {
      setError("Batch anonymization is only available in the Electron app.");
      return;
    }

    setIsBatchLoading(true);
    setStatus("Choose the folder with Label Studio JSON exports...");

    try {
      const result = await window.nerApi.batchAnonymizeLabelStudio();

      if (result.canceled) {
        setStatus("Batch anonymization canceled.");
        return;
      }

      const errorCount = result.errors?.length || 0;
      const errorNote =
        errorCount > 0 ? ` ${errorCount} file(s) failed; see batch-summary.json.` : "";

      setStatus(
        `Processed ${result.tasks_processed} task(s) from ${result.json_files} JSON file(s) into ${result.output_dir}.${errorNote}`,
      );
    } catch (caughtError) {
      setError(caughtError.message);
      setStatus("Batch anonymization failed.");
    } finally {
      setIsBatchLoading(false);
    }
  }

  function closeEntityMenu() {
    setEntityMenu(null);
  }

  function handleAddEntity(label) {
    if (!entityMenu || entityMenu.mode !== "add") return;

    const next = addEntitySpan(entities, {
      start: entityMenu.start,
      end: entityMenu.end,
      text: entityMenu.text,
      label,
    }, text);

    setEntities(next);
    setSelectedCategories((current) => ({
      ...current,
      [label]: current[label] ?? true,
    }));
    closeEntityMenu();
    setStatus(`Added ${CATEGORY_LABELS[label] || label} entity "${entityMenu.text}".`);
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
          <h1>Text Data Anonymizer</h1>
          <p>
            🔒 Anonymize your textual data with complete confidentiality<br />
            🕵️‍♂️ Detect named entities<br />
            👀 Review the identified occurrences<br />
            📑 Generate an anonymized audit report
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
        </div>
        <aside className="privacy-note">
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <span role="img" aria-label="lock" style={{ fontSize: "2em" }}>🔒</span>
            <div>
              <strong style={{ fontSize: "1.1em" }}>Your Data Stays Private</strong>
              <br />
              <span style={{
                color: "#308350",
                fontWeight: 500,
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
              }}>
                <svg width="20" height="20" style={{ verticalAlign: "middle" }} viewBox="0 0 20 20" fill="none">
                  <circle cx="10" cy="10" r="9" stroke="#308350" strokeWidth="2" fill="#E8F7F0" />
                  <path d="M6 10.5l2.5 2.5 5-5" stroke="#308350" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                Local-first: zero data leaves your device.
              </span>
              <div style={{ fontSize: "0.95em", marginTop: 2 }}>
                Your text is <strong>only</strong> sent to your local Python NER process.<br />
                <span style={{ color: "#555" }}>Never shared, never sent to external servers or AI APIs.</span>
              </div>
            </div>
          </div>
        </aside>

      </header>

      <section className="controls">
        <label className="backend-select">
          Default model
          <select
            value={nerBackend}
            onChange={(event) => {
              setNerBackend(event.target.value);
              setEntities([]);
              setSelectedCategories({});
              setExcludedEntityKeys({});
              setModelName(null);
              setStatus(
                `Default model set to ${NER_BACKENDS[event.target.value]}. Run detection again.`,
              );
            }}
            disabled={isDetecting}
          >
            <option value="spacy-sm">{NER_BACKENDS["spacy-sm"]}</option>
            <option value="spacy-lg">{NER_BACKENDS["spacy-lg"]}</option>
            <option value="camembert">{NER_BACKENDS.camembert}</option>
          </select>
        </label>
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
        <button
          className="secondary"
          onClick={batchAnonymizeFromLabelStudio}
          disabled={isDetecting || isBatchLoading}
        >
          {isBatchLoading ? "Processing..." : "Batch from Label Studio"}
        </button>
        {batchMode && (
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
        )}
        <button
          className="secondary"
          onClick={clearSession}
          disabled={isBatchLoading}
        >
          {batchMode ? "Close folder" : "Clear"}
        </button>
        <span className="status">{status}</span>
      </section>

      <section className="batch-panel panel">
        <div className="panel-header">
          <div>
            <h2>Batch text folder</h2>
            <p className="batch-description">
              Load a folder of <code>.txt</code> or <code>.text</code> files, review each
              document in the editor, then navigate with previous/next. Anonymized text and
              audit reports are written live beside each source file.
            </p>
          </div>
          <button onClick={loadBatchFolder} disabled={isDetecting || isBatchLoading}>
            {isBatchLoading ? "Loading folder..." : batchMode ? "Load another folder" : "Load text folder"}
          </button>
        </div>

        {batchMode ? (
          <div className="batch-navigation">
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
              <small>{batchFolder}</small>
            </div>
            <button
              onClick={() => goToFile(currentFileIndex + 1)}
              disabled={currentFileIndex >= batchFiles.length - 1 || isBatchLoading || isDetecting}
            >
              Next file
            </button>
          </div>
        ) : null}

        <label className="batch-auto-ner">
          <input
            type="checkbox"
            checked={autoRunNer}
            onChange={(event) => toggleAutoRunNer(event.target.checked)}
            disabled={isDetecting}
          />
          <span>
            Auto-run default model on each file
            <small>Uses {NER_BACKENDS[nerBackend]} for new files only.</small>
          </span>
        </label>

        <p className="batch-output-note">
          Live outputs per file: <code>*-anonymized.txt</code>, <code>*-report.md</code>, and{" "}
          <code>*-label-studio.json</code> in the same folder, plus shared{" "}
          <code>label-studio-ner-config.xml</code>. Run NER and adjust entity categories for each
          document before moving on.
        </p>
      </section>

      {error && (
        <section className="error-card">
          <strong>NER setup needed</strong>
          <p>{error}</p>
          <p>
            Install Python dependencies with <code>pip install -r requirements.txt</code>.
            For spaCy, install French models with{" "}
            <code>python -m spacy download fr_core_news_sm</code> and{" "}
            <code>python -m spacy download fr_core_news_lg</code>.
            For CamemBERT, also run{" "}
            <code>pip install -r requirements-camembert.txt</code> (Python 3.12
            required). The model downloads automatically on first use via Hugging
            Face.
          </p>
        </section>
      )}

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
                ? `Model: ${modelName} (${nerBackend}) · click entities to toggle`
                : `Backend: ${NER_BACKENDS[nerBackend]}`}
            </span>
          </div>
          <CategoryReview
            text={text}
            groupedEntities={groupedEntities}
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
              {entities.length} spans · select text to add · click highlight to remove
            </span>
          </div>
          <HighlightedText
            text={text}
            segments={highlightedSegments}
            selectedCategories={selectedCategories}
            excludedEntityKeys={excludedEntityKeys}
            onAddSelection={(selection) =>
              setEntityMenu({
                mode: "add",
                ...selection,
              })
            }
            onEntityClick={(entity, position) =>
              setEntityMenu({
                mode: "remove",
                entity,
                ...position,
              })
            }
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

      {entityMenu && (
        <EntityEditMenu
          menu={entityMenu}
          onAdd={handleAddEntity}
          onRemove={handleRemoveEntity}
          onClose={closeEntityMenu}
        />
      )}

      {reportOpen && (
        <AuditReportWindow
          report={auditReport}
          onClose={() => setReportOpen(false)}
          onCopy={copyAuditReport}
          onDownload={downloadAuditReport}
        />
      )}
    </main>
  );
}

function AuditReportWindow({ report, onClose, onCopy, onDownload }) {
  return (
    <div className="report-backdrop" role="presentation">
      <section className="report-window" role="dialog" aria-modal="true" aria-label="Audit report">
        <div className="report-header">
          <div>
            <p className="eyebrow">Research documentation</p>
            <h2>Audit Report</h2>
          </div>
          <div className="report-actions">
            <button onClick={onCopy}>Copy report</button>
            <button onClick={onDownload}>Download .md</button>
            <button className="secondary" onClick={onClose}>
              Close
            </button>
          </div>
        </div>
        <pre className="report-body">{report}</pre>
      </section>
    </div>
  );
}

function CategoryReview({
  text,
  groupedEntities,
  selectedCategories,
  excludedEntityKeys,
  onToggleCategory,
  onToggleEntity,
}) {
  const categories = Object.keys(groupedEntities);

  if (!categories.length) {
    return (
      <div className="empty-state">
        Run NER to see detected entity categories here.
      </div>
    );
  }

  return (
    <div className="category-list">
      {categories.map((category) => (
        <article className="category-card" key={category}>
          <label className="category-toggle">
            <input
              type="checkbox"
              checked={Boolean(selectedCategories[category])}
              onChange={() => onToggleCategory(category)}
            />
            <span>
              Replace {CATEGORY_LABELS[category] || category}
              <small>{groupedEntities[category].length} unique value(s)</small>
            </span>
          </label>
          <div className="entity-chips">
            {groupedEntities[category].map((entity) => {
              const occurrenceCount = countOccurrences(text, entity.text);
              const isActive =
                Boolean(selectedCategories[category]) &&
                !excludedEntityKeys[getEntityValueKey(category, entity.text)];

              return (
                <button
                  type="button"
                  className={`chip chip-${category} ${isActive ? "chip-active" : "chip-inactive"}`}
                  key={entity.key}
                  onClick={() => onToggleEntity(category, entity.text)}
                  title={
                    isActive
                      ? "Click to keep this value unchanged in the output"
                      : "Click to include this value in anonymization again"
                  }
                >
                  <span className="chip-label">{entity.text}</span>
                  <span className="chip-count">{occurrenceCount}</span>
                </button>
              );
            })}
          </div>
        </article>
      ))}
      <p className="category-hint">Click an entity to toggle all of its occurrences in the output.</p>
    </div>
  );
}

function EntityEditMenu({ menu, onAdd, onRemove, onClose }) {
  useEffect(() => {
    function handleKeyDown(event) {
      if (event.key === "Escape") onClose();
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  return (
    <div className="entity-menu-backdrop" onClick={onClose} role="presentation">
      <section
        className="entity-menu"
        style={{ top: menu.y, left: menu.x }}
        role="dialog"
        aria-label={menu.mode === "add" ? "Add entity" : "Remove entity"}
        onClick={(event) => event.stopPropagation()}
      >
        {menu.mode === "add" ? (
          <>
            <p className="entity-menu-title">Add entity</p>
            <p className="entity-menu-selection">"{menu.text}"</p>
            <div className="entity-menu-actions">
              {Object.entries(CATEGORY_LABELS).map(([category, label]) => (
                <button
                  key={category}
                  className={`entity-menu-chip chip-${category}`}
                  type="button"
                  onClick={() => onAdd(category)}
                >
                  {label}
                </button>
              ))}
            </div>
          </>
        ) : (
          <>
            <p className="entity-menu-title">
              {CATEGORY_LABELS[menu.entity.label] || menu.entity.label}
            </p>
            <p className="entity-menu-selection">"{menu.entity.text}"</p>
            <p className="entity-menu-hint">Remove this detected span from the review.</p>
            <button className="entity-menu-danger" type="button" onClick={onRemove}>
              Remove entity
            </button>
          </>
        )}
        <button className="secondary entity-menu-cancel" type="button" onClick={onClose}>
          Cancel
        </button>
      </section>
    </div>
  );
}

function HighlightedText({
  text,
  segments,
  selectedCategories,
  excludedEntityKeys,
  onAddSelection,
  onEntityClick,
}) {
  const containerRef = useRef(null);

  if (!text) {
    return <div className="empty-state">Paste text and run detection to highlight entities.</div>;
  }

  const displaySegments =
    segments.length > 0 ? segments : [{ text, start: 0, end: text.length }];

  function handleMouseUp(event) {
    if (event.target.closest(".highlight")) return;

    const container = containerRef.current;
    const selection = getSelectionOffsets(container, text);
    if (!selection || !selection.text.trim()) return;

    onAddSelection({
      ...selection,
      x: event.clientX,
      y: event.clientY,
    });
    window.getSelection()?.removeAllRanges();
  }

  return (
    <div
      className="highlighted-text interactive-highlight"
      ref={containerRef}
      onMouseUp={handleMouseUp}
    >
      {displaySegments.map((segment, index) =>
        segment.entity ? (
          <mark
            className={`highlight highlight-${segment.entity.label} ${isEntityActive(segment.entity, selectedCategories, excludedEntityKeys)
              ? "selected"
              : "ignored"
              }`}
            data-start={segment.start}
            data-end={segment.end}
            title={`${CATEGORY_LABELS[segment.entity.label] || segment.entity.label}: click to remove`}
            key={`${segment.entity.id || segment.start}-${index}`}
            onClick={(event) => {
              event.stopPropagation();
              onEntityClick(segment.entity, { x: event.clientX, y: event.clientY });
            }}
          >
            {segment.text}
          </mark>
        ) : (
          <span data-start={segment.start} data-end={segment.end} key={`plain-${segment.start}-${index}`}>
            {segment.text}
          </span>
        ),
      )}
    </div>
  );
}

function splitEntitiesAtNewlines(sourceText, entities) {
  const expanded = [];

  for (const entity of entities) {
    const start = entity.start;
    const end = entity.end;
    if (!sourceText || start >= end || end > sourceText.length) {
      expanded.push(entity);
      continue;
    }

    let chunkStart = start;
    let split = false;

    for (let index = start; index < end; index += 1) {
      if (sourceText[index] !== "\n") {
        continue;
      }

      split = true;
      const piece = sourceText.slice(chunkStart, index);
      if (piece.trim()) {
        expanded.push({
          ...entity,
          start: chunkStart,
          end: index,
          text: piece,
        });
      }
      chunkStart = index + 1;
    }

    if (!split) {
      expanded.push(entity);
      continue;
    }

    if (chunkStart < end) {
      const piece = sourceText.slice(chunkStart, end);
      if (piece.trim()) {
        expanded.push({
          ...entity,
          start: chunkStart,
          end,
          text: piece,
        });
      }
    }
  }

  return expanded;
}

function normalizeEntities(entities, sourceText) {
  const split = sourceText ? splitEntitiesAtNewlines(sourceText, entities) : entities;

  return split
    .map((entity, index) => ({
      ...entity,
      id: entity.id || `ent-${entity.start}-${entity.end}-${index}`,
      key: `${entity.label}:${entity.text.toLocaleLowerCase()}:${entity.start}:${index}`,
    }))
    .filter((entity) => entity.text && entity.start < entity.end)
    .sort((a, b) => a.start - b.start || a.end - b.end);
}

function addEntitySpan(entities, { start, end, text, label }, sourceText) {
  const withoutOverlap = entities.filter(
    (entity) => entity.end <= start || entity.start >= end,
  );
  return normalizeEntities([
    ...withoutOverlap,
    {
      id: `manual-${start}-${end}-${Date.now()}`,
      start,
      end,
      text,
      label,
      source: "manual",
    },
  ], sourceText);
}

function removeEntityById(entities, entityId) {
  return entities.filter((entity) => entity.id !== entityId);
}

function getSelectionOffsets(container, text) {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0 || selection.isCollapsed || !container) {
    return null;
  }

  const range = selection.getRangeAt(0);
  if (!container.contains(range.commonAncestorContainer)) {
    return null;
  }

  const start = getOffsetWithinContainer(container, range.startContainer, range.startOffset);
  const end = getOffsetWithinContainer(container, range.endContainer, range.endOffset);
  if (start === null || end === null || start >= end) {
    return null;
  }

  return {
    start,
    end,
    text: text.slice(start, end),
  };
}

function getOffsetWithinContainer(container, node, offset) {
  const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
  let position = 0;

  while (walker.nextNode()) {
    const current = walker.currentNode;
    if (current === node) {
      return position + offset;
    }
    position += current.textContent.length;
  }

  return null;
}

function getEntityValueKey(category, entityText) {
  return `${category}:${entityText.toLocaleLowerCase()}`;
}

function isEntityActive(entity, selectedCategories, excludedEntityKeys) {
  if (!selectedCategories[entity.label]) {
    return false;
  }

  return !excludedEntityKeys[getEntityValueKey(entity.label, entity.text)];
}

function groupEntities(entities) {
  return entities.reduce((groups, entity) => {
    const category = entity.label || "misc";
    const existing = groups[category] || [];

    if (existing.some((item) => item.text.toLocaleLowerCase() === entity.text.toLocaleLowerCase())) {
      return groups;
    }

    return {
      ...groups,
      [category]: [...existing, entity],
    };
  }, {});
}

function createHighlightSegments(text, entities) {
  if (!text) return [];

  const orderedEntities = [...entities].sort(
    (a, b) => a.start - b.start || b.end - b.start - (a.end - a.start),
  );
  const segments = [];
  let cursor = 0;

  for (const entity of orderedEntities) {
    if (entity.start < cursor) continue;

    if (entity.start > cursor) {
      segments.push({
        text: text.slice(cursor, entity.start),
        start: cursor,
        end: entity.start,
      });
    }

    segments.push({
      text: text.slice(entity.start, entity.end),
      start: entity.start,
      end: entity.end,
      entity,
    });
    cursor = entity.end;
  }

  if (cursor < text.length) {
    segments.push({
      text: text.slice(cursor),
      start: cursor,
      end: text.length,
    });
  }

  return segments;
}

function replaceSelectedCategories(
  text,
  entities,
  groupedEntities,
  selectedCategories,
  excludedEntityKeys,
) {
  const replacementMap = new Map();

  Object.entries(groupedEntities).forEach(([category, categoryEntities]) => {
    if (!selectedCategories[category]) return;

    categoryEntities.forEach((entity, index) => {
      replacementMap.set(
        getEntityValueKey(category, entity.text),
        `[${CATEGORY_PREFIXES[category] || "ENTITY"}_${index + 1}]`,
      );
    });
  });

  let output = text;
  const applicable = entities
    .filter((entity) => isEntityActive(entity, selectedCategories, excludedEntityKeys))
    .sort((a, b) => b.start - a.start || b.end - a.end);

  for (const entity of applicable) {
    const placeholder = replacementMap.get(getEntityValueKey(entity.label, entity.text));
    if (!placeholder) continue;
    if (entity.start < 0 || entity.end > output.length || entity.start >= entity.end) continue;
    output = output.slice(0, entity.start) + placeholder + output.slice(entity.end);
  }

  return output;
}

function createAuditReport({
  text,
  anonymizedText,
  groupedEntities,
  selectedCategories,
  excludedEntityKeys,
  modelName,
  sourceFile = null,
  nerBackend = null,
  batchMode = false,
}) {
  const categories = Object.keys(groupedEntities);
  const selected = categories.filter((category) => selectedCategories[category]);
  const kept = categories.filter((category) => !selectedCategories[category]);
  const replacementSummary = categories
    .map((category) => {
      const uniqueCount = groupedEntities[category].length;
      const occurrenceCount = groupedEntities[category].reduce(
        (total, entity) => total + countOccurrences(text, entity.text),
        0,
      );
      const activeCount = groupedEntities[category].filter((entity) =>
        isEntityActive(entity, selectedCategories, excludedEntityKeys),
      ).length;
      const status = !selectedCategories[category]
        ? "kept unchanged"
        : activeCount === uniqueCount
          ? "replaced"
          : `${activeCount} of ${uniqueCount} value(s) replaced`;

      return `- ${CATEGORY_LABELS[category] || category}: ${uniqueCount} unique value(s), ${occurrenceCount} occurrence(s), ${status}`;
    })
    .join("\n");
  const valueDecisions = selected
    .flatMap((category) =>
      groupedEntities[category].map((entity, index) => {
        const replacement = `[${CATEGORY_PREFIXES[category] || "ENTITY"}_${index + 1}]`;
        const occurrences = countOccurrences(text, entity.text);
        const active = isEntityActive(entity, selectedCategories, excludedEntityKeys);

        if (active) {
          return `- ${CATEGORY_LABELS[category] || category}: "${entity.text}" -> ${replacement} (${occurrences} occurrence${occurrences === 1 ? "" : "s"}, source: ${entity.source || "unknown"})`;
        }

        return `- ${CATEGORY_LABELS[category] || category}: "${entity.text}" kept unchanged (${occurrences} occurrence${occurrences === 1 ? "" : "s"}, toggled off)`;
      }),
    )
    .join("\n");

  return `# Anonymization Audit Report

Generated: ${new Date().toLocaleString()}
Tool: Text Data Anonymizer${batchMode ? " batch review" : " prototype"}
NER engine: ${modelName || "Not run"}${nerBackend ? ` (${nerBackend})` : ""}
${sourceFile ? `Source file: ${sourceFile}` : ""}

## Document Summary
- Source characters: ${text.length}
- Anonymized characters: ${anonymizedText.length}
- Entity categories detected: ${categories.length}
- Categories selected for replacement: ${selected.length}
- Categories kept unchanged: ${kept.length}

## Category Decisions
${replacementSummary || "- No entities detected"}

## Exact Values Replaced
${valueDecisions || "- No values selected for replacement"}

## Replacement Method
Selected entity categories were replaced with stable category placeholders, for example [PERSON_1], [LOCATION_1], [DATE_1], and [EMAIL_1]. Replacements are applied consistently for each unique detected value within the current text.

## Categories Replaced
${selected.map((category) => `- ${CATEGORY_LABELS[category] || category}`).join("\n") || "- None"}

## Categories Kept Unchanged
${kept.map((category) => `- ${CATEGORY_LABELS[category] || category}`).join("\n") || "- None"}

## Privacy Note
This report includes raw detected values selected for replacement so the anonymization process can be audited. Treat the report as sensitive research data and store or share it with the same care as the source document.

## Research Caveat
This tool is an anonymization assistant. Researchers should manually review the anonymized text for indirect identifiers, rare contextual details, and model detection errors before sharing or archiving data.
`;
}

function countOccurrences(text, value) {
  if (!value) return 0;

  let count = 0;
  let cursor = 0;

  while (cursor < text.length) {
    const index = text.indexOf(value, cursor);
    if (index === -1) break;

    count += 1;
    cursor = index + value.length;
  }

  return count;
}

function downloadFile(content, fileName, type) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(url);
}
