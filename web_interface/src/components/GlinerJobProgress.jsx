import { useUiLocale } from "../context/UiLocaleContext.jsx";

function formatBytes(value) {
  if (!value || !Number.isFinite(value)) {
    return null;
  }

  if (value < 1024) {
    return `${value} B`;
  }

  if (value < 1024 * 1024) {
    return `${(value / 1024).toFixed(1)} KB`;
  }

  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}

function phaseLabel(t, phase) {
  switch (phase) {
    case "prepare":
      return t("glinerProgressPrepare");
    case "load-module":
      return t("glinerProgressLoadModule");
    case "download-onnx":
      return t("glinerProgressDownload");
    case "load-tokenizer":
      return t("glinerProgressTokenizer");
    case "init-runtime":
      return t("glinerProgressInit");
    case "detect":
      return t("glinerProgressDetect");
    default:
      return t("glinerProgressWorking");
  }
}

function phaseDetail(t, jobProgress) {
  if (jobProgress.phase === "download-onnx") {
    if (jobProgress.fromCache) {
      const total = formatBytes(jobProgress.total);
      return total
        ? t("glinerProgressDownloadCached", { file: jobProgress.detail || "model.onnx", total })
        : t("glinerProgressDownloadCachedUnknown", { file: jobProgress.detail || "model.onnx" });
    }

    const loaded = formatBytes(jobProgress.loaded);
    const total = formatBytes(jobProgress.total);
    if (loaded && total) {
      return t("glinerProgressDownloadDetail", { file: jobProgress.detail || "model.onnx", loaded, total });
    }
    return t("glinerProgressDownloadDetailUnknown", { file: jobProgress.detail || "model.onnx" });
  }

  if (jobProgress.phase === "detect" && jobProgress.current && jobProgress.total) {
    return t("glinerProgressDetectDetail", {
      current: jobProgress.current,
      total: jobProgress.total,
    });
  }

  if (jobProgress.detail === "gliner") {
    return t("glinerProgressLoadModuleDetail");
  }

  if (jobProgress.detail === "tokenizer") {
    return t("glinerProgressTokenizerDetail");
  }

  if (jobProgress.detail === "onnxruntime-wasm") {
    return t("glinerProgressInitDetail");
  }

  return null;
}

export default function GlinerJobProgress({ jobProgress }) {
  const { t } = useUiLocale();

  if (!jobProgress) {
    return null;
  }

  const percent = Math.min(100, Math.max(0, jobProgress.overallPercent ?? 0));
  const indeterminate = Boolean(jobProgress.indeterminate) && percent < 100;
  const detail = phaseDetail(t, jobProgress);

  return (
    <section className="panel model-progress-panel gliner-job-progress" aria-live="polite" aria-busy="true">
      <div className="model-progress-summary">
        <div className="model-progress-summary-header">
          <div>
            <h2>{phaseLabel(t, jobProgress.phase)}</h2>
            {detail ? <p className="model-progress-summary-note">{detail}</p> : null}
          </div>
          <div className="model-progress-overall-value" aria-hidden="true">
            {indeterminate ? "…" : `${percent}%`}
          </div>
        </div>

        <div
          className={`model-progress-bar-track model-progress-bar-track-lg${indeterminate ? " is-indeterminate" : ""}`}
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={indeterminate ? undefined : percent}
          aria-label={phaseLabel(t, jobProgress.phase)}
        >
          {!indeterminate ? (
            <div className="model-progress-bar-fill" style={{ width: `${Math.max(2, percent)}%` }} />
          ) : (
            <div className="model-progress-bar-indeterminate" />
          )}
        </div>
      </div>
    </section>
  );
}
