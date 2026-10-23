import { lazy, Suspense, useState } from "react";
import { useUiLocale } from "../context/UiLocaleContext.jsx";

const PersonGraphForceModal = lazy(() => import("./PersonGraphForceModal.jsx"));

/**
 * Opens an interactive person-graph overlay (react-force-graph-2d).
 */
export default function PersonGraphViewButton({
  persons = [],
  excludedPlaceholders = {},
  excludedSurfaces = {},
  title,
  subtitle,
  className = "secondary person-graph-export",
  onEmpty,
}) {
  const { t } = useUiLocale();
  const [open, setOpen] = useState(false);
  const [notice, setNotice] = useState("");

  const resolvedTitle = title || t("personGraphViewWindowTitle");
  const resolvedSubtitle =
    subtitle || t("personGraphViewWindowSubtitle", { count: persons.length });

  function handleOpen() {
    if (!persons.length) {
      const message = t("personGraphViewEmpty");
      setNotice(message);
      onEmpty?.(message);
      return;
    }
    setNotice("");
    setOpen(true);
  }

  return (
    <>
      <button
        type="button"
        className={className}
        title={persons.length ? t("personGraphViewHint") : t("personGraphViewEmpty")}
        onClick={handleOpen}
      >
        {t("personGraphView")}
      </button>
      {notice ? (
        <span className="person-graph-popup-blocked" role="status">
          {notice}
        </span>
      ) : null}
      {open ? (
        <Suspense fallback={null}>
          <PersonGraphForceModal
            open
            onClose={() => setOpen(false)}
            persons={persons}
            excludedPlaceholders={excludedPlaceholders}
            excludedSurfaces={excludedSurfaces}
            title={resolvedTitle}
            subtitle={resolvedSubtitle}
          />
        </Suspense>
      ) : null}
    </>
  );
}
