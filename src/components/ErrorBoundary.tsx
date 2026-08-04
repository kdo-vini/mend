import { Component, type ErrorInfo, type ReactNode } from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";

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
    this.setState({ hasError: false, message: undefined });
  };

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <main className="app-error" role="alert" aria-live="assertive">
        <div className="app-error-icon">
          <AlertTriangle size={19} />
        </div>
        <span className="page-kicker">Interface unavailable</span>
        <h1>Something went wrong</h1>
        <p>
          The workspace could not render this view. Your data is still safe; try
          again or reload the page.
        </p>
        {this.state.message && <code>{this.state.message}</code>}
        <button
          className="button button-primary"
          type="button"
          onClick={this.reset}
        >
          <RefreshCw size={14} /> Try again
        </button>
      </main>
    );
  }
}
