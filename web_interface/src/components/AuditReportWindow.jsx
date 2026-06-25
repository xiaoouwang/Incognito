export default function AuditReportWindow({ report, onClose, onCopy, onDownload }) {
  return (
    <div className="report-backdrop" role="presentation">
      <section className="report-window" role="dialog" aria-modal="true" aria-label="Audit report">
        <div className="report-header">
          <div>
            <p className="eyebrow">Research documentation</p>
            <h2>Audit Report</h2>
          </div>
          <div className="report-actions">
            <button onClick={onCopy}>Copy report</button>
            <button onClick={onDownload}>Download .md</button>
            <button className="secondary" onClick={onClose}>
              Close
            </button>
          </div>
        </div>
        <pre className="report-body">{report}</pre>
      </section>
    </div>
  );
}
