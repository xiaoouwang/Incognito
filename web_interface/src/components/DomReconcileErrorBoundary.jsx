import { Component } from "react";

function isDomReconcileError(error) {
  const message = error instanceof Error ? error.message : String(error || "");
  return (
    message.includes("removeChild") ||
    message.includes("insertBefore") ||
    message.includes("NotFoundError")
  );
}

/**
 * Catches Chromium DOM reconciliation crashes (often removeChild when
 * contentEditable / translation / autofill rewrote nodes React still owns)
 * and remounts children instead of killing the whole workflow panel.
 */
export default class DomReconcileErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { generation: 0, retrying: false, fatal: null };
  }

  static getDerivedStateFromError(error) {
    if (isDomReconcileError(error)) {
      return { retrying: true, fatal: null };
    }
    return { fatal: error, retrying: false };
  }

  componentDidCatch(error, info) {
    if (!isDomReconcileError(error)) {
      console.error("Incognito UI error (source panel):", error, info?.componentStack);
      return;
    }
    console.warn("Incognito: recovered from DOM reconcile error", error, info?.componentStack);
    window.setTimeout(() => {
      this.setState((current) => ({
        generation: current.generation + 1,
        retrying: false,
        fatal: null,
      }));
      if (typeof this.props.onRecover === "function") {
        this.props.onRecover(error);
      }
    }, 0);
  }

  render() {
    if (this.state.fatal) {
      throw this.state.fatal;
    }
    if (this.state.retrying) {
      return this.props.fallback ?? null;
    }
    return (
      <div key={this.state.generation} className="dom-reconcile-boundary">
        {this.props.children}
      </div>
    );
  }
}
