import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  isSurfaceExcluded,
  surfaceExcludeKey,
} from "../lib/albertEdit.js";
import { useUiLocale } from "../context/UiLocaleContext.jsx";

const MOVE_MIME = "application/x-incognito-graph-surface";
const MENU_MARGIN = 8;
const MENU_MIN_WIDTH = 176;

function EditableGraphText({
  value,
  editable,
  title,
  onRename,
  className = "gen-graph-label",
  inputClassName = "gen-graph-label-input",
  activate = "click",
  onActivateClick,
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const inputRef = useRef(null);

  useEffect(() => {
    if (!editing) {
      setDraft(value);
    }
  }, [value, editing]);

  useLayoutEffect(() => {
    if (editing) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [editing]);

  function commit() {
    const next = draft.trim();
    setEditing(false);
    if (!next || next === value) {
      setDraft(value);
      return;
    }
    onRename?.(next);
  }

  function beginEdit(event) {
    event.stopPropagation();
    setDraft(value);
    setEditing(true);
  }

  if (editing && editable) {
    return (
      <input
        ref={inputRef}
        className={inputClassName}
        value={draft}
        aria-label={title}
        onChange={(event) => setDraft(event.target.value)}
        onClick={(event) => event.stopPropagation()}
        onMouseDown={(event) => event.stopPropagation()}
        onKeyDown={(event) => {
          event.stopPropagation();
          if (event.key === "Enter") {
            event.preventDefault();
            commit();
          } else if (event.key === "Escape") {
            event.preventDefault();
            setDraft(value);
            setEditing(false);
          }
        }}
        onBlur={commit}
      />
    );
  }

  if (!editable) {
    return <span className={className}>{value}</span>;
  }

  return (
    <button
      type="button"
      className={`${className} is-editable`}
      title={title}
      onClick={(event) => {
        if (activate === "click") {
          beginEdit(event);
          return;
        }
        onActivateClick?.(event);
      }}
      onDoubleClick={activate === "dblclick" ? beginEdit : undefined}
    >
      {value}
    </button>
  );
}

function isMovableEdge(edge) {
  return edge.kind === "attr" || edge.kind === "alias" || edge.kind === "coref";
}

function placeMenu(anchorRect, menuWidth = MENU_MIN_WIDTH, menuHeight = 220) {
  if (!anchorRect || typeof window === "undefined") {
    return { top: 0, left: 0 };
  }
  const width = Math.max(menuWidth, MENU_MIN_WIDTH);
  let left = anchorRect.right - width;
  let top = anchorRect.bottom + 4;
  left = Math.min(left, window.innerWidth - width - MENU_MARGIN);
  left = Math.max(MENU_MARGIN, left);
  if (top + menuHeight > window.innerHeight - MENU_MARGIN) {
    top = Math.max(MENU_MARGIN, anchorRect.top - menuHeight - 4);
  }
  return { top, left };
}

function GraphPortalMenu({
  id,
  anchorRef,
  label,
  children,
  onClose,
}) {
  const menuRef = useRef(null);
  const [coords, setCoords] = useState({ top: 0, left: 0 });

  useLayoutEffect(() => {
    const anchor = anchorRef?.current;
    if (!anchor) {
      return undefined;
    }
    function update() {
      const rect = anchor.getBoundingClientRect();
      const menuWidth = menuRef.current?.offsetWidth || MENU_MIN_WIDTH;
      const menuHeight = menuRef.current?.offsetHeight || 220;
      setCoords(placeMenu(rect, menuWidth, menuHeight));
    }
    update();
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
    };
  }, [anchorRef]);

  useEffect(() => {
    function handlePointerDown(event) {
      const inMenu = menuRef.current?.contains(event.target);
      const inAnchor = anchorRef?.current?.contains(event.target);
      if (!inMenu && !inAnchor) {
        onClose?.();
      }
    }
    function handleKeyDown(event) {
      if (event.key === "Escape") {
        onClose?.();
      }
    }
    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [anchorRef, onClose]);

  return createPortal(
    <div
      id={id}
      ref={menuRef}
      className="gen-graph-move-menu is-portal"
      role="menu"
      style={{ top: coords.top, left: coords.left }}
    >
      <p className="gen-graph-move-menu-label">{label}</p>
      {children}
    </div>,
    document.body,
  );
}

export default function PersonGraphCard({
  person,
  persons = [],
  excluded,
  excludedSurfaces,
  focused = false,
  pinned = false,
  dropActive = false,
  onTogglePerson,
  onToggleSurface,
  onToggleAttr,
  onHoverPerson,
  onPinPerson,
  onMoveSurface,
  onRelatePerson,
  onRenameEdgeLabel,
  onRenameEdgeValue,
  onDragSurfaceStart,
  onDragSurfaceEnd,
  onDragOverPerson,
  onDragLeavePerson,
  onDropOnPerson,
}) {
  const { t } = useUiLocale();
  const moveMenuId = useId();
  const [moveMenuKey, setMoveMenuKey] = useState(null);
  const [relateMenuOpen, setRelateMenuOpen] = useState(false);
  const cardRef = useRef(null);
  const relateToggleRef = useRef(null);
  const moveAnchorRef = useRef(null);

  const otherPersons = (persons || []).filter(
    (item) => item.placeholder !== person.placeholder,
  );
  const canToggle = typeof onTogglePerson === "function";
  const canMove = typeof onMoveSurface === "function" && otherPersons.length > 0;
  const canRelate = typeof onRelatePerson === "function" && otherPersons.length > 0;

  const edges = [];

  for (const alias of person.aliases || []) {
    const aliasLower = String(alias || "").toLocaleLowerCase();
    edges.push({
      kind: "alias",
      label: person.aliasLabels?.[aliasLower] || "alias",
      value: alias,
      placeholder: person.placeholder,
      entityLabel: "person",
      excluded: isSurfaceExcluded(excludedSurfaces, person.placeholder, alias),
    });
  }
  for (const coref of person.corefs || []) {
    const corefLower = String(coref || "").toLocaleLowerCase();
    edges.push({
      kind: "coref",
      label: person.corefLabels?.[corefLower] || "coréférence",
      value: coref,
      placeholder: person.placeholder,
      entityLabel: "person",
      excluded: isSurfaceExcluded(excludedSurfaces, person.placeholder, coref),
    });
  }
  for (const attr of person.attrs || []) {
    const attrPlaceholder = attr.placeholder || person.placeholder;
    edges.push({
      kind: "attr",
      label: attr.label,
      value: attr.value,
      placeholder: attr.placeholder,
      key: attr.key,
      entityLabel: attr.entityLabel || "misc",
      excluded:
        Boolean(excludedSurfaces[surfaceExcludeKey(attrPlaceholder, attr.value)]) ||
        Boolean(attr.placeholder && excluded),
    });
  }
  for (const rel of person.rels || []) {
    edges.push({
      kind: "rel",
      label: rel.label || "lié à",
      value: rel.target,
      placeholder: rel.placeholder || "",
      excluded: isSurfaceExcluded(excludedSurfaces, person.placeholder, rel.target),
    });
  }

  const nameExcluded =
    excluded || isSurfaceExcluded(excludedSurfaces, person.placeholder, person.name);

  function edgeMenuKey(edge, index) {
    return `${edge.kind}-${edge.label}-${edge.value}-${index}`;
  }

  function movePayload(edge) {
    return {
      fromPlaceholder: person.placeholder,
      surface: edge.value,
      kind: edge.kind,
      entityLabel: edge.entityLabel || (edge.kind === "attr" ? "misc" : "person"),
      key: edge.key || "",
    };
  }

  const openMoveEdge = edges.find((edge, index) => edgeMenuKey(edge, index) === moveMenuKey);
  const openMoveIndex = edges.findIndex(
    (edge, index) => edgeMenuKey(edge, index) === moveMenuKey,
  );

  return (
    <article
      ref={cardRef}
      className={`gen-graph-card${excluded ? " is-excluded" : ""}${focused ? " is-focused" : ""}${
        pinned ? " is-pinned" : ""
      }${dropActive ? " is-drop-target" : ""}`}
      onMouseEnter={() => onHoverPerson?.(person.placeholder)}
      onMouseLeave={() => onHoverPerson?.(null)}
      onDragOver={
        canMove
          ? (event) => {
              event.preventDefault();
              event.dataTransfer.dropEffect = "move";
              onDragOverPerson?.(person.placeholder);
            }
          : undefined
      }
      onDragLeave={
        canMove
          ? (event) => {
              if (!cardRef.current?.contains(event.relatedTarget)) {
                onDragLeavePerson?.(person.placeholder);
              }
            }
          : undefined
      }
      onDrop={
        canMove
          ? (event) => {
              event.preventDefault();
              onDropOnPerson?.(person.placeholder, event);
              setMoveMenuKey(null);
            }
          : undefined
      }
    >
      <div className="gen-graph-root">
        {canToggle ? (
          <button
            type="button"
            className={`gen-map-token gen-graph-toggle${excluded ? " is-off" : ""}`}
            onClick={(event) => {
              event.stopPropagation();
              onTogglePerson(person.placeholder);
            }}
            title={excluded ? "Include person" : "Exclude person"}
          >
            {person.placeholder}
          </button>
        ) : (
          <code className="gen-map-token gen-graph-token-sm">{person.placeholder}</code>
        )}
        <EditableGraphText
          value={person.name}
          editable={typeof onRenameEdgeValue === "function"}
          className={`gen-graph-focus-name${nameExcluded ? " is-excluded" : ""}`}
          inputClassName="gen-graph-name-input"
          activate="dblclick"
          title={
            typeof onPinPerson === "function"
              ? pinned
                ? `${t("personGraphRenameValueTitle")} · ${t("personGraphUnpinHint")}`
                : `${t("personGraphRenameValueTitle")} · ${t("personGraphPinHint")}`
              : undefined
          }
          onActivateClick={() => onPinPerson?.(person.placeholder)}
          onRename={(nextValue) =>
            onRenameEdgeValue?.(person.placeholder, "name", person.name, nextValue)
          }
        />
        {canRelate ? (
          <span className="gen-graph-move gen-graph-relate">
            <button
              ref={relateToggleRef}
              type="button"
              className={`gen-graph-move-toggle${relateMenuOpen ? " is-open" : ""}`}
              aria-expanded={relateMenuOpen}
              title={t("personGraphRelateTitle")}
              onClick={(event) => {
                event.stopPropagation();
                setMoveMenuKey(null);
                setRelateMenuOpen((open) => !open);
              }}
            >
              ⟷
            </button>
            {relateMenuOpen ? (
              <GraphPortalMenu
                anchorRef={relateToggleRef}
                label={t("personGraphRelateTo")}
                onClose={() => setRelateMenuOpen(false)}
              >
                {otherPersons.map((target) => {
                  const already = (person.rels || []).some(
                    (rel) =>
                      String(rel.target || "").toLocaleLowerCase() ===
                        String(target.name || "").toLocaleLowerCase() ||
                      rel.placeholder === target.placeholder,
                  );
                  return (
                    <button
                      key={target.placeholder}
                      type="button"
                      role="menuitem"
                      className={`gen-graph-move-option${already ? " is-current" : ""}`}
                      onClick={(event) => {
                        event.stopPropagation();
                        onRelatePerson?.(person.placeholder, target.placeholder);
                        setRelateMenuOpen(false);
                      }}
                    >
                      <span>
                        {already
                          ? t("personGraphUnrelateTo", { name: target.name })
                          : t("personGraphRelateToName", { name: target.name })}
                      </span>
                      <code>{target.placeholder}</code>
                    </button>
                  );
                })}
              </GraphPortalMenu>
            ) : null}
          </span>
        ) : null}
        {canToggle ? (
          <button
            type="button"
            className={`gen-graph-remove${nameExcluded ? " is-restore" : ""}`}
            onClick={(event) => {
              event.stopPropagation();
              onTogglePerson(person.placeholder);
            }}
            title={nameExcluded ? "Restore person" : "Exclude person"}
          >
            {nameExcluded ? "↺" : "×"}
          </button>
        ) : null}
      </div>
      {edges.length ? (
        <ul className="gen-graph-edges">
          {edges.map((edge, index) => {
            const isLast = index === edges.length - 1;
            const key = edgeMenuKey(edge, index);
            const movable = canMove && isMovableEdge(edge);
            const menuOpen = moveMenuKey === key;
            return (
              <li
                key={key}
                className={`${edge.excluded ? "is-excluded" : ""}${movable ? " is-movable" : ""}${
                  menuOpen ? " is-move-open" : ""
                }`.trim()}
                draggable={movable}
                onDragStart={
                  movable
                    ? (event) => {
                        const payload = movePayload(edge);
                        event.dataTransfer.setData(MOVE_MIME, JSON.stringify(payload));
                        event.dataTransfer.setData("text/plain", edge.value);
                        event.dataTransfer.effectAllowed = "move";
                        onDragSurfaceStart?.(payload);
                        setMoveMenuKey(null);
                      }
                    : undefined
                }
                onDragEnd={
                  movable
                    ? () => {
                        onDragSurfaceEnd?.();
                      }
                    : undefined
                }
              >
                <span className="gen-graph-branch" aria-hidden="true">
                  {isLast ? "└──" : "├──"}
                </span>
                <EditableGraphText
                  value={edge.label}
                  editable={
                    typeof onRenameEdgeLabel === "function" &&
                    (edge.kind === "attr" ||
                      edge.kind === "rel" ||
                      edge.kind === "alias" ||
                      edge.kind === "coref")
                  }
                  title={t("personGraphRenameLabelTitle")}
                  onRename={(nextLabel) =>
                    onRenameEdgeLabel?.(person.placeholder, edge.kind, edge.value, nextLabel)
                  }
                />
                <span className="gen-graph-arrow" aria-hidden="true">
                  →
                </span>
                <EditableGraphText
                  value={edge.value}
                  className="gen-graph-value"
                  inputClassName="gen-graph-value-input"
                  editable={
                    typeof onRenameEdgeValue === "function" &&
                    (edge.kind === "attr" ||
                      edge.kind === "rel" ||
                      edge.kind === "alias" ||
                      edge.kind === "coref")
                  }
                  title={t("personGraphRenameValueTitle")}
                  onRename={(nextValue) =>
                    onRenameEdgeValue?.(person.placeholder, edge.kind, edge.value, nextValue)
                  }
                />
                {edge.placeholder && (edge.kind === "attr" || edge.kind === "rel") ? (
                  <code className="gen-map-token gen-graph-token-sm">{edge.placeholder}</code>
                ) : null}
                {movable ? (
                  <span className="gen-graph-move">
                    <button
                      type="button"
                      className={`gen-graph-move-toggle${menuOpen ? " is-open" : ""}`}
                      aria-expanded={menuOpen}
                      aria-controls={`${moveMenuId}-${index}`}
                      title={t("personGraphMoveTitle")}
                      onClick={(event) => {
                        event.stopPropagation();
                        setRelateMenuOpen(false);
                        if (menuOpen) {
                          moveAnchorRef.current = null;
                          setMoveMenuKey(null);
                        } else {
                          moveAnchorRef.current = event.currentTarget;
                          setMoveMenuKey(key);
                        }
                      }}
                    >
                      ↝
                    </button>
                  </span>
                ) : null}
                {canToggle ? (
                  <button
                    type="button"
                    className={`gen-graph-remove${edge.excluded ? " is-restore" : ""}`}
                    onClick={(event) => {
                      event.stopPropagation();
                      if (edge.kind === "alias" || edge.kind === "coref" || edge.kind === "rel") {
                        onToggleSurface(person.placeholder, edge.value);
                      } else if (edge.kind === "attr") {
                        onToggleAttr(edge.placeholder || person.placeholder, edge.value);
                      }
                    }}
                    title={edge.excluded ? "Restore" : "Exclude"}
                  >
                    {edge.excluded ? "↺" : "×"}
                  </button>
                ) : null}
              </li>
            );
          })}
        </ul>
      ) : null}
      {openMoveEdge && openMoveIndex >= 0 ? (
        <GraphPortalMenu
          id={`${moveMenuId}-${openMoveIndex}`}
          anchorRef={moveAnchorRef}
          label={t("personGraphMoveTo")}
          onClose={() => {
            moveAnchorRef.current = null;
            setMoveMenuKey(null);
          }}
        >
          {otherPersons.map((target) => (
            <button
              key={target.placeholder}
              type="button"
              role="menuitem"
              className="gen-graph-move-option"
              onClick={(event) => {
                event.stopPropagation();
                onMoveSurface?.(person.placeholder, target.placeholder, openMoveEdge.value, {
                  kind: openMoveEdge.kind,
                  entityLabel: openMoveEdge.entityLabel,
                  key: openMoveEdge.key,
                });
                setMoveMenuKey(null);
              }}
            >
              <span>{target.name}</span>
              <code>{target.placeholder}</code>
            </button>
          ))}
        </GraphPortalMenu>
      ) : null}
    </article>
  );
}

export { MOVE_MIME };
