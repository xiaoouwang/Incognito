export default function ModelProgress({ progressItems, modelReady }) {
  if (modelReady !== false && progressItems.length === 0) {
    return null;
  }

  return (
    <section className="panel model-progress-panel">
      <div className="panel-header">
        <h2>Model download</h2>
        <span>ONNX weights are cached in your browser after the first run</span>
      </div>
      <div className="model-progress-list">
        {modelReady === false && !progressItems.length ? (
          <p className="batch-output-note">Preparing Transformers.js pipeline…</p>
        ) : null}
        {progressItems.map((item) => {
          const percentage = item.progress ?? 0;
          return (
            <div className="model-progress-item" key={item.file || item.name}>
              <div className="model-progress-bar-track">
                <div
                  className="model-progress-bar-fill"
                  style={{ width: `${Math.min(100, percentage)}%` }}
                />
              </div>
              <span className="model-progress-label">
                {item.file || item.name} ({percentage.toFixed(1)}%)
              </span>
            </div>
          );
        })}
      </div>
    </section>
  );
}
