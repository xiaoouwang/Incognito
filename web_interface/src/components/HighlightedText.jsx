import { forwardRef, useRef } from "react";
import PersonFocusChips from "./PersonFocusChips.jsx";
import {
  getCategoryHighlightClass,
  getSelectionOffsets,
  isEntityActive,
} from "../lib/entityUtils.js";
import { rangeOverlaps, splitRangeByFocus } from "../lib/personFocus.js";

function mergeRefs(...refs) {
  return (node) => {
    for (const ref of refs) {
      if (typeof ref === "function") {
        ref(node);
      } else if (ref) {
        ref.current = node;
      }
    }
  };
}

const HighlightedText = forwardRef(function HighlightedText(
  {
    text,
    segments,
    categoryLabels,
    selectedCategories,
    excludedEntityKeys,
    focusRanges = [],
    persons = [],
    pinnedPlaceholder = null,
    onPinPerson,
    onAddSelection,
    onEntityClick,
    interactive = true,
    getHighlightClass = getCategoryHighlightClass,
  },
  forwardedRef,
) {
  const containerRef = useRef(null);
  const canEdit = interactive && (typeof onAddSelection === "function" || typeof onEntityClick === "function");

  if (!text) {
    return (
      <div className="empty-state" ref={forwardedRef} translate="no">
        Paste text and run detection to highlight entities.
      </div>
    );
  }

  const displaySegments =
    Array.isArray(segments) && segments.length > 0
      ? segments
      : [{ text, start: 0, end: text.length }];
  const hasFocus = focusRanges.length > 0;
  const showChips = persons.length > 0 && typeof onPinPerson === "function";

  function handleMouseUp(event) {
    if (!canEdit || typeof onAddSelection !== "function") return;
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

  const textPanel = (
    <div
      className={`highlighted-text${canEdit ? " interactive-highlight" : ""}${hasFocus ? " has-person-focus" : ""}`}
      ref={mergeRefs(containerRef, forwardedRef)}
      translate="no"
      onMouseUp={canEdit ? handleMouseUp : undefined}
    >
      {displaySegments.flatMap((segment, index) => {
        if (segment.entity) {
          const focused = rangeOverlaps(segment.start, segment.end, focusRanges);
          const label = categoryLabels[segment.entity.label] || segment.entity.label;
          return [
            <mark
              className={`highlight ${getHighlightClass(segment.entity.label)} ${
                isEntityActive(segment.entity, selectedCategories, excludedEntityKeys)
                  ? "selected"
                  : "ignored"
              }${focused ? " person-focus-underline" : ""}`}
              data-start={segment.start}
              data-end={segment.end}
              title={
                canEdit
                  ? typeof onAddSelection === "function"
                    ? `${label}: click to remove`
                    : `${label}: click to edit`
                  : label
              }
              key={`${segment.entity.id || segment.start}-${index}`}
              onClick={
                canEdit && typeof onEntityClick === "function"
                  ? (event) => {
                      event.stopPropagation();
                      onEntityClick(segment.entity, { x: event.clientX, y: event.clientY }, segment);
                    }
                  : undefined
              }
            >
              {segment.text}
            </mark>,
          ];
        }

        return splitRangeByFocus(segment.start, segment.end, focusRanges).map((piece, pieceIndex) => {
          const pieceText = text.slice(piece.start, piece.end);
          if (!pieceText) {
            return null;
          }
          return (
            <span
              data-start={piece.start}
              data-end={piece.end}
              className={piece.focused ? "person-focus-underline" : undefined}
              key={`plain-${piece.start}-${index}-${pieceIndex}`}
            >
              {pieceText}
            </span>
          );
        });
      })}
    </div>
  );

  if (!showChips) {
    return textPanel;
  }

  return (
    <div className="highlighted-text-shell" translate="no">
      <PersonFocusChips
        persons={persons}
        pinnedPlaceholder={pinnedPlaceholder}
        onPinPerson={onPinPerson}
      />
      {textPanel}
    </div>
  );
});

export default HighlightedText;
