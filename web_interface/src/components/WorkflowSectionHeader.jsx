const STEP_EMOJIS = ["🕵️‍♂️", "👀", "📄"];

export default function WorkflowSectionHeader({
  eyebrow,
  title,
  description,
  steps,
  badge = null,
  badgeClassName = "",
  id,
}) {
  return (
    <div className="workflow-section-header">
      <div>
        {eyebrow ? <p className="workflow-eyebrow">{eyebrow}</p> : null}
        <h2 id={id}>{title}</h2>
        {steps?.length ? (
          <p className="workflow-description">
            {steps.map((step, index) => (
              <span key={step}>
                {index > 0 ? <br /> : null}
                {STEP_EMOJIS[index]} {step}
              </span>
            ))}
          </p>
        ) : description ? (
          <p className="workflow-description">{description}</p>
        ) : null}
      </div>
      {badge ? <span className={`workflow-badge ${badgeClassName}`.trim()}>{badge}</span> : null}
    </div>
  );
}
