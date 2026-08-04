import { AlertCircle, Inbox, RefreshCw, Search } from "lucide-react";

export function Skeleton({ className = "" }: { className?: string }) {
  return <span className={`skeleton ${className}`} aria-hidden="true" />;
}

export function LoadingState({
  label = "Loading workspace data…",
}: {
  label?: string;
}) {
  return (
    <div
      className="resource-state resource-state-loading"
      role="status"
      aria-live="polite"
    >
      <div className="skeleton-preview" aria-hidden="true">
        <Skeleton className="skeleton-preview-icon" />
        <div className="skeleton-preview-copy">
          <Skeleton className="skeleton-preview-title" />
          <Skeleton className="skeleton-preview-line" />
        </div>
      </div>
      <strong>{label}</strong>
      <span>Keeping the current workspace context ready.</span>
    </div>
  );
}

export function EmptyState({
  title,
  description,
  search = false,
  action,
}: {
  title: string;
  description: string;
  search?: boolean;
  action?: React.ReactNode;
}) {
  return (
    <div className="resource-state" role="status">
      {search ? (
        <Search size={20} aria-hidden="true" />
      ) : (
        <Inbox size={20} aria-hidden="true" />
      )}
      <strong>{title}</strong>
      <span>{description}</span>
      {action}
    </div>
  );
}

export function ErrorState({
  title = "Could not load this view",
  description = "The latest data is unavailable right now. Try again in a moment.",
  onRetry,
}: {
  title?: string;
  description?: string;
  onRetry?: () => void;
}) {
  return (
    <div className="resource-state resource-state-error" role="alert">
      <AlertCircle size={20} aria-hidden="true" />
      <strong>{title}</strong>
      <span>{description}</span>
      {onRetry && (
        <button
          className="button button-ghost button-small"
          type="button"
          onClick={onRetry}
        >
          <RefreshCw size={13} /> Try again
        </button>
      )}
    </div>
  );
}
