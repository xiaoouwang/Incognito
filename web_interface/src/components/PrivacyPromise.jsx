import { useUiLocale } from "../context/UiLocaleContext.jsx";
import packageJson from "../../package.json";

const APP_VERSION = packageJson.version;

export function PrivacyDetailsLink({ onOpen }) {
  const { t } = useUiLocale();

  return (
    <button type="button" className="privacy-details-link" onClick={onOpen}>
      {t("privacyDetailsLink")}
    </button>
  );
}

export function PrivacyPromise({ className = "version-announcement" }) {
  return (
    <p className={className}>
      <span className="version-announcement-badge" aria-hidden="true">
        ✨ v{APP_VERSION}
      </span>
    </p>
  );
}
