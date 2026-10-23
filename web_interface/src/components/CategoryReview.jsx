import { useUiLocale } from "../context/UiLocaleContext.jsx";
import {
  countEntitySpans,
  getCategoryChipClass,
  getEntityValueKey,
} from "../lib/entityUtils.js";

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
      {categories.map((category) => (
        <article className="category-card" key={category}>
          <label className="category-toggle">
            <input
              type="checkbox"
              checked={Boolean(selectedCategories[category])}
              onChange={() => onToggleCategory(category)}
            />
            <span>
              {t("replaceCategory")} {categoryLabels[category] || category}
              <small>{t("uniqueValues", { count: groupedEntities[category].length })}</small>
            </span>
          </label>
          <div className="entity-chips">
            {groupedEntities[category].map((entity, entityIndex) => {
              const occurrenceCount = countEntitySpans(entities, category, entity.text);
              const active =
                Boolean(selectedCategories[category]) &&
                !excludedEntityKeys[getEntityValueKey(category, entity.text)];

              return (
                <button
                  type="button"
                  className={`chip ${getCategoryChipClass(category)} ${active ? "chip-active" : "chip-inactive"}`}
                  key={entity.key || `${category}:${entity.text}:${entityIndex}`}
                  onClick={() => onToggleEntity(category, entity.text)}
                  title={active ? t("chipKeep") : t("chipInclude")}
                >
                  <span className="chip-label">{entity.text}</span>
                  <span className="chip-count">{occurrenceCount}</span>
                </button>
              );
            })}
          </div>
        </article>
      ))}
      <p className="category-hint">{t("categoryHint")}</p>
    </div>
  );
}
