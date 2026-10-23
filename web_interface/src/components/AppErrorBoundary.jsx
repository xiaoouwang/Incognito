import { Component } from "react";

/**
 * Prevent a single panel crash from wiping the whole app to a blank page
 * (common in Chromium when a heavy subtree throws during update).
 */
export default class AppErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error("Incognito UI error:", error, info?.componentStack);
  }

  render() {
    const { error } = this.state;
    if (!error) {
      return this.props.children;
    }

    const message = error instanceof Error ? error.message : String(error);

    return (
      <section className="app-error-boundary" role="alert">
        <h2>Something went wrong in this panel</h2>
        <p>
          The view crashed while updating. This is often recoverable — try another mode tab, or
          reload the page. If it keeps happening in Chromium, disable page translation and password
          autofill for this site, then reload.
        </p>
        <pre className="app-error-boundary-message">{message}</pre>
        <div className="app-error-boundary-actions">
          <button type="button" onClick={() => this.setState({ error: null })}>
            Try to recover
          </button>
          <button
            type="button"
            className="secondary"
            onClick={async () => {
              try {
                if ("serviceWorker" in navigator) {
                  const registrations = await navigator.serviceWorker.getRegistrations();
                  await Promise.all(registrations.map((registration) => registration.unregister()));
                }
                if ("caches" in window) {
                  const keys = await caches.keys();
                  await Promise.all(keys.map((key) => caches.delete(key)));
                }
              } catch {
                // ignore — still reload
              }
              window.location.reload();
            }}
          >
            Clear cache &amp; reload
          </button>
        </div>
      </section>
    );
  }
}
