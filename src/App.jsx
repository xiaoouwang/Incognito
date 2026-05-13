import { useMemo, useState } from "react";

const SAMPLE_TEXT = `Extrait d'entretien :

La docteure Marie Dupont a rencontré Jean Martin à Paris le 12 mars 2022.
Marie travaille avec l'Université de Lyon. Son email est marie.dupont@example.com.
La participante a aussi mentionné +33 6 12 34 56 78 et https://example.org/project.`;

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

export default function App() {
  const [text, setText] = useState(SAMPLE_TEXT);
  const [entities, setEntities] = useState([]);
  const [modelName, setModelName] = useState(null);
  const [selectedCategories, setSelectedCategories] = useState({});
  const [reportOpen, setReportOpen] = useState(false);
  const [isDetecting, setIsDetecting] = useState(false);
  const [status, setStatus] = useState("Paste text, then run spaCy NER.");
  const [error, setError] = useState("");

  const groupedEntities = useMemo(() => groupEntities(entities), [entities]);
  const highlightedSegments = useMemo(
    () => createHighlightSegments(text, entities),
    [text, entities],
  );
  const anonymizedText = useMemo(
    () => replaceSelectedCategories(text, groupedEntities, selectedCategories),
    [text, groupedEntities, selectedCategories],
  );
  const auditReport = useMemo(
    () =>
      createAuditReport({
        text,
        anonymizedText,
        groupedEntities,
        selectedCategories,
        modelName,
      }),
    [text, anonymizedText, groupedEntities, selectedCategories, modelName],
  );

  async function detectEntities() {
    setError("");
    setIsDetecting(true);
    setStatus("Running local spaCy detection. The first run can take 20-40 seconds while the model warms up...");

    try {
      if (!window.nerApi) {
        throw new Error("Electron preload API is unavailable. Start the app with npm run dev.");
      }

      const result = await window.nerApi.detectEntities(text);
      const normalized = normalizeEntities(result.entities || []);
      const categorySelection = Object.fromEntries(
        [...new Set(normalized.map((entity) => entity.label))].map((label) => [label, true]),
      );

      setEntities(normalized);
      setSelectedCategories(categorySelection);
      setModelName(result.model);
      setStatus(`Detected ${normalized.length} unique entities using ${result.model}.`);
    } catch (caughtError) {
      setError(caughtError.message);
      setStatus("Detection failed.");
    } finally {
      setIsDetecting(false);
    }
  }

  function toggleCategory(category) {
    setSelectedCategories((current) => ({
      ...current,
      [category]: !current[category],
    }));
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

  return (
    <main className="app">
      <header className="hero">
        <div>
          <p className="eyebrow">Electron + React + local spaCy</p>
          <h1>Qualitative Text Anonymizer</h1>
          <p>
            Paste interview excerpts, run local named entity recognition, review
            highlighted entities, then choose which entity categories should be
            replaced.
          </p>
        </div>
        <aside className="privacy-note">
          <strong>Local-first prototype</strong>
          <span>
            Text is sent only to the local Python spaCy process. The app does not
            call external AI APIs or telemetry services.
          </span>
        </aside>
      </header>

      <section className="controls">
        <button onClick={detectEntities} disabled={!text.trim() || isDetecting}>
          {isDetecting ? "Detecting..." : "Run spaCy NER"}
        </button>
        <button onClick={copyAnonymizedText} disabled={!entities.length}>
          Copy anonymized text
        </button>
        <button onClick={() => setReportOpen(true)} disabled={!entities.length}>
          Show audit report
        </button>
        <button
          className="secondary"
          onClick={() => {
            setText("");
            setEntities([]);
            setSelectedCategories({});
            setModelName(null);
            setReportOpen(false);
            setStatus("Session cleared.");
            setError("");
          }}
        >
          Clear
        </button>
        <span className="status">{status}</span>
      </section>

      {error && (
        <section className="error-card">
          <strong>spaCy setup needed</strong>
          <p>{error}</p>
          <p>
            Install Python dependencies with <code>pip install -r requirements.txt</code>,
            then install a model such as{" "}
            <code>python -m spacy download fr_core_news_sm</code>.
          </p>
        </section>
      )}

      <section className="workspace">
        <div className="panel">
          <div className="panel-header">
            <h2>1. Paste Text</h2>
            <span>{text.length} characters</span>
          </div>
          <textarea
            value={text}
            onChange={(event) => {
              setText(event.target.value);
              setEntities([]);
              setSelectedCategories({});
              setModelName(null);
            }}
            placeholder="Paste interview transcript or field notes here..."
          />
        </div>

        <div className="panel">
          <div className="panel-header">
            <h2>2. Replace Categories?</h2>
            <span>{modelName ? `Model: ${modelName}` : "No model run yet"}</span>
          </div>
          <CategoryReview
            groupedEntities={groupedEntities}
            selectedCategories={selectedCategories}
            onToggle={toggleCategory}
          />
        </div>
      </section>

      <section className="preview-grid">
        <div className="panel">
          <div className="panel-header">
            <h2>3. Highlighted Entities</h2>
            <span>{entities.length} detected, selected categories stay highlighted</span>
          </div>
          <HighlightedText
            segments={highlightedSegments}
            selectedCategories={selectedCategories}
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

function CategoryReview({ groupedEntities, selectedCategories, onToggle }) {
  const categories = Object.keys(groupedEntities);

  if (!categories.length) {
    return (
      <div className="empty-state">
        Run spaCy NER to see detected entity categories here.
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
              onChange={() => onToggle(category)}
            />
            <span>
              Replace {CATEGORY_LABELS[category] || category}
              <small>{groupedEntities[category].length} unique value(s)</small>
            </span>
          </label>
          <div className="entity-chips">
            {groupedEntities[category].map((entity) => (
              <span className={`chip chip-${category}`} key={entity.key}>
                {entity.text}
              </span>
            ))}
          </div>
        </article>
      ))}
    </div>
  );
}

function HighlightedText({ segments, selectedCategories }) {
  if (!segments.length) {
    return <div className="empty-state">Paste text and run detection to highlight entities.</div>;
  }

  return (
    <div className="highlighted-text">
      {segments.map((segment, index) =>
        segment.entity ? (
          <mark
            className={`highlight highlight-${segment.entity.label} ${
              selectedCategories[segment.entity.label] ? "selected" : "ignored"
            }`}
            title={`${CATEGORY_LABELS[segment.entity.label] || segment.entity.label}: ${
              selectedCategories[segment.entity.label] ? "will be replaced" : "kept unchanged"
            }`}
            key={`${segment.text}-${index}`}
          >
            {segment.text}
          </mark>
        ) : (
          <span key={`${segment.text}-${index}`}>{segment.text}</span>
        ),
      )}
    </div>
  );
}

function normalizeEntities(entities) {
  return entities
    .map((entity, index) => ({
      ...entity,
      key: `${entity.label}:${entity.text.toLocaleLowerCase()}:${index}`,
    }))
    .filter((entity) => entity.text && entity.start < entity.end);
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
      segments.push({ text: text.slice(cursor, entity.start) });
    }

    segments.push({
      text: text.slice(entity.start, entity.end),
      entity,
    });
    cursor = entity.end;
  }

  if (cursor < text.length) {
    segments.push({ text: text.slice(cursor) });
  }

  return segments;
}

function replaceSelectedCategories(text, groupedEntities, selectedCategories) {
  let output = text;

  Object.entries(groupedEntities).forEach(([category, entities]) => {
    if (!selectedCategories[category]) return;

    entities.forEach((entity, index) => {
      const replacement = `[${CATEGORY_PREFIXES[category] || "ENTITY"}_${index + 1}]`;
      output = output.split(entity.text).join(replacement);
    });
  });

  return output;
}

function createAuditReport({
  text,
  anonymizedText,
  groupedEntities,
  selectedCategories,
  modelName,
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
      const status = selectedCategories[category] ? "replaced" : "kept unchanged";

      return `- ${CATEGORY_LABELS[category] || category}: ${uniqueCount} unique value(s), ${occurrenceCount} occurrence(s), ${status}`;
    })
    .join("\n");
  const exactReplacements = selected
    .flatMap((category) =>
      groupedEntities[category].map((entity, index) => {
        const replacement = `[${CATEGORY_PREFIXES[category] || "ENTITY"}_${index + 1}]`;
        const occurrences = countOccurrences(text, entity.text);

        return `- ${CATEGORY_LABELS[category] || category}: "${entity.text}" -> ${replacement} (${occurrences} occurrence${occurrences === 1 ? "" : "s"}, source: ${entity.source || "unknown"})`;
      }),
    )
    .join("\n");

  return `# Anonymization Audit Report

Generated: ${new Date().toLocaleString()}
Tool: Qualitative Text Anonymizer prototype
NER engine: ${modelName || "Not run"}

## Document Summary
- Source characters: ${text.length}
- Anonymized characters: ${anonymizedText.length}
- Entity categories detected: ${categories.length}
- Categories selected for replacement: ${selected.length}
- Categories kept unchanged: ${kept.length}

## Category Decisions
${replacementSummary || "- No entities detected"}

## Exact Values Replaced
${exactReplacements || "- No values selected for replacement"}

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
