import { useState } from "react";
import CamembertWorkflowSection from "./components/CamembertWorkflowSection.jsx";
import GlinerWorkflowSection from "./components/GlinerWorkflowSection.jsx";
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
        <div>
          <div className="hero-brand">
            <img className="hero-logo" src="./logo.png" alt="" width={72} height={72} />
            <div className="hero-brand-text">
              <div className="hero-title-row">
                <h1>Incognito</h1>
                <LanguageToggle />
              </div>
              <p className="hero-tagline">{t("heroTagline")}</p>
              <PrivacyPromise />
            </div>
          </div>

          <p>
            🕵️‍♂️ {t("heroStep1")}
            <br />
            👀 {t("heroStep2")}
            <br />
            📄 {t("heroStep3")}
          </p>
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
          <p className="credits">
            🖥️ {t("creditsDesktop")}{" "}
            <a href="https://github.com/xiaoouwang/Incognito" target="_blank" rel="noreferrer">
              {t("creditsDesktopApp")}
            </a>
            {" · "}
            <a
              href="https://github.com/xiaoouwang/Incognito/releases"
              target="_blank"
              rel="noreferrer"
            >
              {t("creditsReleases")}
            </a>
          </p>
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
      </div>

      <div className={workflowMode === "basic" ? undefined : "workflow-panel-hidden"}>
        <CamembertWorkflowSection />
      </div>
      <div className={workflowMode === "advanced" ? undefined : "workflow-panel-hidden"}>
        <GlinerWorkflowSection />
      </div>

      {privacyDetailsOpen ? (
        <PrivacyDetailsWindow onClose={() => setPrivacyDetailsOpen(false)} />
      ) : null}
    </main>
  );
}
