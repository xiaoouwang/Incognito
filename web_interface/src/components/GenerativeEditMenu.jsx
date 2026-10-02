import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useUiLocale } from "../context/UiLocaleContext.jsx";
import { getCategoryChipClass } from "../lib/entityUtils.js";

export default function GenerativeEditMenu({
  menu,
  persons,
  menuCategories = [],
  onAddToPerson,
  onAddAsNewPerson,
  onAddCategory,
  onAddCustom,
  onRelateToPerson,
  onRemove,
  onClose,
}) {
  const { t } = useUiLocale();
  const menuRef = useRef(null);
  const [newCategoryName, setNewCategoryName] = useState("");
  const [position, setPosition] = useState({ top: menu.y, left: menu.x });

  const relatedCandidates = useMemo(() => {
    if (menu.mode === "add" || !persons.length) {
      return [];
    }
    const textLower = String(menu.text || "").toLocaleLowerCase();
    return persons
      .map((person, index) => ({ person, index }))
      .filter(({ person, index }) => {
        if (menu.personIndex === index && menu.kind !== "attr") {
          return String(person.name || "").toLocaleLowerCase() !== textLower;
        }
        return true;
      });
  }, [menu.mode, menu.text, menu.personIndex, menu.kind, persons]);

  useEffect(() => {
    setNewCategoryName("");
  }, [menu.mode, menu.start, menu.end, menu.text]);

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
  }, [menu.x, menu.y, menu.text, menu.mode, persons.length, menuCategories.length, relatedCandidates.length]);

  useEffect(() => {
    function handleKeyDown(event) {
      if (event.key === "Escape") {
        onClose();
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  return (
    <div className="entity-menu-backdrop" onClick={onClose} role="presentation">
      <section
        className="entity-menu gen-edit-menu"
        ref={menuRef}
        style={{ top: position.top, left: position.left }}
        role="dialog"
        aria-label={menu.mode === "add" ? "Add entity" : "Edit entity"}
        onClick={(event) => event.stopPropagation()}
      >
        {menu.mode === "add" ? (
          <>
            <p className="entity-menu-title">Add entity</p>
            <p className="entity-menu-selection">&quot;{menu.text}&quot;</p>
            <p className="entity-menu-hint">
              Masks every identical occurrence in the text (string match).
            </p>
            <div className="entity-menu-columns">
              <div className="entity-menu-main">
                <p className="entity-menu-section-label">Categories</p>
                <div className="entity-menu-actions">
                  {menuCategories.map(([category, label]) => (
                    <button
                      key={category}
                      type="button"
                      className={`entity-menu-chip ${getCategoryChipClass(category)}`}
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={() => onAddCategory(category)}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                {persons.length ? (
                  <>
                    <p className="entity-menu-section-label">Person graph</p>
                    <div className="entity-menu-actions">
                      {persons.map((person, index) => (
                        <button
                          key={person.placeholder || index}
                          type="button"
                          className="entity-menu-category"
                          onMouseDown={(event) => event.preventDefault()}
                          onClick={() => onAddToPerson(index)}
                        >
                          Alias of {person.name}
                          <code>{person.placeholder}</code>
                        </button>
                      ))}
                      <button
                        type="button"
                        className="entity-menu-category"
                        onMouseDown={(event) => event.preventDefault()}
                        onClick={onAddAsNewPerson}
                      >
                        New person
                      </button>
                    </div>
                  </>
                ) : (
                  <div className="entity-menu-actions">
                    <button
                      type="button"
                      className="entity-menu-category"
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={onAddAsNewPerson}
                    >
                      New person
                    </button>
                  </div>
                )}
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
        ) : (
          <>
            <p className="entity-menu-title">
              {menu.excluded ? t("generativeMenuRestoreTitle") : t("generativeMenuExcludeTitle")}
            </p>
            <p className="entity-menu-selection">&quot;{menu.text}&quot;</p>
            {relatedCandidates.length && onRelateToPerson ? (
              <>
                <p className="entity-menu-section-label">{t("entityMenuRelatedTo")}</p>
                <p className="entity-menu-hint">{t("entityMenuRelatedHint")}</p>
                <div className="entity-menu-actions">
                  {relatedCandidates.map(({ person, index }) => {
                    const isCurrent = menu.personIndex === index && menu.kind !== "attr";
                    return (
                      <button
                        key={person.placeholder || index}
                        type="button"
                        className={`entity-menu-category${isCurrent ? " is-current" : ""}`}
                        disabled={isCurrent}
                        onMouseDown={(event) => event.preventDefault()}
                        onClick={() => onRelateToPerson(index)}
                      >
                        {menu.kind === "person" || menu.kind === "alias"
                          ? t("entityMenuAliasOf", { name: person.name })
                          : t("entityMenuRelateTo", { name: person.name })}
                        <code>{person.placeholder}</code>
                      </button>
                    );
                  })}
                </div>
              </>
            ) : null}
            <p className="entity-menu-hint">
              {menu.excluded ? t("generativeMenuRestoreHint") : t("generativeMenuExcludeHint")}
            </p>
            <div className="entity-menu-actions">
              <button
                type="button"
                className="entity-menu-remove"
                onMouseDown={(event) => event.preventDefault()}
                onClick={onRemove}
              >
                {menu.excluded ? t("generativeMenuRestore") : t("generativeMenuExclude")}
              </button>
            </div>
          </>
        )}
        <button type="button" className="entity-menu-close secondary" onClick={onClose}>
          Cancel
        </button>
      </section>
    </div>
  );
}
