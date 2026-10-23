import PersonGraphCard from "./PersonGraphCard.jsx";
import PersonGraphExportButton from "./PersonGraphExportButton.jsx";
import PersonGraphViewButton from "./PersonGraphViewButton.jsx";
import { useUiLocale } from "../context/UiLocaleContext.jsx";

/**
 * Person graph for the anonymized preview (surfaces already replaced).
 * Values are editable and sync back into the anonymized text via custom overrides.
 */
export default function AnonymizedPersonGraphPanel({
  persons = [],
  excludedPlaceholders = {},
  excludedSurfaces = {},
  onExported,
  onHide,
  onRenameEdgeValue,
}) {
  const { t } = useUiLocale();

  return (
    <div className="panel workspace-graph workspace-graph-anonymized">
      <div className="panel-header">
        <h2>{t("anonymizedPersonGraphTitle")}</h2>
        <div className="panel-header-actions">
          {typeof onHide === "function" ? (
            <button
              type="button"
              className="secondary person-graph-export"
              onClick={onHide}
              title={t("anonymizedPersonGraphHide")}
            >
              {t("anonymizedPersonGraphHide")}
            </button>
          ) : null}
          <PersonGraphViewButton
            persons={persons}
            excludedPlaceholders={excludedPlaceholders}
            excludedSurfaces={excludedSurfaces}
            title={t("personGraphViewWindowTitleAnonymized")}
            subtitle={t("personGraphViewWindowSubtitle", { count: persons.length })}
          />
          <PersonGraphExportButton
            persons={persons}
            excludedPlaceholders={excludedPlaceholders}
            excludedSurfaces={excludedSurfaces}
            onExported={onExported}
          />
        </div>
        <span>{t("anonymizedPersonGraphHint", { count: persons.length })}</span>
      </div>
      <div className="workspace-graph-body">
        {persons.length ? (
          <div className="gen-graph-list gen-graph-list-sidebar">
            {persons.map((person, personIndex) => (
              <PersonGraphCard
                key={`anon-${person.placeholder}-${person.name}-${personIndex}`}
                person={person}
                persons={persons}
                excluded={Boolean(excludedPlaceholders[person.placeholder])}
                excludedSurfaces={excludedSurfaces}
                onRenameEdgeValue={onRenameEdgeValue}
              />
            ))}
          </div>
        ) : (
          <p className="gen-maps-empty">{t("anonymizedPersonGraphEmpty")}</p>
        )}
        <p className="category-hint">{t("anonymizedPersonGraphEditHint")}</p>
        <p className="category-hint">{t("anonymizedPersonGraphExportHint")}</p>
      </div>
    </div>
  );
}
