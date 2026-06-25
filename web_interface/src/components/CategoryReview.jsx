import {
  countEntitySpans,
  getCategoryChipClass,
  getEntityValueKey,
  isEntityActive,
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
  const categories = Object.keys(groupedEntities);

  if (!categories.length) {
    return (
      <div className="empty-state">
        Run NER or add entities manually in the highlighted view below.
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
              onChange={() => onToggleCategory(category)}
            />
            <span>
              Replace {categoryLabels[category] || category}
              <small>{groupedEntities[category].length} unique value(s)</small>
            </span>
          </label>
          <div className="entity-chips">
            {groupedEntities[category].map((entity) => {
              const occurrenceCount = countEntitySpans(entities, category, entity.text);
              const active =
                Boolean(selectedCategories[category]) &&
                !excludedEntityKeys[getEntityValueKey(category, entity.text)];

              return (
                <button
                  type="button"
                  className={`chip ${getCategoryChipClass(category)} ${active ? "chip-active" : "chip-inactive"}`}
                  key={entity.key}
                  onClick={() => onToggleEntity(category, entity.text)}
                  title={
                    active
                      ? "Click to keep this value unchanged in the output"
                      : "Click to include this value in anonymization again"
                  }
                >
                  <span className="chip-label">{entity.text}</span>
                  <span className="chip-count">{occurrenceCount}</span>
                </button>
              );
            })}
          </div>
        </article>
      ))}
      <p className="category-hint">Click an entity to toggle all of its occurrences in the output.</p>
    </div>
  );
}
