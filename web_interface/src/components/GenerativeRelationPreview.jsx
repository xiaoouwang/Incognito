import { Component, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  buildGenerativeRelationModel,
  buildGenerativeSegments,
} from "../lib/albertHighlight.js";

function anchorPoint(rect, containerRect, side) {
  const x =
    side === "left"
      ? rect.left - containerRect.left
      : side === "right"
        ? rect.right - containerRect.left
        : rect.left - containerRect.left + rect.width / 2;
  const y =
    side === "top"
      ? rect.top - containerRect.top
      : side === "bottom"
        ? rect.bottom - containerRect.top
        : rect.top - containerRect.top + rect.height / 2;
  return { x, y };
}

function buildCurve(from, to) {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const distance = Math.hypot(dx, dy) || 1;
  const lift = Math.min(80, Math.max(28, distance * 0.28));
  const midX = (from.x + to.x) / 2;
  const midY = Math.min(from.y, to.y) - lift;
  return {
    d: `M ${from.x} ${from.y} Q ${midX} ${midY} ${to.x} ${to.y}`,
    labelX: midX,
    labelY: midY + 10,
  };
}

class RelationPreviewErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  render() {
    if (this.state.error) {
      return (
        <div className="gen-rel-empty">
          Relation preview failed to render. The anonymized text and person graph below are
          still available.
        </div>
      );
    }
    return this.props.children;
  }
}

function RelationPreviewInner({
  text,
  persons,
  emptyLabel,
  activePersonIndex = null,
  onHoverPerson,
}) {
  const scrollRef = useRef(null);
  const textRef = useRef(null);
  const markRefs = useRef(new Map());
  const [arrows, setArrows] = useState([]);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const rafRef = useRef(0);

  const safePersons = Array.isArray(persons) ? persons : [];

  const model = useMemo(
    () => buildGenerativeRelationModel(text || "", safePersons),
    [text, safePersons],
  );
  const segments = useMemo(
    () => buildGenerativeSegments(text || "", model.spans),
    [text, model.spans],
  );

  function setMarkRef(spanId, personIndex, node) {
    if (!node) {
      markRefs.current.delete(spanId);
      return;
    }
    markRefs.current.set(spanId, { node, personIndex });
  }

  function firstMarkForPerson(personIndex) {
    for (const entry of markRefs.current.values()) {
      if (entry.personIndex === personIndex) {
        return entry.node;
      }
    }
    return null;
  }

  function recomputeArrows() {
    const scroll = scrollRef.current;
    const textNode = textRef.current;
    if (!scroll || !textNode) {
      return;
    }

    // Measure text content only — never the SVG — to avoid ResizeObserver loops.
    const nextWidth = Math.max(scroll.clientWidth, textNode.scrollWidth);
    const nextHeight = Math.max(scroll.clientHeight, textNode.scrollHeight);
    setSize((prev) =>
      prev.width === nextWidth && prev.height === nextHeight
        ? prev
        : { width: nextWidth, height: nextHeight },
    );

    if (!model.relations.length) {
      setArrows((prev) => (prev.length ? [] : prev));
      return;
    }

    const containerRect = scroll.getBoundingClientRect();
    const next = [];
    const usedPairs = new Map();

    for (const relation of model.relations) {
      const fromNode = firstMarkForPerson(relation.fromPersonIndex);
      const toNode = firstMarkForPerson(relation.toPersonIndex);
      if (!fromNode || !toNode || fromNode === toNode) {
        continue;
      }

      const pairKey = `${relation.fromPersonIndex}->${relation.toPersonIndex}:${relation.key}`;
      const lane = usedPairs.get(pairKey) || 0;
      usedPairs.set(pairKey, lane + 1);

      const fromRect = fromNode.getBoundingClientRect();
      const toRect = toNode.getBoundingClientRect();
      if (!fromRect.width || !toRect.width) {
        continue;
      }

      const from = anchorPoint(fromRect, containerRect, "bottom");
      const to = anchorPoint(toRect, containerRect, "top");
      from.x += scroll.scrollLeft + lane * 10;
      from.y += scroll.scrollTop + lane * 4;
      to.x += scroll.scrollLeft + lane * 10;
      to.y += scroll.scrollTop - lane * 4;

      const curve = buildCurve(from, to);
      next.push({
        ...relation,
        ...curve,
        active:
          activePersonIndex == null ||
          activePersonIndex === relation.fromPersonIndex ||
          activePersonIndex === relation.toPersonIndex,
      });
    }

    setArrows((prev) => {
      if (
        prev.length === next.length &&
        prev.every(
          (item, index) =>
            item.id === next[index].id &&
            item.d === next[index].d &&
            item.active === next[index].active,
        )
      ) {
        return prev;
      }
      return next;
    });
  }

  function scheduleRecompute() {
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
    }
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = 0;
      recomputeArrows();
    });
  }

  useLayoutEffect(() => {
    scheduleRecompute();
    return () => {
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
      }
    };
  }, [text, safePersons, activePersonIndex, model.relations]);

  useEffect(() => {
    const scroll = scrollRef.current;
    const textNode = textRef.current;
    if (!scroll || !textNode) {
      return undefined;
    }

    const observer = new ResizeObserver(() => {
      scheduleRecompute();
    });
    // Observe the text block only (not the SVG), preventing size feedback loops.
    observer.observe(textNode);

    scroll.addEventListener("scroll", scheduleRecompute, { passive: true });
    window.addEventListener("resize", scheduleRecompute);

    return () => {
      observer.disconnect();
      scroll.removeEventListener("scroll", scheduleRecompute);
      window.removeEventListener("resize", scheduleRecompute);
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
      }
    };
  }, [text, safePersons]);

  if (!text) {
    return <div className="gen-rel-empty">{emptyLabel}</div>;
  }

  return (
    <div className="gen-rel-shell">
      <div className="gen-rel-scroll" ref={scrollRef}>
        <svg
          className="gen-rel-svg"
          width={Math.max(1, size.width)}
          height={Math.max(1, size.height)}
          aria-hidden="true"
        >
          <defs>
            {arrows.map((arrow) => (
              <marker
                key={`marker-${arrow.id}`}
                id={`gen-arrow-${arrow.id}`}
                markerWidth="8"
                markerHeight="8"
                refX="6"
                refY="3"
                orient="auto"
                markerUnits="strokeWidth"
              >
                <path d="M0,0 L6,3 L0,6 Z" fill={arrow.color} />
              </marker>
            ))}
          </defs>
          {arrows.map((arrow) => (
            <g
              key={arrow.id}
              className={`gen-rel-edge${arrow.active ? " is-active" : " is-muted"}`}
            >
              <path
                d={arrow.d}
                fill="none"
                stroke={arrow.color}
                strokeWidth={arrow.active ? 2.25 : 1.25}
                strokeLinecap="round"
                markerEnd={`url(#gen-arrow-${arrow.id})`}
                opacity={arrow.active ? 0.9 : 0.22}
              />
              <text
                x={arrow.labelX}
                y={arrow.labelY}
                textAnchor="middle"
                className="gen-rel-edge-label"
                fill={arrow.color}
                opacity={arrow.active ? 0.95 : 0.2}
              >
                {arrow.label}
              </text>
            </g>
          ))}
        </svg>

        <div className="gen-rel-text" ref={textRef}>
          {segments.map((segment, index) => {
            if (!segment.span) {
              return <span key={`t-${segment.start}-${index}`}>{segment.text}</span>;
            }

            const span = segment.span;
            const color = model.personColors[span.colorIndex % model.personColors.length];
            const isActive =
              activePersonIndex == null || activePersonIndex === span.personIndex;

            return (
              <mark
                key={span.id}
                ref={(node) => setMarkRef(span.id, span.personIndex, node)}
                className={`gen-rel-mark gen-rel-mark-${span.kind}${
                  isActive ? " is-active" : " is-muted"
                }`}
                style={{ "--gen-span-color": color }}
                title={`${span.label || ""}${
                  span.kind === "attr"
                    ? ""
                    : ` · ${safePersons[span.personIndex]?.name || ""}`
                }`}
                data-person-index={span.personIndex}
                onMouseEnter={() => onHoverPerson?.(span.personIndex)}
                onMouseLeave={() => onHoverPerson?.(null)}
                onFocus={() => onHoverPerson?.(span.personIndex)}
                onBlur={() => onHoverPerson?.(null)}
                tabIndex={0}
              >
                {segment.text}
              </mark>
            );
          })}
        </div>
      </div>

      {safePersons.length ? (
        <div className="gen-rel-legend" aria-label="Person colors">
          {safePersons.map((person, index) => (
            <button
              key={`legend-${index}-${person.placeholder || person.name || "p"}`}
              type="button"
              className={`gen-rel-legend-item${
                activePersonIndex === index ? " is-active" : ""
              }`}
              style={{
                "--gen-span-color":
                  model.personColors[index % model.personColors.length],
              }}
              onMouseEnter={() => onHoverPerson?.(index)}
              onMouseLeave={() => onHoverPerson?.(null)}
              onFocus={() => onHoverPerson?.(index)}
              onBlur={() => onHoverPerson?.(null)}
            >
              <span className="gen-rel-legend-swatch" />
              <code>{person.placeholder || `[PER_${index + 1}]`}</code>
              <span>{person.name || "—"}</span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export default function GenerativeRelationPreview(props) {
  return (
    <RelationPreviewErrorBoundary>
      <RelationPreviewInner {...props} />
    </RelationPreviewErrorBoundary>
  );
}
