function resolveProgressPercent(item) {
  if (typeof item.progress === "number" && Number.isFinite(item.progress)) {
    if (item.progress > 0 && item.progress <= 1) {
      return item.progress * 100;
    }
    return Math.min(100, Math.max(0, item.progress));
  }

  if (item.loaded && item.total) {
    return Math.min(100, Math.max(0, (item.loaded / item.total) * 100));
  }

  return 0;
}

function progressFileLabel(item) {
  if (item.name) {
    return item.name;
  }

  if (item.file) {
    const parts = String(item.file).split("/");
    return parts[parts.length - 1] || item.file;
  }

  return "Model file";
}

export default function ModelProgress({ progressItems, modelReady }) {
  if (modelReady !== false && progressItems.length === 0) {
    return null;
  }

  const fileProgress = progressItems.map((item) => ({
    ...item,
    percent: resolveProgressPercent(item),
    label: progressFileLabel(item),
  }));

  const overallPercent = fileProgress.length
    ? fileProgress.reduce((sum, item) => sum + item.percent, 0) / fileProgress.length
    : null;

  const isIndeterminate = overallPercent === null;

  return (
    <section className="panel model-progress-panel" aria-live="polite" aria-busy="true">
      <div className="model-progress-summary">
        <div className="model-progress-summary-header">
          <div>
            <h2>Downloading model</h2>
            <p className="model-progress-summary-note">
              ONNX weights are cached in your browser after the first run.
            </p>
          </div>
          <div className="model-progress-overall-value" aria-hidden="true">
            {isIndeterminate ? "…" : `${Math.round(overallPercent)}%`}
          </div>
        </div>

        <div
          className={`model-progress-bar-track model-progress-bar-track-lg${isIndeterminate ? " is-indeterminate" : ""}`}
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={isIndeterminate ? undefined : Math.round(overallPercent)}
          aria-label="Overall model download progress"
        >
          {!isIndeterminate ? (
            <div
              className="model-progress-bar-fill"
              style={{ width: `${Math.max(2, overallPercent)}%` }}
            />
          ) : (
            <div className="model-progress-bar-indeterminate" />
          )}
        </div>
      </div>

      {fileProgress.length ? (
        <div className="model-progress-list">
          {fileProgress.map((item) => (
            <div className="model-progress-item" key={item.file || item.name}>
              <div className="model-progress-item-header">
                <span className="model-progress-label">{item.label}</span>
                <span className="model-progress-percent">{Math.round(item.percent)}%</span>
              </div>
              <div
                className="model-progress-bar-track"
                role="progressbar"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={Math.round(item.percent)}
                aria-label={`${item.label} download progress`}
              >
                <div
                  className="model-progress-bar-fill"
                  style={{ width: `${Math.max(item.percent > 0 ? 2 : 0, item.percent)}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p className="model-progress-preparing">Preparing Transformers.js pipeline…</p>
      )}
    </section>
  );
}
