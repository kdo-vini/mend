import { Component, type ErrorInfo, type ReactNode } from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";
import i18n from "../i18n";

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  message?: string;
}

export class ErrorBoundary extends Component<
  ErrorBoundaryProps,
  ErrorBoundaryState
> {
  state: ErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, message: error.message };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("Mend interface error", error, info.componentStack);
  }

  reset = () => {
    if (
      /dynamically imported module|module script/i.test(
        this.state.message ?? "",
      )
    ) {
      const url = new URL(window.location.href);
      url.searchParams.set("_mend_chunk_recovery", String(Date.now()));
      window.location.replace(url.toString());
      return;
    }
    this.setState({ hasError: false, message: undefined });
  };

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <main className="app-error" role="alert" aria-live="assertive">
        <div className="app-error-icon">
          <AlertTriangle size={19} />
        </div>
        <span className="page-kicker">
          {i18n.t("errors.interfaceUnavailable", { ns: "common" })}
        </span>
        <h1>{i18n.t("errors.somethingWentWrong", { ns: "common" })}</h1>
        <p>{i18n.t("errors.interfaceDescription", { ns: "common" })}</p>
        <button
          className="button button-primary"
          type="button"
          onClick={this.reset}
        >
          <RefreshCw size={14} /> {i18n.t("actions.retry", { ns: "common" })}
        </button>
      </main>
    );
  }
}
