import { useEffect, useMemo, useRef, useState } from "react";
import AnonymizedReplacementEditor from "./AnonymizedReplacementEditor.jsx";
import EditableAnonymizedText from "./EditableAnonymizedText.jsx";
import HighlightedText from "./HighlightedText.jsx";
import { useUiLocale } from "../context/UiLocaleContext.jsx";
import { useSyncedScroll } from "../hooks/useSyncedScroll.js";
import {
  createHighlightSegments,
  getCategoryChipClass,
  getEntityValueKey,
} from "../lib/entityUtils.js";
import {
  DEFAULT_REPLACEMENT_STYLE,
  REPLACEMENT_METHODS,
  normalizeReplacementMethod,
  replacementForCategoryValue,
} from "../lib/pseudonymize.js";
import "./anonymizedSplitPreview.css";

/** Preferred chip order in the replacement-methods bar. */
const REPLACEMENT_CATEGORY_PRIORITY = [
  "person",
  "age",
  "date",
  "address",
  "email",
  "phone number",
];

function methodMeta(methodId) {
  const id = normalizeReplacementMethod(methodId);
  return REPLACEMENT_METHODS.find((method) => method.id === id) || REPLACEMENT_METHODS[0];
}

function sortReplacementCategories(categories) {
  return [...categories].sort((left, right) => {
    const leftIndex = REPLACEMENT_CATEGORY_PRIORITY.indexOf(left);
    const rightIndex = REPLACEMENT_CATEGORY_PRIORITY.indexOf(right);
    const leftRank = leftIndex === -1 ? Number.MAX_SAFE_INTEGER : leftIndex;
    const rightRank = rightIndex === -1 ? Number.MAX_SAFE_INTEGER : rightIndex;
    if (leftRank !== rightRank) {
      return leftRank - rightRank;
    }
    return left.localeCompare(right);
  });
}

function mergePreviewRef(node, rightScrollRef, previewRef) {
  rightScrollRef.current = node;
  if (typeof previewRef === "function") {
    previewRef(node);
  } else if (previewRef) {
    previewRef.current = node;
  }
}

/**
 * Split anonymized preview:
 * - compact category chips (all visible); click opens method dropdown
 * - left: original text with highlights
 * - right: highlighted replacements + free-text edit around them
 */
export default function AnonymizedSplitPreview({
  text,
  entities = [],
  segments = null,
  categoryLabels = {},
  selectedCategories = {},
  excludedEntityKeys = {},
  categoryMethods = {},
  onCategoryMethodChange,
  anonymizedText = "",
  anonymizedSegments = null,
  surfaceOverrides = {},
  onSurfaceOverrideChange,
  anonymizedTextOverride = null,
  onAnonymizedTextOverrideChange,
  emptyLabel,
  previewRef = null,
  disabled = false,
  generalizationMode = "idle",
  generalizationLoading = false,
  generalizationError = "",
}) {
  const { t } = useUiLocale();
  const leftScrollRef = useRef(null);
  const rightScrollRef = useRef(null);
  const methodsRef = useRef(null);
  const [openCategory, setOpenCategory] = useState(null);
  const [replacementEdit, setReplacementEdit] = useState(null);

  const activeCategories = useMemo(() => {
    const fromSelection = Object.keys(selectedCategories || {}).filter(
      (category) => selectedCategories[category],
    );
    if (fromSelection.length) {
      return sortReplacementCategories(fromSelection);
    }
    return sortReplacementCategories([
      ...new Set((entities || []).map((entity) => entity.label).filter(Boolean)),
    ]);
  }, [selectedCategories, entities]);

  const selectionMap = useMemo(
    () =>
      Object.keys(selectedCategories || {}).length
        ? selectedCategories
        : Object.fromEntries(activeCategories.map((category) => [category, true])),
    [selectedCategories, activeCategories],
  );

  useEffect(() => {
    if (!openCategory) {
      return undefined;
    }

    function handlePointerDown(event) {
      if (methodsRef.current && !methodsRef.current.contains(event.target)) {
        setOpenCategory(null);
      }
    }

    function handleKeyDown(event) {
      if (event.key === "Escape") {
        setOpenCategory(null);
      }
    }

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [openCategory]);

  useEffect(() => {
    if (openCategory && !activeCategories.includes(openCategory)) {
      setOpenCategory(null);
    }
  }, [activeCategories, openCategory]);

  const highlightSegments = useMemo(
    () => segments || createHighlightSegments(text, entities),
    [segments, text, entities],
  );

  const displayAnonymizedText =
    anonymizedTextOverride != null ? anonymizedTextOverride : anonymizedText;
  const canEditFullText =
    !disabled && typeof onAnonymizedTextOverrideChange === "function" && Boolean(anonymizedText);
  const canEditReplacements =
    !disabled && typeof onSurfaceOverrideChange === "function" && Boolean(anonymizedText);
  const hasManualFullText = anonymizedTextOverride != null;

  useSyncedScroll(
    leftScrollRef,
    rightScrollRef,
    Boolean(displayAnonymizedText) && Boolean(text),
  );

  function patchOverrideText(previousReplacement, nextReplacement) {
    if (
      anonymizedTextOverride == null ||
      typeof onAnonymizedTextOverrideChange !== "function" ||
      previousReplacement == null ||
      nextReplacement == null ||
      previousReplacement === nextReplacement
    ) {
      return;
    }
    if (!anonymizedTextOverride.includes(previousReplacement)) {
      return;
    }
    onAnonymizedTextOverrideChange(
      anonymizedTextOverride.split(previousReplacement).join(nextReplacement),
    );
  }

  function resolveOverrideReplacement(override, edit) {
    if (!override) {
      return edit.replacement;
    }
    if (override.kind === "custom") {
      return String(override.text ?? "");
    }
    if (override.kind === "method") {
      return replacementForCategoryValue(edit.category, edit.originalText, {
        method: normalizeReplacementMethod(override.method),
        index: 0,
        salt: text || "",
      });
    }
    return edit.replacement;
  }

  function setMethod(category, method) {
    if (!onCategoryMethodChange || disabled) {
      return;
    }
    onCategoryMethodChange({
      ...categoryMethods,
      [category]: normalizeReplacementMethod(method),
    });
    setOpenCategory(null);
  }

  function applyMethodToAll(method) {
    if (!onCategoryMethodChange || disabled || !activeCategories.length) {
      return;
    }
    const normalized = normalizeReplacementMethod(method);
    const next = { ...categoryMethods };
    for (const category of activeCategories) {
      next[category] = normalized;
    }
    onCategoryMethodChange(next);
    setOpenCategory(null);
  }

  function toggleMenu(category) {
    if (disabled) {
      return;
    }
    setOpenCategory((current) => (current === category ? null : category));
  }

  function openReplacementEditor(entity, point, segmentMeta = {}) {
    if (!canEditReplacements || !entity) {
      return;
    }
    const valueKey =
      segmentMeta.valueKey || getEntityValueKey(entity.label, entity.text);
    setOpenCategory(null);
    setReplacementEdit({
      valueKey,
      category: entity.label,
      originalText: segmentMeta.originalText || entity.text,
      replacement: segmentMeta.replacement || segmentMeta.text || "",
      x: point?.x ?? 0,
      y: point?.y ?? 0,
    });
  }

  function applySurfaceOverride(override) {
    if (!replacementEdit || !onSurfaceOverrideChange) {
      return;
    }
    const previous = replacementEdit.replacement;
    const nextRep = resolveOverrideReplacement(override, replacementEdit);
    onSurfaceOverrideChange({
      ...surfaceOverrides,
      [replacementEdit.valueKey]: override,
    });
    patchOverrideText(previous, nextRep);
    setReplacementEdit(null);
  }

  function clearSurfaceOverride() {
    if (!replacementEdit || !onSurfaceOverrideChange) {
      return;
    }
    const previous = replacementEdit.replacement;
    const next = { ...surfaceOverrides };
    delete next[replacementEdit.valueKey];
    onSurfaceOverrideChange(next);
    const nextRep = replacementForCategoryValue(
      replacementEdit.category,
      replacementEdit.originalText,
      {
        method: normalizeReplacementMethod(
          categoryMethods[replacementEdit.category] || DEFAULT_REPLACEMENT_STYLE,
        ),
        index: 0,
        salt: text || "",
      },
    );
    patchOverrideText(previous, nextRep);
    setReplacementEdit(null);
  }

  const uniformMethod = useMemo(() => {
    if (!activeCategories.length) {
      return null;
    }
    const first = normalizeReplacementMethod(
      categoryMethods[activeCategories[0]] || DEFAULT_REPLACEMENT_STYLE,
    );
    return activeCategories.every(
      (category) =>
        normalizeReplacementMethod(categoryMethods[category] || DEFAULT_REPLACEMENT_STYLE) ===
        first,
    )
      ? first
      : null;
  }, [activeCategories, categoryMethods]);

  const hasContent = Boolean(text);
  const hasAnonHighlights =
    Boolean(displayAnonymizedText) &&
    Array.isArray(anonymizedSegments) &&
    anonymizedSegments.some((item) => item.entity);

  // Offline-only generalization: no status banner unless something is wrong.
  const generalizationStatus =
    generalizationLoading || generalizationMode === "loading"
      ? t("generalizationStatusLoading")
      : generalizationMode === "error"
        ? t("generalizationStatusError", {
            message: generalizationError || t("generalizationStatusErrorFallback"),
          })
        : "";

  return (
    <div className="split-preview">
      <div
        className="split-preview-methods"
        ref={methodsRef}
        aria-label={t("replacementMethodsBarLabel")}
      >
        <div className="split-preview-methods-header">
          <strong>{t("replacementMethodsBarTitle")}</strong>
          <span>{t("replacementMethodsBarHint")}</span>
        </div>
        {activeCategories.length ? (
          <div className="split-preview-apply-all" aria-label={t("replacementMethodsApplyAllLabel")}>
            <span className="split-preview-apply-all-label">{t("replacementMethodsApplyAll")}</span>
            <div className="split-preview-apply-all-actions">
              {REPLACEMENT_METHODS.map((method) => {
                const active = uniformMethod === method.id;
                return (
                  <button
                    key={method.id}
                    type="button"
                    className={`split-preview-apply-all-btn${active ? " is-active" : ""}`}
                    disabled={disabled}
                    title={t("replacementMethodsApplyAllTitle", {
                      method: t(method.labelKey),
                    })}
                    onClick={() => applyMethodToAll(method.id)}
                  >
                    <span className="split-preview-method-icon" aria-hidden="true">
                      {method.icon}
                    </span>
                    <span>{t(method.labelKey)}</span>
                  </button>
                );
              })}
            </div>
          </div>
        ) : null}
        {generalizationStatus ? (
          <p
            className={`split-preview-generalize-status is-${generalizationMode}${
              generalizationLoading ? " is-loading" : ""
            }`}
          >
            {generalizationStatus}
          </p>
        ) : null}
        {activeCategories.length ? (
          <div className="split-preview-cat-grid">
            {activeCategories.map((category) => {
              const current = normalizeReplacementMethod(
                categoryMethods[category] || DEFAULT_REPLACEMENT_STYLE,
              );
              const currentMeta = methodMeta(current);
              const isOpen = openCategory === category;
              const menuId = `replacement-method-menu-${category.replace(/\s+/g, "-")}`;

              return (
                <div
                  className={`split-preview-cat-item${isOpen ? " is-open" : ""}`}
                  key={category}
                >
                  <button
                    type="button"
                    className={`split-preview-cat-trigger ${getCategoryChipClass(category)}${
                      isOpen ? " is-open" : ""
                    }`}
                    disabled={disabled}
                    aria-haspopup="menu"
                    aria-expanded={isOpen}
                    aria-controls={menuId}
                    title={`${categoryLabels[category] || category} · ${t(currentMeta.labelKey)}`}
                    onClick={() => toggleMenu(category)}
                  >
                    <span className="split-preview-cat-name">
                      {categoryLabels[category] || category}
                    </span>
                    <span className="split-preview-cat-method">
                      <span className="split-preview-method-icon" aria-hidden="true">
                        {currentMeta.icon}
                      </span>
                      <span>{t(currentMeta.labelKey)}</span>
                    </span>
                    <span className="split-preview-cat-caret" aria-hidden="true">
                      ▾
                    </span>
                  </button>

                  {isOpen ? (
                    <div
                      className="split-preview-method-menu"
                      id={menuId}
                      role="menu"
                      aria-label={t("replacementMethodMenuLabel", {
                        category: categoryLabels[category] || category,
                      })}
                    >
                      {REPLACEMENT_METHODS.map((method) => {
                        const active = current === method.id;
                        return (
                          <button
                            key={method.id}
                            type="button"
                            role="menuitemradio"
                            aria-checked={active}
                            className={`split-preview-method-option${active ? " is-active" : ""}`}
                            title={t(method.hintKey)}
                            onClick={() => setMethod(category, method.id)}
                          >
                            <span className="split-preview-method-icon" aria-hidden="true">
                              {method.icon}
                            </span>
                            <span className="split-preview-method-option-text">
                              <strong>{t(method.labelKey)}</strong>
                              <small>{t(method.hintKey)}</small>
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        ) : (
          <p className="split-preview-methods-empty">{t("replacementMethodsBarEmpty")}</p>
        )}
      </div>

      <div className="split-preview-panes">
        <div className="split-preview-pane">
          <div className="split-preview-pane-header">{t("splitPreviewOriginal")}</div>
          <div className="split-preview-pane-body" ref={leftScrollRef}>
            {hasContent ? (
              entities.length > 0 || (Array.isArray(segments) && segments.some((item) => item.entity)) ? (
                <HighlightedText
                  text={text}
                  segments={highlightSegments}
                  categoryLabels={categoryLabels}
                  selectedCategories={selectionMap}
                  excludedEntityKeys={excludedEntityKeys}
                  interactive={false}
                />
              ) : (
                <pre className="split-preview-plain-source">{text}</pre>
              )
            ) : (
              <div className="empty-state">{emptyLabel || t("panel4Empty")}</div>
            )}
          </div>
        </div>
        <div className="split-preview-pane">
          <div className="split-preview-pane-header">
            <span className="split-preview-pane-title-row">
              {t("splitPreviewAnonymized")}
              <span className="split-preview-pane-hint">
                {canEditFullText || canEditReplacements
                  ? t("splitPreviewAnonymizedCombinedHint")
                  : t("splitPreviewAnonymizedHint")}
              </span>
            </span>
            {hasManualFullText && canEditFullText ? (
              <span className="split-preview-pane-actions">
                <button
                  type="button"
                  className="split-preview-view-toggle"
                  disabled={disabled}
                  onClick={() => onAnonymizedTextOverrideChange(null)}
                >
                  {t("splitPreviewResetGenerated")}
                </button>
              </span>
            ) : null}
          </div>
          <div
            className="split-preview-pane-body text-preview"
            ref={(node) => mergePreviewRef(node, rightScrollRef, previewRef)}
          >
            {displayAnonymizedText ? (
              hasAnonHighlights && (canEditFullText || canEditReplacements) ? (
                <EditableAnonymizedText
                  text={displayAnonymizedText}
                  segments={anonymizedSegments}
                  categoryLabels={categoryLabels}
                  selectedCategories={selectionMap}
                  excludedEntityKeys={{}}
                  disabled={disabled}
                  onTextChange={
                    canEditFullText
                      ? (next) => onAnonymizedTextOverrideChange(next)
                      : undefined
                  }
                  onEntityClick={
                    canEditReplacements
                      ? (entity, point, segment) => {
                          openReplacementEditor(entity, point, segment || {});
                        }
                      : undefined
                  }
                />
              ) : (
                <pre className="split-preview-plain-source">{displayAnonymizedText}</pre>
              )
            ) : (
              <div className="empty-state">{emptyLabel || t("panel4Empty")}</div>
            )}
          </div>
        </div>
      </div>

      {replacementEdit ? (
        <AnonymizedReplacementEditor
          edit={replacementEdit}
          categoryLabel={categoryLabels[replacementEdit.category]}
          categoryMethod={categoryMethods[replacementEdit.category]}
          override={surfaceOverrides[replacementEdit.valueKey]}
          onApply={applySurfaceOverride}
          onClear={clearSurfaceOverride}
          onClose={() => setReplacementEdit(null)}
        />
      ) : null}
    </div>
  );
}
