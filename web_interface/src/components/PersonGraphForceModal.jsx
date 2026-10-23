import { useEffect, useId, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import ForceGraph2D from "react-force-graph-2d";
import { useUiLocale } from "../context/UiLocaleContext.jsx";
import { buildPersonGraphNetworkData } from "../lib/personGraphNetwork.js";

const GROUP_COLORS = {
  person: "#203a5f",
  personExcluded: "#9ca3af",
  alias: "#8a6a3d",
  aliasExcluded: "#c4c4c4",
  coref: "#4f6f4a",
  attr: "#a07848",
  attrExcluded: "#d1d5db",
};

/**
 * Full-viewport overlay with react-force-graph-2d.
 */
export default function PersonGraphForceModal({
  open,
  onClose,
  persons = [],
  excludedPlaceholders = {},
  excludedSurfaces = {},
  title,
  subtitle,
}) {
  const { t } = useUiLocale();
  const titleId = useId();
  const graphRef = useRef(null);
  const wrapRef = useRef(null);
  const [size, setSize] = useState({ width: 900, height: 560 });

  const graphData = useMemo(() => {
    const { nodes, edges } = buildPersonGraphNetworkData(persons, {
      excludedPlaceholders,
      excludedSurfaces,
    });
    return {
      nodes: nodes.map((node) => ({
        id: node.id,
        name: node.label || node.id,
        group: node.group || "attr",
        val: node.group === "person" || node.group === "personExcluded" ? 8 : 3,
      })),
      links: edges.map((edge) => ({
        source: edge.from,
        target: edge.to,
        label: edge.label || "",
      })),
    };
  }, [persons, excludedPlaceholders, excludedSurfaces]);

  useEffect(() => {
    if (!open) {
      return undefined;
    }

    function onKeyDown(event) {
      if (event.key === "Escape") {
        onClose?.();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [open, onClose]);

  useEffect(() => {
    if (!open || !wrapRef.current) {
      return undefined;
    }

    function measure() {
      const rect = wrapRef.current?.getBoundingClientRect();
      if (!rect) {
        return;
      }
      setSize({
        width: Math.max(320, Math.floor(rect.width)),
        height: Math.max(360, Math.floor(rect.height)),
      });
    }

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(wrapRef.current);
    return () => observer.disconnect();
  }, [open]);

  useEffect(() => {
    if (!open || !graphRef.current || !graphData.nodes.length) {
      return undefined;
    }
    const fg = graphRef.current;
    fg.d3Force?.("charge")?.strength(-320);
    fg.d3Force?.("link")?.distance((link) => {
      const label = String(link.label || "");
      if (label === "alias" || label === "coref") {
        return 70;
      }
      if (label) {
        return 130;
      }
      return 100;
    });
    fg.d3Force?.("center")?.strength(0.04);
    const timer = window.setTimeout(() => {
      fg.zoomToFit?.(400, 72);
    }, 700);
    return () => window.clearTimeout(timer);
  }, [open, graphData, size.width, size.height]);

  if (!open) {
    return null;
  }

  const status =
    subtitle ||
    `${t("personGraphViewWindowSubtitle", { count: persons.length })} · ${graphData.nodes.length} nodes · ${graphData.links.length} edges`;

  return createPortal(
    <div
      className="person-graph-network-backdrop"
      role="presentation"
      onClick={onClose}
    >
      <div
        className="person-graph-network-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={(event) => event.stopPropagation()}
      >
        <header className="person-graph-network-header">
          <div>
            <h2 id={titleId}>{title || t("personGraphViewWindowTitle")}</h2>
            <p className="person-graph-network-subtitle">{status}</p>
          </div>
          <div className="person-graph-network-actions">
            <p className="person-graph-network-hint">{t("personGraphViewControlsHint")}</p>
            <button type="button" className="secondary" onClick={onClose}>
              {t("personGraphViewClose")}
            </button>
          </div>
        </header>
        <div className="person-graph-network-canvas person-graph-force-canvas" ref={wrapRef}>
          <ForceGraph2D
            ref={graphRef}
            width={size.width}
            height={size.height}
            graphData={graphData}
            backgroundColor="#fffdf8"
            nodeId="id"
            nodeLabel="name"
            nodeVal="val"
            nodeRelSize={5}
            nodeColor={(node) => GROUP_COLORS[node.group] || GROUP_COLORS.attr}
            linkColor={() => "rgba(32,58,95,0.35)"}
            linkWidth={1.2}
            linkLabel="label"
            linkDirectionalArrowLength={(link) =>
              link.label && link.label !== "alias" && link.label !== "coref" ? 4 : 0
            }
            linkDirectionalArrowRelPos={1}
            d3AlphaDecay={0.028}
            d3VelocityDecay={0.35}
            cooldownTicks={160}
            onEngineStop={() => graphRef.current?.zoomToFit?.(300, 72)}
            nodeCanvasObjectMode={() => "after"}
            nodeCanvasObject={(node, ctx, globalScale) => {
              const label = node.name || "";
              if (!label) {
                return;
              }
              const fontSize = Math.max(10, 12 / globalScale);
              ctx.font = `600 ${fontSize}px "IBM Plex Sans", "Segoe UI", sans-serif`;
              ctx.textAlign = "center";
              ctx.textBaseline = "top";
              ctx.fillStyle = "#1f2937";
              ctx.fillText(label, node.x, node.y + 6);
            }}
          />
        </div>
      </div>
    </div>,
    document.body,
  );
}
