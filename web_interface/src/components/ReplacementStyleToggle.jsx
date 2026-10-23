import { useUiLocale } from "../context/UiLocaleContext.jsx";

export default function ReplacementStyleToggle({ value, onChange, disabled = false }) {
  const { t } = useUiLocale();

  return (
    <div className="replacement-style-toggle" role="group" aria-label={t("replacementStyleLabel")}>
      <button
        type="button"
        className={value === "pseudonym" ? "is-active" : "secondary"}
        aria-pressed={value === "pseudonym"}
        disabled={disabled}
        onClick={() => onChange("pseudonym")}
      >
        {t("replacementStylePseudonym")}
      </button>
      <button
        type="button"
        className={value === "placeholder" ? "is-active" : "secondary"}
        aria-pressed={value === "placeholder"}
        disabled={disabled}
        onClick={() => onChange("placeholder")}
      >
        {t("replacementStylePlaceholder")}
      </button>
    </div>
  );
}
