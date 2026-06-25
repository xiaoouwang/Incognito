const PHASE_LABELS = {
  loading: "Loading documents",
  detecting: "Detecting entities in batch",
};

export default function BatchJobProgress({ progress }) {
  if (!progress) {
    return null;
  }

  const total = progress.total || 0;
  const current = progress.current || 0;
  const percent = total > 0 ? Math.min(100, (current / total) * 100) : null;
  const isIndeterminate = percent === null;
  const title = PHASE_LABELS[progress.phase] || "Processing batch";

  return (
    <section className="panel model-progress-panel batch-job-progress-panel" aria-live="polite" aria-busy="true">
      <div className="model-progress-summary">
        <div className="model-progress-summary-header">
          <div>
            <h2>{title}</h2>
            <p className="model-progress-summary-note">
              {progress.fileName
                ? `Current file: ${progress.fileName}`
                : "Preparing your selected documents…"}
            </p>
          </div>
          <div className="model-progress-overall-value" aria-hidden="true">
            {isIndeterminate ? "…" : `${Math.round(percent)}%`}
          </div>
        </div>

        <div
          className={`model-progress-bar-track model-progress-bar-track-lg${isIndeterminate ? " is-indeterminate" : ""}`}
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={isIndeterminate ? undefined : Math.round(percent)}
          aria-label={`${title} progress`}
        >
          {!isIndeterminate ? (
            <div
              className="model-progress-bar-fill"
              style={{ width: `${Math.max(2, percent)}%` }}
            />
          ) : (
            <div className="model-progress-bar-indeterminate" />
          )}
        </div>

        {total > 0 ? (
          <p className="batch-job-progress-count">
            File {Math.min(current, total)} of {total}
          </p>
        ) : null}
      </div>
    </section>
  );
}
