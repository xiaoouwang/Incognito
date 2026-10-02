import {
  isSurfaceExcluded,
  surfaceExcludeKey,
} from "../lib/albertEdit.js";

export default function PersonGraphCard({
  person,
  excluded,
  excludedSurfaces,
  focused = false,
  pinned = false,
  onTogglePerson,
  onToggleSurface,
  onToggleAttr,
  onHoverPerson,
  onPinPerson,
}) {
  const edges = [];

  for (const alias of person.aliases || []) {
    edges.push({
      kind: "alias",
      label: "alias",
      value: alias,
      placeholder: person.placeholder,
      excluded: isSurfaceExcluded(excludedSurfaces, person.placeholder, alias),
    });
  }
  for (const coref of person.corefs || []) {
    edges.push({
      kind: "coref",
      label: "coréférence",
      value: coref,
      placeholder: person.placeholder,
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
      excluded:
        Boolean(excludedSurfaces[surfaceExcludeKey(attrPlaceholder, attr.value)]) ||
        Boolean(attr.placeholder && excluded),
    });
  }

  const nameExcluded =
    excluded || isSurfaceExcluded(excludedSurfaces, person.placeholder, person.name);

  return (
    <article
      className={`gen-graph-card${excluded ? " is-excluded" : ""}${focused ? " is-focused" : ""}${
        pinned ? " is-pinned" : ""
      }`}
      onMouseEnter={() => onHoverPerson?.(person.placeholder)}
      onMouseLeave={() => onHoverPerson?.(null)}
    >
      <div className="gen-graph-root">
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
        <button
          type="button"
          className={`gen-graph-focus-name${nameExcluded ? " is-excluded" : ""}`}
          onClick={() => onPinPerson?.(person.placeholder)}
          title={pinned ? "Clear person underline" : "Underline this person’s info in the text"}
        >
          {person.name}
        </button>
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
      </div>
      {edges.length ? (
        <ul className="gen-graph-edges">
          {edges.map((edge, index) => {
            const isLast = index === edges.length - 1;
            return (
              <li
                key={`${edge.kind}-${edge.label}-${edge.value}-${index}`}
                className={edge.excluded ? "is-excluded" : undefined}
              >
                <span className="gen-graph-branch" aria-hidden="true">
                  {isLast ? "└──" : "├──"}
                </span>
                <span className="gen-graph-label">{edge.label}</span>
                <span className="gen-graph-arrow" aria-hidden="true">
                  →
                </span>
                <span className="gen-graph-value">{edge.value}</span>
                {edge.placeholder && edge.kind === "attr" ? (
                  <code className="gen-map-token gen-graph-token-sm">{edge.placeholder}</code>
                ) : null}
                <button
                  type="button"
                  className={`gen-graph-remove${edge.excluded ? " is-restore" : ""}`}
                  onClick={(event) => {
                    event.stopPropagation();
                    if (edge.kind === "alias" || edge.kind === "coref") {
                      onToggleSurface(person.placeholder, edge.value);
                    } else if (edge.kind === "attr") {
                      onToggleAttr(edge.placeholder || person.placeholder, edge.value);
                    }
                  }}
                  title={edge.excluded ? "Restore" : "Exclude"}
                >
                  {edge.excluded ? "↺" : "×"}
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}
    </article>
  );
}
