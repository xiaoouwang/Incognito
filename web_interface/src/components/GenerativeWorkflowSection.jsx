import { useEffect, useMemo, useRef, useState } from "react";
import WorkflowSectionHeader from "./WorkflowSectionHeader.jsx";
import GenerativeRelationView from "./GenerativeRelationView.jsx";
import GenerativeEditMenu from "./GenerativeEditMenu.jsx";
import PersonGraphCard from "./PersonGraphCard.jsx";
import PersonGraphExportButton from "./PersonGraphExportButton.jsx";
import CategoryReview from "./CategoryReview.jsx";
import { useUiLocale } from "../context/UiLocaleContext.jsx";
import { useSyncedScroll } from "../hooks/useSyncedScroll.js";
import {
  listAlbertChatModels,
  resolveInitialAlbertApiKey,
  runAlbertGenerativeAnonymization,
  storeAlbertApiKey,
} from "../lib/albertClient.js";
import {
  addSurfaceAsCategory,
  addSurfaceAsNewPerson,
  addSurfaceToExistingPerson,
  buildGenerativeCategoryView,
  rebuildGenerativeOutputs,
  relateSurfaceToPerson,
  surfaceExcludeKey,
  toggleEntityExclusionSynced,
  togglePlaceholderExclusionSynced,
  toggleSurfaceExclusionSynced,
} from "../lib/albertEdit.js";
import {
  ALBERT_DEFAULT_MODEL,
  ALBERT_DEFAULT_MODELS,
  ALBERT_DOCS_URL,
  ALBERT_MAX_INPUT_CHARS,
  ALBERT_SAMPLE_TEXT,
} from "../lib/albertConstants.js";
import {
  buildCategoryLabels,
  buildMenuCategories,
  createCustomCategoryId,
} from "../lib/entityUtils.js";
import "./generativeWorkflow.css";

export default function GenerativeWorkflowSection() {
  const { t } = useUiLocale();
  const sourceScrollRef = useRef(null);
  const previewScrollRef = useRef(null);
  const [apiKey, setApiKey] = useState(() => resolveInitialAlbertApiKey());
  const [model, setModel] = useState(ALBERT_DEFAULT_MODEL);
  const [models, setModels] = useState(ALBERT_DEFAULT_MODELS);
  const [text, setText] = useState(ALBERT_SAMPLE_TEXT);
  const [extraInstructions, setExtraInstructions] = useState("");
  const [anonymizedText, setAnonymizedText] = useState("");
  const [replacements, setReplacements] = useState([]);
  const [persons, setPersons] = useState([]);
  const [groups, setGroups] = useState([]);
  const [excludedPlaceholders, setExcludedPlaceholders] = useState({});
  const [excludedSurfaces, setExcludedSurfaces] = useState({});
  const [selectedCategories, setSelectedCategories] = useState({});
  const [excludedEntityKeys, setExcludedEntityKeys] = useState({});
  const [customCategories, setCustomCategories] = useState({});
  const [usedModel, setUsedModel] = useState(null);
  const [isRunning, setIsRunning] = useState(false);
  const [isLoadingModels, setIsLoadingModels] = useState(false);
  const [isEditingSource, setIsEditingSource] = useState(true);
  const [editMenu, setEditMenu] = useState(null);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");

  const charCount = text.length;
  const canRun = Boolean(apiKey.trim() && text.trim() && !isRunning);
  const showRelationView = persons.length > 0 && !isEditingSource;

  useSyncedScroll(
    sourceScrollRef,
    previewScrollRef,
    anonymizedText ? (showRelationView ? "relation" : "source") : false,
  );

  useEffect(() => {
    storeAlbertApiKey(apiKey.trim());
  }, [apiKey]);

  useEffect(() => {
    if (!apiKey.trim()) {
      setModels(ALBERT_DEFAULT_MODELS);
      return undefined;
    }

    let cancelled = false;
    setIsLoadingModels(true);

    listAlbertChatModels(apiKey.trim())
      .then((ids) => {
        if (cancelled) return;
        setModels(ids);
        if (!ids.includes(model)) {
          setModel(ids[0] || ALBERT_DEFAULT_MODEL);
        }
      })
      .catch(() => {
        if (cancelled) return;
        setModels(ALBERT_DEFAULT_MODELS);
      })
      .finally(() => {
        if (!cancelled) {
          setIsLoadingModels(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [apiKey]);

  const categoryLabels = useMemo(
    () => buildCategoryLabels(customCategories),
    [customCategories],
  );
  const menuCategories = useMemo(
    () => buildMenuCategories(customCategories),
    [customCategories],
  );
  const categoryView = useMemo(
    () => buildGenerativeCategoryView(groups, text, customCategories),
    [groups, text, customCategories],
  );

  useEffect(() => {
    const categories = Object.keys(categoryView.groupedEntities);
    if (!categories.length) {
      return;
    }
    setSelectedCategories((current) => {
      let changed = false;
      const next = { ...current };
      for (const category of categories) {
        if (next[category] === undefined) {
          next[category] = true;
          changed = true;
        }
      }
      return changed ? next : current;
    });
  }, [categoryView.groupedEntities]);

  function applyGraphState(
    nextPersons,
    nextGroups,
    nextExcludedPlaceholders = excludedPlaceholders,
    nextExcludedSurfaces = excludedSurfaces,
    nextSelectedCategories = selectedCategories,
    nextExcludedEntityKeys = excludedEntityKeys,
  ) {
    setPersons(nextPersons);
    setGroups(nextGroups);
    setExcludedPlaceholders(nextExcludedPlaceholders);
    setExcludedSurfaces(nextExcludedSurfaces);
    setSelectedCategories(nextSelectedCategories);
    setExcludedEntityKeys(nextExcludedEntityKeys);
    const outputs = rebuildGenerativeOutputs(
      text,
      nextGroups,
      nextExcludedPlaceholders,
      nextExcludedSurfaces,
      nextSelectedCategories,
      nextExcludedEntityKeys,
      customCategories,
    );
    setAnonymizedText(outputs.anonymizedText);
    setReplacements(outputs.replacements);
  }

  async function runGenerativeAnonymization() {
    if (!canRun) {
      return;
    }

    setIsRunning(true);
    setError("");
    setStatus(t("generativeStatusRunning"));
    setEditMenu(null);

    try {
      const result = await runAlbertGenerativeAnonymization({
        apiKey: apiKey.trim(),
        model,
        text,
        extraInstructions,
      });
      setPersons(result.persons || []);
      setGroups(result.groups || []);
      setExcludedPlaceholders({});
      setExcludedSurfaces({});
      const view = buildGenerativeCategoryView(result.groups || [], text, customCategories);
      setSelectedCategories(view.selectedCategories);
      setExcludedEntityKeys({});
      setUsedModel(result.model);
      setIsEditingSource(false);
      const outputs = rebuildGenerativeOutputs(
        text,
        result.groups || [],
        {},
        {},
        view.selectedCategories,
        {},
        customCategories,
      );
      setAnonymizedText(outputs.anonymizedText);
      setReplacements(outputs.replacements);
      setStatus(
        t("generativeStatusDone", {
          count: result.persons?.length || result.replacements.length,
          model: result.model,
        }),
      );
    } catch (caughtError) {
      const message = caughtError instanceof Error ? caughtError.message : String(caughtError);
      setError(message);
      setStatus(t("generativeStatusFailed"));
    } finally {
      setIsRunning(false);
    }
  }

  function resetSample() {
    setText(ALBERT_SAMPLE_TEXT);
    setAnonymizedText("");
    setReplacements([]);
    setPersons([]);
    setGroups([]);
    setExcludedPlaceholders({});
    setExcludedSurfaces({});
    setSelectedCategories({});
    setExcludedEntityKeys({});
    setCustomCategories({});
    setUsedModel(null);
    setIsEditingSource(true);
    setEditMenu(null);
    setError("");
    setStatus(t("generativeStatusSampleRestored"));
  }

  function clearAll() {
    setText("");
    setAnonymizedText("");
    setReplacements([]);
    setPersons([]);
    setGroups([]);
    setExcludedPlaceholders({});
    setExcludedSurfaces({});
    setSelectedCategories({});
    setExcludedEntityKeys({});
    setCustomCategories({});
    setUsedModel(null);
    setExtraInstructions("");
    setIsEditingSource(true);
    setEditMenu(null);
    setError("");
    setStatus("");
  }

  function copyAnonymized() {
    if (!anonymizedText) return;
    navigator.clipboard.writeText(anonymizedText);
    setStatus(t("generativeStatusCopied"));
  }

  function beginEditSource() {
    setIsEditingSource(true);
    setEditMenu(null);
  }

  function onSourceChange(event) {
    const next = event.target.value;
    setText(next);
    if (persons.length || anonymizedText || replacements.length) {
      setPersons([]);
      setGroups([]);
      setExcludedPlaceholders({});
      setExcludedSurfaces({});
      setSelectedCategories({});
      setExcludedEntityKeys({});
      setCustomCategories({});
      setAnonymizedText("");
      setReplacements([]);
      setUsedModel(null);
      setEditMenu(null);
    }
  }

  function handleAddSelection(selection) {
    setEditMenu({
      mode: "add",
      text: selection.text,
      start: selection.start,
      end: selection.end,
      x: selection.x,
      y: selection.y,
    });
  }

  function handleEntityClick(entity, position) {
    setEditMenu({
      mode: "remove",
      text: entity.text,
      start: entity.start,
      end: entity.end,
      placeholder: entity.placeholder,
      personIndex: entity.personIndex,
      excluded: entity.excluded,
      x: position.x,
      y: position.y,
    });
  }

  function handleAddToPerson(personIndex) {
    if (!editMenu || editMenu.mode !== "add") {
      return;
    }
    const result = addSurfaceToExistingPerson(persons, groups, personIndex, editMenu.text);
    const nextSurfaces = { ...excludedSurfaces };
    delete nextSurfaces[surfaceExcludeKey(result.persons[personIndex]?.placeholder, editMenu.text)];
    applyGraphState(result.persons, result.groups, excludedPlaceholders, nextSurfaces);
    setStatus(t("generativeStatusAddedAlias", { text: editMenu.text }));
    setEditMenu(null);
  }

  function handleAddAsNewPerson() {
    if (!editMenu || editMenu.mode !== "add") {
      return;
    }
    const result = addSurfaceAsNewPerson(persons, groups, editMenu.text);
    applyGraphState(result.persons, result.groups);
    setStatus(t("generativeStatusAddedPerson", { text: editMenu.text }));
    setEditMenu(null);
  }

  function handleAddCategory(categoryId) {
    if (!editMenu || editMenu.mode !== "add") {
      return;
    }
    const result = addSurfaceAsCategory(persons, groups, editMenu.text, categoryId);
    const nextSelected = {
      ...selectedCategories,
      [categoryId]: true,
    };
    applyGraphState(
      result.persons,
      result.groups,
      excludedPlaceholders,
      excludedSurfaces,
      nextSelected,
      excludedEntityKeys,
    );
    setStatus(t("generativeStatusAddedAlias", { text: editMenu.text }));
    setEditMenu(null);
  }

  function handleAddCustomCategory(displayName) {
    if (!editMenu || editMenu.mode !== "add") {
      return;
    }
    const trimmed = String(displayName || "").trim();
    if (!trimmed) {
      return;
    }
    const categoryId = createCustomCategoryId(trimmed, customCategories);
    setCustomCategories((current) => ({ ...current, [categoryId]: trimmed }));
    const result = addSurfaceAsCategory(persons, groups, editMenu.text, categoryId);
    const nextSelected = {
      ...selectedCategories,
      [categoryId]: true,
    };
    applyGraphState(
      result.persons,
      result.groups,
      excludedPlaceholders,
      excludedSurfaces,
      nextSelected,
      excludedEntityKeys,
    );
    setStatus(t("generativeStatusAddedAlias", { text: editMenu.text }));
    setEditMenu(null);
  }

  function handleToggleSurface(placeholder, surface) {
    const synced = toggleSurfaceExclusionSynced(
      groups,
      excludedSurfaces,
      excludedEntityKeys,
      placeholder,
      surface,
      customCategories,
    );
    applyGraphState(
      persons,
      groups,
      excludedPlaceholders,
      synced.excludedSurfaces,
      selectedCategories,
      synced.excludedEntityKeys,
    );
    setStatus(
      synced.excluded
        ? t("generativeStatusExcluded", { text: surface })
        : t("generativeStatusRestored", { text: surface }),
    );
    setEditMenu(null);
  }

  function handleRemoveFromMenu() {
    if (!editMenu || editMenu.mode !== "remove") {
      return;
    }
    handleToggleSurface(editMenu.placeholder || "", editMenu.text);
  }

  function handleRelateToPerson(personIndex) {
    if (!editMenu || editMenu.mode !== "remove") {
      return;
    }
    const targetPlaceholder = persons[personIndex]?.placeholder;
    const asAlias = editMenu.kind === "person" || editMenu.kind === "alias";
    const result = relateSurfaceToPerson(persons, groups, editMenu.text, personIndex, {
      asAlias,
      attrLabel: editMenu.label || "",
      fromPlaceholder: editMenu.placeholder || "",
    });
    applyGraphState(result.persons, result.groups, excludedPlaceholders, excludedSurfaces);
    const targetName =
      result.persons.find((person) => person.placeholder === targetPlaceholder)?.name ||
      persons[personIndex]?.name ||
      "";
    setStatus(
      t(asAlias ? "entityMenuAliasStatus" : "entityMenuRelatedStatus", {
        text: editMenu.text,
        person: targetName,
      }),
    );
    setEditMenu(null);
  }

  function handleTogglePlaceholder(placeholder) {
    const synced = togglePlaceholderExclusionSynced(
      groups,
      excludedPlaceholders,
      excludedSurfaces,
      excludedEntityKeys,
      placeholder,
      customCategories,
    );
    applyGraphState(
      persons,
      groups,
      synced.excludedPlaceholders,
      synced.excludedSurfaces,
      selectedCategories,
      synced.excludedEntityKeys,
    );
    const group = groups.find((item) => item.placeholder === placeholder);
    const label = group?.original || group?.aliases?.[0] || placeholder;
    setStatus(
      synced.excluded
        ? t("generativeStatusExcluded", { text: label })
        : t("generativeStatusRestored", { text: label }),
    );
  }

  function handleToggleCategory(category) {
    const nextSelected = {
      ...selectedCategories,
      [category]: !selectedCategories[category],
    };
    applyGraphState(
      persons,
      groups,
      excludedPlaceholders,
      excludedSurfaces,
      nextSelected,
      excludedEntityKeys,
    );
  }

  function handleToggleEntityValue(category, entityText) {
    const synced = toggleEntityExclusionSynced(
      groups,
      excludedSurfaces,
      excludedEntityKeys,
      category,
      entityText,
      customCategories,
    );
    applyGraphState(
      persons,
      groups,
      excludedPlaceholders,
      synced.excludedSurfaces,
      selectedCategories,
      synced.excludedEntityKeys,
    );
  }

  return (
    <section className="gen-workflow" aria-labelledby="generative-section-title">
      <WorkflowSectionHeader
        id="generative-section-title"
        eyebrow={t("generativeEyebrow")}
        title={t("generativeTitle")}
        steps={[t("generativeStep1"), t("generativeStep2"), t("generativeStep3")]}
        badge={t("generativeBadge")}
        badgeClassName="gen-workflow-badge"
      />

      <aside className="gen-privacy" role="note">
        <strong>{t("generativePrivacyTitle")}</strong>
        <p>{t("generativePrivacyBody")}</p>
        <p>
          <a href={ALBERT_DOCS_URL} target="_blank" rel="noreferrer">
            {t("generativeDocsLink")}
          </a>
        </p>
      </aside>

      <section className="gen-toolbar">
        <label className="gen-field gen-field-key">
          <span>{t("generativeApiKey")}</span>
          <input
            type="password"
            autoComplete="off"
            spellCheck={false}
            value={apiKey}
            placeholder={t("generativeApiKeyPlaceholder")}
            onChange={(event) => setApiKey(event.target.value)}
          />
        </label>
        <label className="gen-field">
          <span>{t("generativeModel")}</span>
          <select
            value={model}
            disabled={isRunning || isLoadingModels}
            onChange={(event) => setModel(event.target.value)}
          >
            {models.map((id) => (
              <option key={id} value={id}>
                {id}
              </option>
            ))}
          </select>
        </label>
        <button type="button" onClick={runGenerativeAnonymization} disabled={!canRun}>
          {isRunning ? t("generativeRunning") : t("generativeRun")}
        </button>
        <button type="button" className="secondary" onClick={resetSample} disabled={isRunning}>
          {t("generativeResetSample")}
        </button>
        <button type="button" className="secondary" onClick={clearAll} disabled={isRunning}>
          {t("clear")}
        </button>
        <button type="button" className="secondary" onClick={copyAnonymized} disabled={!anonymizedText}>
          {t("copyAnonymized")}
        </button>
        <span className="gen-status">{status}</span>
      </section>

      <label className="gen-notes">
        <span className="gen-notes-label">{t("generativeInstructions")}</span>
        <textarea
          className="gen-notes-input"
          value={extraInstructions}
          onChange={(event) => setExtraInstructions(event.target.value)}
          placeholder={t("generativeInstructionsPlaceholder")}
          rows={2}
        />
      </label>

      {error ? (
        <section className="gen-error">
          <strong>{t("errorTitle")}</strong>
          <p>{error}</p>
          <p>{t("generativeErrorHint")}</p>
        </section>
      ) : null}

      <section className="workspace workspace-four-col gen-workspace">
        <div className="panel workspace-sidebar gen-sidebar">
          <div className="panel-header">
            <h2>{t("panel2Title")}</h2>
            <span>
              {usedModel
                ? t("generativeModelLine", { model: usedModel })
                : t("generativeReplacementsEmpty")}
            </span>
          </div>
          {Object.keys(categoryView.groupedEntities).length ? (
            <CategoryReview
              entities={categoryView.entities}
              groupedEntities={categoryView.groupedEntities}
              categoryLabels={categoryLabels}
              selectedCategories={selectedCategories}
              excludedEntityKeys={excludedEntityKeys}
              onToggleCategory={handleToggleCategory}
              onToggleEntity={handleToggleEntityValue}
            />
          ) : (
            <div className="empty-state">{t("categoryEmpty")}</div>
          )}
        </div>

        <div className="panel workspace-source gen-board">
          <div className="panel-header workspace-source-header">
            <h2>{showRelationView ? t("panelSourceHighlight") : t("panel1Single")}</h2>
            <div className="workspace-source-header-center">
              {showRelationView ? (
                <button type="button" className="link-button" onClick={beginEditSource}>
                  {t("generativeEditSource")}
                </button>
              ) : persons.length > 0 ? (
                <button
                  type="button"
                  className="link-button"
                  onClick={() => setIsEditingSource(false)}
                >
                  {t("generativeShowRelations")}
                </button>
              ) : null}
            </div>
            <span className="panel-header-meta">
              {showRelationView
                ? t("generativeRelationHint", { count: persons.length })
                : `${t("characters", { count: charCount })}${
                    charCount > ALBERT_MAX_INPUT_CHARS
                      ? ` · ${t("generativeTooLong", { max: ALBERT_MAX_INPUT_CHARS })}`
                      : ""
                  }`}
            </span>
          </div>
          {showRelationView ? (
            <GenerativeRelationView
              ref={sourceScrollRef}
              text={text}
              persons={persons}
              excludedPlaceholders={excludedPlaceholders}
              excludedSurfaces={excludedSurfaces}
              emptyLabel={t("generativeInputPlaceholder")}
              onAddSelection={handleAddSelection}
              onEntityClick={handleEntityClick}
            />
          ) : (
            <textarea
              ref={sourceScrollRef}
              className="gen-board-input"
              value={text}
              onChange={onSourceChange}
              placeholder={t("generativeInputPlaceholder")}
            />
          )}
        </div>

        <div className="panel workspace-graph">
          <div className="panel-header">
            <h2>{t("generativeGraphTitle")}</h2>
            <div className="panel-header-actions">
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
            <span>{t("generativeGraphHint", { count: persons.length })}</span>
          </div>
          <div className="workspace-graph-body">
            {persons.length ? (
              <div className="gen-graph-list gen-graph-list-sidebar">
                {persons.map((person, personIndex) => (
                  <PersonGraphCard
                    key={`${person.placeholder}-${person.name}-${personIndex}`}
                    person={person}
                    excluded={Boolean(excludedPlaceholders[person.placeholder])}
                    excludedSurfaces={excludedSurfaces}
                    onTogglePerson={handleTogglePlaceholder}
                    onToggleSurface={handleToggleSurface}
                    onToggleAttr={handleToggleSurface}
                  />
                ))}
              </div>
            ) : (
              <p className="gen-maps-empty">{t("generativeGraphEmpty")}</p>
            )}
          </div>
        </div>

        <div className="panel workspace-preview gen-board">
          <div className="panel-header">
            <h2>{t("panel4Title")}</h2>
            <span>
              {usedModel ? t("generativeModelLine", { model: usedModel }) : t("panel4Subtitle")}
            </span>
          </div>
          <pre ref={previewScrollRef} className="gen-board-output text-preview">
            {anonymizedText || t("generativeOutputEmpty")}
          </pre>
        </div>
      </section>

      {editMenu ? (
        <GenerativeEditMenu
          menu={editMenu}
          persons={persons}
          menuCategories={menuCategories}
          onAddToPerson={handleAddToPerson}
          onAddAsNewPerson={handleAddAsNewPerson}
          onAddCategory={handleAddCategory}
          onAddCustom={handleAddCustomCategory}
          onRelateToPerson={handleRelateToPerson}
          onRemove={handleRemoveFromMenu}
          onClose={() => setEditMenu(null)}
        />
      ) : null}
    </section>
  );
}
