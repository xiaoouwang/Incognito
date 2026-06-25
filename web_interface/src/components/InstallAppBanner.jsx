import { useInstallPrompt } from "../hooks/useInstallPrompt.js";

export default function InstallAppBanner() {
  const { canInstall, installed, install } = useInstallPrompt();

  if (installed) {
    return null;
  }

  if (canInstall) {
    return (
      <section className="install-banner" aria-label="Install Incognito as an app">
        <div>
          <strong>Install Incognito</strong>
          <p>
            Add a desktop shortcut that opens this app in its own window — no binary download,
            same privacy-first text anonymization.
          </p>
        </div>
        <button type="button" className="install-banner-button" onClick={() => install()}>
          Install app
        </button>
      </section>
    );
  }

  return (
    <section className="install-banner install-banner-hint" aria-label="Install Incognito as an app">
      <div>
        <strong>Install as an app</strong>
        <p>
          In Chrome or Edge: menu → <em>Install Incognito</em> / <em>Apps → Install this site</em>.
          On macOS you can keep it in the Dock like a native app.
        </p>
      </div>
    </section>
  );
}
