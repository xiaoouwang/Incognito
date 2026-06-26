import { buildGlinerHighlightSegments, getGlinerLabelHighlightClass } from "../lib/glinerUtils.js";

export default function GlinerHighlightPreview({ text, entities, emptyLabel }) {
  if (!text) {
    return <p className="gliner-empty-state">{emptyLabel}</p>;
  }

  if (!entities.length) {
    return <p className="gliner-empty-state">{emptyLabel}</p>;
  }

  const segments = buildGlinerHighlightSegments(text, entities);

  return (
    <div className="highlighted-text gliner-highlight-preview">
      {segments.map((segment, index) =>
        segment.entity ? (
          <mark
            className={`highlight selected ${getGlinerLabelHighlightClass(segment.entity.label)}`}
            data-start={segment.start}
            data-end={segment.end}
            title={`${segment.entity.label} · ${Math.round(segment.entity.score * 100)}%`}
            key={`${segment.entity.label}-${segment.start}-${index}`}
          >
            {segment.text}
          </mark>
        ) : (
          <span data-start={segment.start} data-end={segment.end} key={`plain-${segment.start}-${index}`}>
            {segment.text}
          </span>
        ),
      )}
    </div>
  );
}
