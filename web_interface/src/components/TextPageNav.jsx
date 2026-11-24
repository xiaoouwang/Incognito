import { useUiLocale } from "../context/UiLocaleContext.jsx";

/**
 * Compact prev / next pager for long-text review pages.
 */
export default function TextPageNav({
  pageIndex = 0,
  pageCount = 1,
  onPageChange,
  disabled = false,
  className = "",
}) {
  const { t } = useUiLocale();
  if (pageCount <= 1) {
    return null;
  }

  const safeIndex = Math.min(Math.max(0, pageIndex), pageCount - 1);
  const atStart = safeIndex <= 0;
  const atEnd = safeIndex >= pageCount - 1;

  return (
    <div className={`text-page-nav ${className}`.trim()} role="navigation" aria-label={t("textPageNavLabel")}>
      <button
        type="button"
        className="text-page-nav-btn"
        disabled={disabled || atStart}
        aria-label={t("textPagePrevious")}
        title={t("textPagePrevious")}
        onClick={() => onPageChange?.(safeIndex - 1)}
      >
        ←
      </button>
      <span className="text-page-nav-status">
        {t("textPageStatus", { current: safeIndex + 1, total: pageCount })}
      </span>
      <button
        type="button"
        className="text-page-nav-btn"
        disabled={disabled || atEnd}
        aria-label={t("textPageNext")}
        title={t("textPageNext")}
        onClick={() => onPageChange?.(safeIndex + 1)}
      >
        →
      </button>
    </div>
  );
}
