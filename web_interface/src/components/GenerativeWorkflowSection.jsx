import { useEffect, useMemo, useRef, useState } from "react";
import WorkflowSectionHeader from "./WorkflowSectionHeader.jsx";
import GenerativeRelationView from "./GenerativeRelationView.jsx";
import GenerativeEditMenu from "./GenerativeEditMenu.jsx";
import EntityEditMenu from "./EntityEditMenu.jsx";
import HighlightedText from "./HighlightedText.jsx";
import PersonGraphCard from "./PersonGraphCard.jsx";
import PersonGraphExportButton from "./PersonGraphExportButton.jsx";
import PersonGraphViewButton from "./PersonGraphViewButton.jsx";
import CategoryReview from "./CategoryReview.jsx";
import { useUiLocale } from "../context/UiLocaleContext.jsx";
import { useGeneralizationLadders } from "../hooks/useGeneralizationLadders.js";
import { useSyncedScroll } from "../hooks/useSyncedScroll.js";
import {
  ALBERT_GRAPH_SYSTEM_PROMPT,
  buildAlbertGraphUserPrompt,
  entitiesToAlbertCandidates,
  listAlbertChatModels,
  resolveInitialAlbertApiKey,
  runAlbertEntityDetection,
  runAlbertGenerativeAnonymization,
  storeAlbertApiKey,
} from "../lib/albertClient.js";
import {
  ALBERT_ENTITY_DETECTION_SYSTEM_PROMPT,
  buildAlbertEntityDetectionUserPrompt,
} from "../lib/albertEntityDetection.js";
import { GLINER_LABELS } from "../lib/glinerConstants.js";
import AlbertPromptPreview from "./AlbertPromptPreview.jsx";
import {
  addSurfaceAsCategory,
  addSurfaceAsNewPerson,
  addSurfaceToExistingPerson,
  buildGenerativeCategoryView,
  rebuildGenerativeOutputs,
  relateSurfaceToPerson,
  resolveGroupCategory,
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
  GLINER2_MULTI_BASIC_LABEL_MAP,
  GLINER2_MULTI_DEFAULT_THRESHOLD,
} from "../lib/gliner2MultiConstants.js";
import {
  addEntitySpans,
  buildCategoryLabels,
  buildMenuCategories,
  createCategorySelectionFromEntities,
  createCustomCategoryId,
  createHighlightSegments,
  finalizeDetectedEntities,
  findAllOccurrenceRanges,
  getEntityValueKey,
  groupEntities,
  inferCustomCategoriesFromEntities,
  isEntityActive,
  removeEntityById,
  buildAnonymizedPreviewModel,
} from "../lib/entityUtils.js";
import AnonymizedSplitPreview from "./AnonymizedSplitPreview.jsx";
import "./generativeWorkflow.css";

/**
 * @param {{ variant?: "basic" | "advanced" }} props
 * basic — local GLiNER2-multi detection, then Albert person graph
 * advanced — Albert LLM detection (Basic+Advanced labels + NL categories), then Albert person graph
 */
export default function GenerativeWorkflowSection({ variant = "basic" }) {
  const isAdvanced = variant === "advanced";
  const { t } = useUiLocale();
  const sourceScrollRef = useRef(null);
  const previewScrollRef = useRef(null);
  const entityMenuRef = useRef(null);
  const [apiKey, setApiKey] = useState(() => resolveInitialAlbertApiKey());
  const [model, setModel] = useState(ALBERT_DEFAULT_MODEL);
  const [models, setModels] = useState(ALBERT_DEFAULT_MODELS);
  const [text, setText] = useState(ALBERT_SAMPLE_TEXT);
  const [extraInstructions, setExtraInstructions] = useState("");
  const [categoryInstructions, setCategoryInstructions] = useState("");
  const [activeLabels, setActiveLabels] = useState(() => new Set(GLINER_LABELS));
  const [categoryMethods, setCategoryMethods] = useState({});
  const [surfaceOverrides, setSurfaceOverrides] = useState({});
  const [anonymizedTextOverride, setAnonymizedTextOverride] = useState(null);
  const [entities, setEntities] = useState([]);
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
  const [isDetecting, setIsDetecting] = useState(false);
  const [isRunning, setIsRunning] = useState(false);
  const [isLoadingModels, setIsLoadingModels] = useState(false);
  const [isEditingSource, setIsEditingSource] = useState(true);
  const [editMenu, setEditMenu] = useState(null);
  const [entityMenu, setEntityMenu] = useState(null);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");

  const charCount = text.length;
  const busy = isDetecting || isRunning;
  const canDetect = Boolean(
    text.trim() && !busy && (!isAdvanced || apiKey.trim()),
  );
  const activeEntities = useMemo(
    () => entities.filter((entity) => isEntityActive(entity, selectedCategories, excludedEntityKeys)),
    [entities, selectedCategories, excludedEntityKeys],
  );
  const canSendToAlbert = Boolean(apiKey.trim() && activeEntities.length > 0 && !busy);
  const titleKey = isAdvanced ? "generativeAdvancedTitle" : "generativeTitle";
  const eyebrowKey = isAdvanced ? "generativeAdvancedEyebrow" : "generativeEyebrow";
  const stepKeys = isAdvanced
    ? ["generativeAdvancedStep1", "generativeAdvancedStep2", "generativeAdvancedStep3"]
    : ["generativeStep1", "generativeStep2", "generativeStep3"];
  const privacyBodyKey = isAdvanced ? "generativeAdvancedPrivacyBody" : "generativePrivacyBody";
  const sectionId = isAdvanced ? "generative-advanced-section-title" : "generative-section-title";
  const showRelationView = persons.length > 0 && !isEditingSource;
  const showEntityReview = entities.length > 0 && !showRelationView && !isEditingSource;

  const selectedDetectionLabels = useMemo(
    () => GLINER_LABELS.filter((label) => activeLabels.has(label)),
    [activeLabels],
  );

  const detectionUserPrompt = useMemo(() => {
    if (!isAdvanced) {
      return "";
    }
    return buildAlbertEntityDetectionUserPrompt({
      sourceText: text.trim(),
      labels: selectedDetectionLabels.length ? selectedDetectionLabels : GLINER_LABELS,
      categoryInstructions,
    });
  }, [isAdvanced, text, categoryInstructions, selectedDetectionLabels]);

  const graphCandidates = useMemo(
    () => (isAdvanced ? entitiesToAlbertCandidates(activeEntities) : []),
    [isAdvanced, activeEntities],
  );

  const graphUserPrompt = useMemo(() => {
    if (!isAdvanced) {
      return "";
    }
    return buildAlbertGraphUserPrompt({
      sourceText: text.trim(),
      extraInstructions,
      candidates: graphCandidates,
    });
  }, [isAdvanced, text, extraInstructions, graphCandidates]);

  // Only sync the main source pane with the preview when showing the relation
  // view. The split preview owns its own left/right sync; wiring both to the
  // same preview node caused Chromium removeChild crashes during updates.
  useSyncedScroll(
    sourceScrollRef,
    previewScrollRef,
    Boolean(anonymizedText) && showRelationView,
  );

  useEffect(() => {
    storeAlbertApiKey(apiKey.trim());
  }, [apiKey]);

  const {
    ladders: generalizationLadders,
    loading: generalizationLoading,
    mode: generalizationMode,
    error: generalizationError,
  } = useGeneralizationLadders({
    entities,
    groups,
    categoryMethods,
    selectedCategories,
    resolveGroupCategory: (group) => resolveGroupCategory(group, customCategories),
  });
  const generalizationLaddersRef = useRef(generalizationLadders);
  generalizationLaddersRef.current = generalizationLadders;

  useEffect(() => {
    if (!groups.length) {
      return;
    }
    try {
      const outputs = rebuildGenerativeOutputs(
        text,
        groups,
        excludedPlaceholders,
        excludedSurfaces,
        selectedCategories,
        excludedEntityKeys,
        customCategories,
        { categoryMethods, salt: text, generalizationLadders, surfaceOverrides },
      );
      setAnonymizedText(outputs.anonymizedText);
      setReplacements(outputs.replacements);
    } catch (caughtError) {
      const message = caughtError instanceof Error ? caughtError.message : String(caughtError);
      setError(message);
      setStatus(t("generativeStatusFailed"));
    }
    // Intentionally rebuild when methods/ladders/overrides change; graph state deps are intentional.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [categoryMethods, generalizationLadders, surfaceOverrides]);

  useEffect(() => {
    if (!apiKey.trim()) {
      setModels(ALBERT_DEFAULT_MODELS);
      return undefined;
    }

    let cancelled = false;
    setIsLoadingModels(true);

    // Defer until after first paint so Chromium is not reconciling <select>
    // options in the same commit as the generative panel mount.
    const timer = window.setTimeout(() => {
      listAlbertChatModels(apiKey.trim())
        .then((ids) => {
          if (cancelled) return;
          const nextIds = ids?.length ? ids : ALBERT_DEFAULT_MODELS;
          // Avoid needless <select> option churn — Chromium can throw removeChild
          // when React reconciles option lists that password/autofill has touched.
          setModels((current) => {
            if (
              current.length === nextIds.length &&
              current.every((id, index) => id === nextIds[index])
            ) {
              return current;
            }
            return nextIds;
          });
          setModel((current) =>
            nextIds.includes(current) ? current : nextIds[0] || ALBERT_DEFAULT_MODEL,
          );
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
    }, 0);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
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
  const groupedEntities = useMemo(() => groupEntities(entities), [entities]);
  const highlightSegments = useMemo(
    () => createHighlightSegments(text, entities),
    [text, entities],
  );

  const sidebarGrouped = persons.length
    ? categoryView.groupedEntities
    : groupedEntities;
  const sidebarEntities = persons.length ? categoryView.entities : entities;

  const anonymizedPreview = useMemo(
    () =>
      buildAnonymizedPreviewModel(
        text,
        sidebarEntities,
        sidebarGrouped,
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
      sidebarEntities,
      sidebarGrouped,
      selectedCategories,
      excludedEntityKeys,
      customCategories,
      categoryMethods,
      generalizationLadders,
      persons,
      surfaceOverrides,
    ],
  );
  const generatedAnonymizedText = anonymizedPreview.anonymizedText || anonymizedText;
  const previewAnonymizedText =
    anonymizedTextOverride != null ? anonymizedTextOverride : generatedAnonymizedText;
  const anonymizedSegments = anonymizedPreview.segments;

  useEffect(() => {
    const categories = Object.keys(sidebarGrouped);
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
  }, [sidebarGrouped]);

  function clearAlbertOutputs({ clearModel = true } = {}) {
    setPersons([]);
    setGroups([]);
    setExcludedPlaceholders({});
    setExcludedSurfaces({});
    setAnonymizedText("");
    setReplacements([]);
    if (clearModel) {
      setUsedModel(null);
    }
  }

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
      {
        categoryMethods,
        salt: text,
        generalizationLadders: generalizationLaddersRef.current,
        surfaceOverrides,
      },
    );
    setAnonymizedText(outputs.anonymizedText);
    setReplacements(outputs.replacements);
  }

  async function detectEntities() {
    if (!canDetect) {
      return;
    }

    setIsDetecting(true);
    setError("");
    setEditMenu(null);
    setEntityMenu(null);
    setStatus(
      t(isAdvanced ? "generativeAdvancedStatusDetecting" : "generativeStatusDetecting"),
    );

    try {
      let normalized;
      let nextCustom = {};

      let detectionModel = null;
      if (isAdvanced) {
        const detectionLabels = selectedDetectionLabels.length
          ? selectedDetectionLabels
          : GLINER_LABELS;
        const result = await runAlbertEntityDetection({
          apiKey: apiKey.trim(),
          model,
          text,
          categoryInstructions,
          labels: detectionLabels,
        });
        normalized = result.entities || [];
        nextCustom = result.customCategories || {};
        detectionModel = result.model || model;
      } else {
        const { runGliner2MultiDetection } = await import("../lib/gliner2MultiService.js");
        const result = await runGliner2MultiDetection({
          text,
          labelMap: GLINER2_MULTI_BASIC_LABEL_MAP,
          threshold: GLINER2_MULTI_DEFAULT_THRESHOLD,
          onProgress: (progress) => {
            if (progress?.phase === "download") {
              const pct =
                typeof progress.percent === "number" ? ` ${Math.round(progress.percent)}%` : "";
              setStatus(`Downloading GLiNER2-multi (${progress.file || "model"})${pct}…`);
            }
          },
        });
        normalized = finalizeDetectedEntities(text, result.entities || []);
        nextCustom = inferCustomCategoriesFromEntities(normalized, {});
      }

      const categorySelection = createCategorySelectionFromEntities(normalized);

      clearAlbertOutputs({ clearModel: !detectionModel });
      if (detectionModel) {
        setUsedModel(detectionModel);
      }
      setEntities(normalized);
      setSelectedCategories(categorySelection);
      setExcludedEntityKeys({});
      setCustomCategories(nextCustom);
      setIsEditingSource(false);
      setStatus(
        t("generativeStatusDetected", {
          count: normalized.length,
        }),
      );
    } catch (caughtError) {
      const message = caughtError instanceof Error ? caughtError.message : String(caughtError);
      setError(message);
      setStatus(t("generativeStatusDetectFailed"));
    } finally {
      setIsDetecting(false);
    }
  }

  async function runGenerativeAnonymization() {
    if (!canSendToAlbert) {
      if (!activeEntities.length) {
        setStatus(t("generativeNeedEntities"));
      }
      return;
    }

    setIsRunning(true);
    setError("");
    setStatus(t("generativeStatusRunning"));
    setEditMenu(null);
    setEntityMenu(null);

    try {
      const candidates = entitiesToAlbertCandidates(activeEntities);
      const result = await runAlbertGenerativeAnonymization({
        apiKey: apiKey.trim(),
        model,
        text,
        extraInstructions,
        candidates,
      });
      setPersons(result.persons || []);
      setGroups(result.groups || []);
      setExcludedPlaceholders({});
      setExcludedSurfaces({});
      const view = buildGenerativeCategoryView(result.groups || [], text, customCategories);
      setSelectedCategories(view.selectedCategories);
      setExcludedEntityKeys({});
      setUsedModel(result.model || model);
      setIsEditingSource(false);
      const outputs = rebuildGenerativeOutputs(
        text,
        result.groups || [],
        {},
        {},
        view.selectedCategories,
        {},
        customCategories,
        {
          categoryMethods,
          salt: text,
          generalizationLadders: generalizationLaddersRef.current,
          surfaceOverrides,
        },
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

  function toggleDetectionLabel(label) {
    setActiveLabels((current) => {
      const next = new Set(current);
      if (next.has(label)) {
        if (next.size <= 1) {
          return current;
        }
        next.delete(label);
      } else {
        next.add(label);
      }
      return next;
    });
  }

  function resetSample() {
    setText(ALBERT_SAMPLE_TEXT);
    setEntities([]);
    clearAlbertOutputs();
    setSelectedCategories({});
    setExcludedEntityKeys({});
    setCustomCategories({});
    setCategoryInstructions("");
    setActiveLabels(new Set(GLINER_LABELS));
    setCategoryMethods({});
    setSurfaceOverrides({});
    setAnonymizedTextOverride(null);
    setIsEditingSource(true);
    setEditMenu(null);
    setEntityMenu(null);
    setError("");
    setStatus(t("generativeStatusSampleRestored"));
  }

  function clearAll() {
    setText("");
    setEntities([]);
    clearAlbertOutputs();
    setSelectedCategories({});
    setExcludedEntityKeys({});
    setCustomCategories({});
    setExtraInstructions("");
    setCategoryInstructions("");
    setActiveLabels(new Set(GLINER_LABELS));
    setCategoryMethods({});
    setSurfaceOverrides({});
    setAnonymizedTextOverride(null);
    setIsEditingSource(true);
    setEditMenu(null);
    setEntityMenu(null);
    setError("");
    setStatus("");
  }

  function copyAnonymized() {
    const payload = previewAnonymizedText || anonymizedText;
    if (!payload) return;
    navigator.clipboard.writeText(payload);
    setStatus(t("generativeStatusCopied"));
  }

  function beginEditSource() {
    setIsEditingSource(true);
    setEditMenu(null);
    setEntityMenu(null);
  }

  function onSourceChange(event) {
    const next = event.target.value;
    setText(next);
    if (entities.length || persons.length || anonymizedText || replacements.length) {
      setEntities([]);
      clearAlbertOutputs();
      setSelectedCategories({});
      setExcludedEntityKeys({});
      setCustomCategories({});
      setEditMenu(null);
      setEntityMenu(null);
    }
  }

  function handleAddSelection(selection) {
    if (showRelationView) {
      setEditMenu({
        mode: "add",
        text: selection.text,
        start: selection.start,
        end: selection.end,
        x: selection.x,
        y: selection.y,
      });
      return;
    }

    const next = {
      mode: "add",
      text: selection.text,
      start: selection.start,
      end: selection.end,
      x: selection.x,
      y: selection.y,
      scope: "all",
    };
    entityMenuRef.current = next;
    setEntityMenu(next);
  }

  function handleEntityClick(entity, position) {
    if (showRelationView) {
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
      return;
    }

    const next = {
      mode: "remove",
      entity,
      text: entity.text,
      start: entity.start,
      end: entity.end,
      x: position.x,
      y: position.y,
    };
    entityMenuRef.current = next;
    setEntityMenu(next);
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

  function addManualEntity(categoryId) {
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
    clearAlbertOutputs();
    closeEntityMenu();
    setStatus(t("generativeStatusAddedAlias", { text: menu.text }));
  }

  function handleAddEntity(label) {
    addManualEntity(label);
  }

  function handleAddCustomEntityCategory(displayName) {
    const trimmed = String(displayName || "").trim();
    const menu = entityMenuRef.current;
    if (!trimmed || !menu || menu.mode !== "add") {
      return;
    }
    const categoryId = createCustomCategoryId(trimmed, customCategories);
    setCustomCategories((current) => ({ ...current, [categoryId]: trimmed }));
    addManualEntity(categoryId);
  }

  function handleRemoveEntity() {
    if (!entityMenu || entityMenu.mode !== "remove") return;
    const next = removeEntityById(entities, entityMenu.entity.id, entityMenu.entity);
    setEntities(next);
    clearAlbertOutputs();
    closeEntityMenu();
    setStatus(t("generativeStatusRemoved", { text: entityMenu.entity.text }));
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
    if (persons.length) {
      applyGraphState(
        persons,
        groups,
        excludedPlaceholders,
        excludedSurfaces,
        nextSelected,
        excludedEntityKeys,
      );
      return;
    }
    setSelectedCategories(nextSelected);
  }

  function handleToggleEntityValue(category, entityText) {
    if (persons.length) {
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
      return;
    }

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

  return (
    <section className="gen-workflow" aria-labelledby={sectionId} translate="no">
      <WorkflowSectionHeader
        id={sectionId}
        eyebrow={t(eyebrowKey)}
        title={t(titleKey)}
        steps={stepKeys.map((key) => t(key))}
        badge={t(isAdvanced ? "generativeAdvancedBadge" : "generativeBadge")}
        badgeClassName="gen-workflow-badge"
      />

      <aside className="gen-privacy" role="note">
        <strong>{t("generativePrivacyTitle")}</strong>
        <p>{t(privacyBodyKey)}</p>
        <p>
          <a href={ALBERT_DOCS_URL} target="_blank" rel="noreferrer">
            {t("generativeDocsLink")}
          </a>
        </p>
      </aside>

      <section className="gen-toolbar">
        <label className="gen-field gen-field-key">
          <span>{t("generativeApiKey")}</span>
          {/*
            Use type="text" + CSS masking. Chromium password managers inject DOM
            into type="password" fields and can trigger React removeChild crashes.
          */}
          <input
            type="text"
            className="gen-api-key-input"
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="off"
            spellCheck={false}
            name="incognito-albert-api-key"
            data-lpignore="true"
            data-1p-ignore="true"
            data-bwignore="true"
            data-form-type="other"
            value={apiKey}
            placeholder={t("generativeApiKeyPlaceholder")}
            onChange={(event) => setApiKey(event.target.value)}
          />
        </label>
        <label className="gen-field">
          <span>{t("generativeModel")}</span>
          <select
            key={`albert-model-select-${models.join("|")}`}
            value={models.includes(model) ? model : models[0] || ALBERT_DEFAULT_MODEL}
            disabled={busy || isLoadingModels}
            onChange={(event) => setModel(event.target.value)}
          >
            {models.map((id) => (
              <option key={id} value={id}>
                {id}
              </option>
            ))}
          </select>
        </label>
        <button type="button" onClick={detectEntities} disabled={!canDetect}>
          {isDetecting
            ? t(isAdvanced ? "generativeAdvancedDetecting" : "generativeDetecting")
            : t(isAdvanced ? "generativeAdvancedDetect" : "generativeDetect")}
        </button>
        <button type="button" onClick={runGenerativeAnonymization} disabled={!canSendToAlbert}>
          {isRunning ? t("generativeRunning") : t("generativeRun")}
        </button>
        <button type="button" className="secondary" onClick={resetSample} disabled={busy}>
          {t("generativeResetSample")}
        </button>
        <button type="button" className="secondary" onClick={clearAll} disabled={busy}>
          {t("clear")}
        </button>
        <button type="button" className="secondary" onClick={copyAnonymized} disabled={!anonymizedText}>
          {t("copyAnonymized")}
        </button>
        <span className="gen-status">{status}</span>
      </section>

      {isAdvanced ? (
        <>
          <div className="gen-label-catalog" aria-label={t("generativeAdvancedLabelsTitle")}>
            <div className="gen-label-catalog-header">
              <strong>{t("generativeAdvancedLabelsTitle")}</strong>
              <span>
                {t("generativeAdvancedLabelsHint", { count: selectedDetectionLabels.length })}
              </span>
            </div>
            <div className="gen-label-catalog-list" role="group" aria-label={t("generativeAdvancedLabelsTitle")}>
              {GLINER_LABELS.map((label) => {
                const active = activeLabels.has(label);
                return (
                  <button
                    key={label}
                    type="button"
                    className={`gen-label-chip${active ? " is-active" : ""}`}
                    aria-pressed={active}
                    disabled={busy}
                    onClick={() => toggleDetectionLabel(label)}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          </div>
          <label className="gen-notes">
            <span className="gen-notes-label">{t("generativeAdvancedCategories")}</span>
            <textarea
              className="gen-notes-input"
              value={categoryInstructions}
              onChange={(event) => setCategoryInstructions(event.target.value)}
              placeholder={t("generativeAdvancedCategoriesPlaceholder")}
              rows={2}
            />
          </label>
        </>
      ) : null}

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

      {isAdvanced ? (
        <section className="gen-prompt-live" aria-label={t("generativePromptLiveTitle")}>
          <div className="gen-prompt-live-header">
            <strong>{t("generativePromptLiveTitle")}</strong>
            <span>{t("generativePromptLiveHint")}</span>
          </div>
          <AlbertPromptPreview
            title={t("generativePromptDetectionTitle")}
            hint={t("generativePromptDetectionHint")}
            systemPrompt={ALBERT_ENTITY_DETECTION_SYSTEM_PROMPT}
            userPrompt={detectionUserPrompt}
          />
          <AlbertPromptPreview
            title={t("generativePromptGraphTitle")}
            hint={
              graphCandidates.length
                ? t("generativePromptGraphHint", { count: graphCandidates.length })
                : t("generativePromptGraphEmptyHint")
            }
            systemPrompt={ALBERT_GRAPH_SYSTEM_PROMPT}
            userPrompt={graphUserPrompt}
          />
        </section>
      ) : null}

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
                : entities.length
                  ? t("generativeReviewHint", { count: entities.length })
                  : t("generativeEntitiesEmpty")}
            </span>
          </div>
          {Object.keys(sidebarGrouped).length ? (
            <CategoryReview
              entities={sidebarEntities}
              groupedEntities={sidebarGrouped}
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
            <h2>
              {showRelationView || showEntityReview ? t("panelSourceHighlight") : t("panel1Single")}
            </h2>
            <div className="workspace-source-header-center">
              {showRelationView || showEntityReview ? (
                <button type="button" className="link-button" onClick={beginEditSource}>
                  {t("generativeEditSource")}
                </button>
              ) : entities.length > 0 || persons.length > 0 ? (
                <button
                  type="button"
                  className="link-button"
                  onClick={() => setIsEditingSource(false)}
                >
                  {persons.length ? t("generativeShowRelations") : t("panelSourceHighlight")}
                </button>
              ) : null}
            </div>
            <span className="panel-header-meta">
              {showRelationView
                ? t("generativeRelationHint", { count: persons.length })
                : showEntityReview
                  ? t("generativeReviewHint", { count: entities.length })
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
          ) : showEntityReview ? (
            <HighlightedText
              ref={sourceScrollRef}
              text={text}
              segments={highlightSegments}
              categoryLabels={categoryLabels}
              selectedCategories={selectedCategories}
              excludedEntityKeys={excludedEntityKeys}
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
          <AnonymizedSplitPreview
            text={text}
            entities={sidebarEntities}
            categoryLabels={categoryLabels}
            selectedCategories={selectedCategories}
            excludedEntityKeys={excludedEntityKeys}
            categoryMethods={categoryMethods}
            onCategoryMethodChange={setCategoryMethods}
            anonymizedText={generatedAnonymizedText}
            anonymizedSegments={anonymizedSegments}
            surfaceOverrides={surfaceOverrides}
            onSurfaceOverrideChange={setSurfaceOverrides}
            anonymizedTextOverride={anonymizedTextOverride}
            onAnonymizedTextOverrideChange={setAnonymizedTextOverride}
            emptyLabel={t("generativeOutputEmpty")}
            previewRef={previewScrollRef}
            generalizationMode={generalizationMode}
            generalizationLoading={generalizationLoading}
            generalizationError={generalizationError}
          />
        </div>
      </section>

      {editMenu && showRelationView ? (
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

      {entityMenu && showEntityReview ? (
        <EntityEditMenu
          menu={entityMenu}
          sourceText={text}
          menuCategories={menuCategories}
          categoryLabels={categoryLabels}
          persons={[]}
          onScopeChange={setEntityMenuScope}
          onAdd={handleAddEntity}
          onAddCustom={handleAddCustomEntityCategory}
          onRemove={handleRemoveEntity}
          onClose={closeEntityMenu}
        />
      ) : null}
    </section>
  );
}
