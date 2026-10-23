import { forwardRef, useLayoutEffect, useRef } from "react";
import {
  getCategoryHighlightClass,
  isEntityActive,
} from "../lib/entityUtils.js";

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

/**
 * Build plain/entity parts by walking generated segments, or by re-locating
 * replacements inside a freely edited full text.
 */
export function buildAnonymizedParts(fullText, segments = []) {
  const text = String(fullText || "");
  if (!text) {
    return [];
  }
  const entitySegments = (segments || []).filter((segment) => segment?.entity);
  if (!entitySegments.length) {
    return [{ type: "plain", text }];
  }

  // Prefer exact segment layout when the document still matches generated output.
  const joinedFromSegments = entitySegments.length
    ? (segments || []).map((segment) => segment.text || "").join("")
    : "";
  if (joinedFromSegments === text && Array.isArray(segments) && segments.length) {
    return segments.map((segment) => {
      if (segment.entity) {
        return {
          type: "entity",
          text: segment.text,
          valueKey: segment.valueKey,
          originalText: segment.originalText || segment.entity.text,
          entity: segment.entity,
          replacement: segment.replacement || segment.text,
        };
      }
      return { type: "plain", text: segment.text || "" };
    });
  }

  // Freely edited text: re-attach highlights by finding replacements in order.
  const parts = [];
  let cursor = 0;
  for (const segment of entitySegments) {
    const needle = String(segment.replacement || segment.text || "");
    if (!needle) {
      continue;
    }
    const index = text.indexOf(needle, cursor);
    if (index === -1) {
      continue;
    }
    if (index > cursor) {
      parts.push({ type: "plain", text: text.slice(cursor, index) });
    }
    parts.push({
      type: "entity",
      text: needle,
      valueKey: segment.valueKey,
      originalText: segment.originalText || segment.entity.text,
      entity: segment.entity,
      replacement: needle,
    });
    cursor = index + needle.length;
  }
  if (cursor < text.length) {
    parts.push({ type: "plain", text: text.slice(cursor) });
  }
  return parts.length ? parts : [{ type: "plain", text }];
}

function serializeEditableRoot(root) {
  if (!root) {
    return "";
  }
  let output = "";
  const walk = (node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      output += node.nodeValue || "";
      return;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) {
      return;
    }
    const element = /** @type {HTMLElement} */ (node);
    if (element.dataset?.anonEntity === "1") {
      output += element.textContent || "";
      return;
    }
    if (element.tagName === "BR") {
      output += "\n";
      return;
    }
    for (const child of element.childNodes) {
      walk(child);
    }
  };
  walk(root);
  return output;
}

/**
 * Rebuild contentEditable children imperatively.
 * React must not reconcile children inside contentEditable — Chromium throws
 * removeChild when the live DOM diverges (typing, autofill, translation).
 */
function paintEditableParts(root, parts, {
  categoryLabels,
  selectedCategories,
  excludedEntityKeys,
  getHighlightClass,
  disabled,
  onEntityClick,
  emitTextFromDom,
  focusedRef,
}) {
  root.replaceChildren();

  for (const part of parts) {
    if (part.type === "entity" && part.entity) {
      const label = categoryLabels[part.entity.label] || part.entity.label;
      const active = isEntityActive(
        part.entity,
        selectedCategories,
        excludedEntityKeys,
      );
      const mark = document.createElement("mark");
      mark.className = `highlight ${getHighlightClass(part.entity.label)} ${
        active ? "selected" : "ignored"
      }`;
      mark.contentEditable = "false";
      mark.dataset.anonEntity = "1";
      mark.dataset.valueKey = part.valueKey || "";
      mark.title = `${label}: click to choose method`;
      mark.textContent = part.text;
      mark.addEventListener("mousedown", (event) => {
        if (focusedRef.current) {
          emitTextFromDom();
        }
        event.preventDefault();
        event.stopPropagation();
        if (disabled || typeof onEntityClick !== "function") {
          return;
        }
        onEntityClick(
          part.entity,
          { x: event.clientX, y: event.clientY },
          {
            valueKey: part.valueKey,
            originalText: part.originalText,
            replacement: part.text,
            text: part.text,
          },
        );
      });
      root.appendChild(mark);
      continue;
    }

    const span = document.createElement("span");
    span.dataset.anonPlain = "1";
    span.textContent = part.text;
    root.appendChild(span);
  }
}

/**
 * Highlighted anonymized text that stays editable around entity marks.
 * Entity marks are locked (click opens replacement editor); surrounding text is free-form.
 */
const EditableAnonymizedText = forwardRef(function EditableAnonymizedText(
  {
    text,
    segments = [],
    categoryLabels = {},
    selectedCategories = {},
    excludedEntityKeys = {},
    disabled = false,
    onTextChange,
    onEntityClick,
    getHighlightClass = getCategoryHighlightClass,
  },
  forwardedRef,
) {
  const containerRef = useRef(null);
  const focusedRef = useRef(false);
  const skipNextSyncRef = useRef(false);
  const partsRef = useRef([]);
  const handlersRef = useRef({});
  const parts = buildAnonymizedParts(text, segments);
  partsRef.current = parts;

  handlersRef.current = {
    categoryLabels,
    selectedCategories,
    excludedEntityKeys,
    getHighlightClass,
    disabled,
    onEntityClick,
    onTextChange,
    text,
  };

  function emitTextFromDom() {
    const root = containerRef.current;
    const { onTextChange: onChange, text: currentText } = handlersRef.current;
    if (!root || typeof onChange !== "function") {
      return;
    }
    const next = serializeEditableRoot(root);
    if (next === currentText) {
      return;
    }
    skipNextSyncRef.current = true;
    onChange(next);
  }

  useLayoutEffect(() => {
    const root = containerRef.current;
    if (!root || !text) {
      return;
    }
    if (focusedRef.current || skipNextSyncRef.current) {
      skipNextSyncRef.current = false;
      return;
    }
    const {
      categoryLabels: labels,
      selectedCategories: selected,
      excludedEntityKeys: excluded,
      getHighlightClass: highlightClass,
      disabled: isDisabled,
      onEntityClick: entityClick,
    } = handlersRef.current;
    paintEditableParts(root, partsRef.current, {
      categoryLabels: labels,
      selectedCategories: selected,
      excludedEntityKeys: excluded,
      getHighlightClass: highlightClass,
      disabled: isDisabled,
      onEntityClick: entityClick,
      emitTextFromDom,
      focusedRef,
    });
    // Handlers are read from refs so parent inline callbacks do not rebuild the DOM every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text, segments, categoryLabels, selectedCategories, excludedEntityKeys, disabled]);

  if (!text) {
    return (
      <div className="empty-state" ref={forwardedRef} translate="no">
        —
      </div>
    );
  }

  return (
    <div
      className={`highlighted-text interactive-highlight editable-anonymized-text${
        disabled ? " is-disabled" : ""
      }`}
      ref={mergeRefs(containerRef, forwardedRef)}
      contentEditable={!disabled}
      suppressContentEditableWarning
      translate="no"
      role="textbox"
      aria-multiline="true"
      spellCheck={false}
      onFocus={() => {
        focusedRef.current = true;
      }}
      onBlur={() => {
        focusedRef.current = false;
        emitTextFromDom();
      }}
      onKeyDown={(event) => {
        // Avoid inserting rich HTML from Enter in some browsers.
        if (event.key === "Enter") {
          event.preventDefault();
          document.execCommand("insertLineBreak");
        }
      }}
    />
  );
});

export default EditableAnonymizedText;
