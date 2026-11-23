import { useEffect } from "react";
import { useUiLocale } from "../context/UiLocaleContext.jsx";
import { UI_STRINGS } from "../lib/uiStrings.js";

export default function PrivacyDetailsWindow({ onClose }) {
  const { locale } = useUiLocale();
  const copy = UI_STRINGS[locale].privacy;

  useEffect(() => {
    function handleKeyDown(event) {
      if (event.key === "Escape") {
        onClose();
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  return (
    <div className="report-backdrop" role="presentation">
      <section
        className="report-window privacy-details-window"
        role="dialog"
        aria-modal="true"
        aria-labelledby="privacy-details-title"
      >
        <div className="report-header">
          <div>
            <p className="eyebrow">{copy.eyebrow}</p>
            <h2 id="privacy-details-title">{copy.title}</h2>
          </div>
          <div className="report-actions">
            <button className="secondary" onClick={onClose}>
              {UI_STRINGS[locale].close}
            </button>
          </div>
        </div>
        <div className="privacy-details-body">
          <p>{copy.intro}</p>

          {copy.sections.map((section) => (
            <section key={section.heading}>
              <h3>{section.heading}</h3>
              {section.paragraphs?.map((paragraph) => (
                <p key={paragraph}>{paragraph}</p>
              ))}
              {section.bullets ? (
                <ul>
                  {section.bullets.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              ) : null}
              {section.linkLabel ? (
                <p>
                  <a
                    href="https://gitlab.huma-num.fr/mshs-sud-est/incognito"
                    target="_blank"
                    rel="noreferrer"
                  >
                    {section.linkLabel}
                  </a>
                </p>
              ) : null}
            </section>
          ))}

          <p className="privacy-details-footnote">{copy.footnote}</p>
        </div>
      </section>
    </div>
  );
}
