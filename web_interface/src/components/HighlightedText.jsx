import { forwardRef, memo, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import PersonFocusChips from "./PersonFocusChips.jsx";
import {
  getCategoryHighlightClass,
  getSelectionOffsets,
  isEntityActive,
} from "../lib/entityUtils.js";
import { rangeOverlaps, splitRangeByFocus } from "../lib/personFocus.js";

const TOOLTIP_SHOW_DELAY_MS = 120;

const DENSE_SEGMENT_THRESHOLD = 120;

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

function findEntityAt(segments, start, end) {
  for (const segment of segments) {
    if (segment.entity && segment.start === start && segment.end === end) {
      return segment.entity;
    }
  }
  return null;
}

/**
 * Group flat segments into line rows so each row can use content-visibility
 * and avoid laying out off-screen marks while scrolling long interviews.
 */
function groupSegmentsIntoLines(segments, text, focusRanges) {
  const lines = [];
  let current = [];

  function pushLine() {
    if (current.length) {
      lines.push(current);
      current = [];
    }
  }

  for (const segment of segments) {
    if (segment.entity) {
      current.push({ kind: "entity", segment });
      continue;
    }

    const pieces = splitRangeByFocus(segment.start, segment.end, focusRanges);
    for (const piece of pieces) {
      const pieceText = text.slice(piece.start, piece.end);
      if (!pieceText) {
        continue;
      }
      let offset = piece.start;
      // Accept LF, CRLF, and classic Mac CR so loaded .txt files keep line rows.
      const parts = pieceText.split(/(\r\n|\n|\r)/);
      for (const part of parts) {
        if (!part) {
          continue;
        }
        if (part === "\n" || part === "\r" || part === "\r\n") {
          offset += part.length;
          // Block rows replace the newline; keep empty rows for blank lines.
          if (!current.length) {
            lines.push([]);
          } else {
            pushLine();
          }
          continue;
        }
        current.push({
          kind: "plain",
          start: offset,
          end: offset + part.length,
          text: part,
          focused: piece.focused,
        });
        offset += part.length;
      }
    }
  }

  pushLine();
  if (!lines.length) {
    lines.push([
      {
        kind: "plain",
        start: 0,
        end: text.length,
        text,
        focused: false,
      },
    ]);
  }
  return lines;
}

const HighlightedText = memo(
  forwardRef(function HighlightedText(
    {
      text,
      segments,
      categoryLabels,
      selectedCategories,
      excludedEntityKeys,
      placeholderHints = null,
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
    const tooltipTimerRef = useRef(null);
    const [hoverTip, setHoverTip] = useState(null);
    const [hoveredGroup, setHoveredGroup] = useState(null);
    const canEdit =
      interactive &&
      (typeof onAddSelection === "function" || typeof onEntityClick === "function");

    const displaySegments = useMemo(() => {
      if (!text) {
        return [];
      }
      return Array.isArray(segments) && segments.length > 0
        ? segments
        : [{ text, start: 0, end: text.length }];
    }, [text, segments]);

    const lines = useMemo(
      () => (text ? groupSegmentsIntoLines(displaySegments, text, focusRanges) : []),
      [text, displaySegments, focusRanges],
    );

    useEffect(() => {
      return () => {
        if (tooltipTimerRef.current) {
          window.clearTimeout(tooltipTimerRef.current);
        }
      };
    }, []);

    if (!text) {
      return (
        <div className="empty-state" ref={forwardedRef} translate="no">
          Paste text and run detection to highlight entities.
        </div>
      );
    }

    const hasFocus = focusRanges.length > 0;
    const showChips = persons.length > 0 && typeof onPinPerson === "function";
    const dense = displaySegments.length >= DENSE_SEGMENT_THRESHOLD;

    function clearHoverTip() {
      if (tooltipTimerRef.current) {
        window.clearTimeout(tooltipTimerRef.current);
        tooltipTimerRef.current = null;
      }
      setHoverTip(null);
    }

    function clearHoverState() {
      clearHoverTip();
      setHoveredGroup(null);
    }

    function handleMouseOver(event) {
      const mark = event.target.closest?.("mark.highlight");
      if (!mark || !containerRef.current?.contains(mark)) {
        return;
      }
      if (event.relatedTarget && mark.contains(event.relatedTarget)) {
        return;
      }
      const group = mark.getAttribute("data-hover-group");
      if (group) {
        setHoveredGroup(group);
      }
      const tip = mark.getAttribute("data-tooltip");
      if (!tip) {
        return;
      }
      if (tooltipTimerRef.current) {
        window.clearTimeout(tooltipTimerRef.current);
      }
      const rect = mark.getBoundingClientRect();
      tooltipTimerRef.current = window.setTimeout(() => {
        setHoverTip({
          text: tip,
          x: rect.left + rect.width / 2,
          y: rect.bottom,
        });
      }, TOOLTIP_SHOW_DELAY_MS);
    }

    function handleMouseOut(event) {
      const mark = event.target.closest?.("mark.highlight");
      if (!mark || !containerRef.current?.contains(mark)) {
        return;
      }
      if (event.relatedTarget && mark.contains(event.relatedTarget)) {
        return;
      }
      // Leaving one mark for another matching mark keeps the group lit.
      const nextMark = event.relatedTarget?.closest?.("mark.highlight");
      if (
        nextMark &&
        containerRef.current?.contains(nextMark) &&
        nextMark.getAttribute("data-hover-group") === mark.getAttribute("data-hover-group")
      ) {
        clearHoverTip();
        return;
      }
      clearHoverState();
    }

    function handleMouseUp(event) {
      if (!canEdit || typeof onAddSelection !== "function") return;
      if (event.target.closest(".highlight")) return;

      const container = containerRef.current;
      const selection = getSelectionOffsets(container, text);
      if (!selection || !selection.text.trim()) return;

      clearHoverState();
      onAddSelection({
        ...selection,
        x: event.clientX,
        y: event.clientY,
      });
      window.getSelection()?.removeAllRanges();
    }

    function handleClick(event) {
      if (!canEdit || typeof onEntityClick !== "function") {
        return;
      }
      const mark = event.target.closest("mark.highlight");
      if (!mark || !containerRef.current?.contains(mark)) {
        return;
      }
      event.stopPropagation();
      clearHoverState();
      const start = Number(mark.dataset.start);
      const end = Number(mark.dataset.end);
      if (!Number.isFinite(start) || !Number.isFinite(end)) {
        return;
      }
      const entity = findEntityAt(displaySegments, start, end);
      if (!entity) {
        return;
      }
      onEntityClick(entity, { x: event.clientX, y: event.clientY }, { start, end, text: mark.textContent });
    }

    const tooltipNode =
      hoverTip && typeof document !== "undefined"
        ? createPortal(
            <div
              className="highlight-tooltip"
              style={{ left: hoverTip.x, top: hoverTip.y }}
              role="tooltip"
            >
              {hoverTip.text}
            </div>,
            document.body,
          )
        : null;

    const textPanel = (
      <div
        className={`highlighted-text${canEdit ? " interactive-highlight" : ""}${
          hasFocus ? " has-person-focus" : ""
        }${dense ? " dense-highlights" : ""}${hoveredGroup ? " has-value-hover" : ""}`}
        ref={mergeRefs(containerRef, forwardedRef)}
        translate="no"
        onMouseOver={handleMouseOver}
        onMouseOut={handleMouseOut}
        onMouseUp={canEdit ? handleMouseUp : undefined}
        onClick={canEdit && typeof onEntityClick === "function" ? handleClick : undefined}
      >
        {lines.map((line, lineIndex) => (
          <div className="highlight-line" key={`line-${lineIndex}`}>
            {line.map((item, itemIndex) => {
              if (item.kind === "entity") {
                const { segment } = item;
                const focused = rangeOverlaps(segment.start, segment.end, focusRanges);
                const label = categoryLabels[segment.entity.label] || segment.entity.label;
                const active = isEntityActive(
                  segment.entity,
                  selectedCategories,
                  excludedEntityKeys,
                );
                const hint =
                  (typeof placeholderHints?.get === "function"
                    ? placeholderHints.get(segment.entity)
                    : null) || label;
                const hoverGroup = hint;
                const isValueHovered = Boolean(hoveredGroup) && hoveredGroup === hoverGroup;
                return (
                  <mark
                    className={`highlight ${getHighlightClass(segment.entity.label)} ${
                      active ? "selected" : "ignored"
                    }${focused ? " person-focus-underline" : ""}${
                      isValueHovered ? " value-hover" : ""
                    }`}
                    data-start={segment.start}
                    data-end={segment.end}
                    data-hover-group={hoverGroup}
                    data-tooltip={hint}
                    aria-label={hint}
                    key={`e-${segment.entity.id || segment.start}-${itemIndex}`}
                  >
                    {segment.text}
                  </mark>
                );
              }

              return (
                <span
                  data-start={item.start}
                  data-end={item.end}
                  className={item.focused ? "person-focus-underline" : undefined}
                  key={`p-${item.start}-${itemIndex}`}
                >
                  {item.text}
                </span>
              );
            })}
            {/* Keep \n in the DOM for selection offsets without adding a visual blank line. */}
            {lineIndex < lines.length - 1 ? (
              <span className="highlight-line-break" aria-hidden="true">
                {"\n"}
              </span>
            ) : null}
          </div>
        ))}
        {tooltipNode}
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
  }),
);

export default HighlightedText;
