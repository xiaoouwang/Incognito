import { useUiLocale } from "../context/UiLocaleContext.jsx";

export function PrivacyDetailsLink({ onOpen }) {
  const { t } = useUiLocale();

  return (
    <button type="button" className="privacy-details-link" onClick={onOpen}>
      {t("privacyDetailsLink")}
    </button>
  );
}

export function PrivacyPromise({ className = "version-announcement" }) {
  const { t } = useUiLocale();

  return (
    <p className={className}>
      <span className="version-announcement-badge" aria-hidden="true">
        ✨ v{t("versionNumber")}
      </span>
      <span className="version-announcement-text">
        🎯 {t("versionFeatureLead")}{" "}
        <strong>{t("versionFeatureHighlight")}</strong>
      </span>
    </p>
  );
}
