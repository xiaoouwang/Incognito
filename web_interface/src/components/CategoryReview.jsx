import { memo, useMemo } from "react";
import { useUiLocale } from "../context/UiLocaleContext.jsx";
import {
  buildEntitySpanCounts,
  getCategoryChipClass,
  getEntityValueKey,
  groupEntities,
} from "../lib/entityUtils.js";
import { VisibilityIcon, VisibilityToggleButton } from "./VisibilityToggleIcon.jsx";

function CategoryReview({
  entities,
  groupedEntities,
  removedEntities = [],
  categoryLabels,
  selectedCategories,
  excludedEntityKeys,
  onToggleCategory,
  onToggleEntity,
  onRemoveEntity,
  onRestoreEntity,
}) {
  const { t } = useUiLocale();
  const spanCounts = useMemo(() => buildEntitySpanCounts(entities), [entities]);
  const groupedRemoved = useMemo(() => groupEntities(removedEntities), [removedEntities]);
  const removedSpanCounts = useMemo(
    () => buildEntitySpanCounts(removedEntities),
    [removedEntities],
  );
  const categories = useMemo(() => {
    const keys = new Set([
      ...Object.keys(groupedEntities || {}),
      ...Object.keys(groupedRemoved),
    ]);
    const personRank = (category) => {
      const key = String(category || "").toLocaleLowerCase();
      // Person names stay at the top of Categories & entities.
      return key === "person" || key === "person name" ? 0 : 1;
    };
    return [...keys].sort((left, right) => {
      const rankDiff = personRank(left) - personRank(right);
      if (rankDiff !== 0) {
        return rankDiff;
      }
      const leftLabel = categoryLabels[left] || left;
      const rightLabel = categoryLabels[right] || right;
      return String(leftLabel).localeCompare(String(rightLabel));
    });
  }, [groupedEntities, groupedRemoved, categoryLabels]);

  if (!categories.length) {
    return <div className="empty-state">{t("categoryEmpty")}</div>;
  }

  const canRemove = typeof onRemoveEntity === "function";
  const canRestore = typeof onRestoreEntity === "function";

  return (
    <div className="category-list">
      {categories.map((category) => {
        const categoryActive = Boolean(selectedCategories[category]);
        const activeValues = groupedEntities[category] || [];
        const removedValues = groupedRemoved[category] || [];
        const uniqueCount = activeValues.length;

        return (
          <article className="category-card" key={category}>
            <div className="category-toggle">
              <VisibilityToggleButton
                shown={!categoryActive}
                className="category-visibility"
                size={16}
                title={
                  categoryActive
                    ? t("personGraphVisibilityAnonymizedTitle")
                    : t("personGraphVisibilityShownTitle")
                }
                onClick={() => onToggleCategory(category)}
                disabled={!activeValues.length}
              />
              <span>
                {t("anonymizeCategory")} {categoryLabels[category] || category}
                <small>{t("uniqueValues", { count: uniqueCount })}</small>
              </span>
            </div>
            <div className="entity-chips">
              {activeValues.map((entity, entityIndex) => {
                const valueKey = getEntityValueKey(category, entity.text);
                const occurrenceCount = spanCounts.get(valueKey) || 0;
                // True when this value will be anonymized in the preview.
                const anonymized = categoryActive && !excludedEntityKeys[valueKey];

                return (
                  <span
                    key={entity.key || `${category}:${entity.text}:${entityIndex}`}
                    className={`chip chip-with-remove ${getCategoryChipClass(category)} ${
                      anonymized ? "chip-inactive" : "chip-active"
                    }`}
                  >
                    <button
                      type="button"
                      className="chip-main"
                      onClick={() => onToggleEntity(category, entity.text)}
                      title={`${entity.text} · ${
                        anonymized
                          ? t("personGraphVisibilityAnonymizedTitle")
                          : t("personGraphVisibilityShownTitle")
                      }`}
                    >
                      <VisibilityIcon shown={!anonymized} size={13} />
                      <span className="chip-label">{entity.text}</span>
                      <span className="chip-count">{occurrenceCount}</span>
                    </button>
                    {canRemove ? (
                      <button
                        type="button"
                        className="chip-remove"
                        aria-label={t("chipRemoveEntity", { text: entity.text })}
                        title={t("chipRemoveEntity", { text: entity.text })}
                        onClick={(event) => {
                          event.preventDefault();
                          event.stopPropagation();
                          onRemoveEntity(category, entity.text);
                        }}
                      >
                        ×
                      </button>
                    ) : null}
                  </span>
                );
              })}
            </div>
            {removedValues.length ? (
              <>
                <hr className="entity-chips-divider" />
                <div className="entity-chips entity-chips-removed" aria-label={t("chipRemovedSection")}>
                  {removedValues.map((entity, entityIndex) => {
                    const valueKey = getEntityValueKey(category, entity.text);
                    const occurrenceCount = removedSpanCounts.get(valueKey) || 0;
                    return (
                      <span
                        key={`removed:${entity.key || `${category}:${entity.text}:${entityIndex}`}`}
                        className={`chip chip-removed ${getCategoryChipClass(category)}`}
                      >
                        <span className="chip-main chip-main-static">
                          <span className="chip-label">{entity.text}</span>
                          <span className="chip-count">{occurrenceCount}</span>
                        </span>
                        {canRestore ? (
                          <button
                            type="button"
                            className="chip-restore"
                            aria-label={t("chipRestoreEntity", { text: entity.text })}
                            title={t("chipRestoreEntity", { text: entity.text })}
                            onClick={(event) => {
                              event.preventDefault();
                              event.stopPropagation();
                              onRestoreEntity(category, entity.text);
                            }}
                          >
                            ↩
                          </button>
                        ) : null}
                      </span>
                    );
                  })}
                </div>
              </>
            ) : null}
          </article>
        );
      })}
      <p className="category-hint">{t("categoryHint")}</p>
    </div>
  );
}

export default memo(CategoryReview);
