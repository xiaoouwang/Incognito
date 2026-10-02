import { personColorIndex } from "../lib/albertHighlight.js";

/**
 * Top-of-source person chips: click to focus/underline related spans only.
 * Soft-exclude stays on the graph / category / entity menus (those do affect anonymization).
 */
export default function PersonFocusChips({
  persons = [],
  pinnedPlaceholder = null,
  onPinPerson,
}) {
  if (!persons.length) {
    return null;
  }

  function handleChipClick(person) {
    if (pinnedPlaceholder === person.placeholder) {
      onPinPerson?.(null);
      return;
    }
    onPinPerson?.(person.placeholder);
  }

  return (
    <div className="person-focus-toolbar gen-rel-toolbar">
      <span className="gen-rel-legend">
        {persons.map((person, index) => {
          const active = pinnedPlaceholder === person.placeholder;
          const colorIndex = personColorIndex(index);
          return (
            <button
              type="button"
              key={`${person.placeholder}-${person.name}-${index}`}
              className={`gen-rel-chip gen-person-${colorIndex}${active ? " is-active" : ""}`}
              onClick={() => handleChipClick(person)}
              title={
                active
                  ? `${person.placeholder} · click to clear focus`
                  : `${person.placeholder} · click to highlight related info`
              }
            >
              {person.name}
            </button>
          );
        })}
      </span>
    </div>
  );
}
