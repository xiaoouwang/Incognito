import { useUiLocale } from "../context/UiLocaleContext.jsx";

export default function AuditReportWindow({
  report,
  busy = false,
  onClose,
  onCopy,
  onDownload,
}) {
  const { t } = useUiLocale();
  const ready = Boolean(report) && !busy;

  return (
    <div className="report-backdrop" role="presentation">
      <section className="report-window" role="dialog" aria-modal="true" aria-label="Audit report">
        <div className="report-header">
          <div>
            <p className="eyebrow">{t("auditEyebrow")}</p>
            <h2>{t("auditTitle")}</h2>
          </div>
          <div className="report-actions">
            <button onClick={onCopy} disabled={!ready}>
              {t("auditCopy")}
            </button>
            <button onClick={onDownload} disabled={!ready}>
              {t("auditDownload")}
            </button>
            <button className="secondary" onClick={onClose}>
              {t("close")}
            </button>
          </div>
        </div>
        {busy || !report ? (
          <p className="report-body report-body-status" role="status">
            {t("auditBuilding")}
          </p>
        ) : (
          <textarea
            className="report-body report-body-text"
            readOnly
            value={report}
            spellCheck={false}
            aria-label={t("auditTitle")}
          />
        )}
      </section>
    </div>
  );
}
