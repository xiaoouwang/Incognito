import { useState } from "react";
import AppErrorBoundary from "./components/AppErrorBoundary.jsx";
import CamembertWorkflowSection from "./components/CamembertWorkflowSection.jsx";
import GenerativeWorkflowSection from "./components/GenerativeWorkflowSection.jsx";
import LanguageToggle from "./components/LanguageToggle.jsx";
import PrivacyDetailsWindow from "./components/PrivacyDetailsWindow.jsx";
import { PrivacyPromise, PrivacyDetailsLink } from "./components/PrivacyPromise.jsx";
import { useUiLocale } from "./context/UiLocaleContext.jsx";

export default function App() {
  const { t } = useUiLocale();
  const [privacyDetailsOpen, setPrivacyDetailsOpen] = useState(false);
  const [workflowMode, setWorkflowMode] = useState("basic");

  return (
    <main className="app">
      <header className="hero">
        <div className="hero-main">
          <div className="hero-brand">
            <img className="hero-logo" src="./logo.png" alt="" width={72} height={72} />
            <div className="hero-brand-text">
              <div className="hero-title-row">
                <h1>Incognito</h1>
                <LanguageToggle />
              </div>
              <p className="hero-tagline">{t("heroTagline")}</p>
              <PrivacyPromise />
              <p className="credits">
                👨‍💻 {t("creditsDeveloped")}{" "}
                <a href="https://xiaoouwang.github.io/" target="_blank" rel="noreferrer">
                  Xiaoou Wang
                </a>
                {" · "}
                {t("creditsRole")}
                {" · "}
                <a href="https://mshs.univ-cotedazur.fr/" target="_blank" rel="noreferrer">
                  MSHS Sud-Est
                </a>
                {" · "}
                <a href="https://univ-cotedazur.fr/" target="_blank" rel="noreferrer">
                  Université Côte d&apos;Azur
                </a>
              </p>
            </div>
          </div>

          <div className="workflow-mode-toggle" role="group" aria-label={t("workflowModeLabel")}>
            <button
              type="button"
              className={workflowMode === "basic" ? "is-active" : "secondary"}
              aria-pressed={workflowMode === "basic"}
              onClick={() => setWorkflowMode("basic")}
            >
              {t("workflowModeBasic")}
            </button>
            <button
              type="button"
              className={workflowMode === "advanced" ? "is-active" : "secondary"}
              aria-pressed={workflowMode === "advanced"}
              onClick={() => setWorkflowMode("advanced")}
            >
              {t("workflowModeAdvanced")}
            </button>
            <button
              type="button"
              className={workflowMode === "generative" ? "is-active" : "secondary"}
              aria-pressed={workflowMode === "generative"}
              onClick={() => setWorkflowMode("generative")}
            >
              {t("workflowModeGenerative")}
            </button>
            <button
              type="button"
              className={workflowMode === "generative-advanced" ? "is-active" : "secondary"}
              aria-pressed={workflowMode === "generative-advanced"}
              onClick={() => setWorkflowMode("generative-advanced")}
            >
              {t("workflowModeGenerativeAdvanced")}
            </button>
          </div>
        </div>
        <aside className="privacy-note">
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <span role="img" aria-label="lock" style={{ fontSize: "2em" }}>
              🔒
            </span>
            <div>
              <strong style={{ fontSize: "1.1em" }}>
                {t("privacyPromise")}{" "}
                <PrivacyDetailsLink onOpen={() => setPrivacyDetailsOpen(true)} />
              </strong>
              <div style={{ fontSize: "0.95em", marginTop: 6 }}>{t("privacyAsideBody")}</div>
            </div>
          </div>
        </aside>
      </header>

      {/*
        Mount only the active workflow. Keeping Basic + Advanced + both Generative
        panels in the DOM (even with display:none) is very heavy and can blank the
        tab in Chromium while Firefox/Safari still cope.
      */}
      <AppErrorBoundary key={workflowMode}>
        {workflowMode === "basic" ? <CamembertWorkflowSection variant="basic" /> : null}
        {workflowMode === "advanced" ? <CamembertWorkflowSection variant="advanced" /> : null}
        {workflowMode === "generative" ? <GenerativeWorkflowSection variant="basic" /> : null}
        {workflowMode === "generative-advanced" ? (
          <GenerativeWorkflowSection variant="advanced" />
        ) : null}
      </AppErrorBoundary>

      {privacyDetailsOpen ? (
        <PrivacyDetailsWindow onClose={() => setPrivacyDetailsOpen(false)} />
      ) : null}
    </main>
  );
}
