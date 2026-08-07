import { AlertCircle, Inbox, RefreshCw, Search } from "lucide-react";
import { useTranslation } from "react-i18next";

export function Skeleton({ className = "" }: { className?: string }) {
  return <span className={`skeleton ${className}`} aria-hidden="true" />;
}

export function LoadingState({ label }: { label?: string }) {
  const { t } = useTranslation("common");
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
      <strong>{label ?? t("states.loading")}</strong>
      <span>{t("states.loadingDescription")}</span>
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
  title,
  description,
  onRetry,
}: {
  title?: string;
  description?: string;
  onRetry?: () => void;
}) {
  const { t } = useTranslation("common");
  return (
    <div className="resource-state resource-state-error" role="alert">
      <AlertCircle size={20} aria-hidden="true" />
      <strong>{title ?? t("errors.viewUnavailable")}</strong>
      <span>{description ?? t("errors.viewUnavailableDescription")}</span>
      {onRetry && (
        <button
          className="button button-ghost button-small"
          type="button"
          onClick={onRetry}
        >
          <RefreshCw size={13} /> {t("actions.retry")}
        </button>
      )}
    </div>
  );
}
