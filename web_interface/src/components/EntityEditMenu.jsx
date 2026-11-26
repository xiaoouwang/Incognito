import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { formatCategoryDisplayName } from "../lib/auditReport.js";
import {
  findSurfaceOwnerPlaceholders,
  isPersonLabel,
} from "../lib/basicPersonGraph.js";
import { useUiLocale } from "../context/UiLocaleContext.jsx";
import {
  canonicalCategoryId,
  countEntitiesMatchingValue,
  countOccurrences,
  getCategoryChipClass,
  getEntityOccurrenceKey,
  getEntityValueKey,
  resolveLinkedValueKey,
} from "../lib/entityUtils.js";

export default function EntityEditMenu({
  menu,
  sourceText,
  menuCategories,
  categoryLabels,
  entities = [],
  persons = [],
  relatedPlaceholders = null,
  distinctOccurrenceKeys = {},
  linkedValueKeys = {},
  onScopeChange,
  onAdd,
  onAddCustom,
  onChangeCategory,
  onChangeCategoryCustom,
  onRelateToPerson,
  onToggleDistinctOccurrence,
  onLinkSameCode,
  onRemove,
  onClose,
}) {
  const { t } = useUiLocale();
  const menuRef = useRef(null);
  const [newCategoryName, setNewCategoryName] = useState("");
  const [position, setPosition] = useState({ top: menu.y, left: menu.x });
  const isAdd = menu.mode === "add";
  const isEdit = menu.mode === "remove" && Boolean(menu.entity);
  const scope = menu.scope === "single" ? "single" : "all";
  const occurrenceCount = useMemo(() => {
    if (!isAdd || typeof menu.text !== "string") {
      return 0;
    }

    // Exclude spans that already overlap detections (e.g. "Marie" inside
    // "Marie Dupont") so the count matches what "add all" will actually insert.
    return countOccurrences(sourceText, menu.text, entities);
  }, [isAdd, menu.text, sourceText, entities]);

  const matchingValueCount = useMemo(() => {
    if (!isEdit) {
      return 0;
    }
    return countEntitiesMatchingValue(entities, menu.entity.label, menu.entity.text);
  }, [isEdit, entities, menu.entity]);

  const occurrenceKey = isEdit ? getEntityOccurrenceKey(menu.entity) : "";
  const isDistinctOccurrence = Boolean(
    occurrenceKey && distinctOccurrenceKeys[occurrenceKey],
  );
  const canToggleDistinct =
    isEdit &&
    typeof onToggleDistinctOccurrence === "function" &&
    matchingValueCount > 1;

  const sameCodeCandidates = useMemo(() => {
    if (!isEdit || typeof onLinkSameCode !== "function") {
      return [];
    }
    const category = menu.entity.label;
    const selfLower = String(menu.entity.text || "").toLocaleLowerCase();
    const seen = new Set();
    const candidates = [];
    for (const entity of entities || []) {
      if (entity.label !== category) {
        continue;
      }
      const lower = String(entity.text || "").toLocaleLowerCase();
      if (!lower || lower === selfLower || seen.has(lower)) {
        continue;
      }
      seen.add(lower);
      candidates.push(entity.text);
    }
    return candidates.sort((left, right) => left.localeCompare(right));
  }, [isEdit, entities, menu.entity, onLinkSameCode]);

  const currentValueKey = isEdit
    ? getEntityValueKey(menu.entity.label, menu.entity.text)
    : "";
  const linkedPartnerText = useMemo(() => {
    if (!isEdit || !currentValueKey) {
      return "";
    }
    const canonical = resolveLinkedValueKey(currentValueKey, linkedValueKeys);
    let partnerKey = "";
    if (canonical !== currentValueKey) {
      partnerKey = canonical;
    } else {
      partnerKey =
        Object.entries(linkedValueKeys || {}).find(
          ([, target]) => target === currentValueKey,
        )?.[0] || "";
    }
    if (!partnerKey) {
      return "";
    }
    const lower = partnerKey.slice(partnerKey.indexOf(":") + 1);
    const match = sameCodeCandidates.find(
      (text) => String(text || "").toLocaleLowerCase() === lower,
    );
    return match || lower;
  }, [isEdit, currentValueKey, linkedValueKeys, sameCodeCandidates]);

  const changeCategories = useMemo(() => {
    if (!isEdit) {
      return [];
    }
    const currentCanonical = canonicalCategoryId(menu.entity.label);
    return menuCategories.filter(
      ([category]) => canonicalCategoryId(category) !== currentCanonical,
    );
  }, [isEdit, menuCategories, menu.entity]);

  const canChangeCategory =
    isEdit &&
    typeof onChangeCategory === "function" &&
    typeof onChangeCategoryCustom === "function";

  const relatedCandidates = useMemo(() => {
    if (!isEdit || !persons.length) {
      return [];
    }
    const entityLower = String(menu.entity.text || "").toLocaleLowerCase();
    return persons.filter((person) => {
      if (!isPersonLabel(menu.entity.label)) {
        return true;
      }
      return String(person.name || "").toLocaleLowerCase() !== entityLower;
    });
  }, [isEdit, menu.entity, persons]);

  const currentOwnerPlaceholders = useMemo(() => {
    if (!isEdit) {
      return [];
    }
    if (Array.isArray(relatedPlaceholders)) {
      return relatedPlaceholders;
    }
    return findSurfaceOwnerPlaceholders(persons, menu.entity.text);
  }, [isEdit, menu.entity, persons, relatedPlaceholders]);

  const currentOwners = useMemo(
    () =>
      currentOwnerPlaceholders
        .map((placeholder) => persons.find((person) => person.placeholder === placeholder))
        .filter(Boolean),
    [persons, currentOwnerPlaceholders],
  );

  useEffect(() => {
    setNewCategoryName("");
  }, [menu.mode, menu.start, menu.end, menu.text, menu.entity?.id]);

  useLayoutEffect(() => {
    const element = menuRef.current;
    if (!element) {
      return;
    }

    const margin = 12;
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const maxWidth = Math.max(240, viewportWidth - margin * 2);
    element.style.maxWidth = `${Math.min(520, maxWidth)}px`;
    element.style.maxHeight = `${Math.max(200, viewportHeight - margin * 2)}px`;

    // Prefer opening to the left of the click when close to the right edge.
    const width = element.offsetWidth;
    const height = element.offsetHeight;
    let left = menu.x;
    let top = menu.y;
    if (left + width > viewportWidth - margin) {
      left = menu.x - width;
    }
    if (left < margin) {
      left = margin;
    }
    if (left + width > viewportWidth - margin) {
      left = Math.max(margin, viewportWidth - width - margin);
    }
    if (top + height > viewportHeight - margin) {
      top = Math.max(margin, viewportHeight - height - margin);
    }
    if (top < margin) {
      top = margin;
    }

    setPosition({ top, left });
  }, [
    menu.x,
    menu.y,
    menu.text,
    menu.mode,
    menu.scope,
    menuCategories.length,
    occurrenceCount,
    matchingValueCount,
    relatedCandidates.length,
    sameCodeCandidates.length,
    canChangeCategory,
    canToggleDistinct,
    linkedPartnerText,
  ]);

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
        ref={menuRef}
        style={{ top: position.top, left: position.left }}
        role="dialog"
        aria-label={isAdd ? "Add entity" : "Edit entity"}
        onClick={(event) => event.stopPropagation()}
      >
        {isAdd ? (
          <>
            <p className="entity-menu-title">Add entity</p>
            <p className="entity-menu-selection">&quot;{menu.text}&quot;</p>
            {occurrenceCount > 1 ? (
              <>
                <div className="entity-menu-scope" role="radiogroup" aria-label="Occurrence scope">
                  <button
                    className={`entity-menu-scope-option ${scope === "all" ? "active" : ""}`}
                    type="button"
                    role="radio"
                    aria-checked={scope === "all"}
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => onScopeChange("all")}
                  >
                    All word matches ({occurrenceCount})
                  </button>
                  <button
                    className={`entity-menu-scope-option ${scope === "single" ? "active" : ""}`}
                    type="button"
                    role="radio"
                    aria-checked={scope === "single"}
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => onScopeChange("single")}
                  >
                    This selection only
                  </button>
                </div>
                <p className="entity-menu-hint">
                  Whole words/phrases, case-insensitive. Spans that already
                  overlap a detection are left unchanged.
                </p>
              </>
            ) : (
              <p className="entity-menu-hint">1 whole-word match in this document.</p>
            )}
            <div className="entity-menu-columns">
              <div className="entity-menu-main">
                <p className="entity-menu-section-label">Categories</p>
                <div className="entity-menu-actions">
                  {menuCategories.map(([category, label]) => (
                    <button
                      key={category}
                      className={`entity-menu-chip ${getCategoryChipClass(category)}`}
                      type="button"
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={() => onAdd(category)}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
              <aside className="entity-menu-new-category-panel">
                <p className="entity-menu-section-label">New category</p>
                <input
                  className="entity-menu-new-category-input"
                  type="text"
                  value={newCategoryName}
                  placeholder="e.g. Profession"
                  onChange={(event) => setNewCategoryName(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" && newCategoryName.trim()) {
                      event.preventDefault();
                      onAddCustom(newCategoryName);
                    }
                  }}
                />
                <button
                  className="entity-menu-new-category-submit"
                  type="button"
                  disabled={!newCategoryName.trim()}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => onAddCustom(newCategoryName)}
                >
                  Create &amp; add
                </button>
              </aside>
            </div>
          </>
        ) : isEdit ? (
          <>
            <p className="entity-menu-title">
              {categoryLabels[menu.entity.label] || formatCategoryDisplayName(menu.entity.label)}
            </p>
            <p className="entity-menu-selection">&quot;{menu.entity.text}&quot;</p>
            {matchingValueCount > 1 ? (
              <div
                className="entity-menu-scope"
                role="radiogroup"
                aria-label={t("entityMenuChangeScopeLabel")}
                title={t("entityMenuChangeScopeHint")}
              >
                <button
                  className={`entity-menu-scope-option ${scope === "all" ? "active" : ""}`}
                  type="button"
                  role="radio"
                  aria-checked={scope === "all"}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => onScopeChange("all")}
                >
                  {t("entityMenuChangeAll", { count: matchingValueCount })}
                </button>
                <button
                  className={`entity-menu-scope-option ${scope === "single" ? "active" : ""}`}
                  type="button"
                  role="radio"
                  aria-checked={scope === "single"}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => onScopeChange("single")}
                >
                  {t("entityMenuChangeSingle")}
                </button>
              </div>
            ) : null}
            {canChangeCategory ? (
              <>
                <p className="entity-menu-section-label">{t("entityMenuChangeCategory")}</p>
                <div className="entity-menu-columns">
                  <div className="entity-menu-main">
                    <p className="entity-menu-section-label">{t("entityMenuCategories")}</p>
                    <div className="entity-menu-actions">
                      {changeCategories.map(([category, label]) => (
                        <button
                          key={category}
                          className={`entity-menu-chip ${getCategoryChipClass(category)}`}
                          type="button"
                          onMouseDown={(event) => event.preventDefault()}
                          onClick={() => onChangeCategory(category)}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                  </div>
                  <aside className="entity-menu-new-category-panel">
                    <p className="entity-menu-section-label">{t("entityMenuNewCategory")}</p>
                    <input
                      className="entity-menu-new-category-input"
                      type="text"
                      value={newCategoryName}
                      placeholder={t("entityMenuNewCategoryPlaceholder")}
                      onChange={(event) => setNewCategoryName(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" && newCategoryName.trim()) {
                          event.preventDefault();
                          onChangeCategoryCustom(newCategoryName);
                        }
                      }}
                    />
                    <button
                      className="entity-menu-new-category-submit"
                      type="button"
                      disabled={!newCategoryName.trim()}
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={() => onChangeCategoryCustom(newCategoryName)}
                    >
                      {t("entityMenuCreateAndMove")}
                    </button>
                  </aside>
                </div>
              </>
            ) : null}
            {relatedCandidates.length && onRelateToPerson ? (
              <>
                <p className="entity-menu-section-label">
                  {isPersonLabel(menu.entity.label)
                    ? t("entityMenuRelatedToPerson")
                    : t("entityMenuRelatedTo")}
                </p>
                {currentOwners.length ? (
                  <p className="entity-menu-hint">
                    {t("entityMenuCurrentlyRelatedMulti", {
                      people: currentOwners
                        .map((person) => `${person.name} (${person.placeholder})`)
                        .join(", "),
                    })}{" "}
                    {t("entityMenuRelateToggleHint")}
                  </p>
                ) : (
                  <p className="entity-menu-hint">
                    {isPersonLabel(menu.entity.label)
                      ? t("entityMenuPersonRelateHint")
                      : t("entityMenuRelatedHint")}{" "}
                    {t("entityMenuRelateMultiHint")}
                  </p>
                )}
                <div className="entity-menu-actions">
                  {relatedCandidates.map((person) => {
                    const personEntity = isPersonLabel(menu.entity.label);
                    const entityLower = String(menu.entity.text || "").toLocaleLowerCase();
                    const isCurrent = personEntity
                      ? (person.rels || []).some(
                          (rel) =>
                            String(rel.target || "").toLocaleLowerCase() === entityLower,
                        )
                      : currentOwnerPlaceholders.includes(person.placeholder);
                    return (
                      <button
                        key={`rel-${person.placeholder}`}
                        type="button"
                        className={`entity-menu-category${isCurrent ? " is-current" : ""}`}
                        onMouseDown={(event) => event.preventDefault()}
                        onClick={() =>
                          onRelateToPerson(
                            person.placeholder,
                            personEntity ? { mode: "rel" } : { mode: "attr" },
                          )
                        }
                        title={
                          isCurrent
                            ? t("entityMenuUnrelateTitle", { name: person.name })
                            : undefined
                        }
                      >
                        {isCurrent
                          ? t("entityMenuUnrelateTo", { name: person.name })
                          : t("entityMenuRelateTo", { name: person.name })}
                        <code>{person.placeholder}</code>
                      </button>
                    );
                  })}
                </div>
                {isPersonLabel(menu.entity.label) ? (
                  <>
                    <p className="entity-menu-section-label">{t("entityMenuAliasSection")}</p>
                    <p className="entity-menu-hint">{t("entityMenuAliasHint")}</p>
                    <div className="entity-menu-actions">
                      {relatedCandidates.map((person) => {
                        const entityLower = String(menu.entity.text || "").toLocaleLowerCase();
                        const isCurrent = (person.aliases || []).some(
                          (alias) => String(alias || "").toLocaleLowerCase() === entityLower,
                        );
                        return (
                          <button
                            key={`alias-${person.placeholder}`}
                            type="button"
                            className={`entity-menu-category${isCurrent ? " is-current" : ""}`}
                            onMouseDown={(event) => event.preventDefault()}
                            onClick={() =>
                              onRelateToPerson(person.placeholder, { mode: "alias" })
                            }
                          >
                            {isCurrent
                              ? t("entityMenuUnaliasOf", { name: person.name })
                              : t("entityMenuAliasOf", { name: person.name })}
                            <code>{person.placeholder}</code>
                          </button>
                        );
                      })}
                    </div>
                  </>
                ) : null}
              </>
            ) : null}
            {typeof onLinkSameCode === "function" && sameCodeCandidates.length ? (
              <div className="entity-menu-same-code-row" title={t("entityMenuSameCodeHint")}>
                <label className="entity-menu-section-label" htmlFor="entity-menu-same-code">
                  {t("entityMenuSameCodeSection")}
                </label>
                <select
                  id="entity-menu-same-code"
                  className="entity-menu-same-code-select"
                  value={linkedPartnerText}
                  onMouseDown={(event) => event.stopPropagation()}
                  onChange={(event) => {
                    const next = event.target.value;
                    if (!next) {
                      if (linkedPartnerText) {
                        onLinkSameCode(linkedPartnerText);
                      }
                      return;
                    }
                    onLinkSameCode(next);
                  }}
                >
                  <option value="">{t("entityMenuSameCodeNone")}</option>
                  {sameCodeCandidates.map((candidateText) => (
                    <option key={candidateText} value={candidateText}>
                      {candidateText}
                    </option>
                  ))}
                </select>
              </div>
            ) : null}
            {typeof onToggleDistinctOccurrence === "function" && canToggleDistinct ? (
              <button
                type="button"
                className={`entity-menu-category entity-menu-compact-action${isDistinctOccurrence ? " is-current" : ""}`}
                title={t("entityMenuDistinctHint")}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => onToggleDistinctOccurrence()}
              >
                {isDistinctOccurrence
                  ? t("entityMenuDistinctDisable")
                  : t("entityMenuDistinctEnable")}
              </button>
            ) : null}
            <button
              className="entity-menu-danger"
              type="button"
              title={t("entityMenuRemoveHint")}
              onClick={onRemove}
            >
              {scope === "all" && matchingValueCount > 1
                ? t("entityMenuRemoveAll", { count: matchingValueCount })
                : t("entityMenuRemove")}
            </button>
          </>
        ) : null}
        <button className="secondary entity-menu-cancel" type="button" onClick={onClose}>
          Cancel
        </button>
      </section>
    </div>
  );
}
