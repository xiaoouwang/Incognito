import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { formatCategoryDisplayName } from "../lib/auditReport.js";
import {
  buildMenuCategories,
  countOccurrences,
  getCategoryChipClass,
  getCategoryHighlightClass,
  getCategoryLabel,
  getSelectionOffsets,
  isEntityActive,
} from "../lib/entityUtils.js";

export default function EntityEditMenu({
  menu,
  sourceText,
  menuCategories,
  categoryLabels,
  onScopeChange,
  onAdd,
  onAddCustom,
  onRemove,
  onClose,
}) {
  const menuRef = useRef(null);
  const [newCategoryName, setNewCategoryName] = useState("");
  const [position, setPosition] = useState({ top: menu.y, left: menu.x });
  const scope = menu.mode === "add" && menu.scope === "single" ? "single" : "all";
  const occurrenceCount = useMemo(() => {
    if (menu.mode !== "add" || typeof menu.text !== "string") {
      return 0;
    }

    return countOccurrences(sourceText, menu.text);
  }, [menu.mode, menu.text, sourceText]);

  useEffect(() => {
    setNewCategoryName("");
  }, [menu.mode, menu.start, menu.end, menu.text, menu.entity?.id]);

  useLayoutEffect(() => {
    const element = menuRef.current;
    if (!element) {
      return;
    }

    const margin = 12;
    const rect = element.getBoundingClientRect();
    let top = menu.y;
    let left = menu.x;

    if (left + rect.width > window.innerWidth - margin) {
      left = Math.max(margin, window.innerWidth - rect.width - margin);
    }
    if (top + rect.height > window.innerHeight - margin) {
      top = Math.max(margin, window.innerHeight - rect.height - margin);
    }
    if (left < margin) {
      left = margin;
    }
    if (top < margin) {
      top = margin;
    }

    setPosition({ top, left });
  }, [menu.x, menu.y, menu.text, menu.mode, menu.scope, menuCategories.length, occurrenceCount]);

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
        aria-label={menu.mode === "add" ? "Add entity" : "Remove entity"}
        onClick={(event) => event.stopPropagation()}
      >
        {menu.mode === "add" ? (
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
                  Word matches are whole words/phrases, case-insensitive.
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
        ) : menu.entity ? (
          <>
            <p className="entity-menu-title">
              {categoryLabels[menu.entity.label] || formatCategoryDisplayName(menu.entity.label)}
            </p>
            <p className="entity-menu-selection">&quot;{menu.entity.text}&quot;</p>
            <p className="entity-menu-hint">Remove this detected span from the review.</p>
            <button className="entity-menu-danger" type="button" onClick={onRemove}>
              Remove entity
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
