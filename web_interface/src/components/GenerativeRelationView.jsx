import { forwardRef, useEffect, useMemo, useRef, useState } from "react";
import { buildGenerativeHighlightModel } from "../lib/albertHighlight.js";
import { getSelectionOffsets } from "../lib/entityUtils.js";

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

const GenerativeRelationView = forwardRef(function GenerativeRelationView(
  {
    text,
    persons,
    excludedPlaceholders = {},
    excludedSurfaces = {},
    emptyLabel,
    editLabel,
    onRequestEdit,
    onAddSelection,
    onEntityClick,
  },
  forwardedRef,
) {
  const textRef = useRef(null);
  const [pinnedPerson, setPinnedPerson] = useState(null);
  const [hoveredPerson, setHoveredPerson] = useState(null);
  const activePerson = pinnedPerson ?? hoveredPerson;
  const model = useMemo(
    () =>
      buildGenerativeHighlightModel(
        text,
        persons,
        excludedPlaceholders,
        excludedSurfaces,
      ),
    [text, persons, excludedPlaceholders, excludedSurfaces],
  );

  useEffect(() => {
    setPinnedPerson(null);
    setHoveredPerson(null);
  }, [text, persons]);

  useEffect(() => {
    if (
      pinnedPerson != null &&
      !model.personMeta.some((person) => person.index === pinnedPerson)
    ) {
      setPinnedPerson(null);
    }
  }, [model.personMeta, pinnedPerson]);

  function handleMouseUp(event) {
    if (!onAddSelection || event.target.closest(".gen-rel-mark")) {
      return;
    }
    const selection = getSelectionOffsets(textRef.current, text);
    if (!selection || !selection.text.trim()) {
      return;
    }
    onAddSelection({
      ...selection,
      x: event.clientX,
      y: event.clientY,
    });
    window.getSelection()?.removeAllRanges();
  }

  function handleChipClick(person) {
    setPinnedPerson((current) => (current === person.index ? null : person.index));
  }

  if (!text) {
    return (
      <div className="gen-board-empty" ref={forwardedRef}>
        {emptyLabel}
      </div>
    );
  }

  return (
    <div className="gen-rel-shell">
      <div className="gen-rel-toolbar">
        <span className="gen-rel-legend">
          {model.personMeta.map((person) => (
            <button
              type="button"
              key={person.placeholder || person.index}
              className={`gen-rel-chip gen-person-${person.colorIndex}${
                pinnedPerson === person.index ? " is-active" : ""
              }${person.excluded ? " is-excluded" : ""}`}
              onClick={() => handleChipClick(person)}
              title={
                pinnedPerson === person.index
                  ? `${person.placeholder} · click to clear focus`
                  : `${person.placeholder} · click to highlight related info`
              }
            >
              {person.name}
            </button>
          ))}
        </span>
        {onRequestEdit ? (
          <button type="button" className="secondary gen-rel-edit" onClick={onRequestEdit}>
            {editLabel || "Edit text"}
          </button>
        ) : null}
      </div>
      <div className="gen-rel-scroll" ref={mergeRefs(textRef, forwardedRef)}>
        <div className="gen-rel-text interactive-highlight" onMouseUp={handleMouseUp}>
          {model.segments.map((segment, index) => {
            if (!segment.entity) {
              return <span key={`t-${segment.start}-${index}`}>{segment.text}</span>;
            }
            const { entity } = segment;
            const isActive =
              activePerson == null || activePerson === entity.personIndex;
            return (
              <mark
                key={`e-${segment.start}-${index}`}
                className={`gen-rel-mark gen-person-${entity.colorIndex} gen-rel-kind-${entity.kind}${
                  isActive ? " is-on" : " is-dim"
                }${entity.excluded ? " is-excluded" : ""}`}
                data-person-index={entity.personIndex}
                data-kind={entity.kind}
                data-placeholder={entity.placeholder || ""}
                title={`${entity.label}${entity.placeholder ? ` · ${entity.placeholder}` : ""} · click to edit`}
                onMouseEnter={() => {
                  if (pinnedPerson == null) {
                    setHoveredPerson(entity.personIndex);
                  }
                }}
                onMouseLeave={() => {
                  if (pinnedPerson == null) {
                    setHoveredPerson(null);
                  }
                }}
                onClick={(event) => {
                  event.stopPropagation();
                  if (!onEntityClick) {
                    return;
                  }
                  onEntityClick(
                    {
                      text: segment.text,
                      start: segment.start,
                      end: segment.end,
                      personIndex: entity.personIndex,
                      placeholder: entity.placeholder,
                      kind: entity.kind,
                      label: entity.label,
                      excluded: entity.excluded,
                    },
                    { x: event.clientX, y: event.clientY },
                  );
                }}
              >
                {segment.text}
              </mark>
            );
          })}
        </div>
      </div>
    </div>
  );
});

export default GenerativeRelationView;
