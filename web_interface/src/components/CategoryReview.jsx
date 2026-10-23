import { useUiLocale } from "../context/UiLocaleContext.jsx";
import {
  countEntitySpans,
  getCategoryChipClass,
  getEntityValueKey,
} from "../lib/entityUtils.js";
import { VisibilityIcon, VisibilityToggleButton } from "./VisibilityToggleIcon.jsx";

export default function CategoryReview({
  entities,
  groupedEntities,
  categoryLabels,
  selectedCategories,
  excludedEntityKeys,
  onToggleCategory,
  onToggleEntity,
}) {
  const { t } = useUiLocale();
  const categories = Object.keys(groupedEntities);

  if (!categories.length) {
    return <div className="empty-state">{t("categoryEmpty")}</div>;
  }

  return (
    <div className="category-list">
      {categories.map((category) => {
        const categoryActive = Boolean(selectedCategories[category]);
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
              />
              <span>
                {t("anonymizeCategory")} {categoryLabels[category] || category}
                <small>{t("uniqueValues", { count: groupedEntities[category].length })}</small>
              </span>
            </div>
            <div className="entity-chips">
              {groupedEntities[category].map((entity, entityIndex) => {
                const occurrenceCount = countEntitySpans(entities, category, entity.text);
                const active =
                  categoryActive &&
                  !excludedEntityKeys[getEntityValueKey(category, entity.text)];

                return (
                  <button
                    type="button"
                    className={`chip ${getCategoryChipClass(category)} ${active ? "chip-active" : "chip-inactive"}`}
                    key={entity.key || `${category}:${entity.text}:${entityIndex}`}
                    onClick={() => onToggleEntity(category, entity.text)}
                    title={
                      active
                        ? t("personGraphVisibilityAnonymizedTitle")
                        : t("personGraphVisibilityShownTitle")
                    }
                  >
                    <VisibilityIcon shown={!active} size={13} />
                    <span className="chip-label">{entity.text}</span>
                    <span className="chip-count">{occurrenceCount}</span>
                  </button>
                );
              })}
            </div>
          </article>
        );
      })}
      <p className="category-hint">{t("categoryHint")}</p>
    </div>
  );
}
