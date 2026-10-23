import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useUiLocale } from "../context/UiLocaleContext.jsx";
import {
  DEFAULT_REPLACEMENT_STYLE,
  REPLACEMENT_METHODS,
  normalizeReplacementMethod,
} from "../lib/pseudonymize.js";

/**
 * Popover to edit one anonymized surface: pick a standard method or type a custom value.
 * Optional comment is stored on the override and included in the audit report.
 */
export default function AnonymizedReplacementEditor({
  edit,
  categoryLabel,
  categoryMethod,
  override,
  onApply,
  onClear,
  onClose,
}) {
  const { t } = useUiLocale();
  const panelRef = useRef(null);
  const inputRef = useRef(null);
  const [position, setPosition] = useState({ top: edit.y, left: edit.x });
  const initialCustom =
    override?.kind === "custom" ? String(override.text ?? edit.replacement ?? "") : "";
  const [customText, setCustomText] = useState(
    override?.kind === "custom"
      ? String(override.text ?? edit.replacement ?? "")
      : edit.replacement || "",
  );
  const [comment, setComment] = useState(String(override?.comment ?? ""));
  // Clicking a highlight defaults to Custom so the user can type their own value.
  const [mode, setMode] = useState(override?.kind === "method" ? "method" : "custom");
  const activeMethod =
    override?.kind === "method"
      ? normalizeReplacementMethod(override.method)
      : normalizeReplacementMethod(categoryMethod || DEFAULT_REPLACEMENT_STYLE);

  useEffect(() => {
    setCustomText(
      override?.kind === "custom"
        ? String(override.text ?? edit.replacement ?? "")
        : edit.replacement || "",
    );
    setComment(String(override?.comment ?? ""));
    setMode(override?.kind === "method" ? "method" : "custom");
  }, [edit.valueKey, edit.replacement, override]);

  useLayoutEffect(() => {
    const element = panelRef.current;
    if (!element) {
      return;
    }
    const rect = element.getBoundingClientRect();
    const pad = 8;
    let top = edit.y + 10;
    let left = edit.x;
    if (top + rect.height > window.innerHeight - pad) {
      top = Math.max(pad, edit.y - rect.height - 8);
    }
    if (left + rect.width > window.innerWidth - pad) {
      left = Math.max(pad, window.innerWidth - rect.width - pad);
    }
    if (left < pad) {
      left = pad;
    }
    setPosition({ top, left });
  }, [edit.x, edit.y, mode, customText, comment]);

  useEffect(() => {
    function handlePointerDown(event) {
      if (panelRef.current && !panelRef.current.contains(event.target)) {
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
  }, [onClose]);

  useEffect(() => {
    if (mode === "custom") {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [mode]);

  function trimmedComment() {
    return String(comment || "").trim();
  }

  function withComment(payload) {
    const note = trimmedComment();
    return note ? { ...payload, comment: note } : payload;
  }

  function applyMethod(methodId) {
    onApply?.(
      withComment({
        kind: "method",
        method: normalizeReplacementMethod(methodId),
        category: edit.category,
        surface: edit.originalText,
      }),
    );
  }

  function applyCustom() {
    onApply?.(
      withComment({
        kind: "custom",
        text: customText,
        category: edit.category,
        surface: edit.originalText,
      }),
    );
  }

  return (
    <div className="anon-edit-backdrop" role="presentation">
      <div
        className="anon-edit-panel"
        ref={panelRef}
        role="dialog"
        aria-label={t("anonEditTitle")}
        style={{ top: position.top, left: position.left }}
      >
        <div className="anon-edit-title">{t("anonEditTitle")}</div>
        <div className="anon-edit-meta">
          <span className="anon-edit-category">{categoryLabel || edit.category}</span>
          <code className="anon-edit-original">{edit.originalText}</code>
        </div>
        <p className="anon-edit-hint">{t("anonEditHint")}</p>

        <div className="anon-edit-methods" role="group" aria-label={t("anonEditMethodsLabel")}>
          {REPLACEMENT_METHODS.map((method) => {
            const isActive = mode !== "custom" && activeMethod === method.id;
            return (
              <button
                key={method.id}
                type="button"
                className={`anon-edit-method-btn${isActive ? " is-active" : ""}`}
                title={t(method.hintKey)}
                onClick={() => {
                  setMode("method");
                  applyMethod(method.id);
                }}
              >
                <span className="split-preview-method-icon" aria-hidden="true">
                  {method.icon}
                </span>
                <span>{t(method.labelKey)}</span>
              </button>
            );
          })}
          <button
            type="button"
            className={`anon-edit-method-btn${mode === "custom" ? " is-active" : ""}`}
            title={t("anonEditCustomHint")}
            onClick={() => setMode("custom")}
          >
            <span className="split-preview-method-icon" aria-hidden="true">
              ✎
            </span>
            <span>{t("anonEditCustom")}</span>
          </button>
        </div>

        {mode === "custom" ? (
          <div className="anon-edit-custom">
            <label className="anon-edit-custom-label" htmlFor="anon-edit-custom-input">
              {t("anonEditCustomLabel")}
            </label>
            <input
              id="anon-edit-custom-input"
              ref={inputRef}
              className="anon-edit-custom-input"
              value={customText}
              onChange={(event) => {
                setMode("custom");
                setCustomText(event.target.value);
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  applyCustom();
                }
              }}
              placeholder={t("anonEditCustomPlaceholder")}
            />
          </div>
        ) : null}

        <div className="anon-edit-custom">
          <label className="anon-edit-custom-label" htmlFor="anon-edit-comment-input">
            {t("anonEditCommentLabel")}
          </label>
          <textarea
            id="anon-edit-comment-input"
            className="anon-edit-comment-input"
            value={comment}
            rows={2}
            placeholder={t("anonEditCommentPlaceholder")}
            onChange={(event) => setComment(event.target.value)}
          />
          <p className="anon-edit-comment-hint">{t("anonEditCommentHint")}</p>
        </div>

        {mode === "custom" ? (
          <div className="anon-edit-custom-actions">
            <button type="button" className="secondary" onClick={applyCustom}>
              {t("anonEditApplyCustom")}
            </button>
          </div>
        ) : trimmedComment() && override?.kind === "method" ? (
          <div className="anon-edit-custom-actions">
            <button
              type="button"
              className="secondary"
              onClick={() => applyMethod(activeMethod)}
            >
              {t("anonEditSaveComment")}
            </button>
          </div>
        ) : null}

        <div className="anon-edit-footer">
          {override ? (
            <button type="button" className="secondary" onClick={() => onClear?.()}>
              {t("anonEditReset")}
            </button>
          ) : (
            <span />
          )}
          <button type="button" className="secondary" onClick={() => onClose?.()}>
            {t("anonEditClose")}
          </button>
        </div>
      </div>
    </div>
  );
}
