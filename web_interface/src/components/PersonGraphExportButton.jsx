import { useUiLocale } from "../context/UiLocaleContext.jsx";
import {
  downloadPersonGraphByPersonCsv,
  downloadPersonGraphCsv,
} from "../lib/personGraphCsv.js";

export default function PersonGraphExportButton({
  persons = [],
  excludedPlaceholders = {},
  excludedSurfaces = {},
  onExported,
}) {
  const { t } = useUiLocale();
  const disabled = !persons.length;
  const options = { excludedPlaceholders, excludedSurfaces };

  return (
    <div className="person-graph-export-group">
      <button
        type="button"
        className="secondary person-graph-export"
        disabled={disabled}
        onClick={() => {
          downloadPersonGraphCsv(persons, options);
          onExported?.("edges");
        }}
      >
        {t("personGraphExportCsv")}
      </button>
      <button
        type="button"
        className="secondary person-graph-export"
        disabled={disabled}
        title={t("personGraphExportByPersonHint")}
        onClick={() => {
          downloadPersonGraphByPersonCsv(persons, options);
          onExported?.("byPerson");
        }}
      >
        {t("personGraphExportByPerson")}
      </button>
    </div>
  );
}
