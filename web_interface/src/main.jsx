import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App.jsx";
import { UiLocaleProvider } from "./context/UiLocaleContext.jsx";
import { registerServiceWorker } from "./registerPwa.js";
import "./styles.css";

registerServiceWorker();

function showBootError(error) {
  const root = document.getElementById("root");
  if (!root) {
    return;
  }
  const message = error instanceof Error ? error.message : String(error);
  root.innerHTML = `
    <main class="app" style="padding:2rem;max-width:42rem">
      <h1>Incognito failed to start</h1>
      <p>The UI crashed while loading. Try a hard refresh, or restart the Vite server (<code>npm run dev</code> in <code>web_interface/</code>).</p>
      <pre class="app-error-boundary-message">${message.replace(/[<>&]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" }[c]))}</pre>
    </main>
  `;
}

try {
  createRoot(document.getElementById("root")).render(
    <StrictMode>
      <UiLocaleProvider>
        <App />
      </UiLocaleProvider>
    </StrictMode>,
  );
} catch (error) {
  console.error("Incognito boot error:", error);
  showBootError(error);
}

window.addEventListener("unhandledrejection", (event) => {
  if (document.getElementById("root")?.childElementCount) {
    return;
  }
  console.error("Incognito boot rejection:", event.reason);
  showBootError(event.reason);
});
