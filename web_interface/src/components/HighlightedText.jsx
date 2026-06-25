import { useRef } from "react";
import {
  getCategoryHighlightClass,
  getSelectionOffsets,
  isEntityActive,
} from "../lib/entityUtils.js";

export default function HighlightedText({
  text,
  segments,
  categoryLabels,
  selectedCategories,
  excludedEntityKeys,
  onAddSelection,
  onEntityClick,
}) {
  const containerRef = useRef(null);

  if (!text) {
    return <div className="empty-state">Paste text and run detection to highlight entities.</div>;
  }

  const displaySegments =
    segments.length > 0 ? segments : [{ text, start: 0, end: text.length }];

  function handleMouseUp(event) {
    if (event.target.closest(".highlight")) return;

    const container = containerRef.current;
    const selection = getSelectionOffsets(container, text);
    if (!selection || !selection.text.trim()) return;

    onAddSelection({
      ...selection,
      x: event.clientX,
      y: event.clientY,
    });
    window.getSelection()?.removeAllRanges();
  }

  return (
    <div
      className="highlighted-text interactive-highlight"
      ref={containerRef}
      onMouseUp={handleMouseUp}
    >
      {displaySegments.map((segment, index) =>
        segment.entity ? (
          <mark
            className={`highlight ${getCategoryHighlightClass(segment.entity.label)} ${
              isEntityActive(segment.entity, selectedCategories, excludedEntityKeys)
                ? "selected"
                : "ignored"
            }`}
            data-start={segment.start}
            data-end={segment.end}
            title={`${categoryLabels[segment.entity.label] || segment.entity.label}: click to remove`}
            key={`${segment.entity.id || segment.start}-${index}`}
            onClick={(event) => {
              event.stopPropagation();
              onEntityClick(segment.entity, { x: event.clientX, y: event.clientY });
            }}
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
