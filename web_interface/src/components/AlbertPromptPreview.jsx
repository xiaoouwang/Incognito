/**
 * Live Albert chat prompt preview (system + user) for Advanced generative mode.
 */
export default function AlbertPromptPreview({
  title,
  hint = "",
  systemPrompt = "",
  userPrompt = "",
  systemOpen = false,
  userOpen = true,
}) {
  return (
    <div className="gen-prompt-preview">
      <div className="gen-prompt-preview-header">
        <strong>{title}</strong>
        {hint ? <span>{hint}</span> : null}
      </div>
      <details className="gen-prompt-block" open={systemOpen}>
        <summary>system</summary>
        <pre className="gen-prompt-pre" translate="no">
          {systemPrompt || "—"}
        </pre>
      </details>
      <details className="gen-prompt-block" open={userOpen}>
        <summary>user</summary>
        <pre className="gen-prompt-pre" translate="no">
          {userPrompt || "—"}
        </pre>
      </details>
    </div>
  );
}
