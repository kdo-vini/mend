import type { ReactNode } from "react";
import { CheckCircle2, Circle, CircleAlert } from "lucide-react";
import { useTranslation } from "react-i18next";
import { PageHeader } from "../../../shared/ui/PageHeader";
import { EmptyState } from "../../../shared/ui/ResourceState";

export function SettingsPageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description: string;
  actions?: ReactNode;
}) {
  const { t } = useTranslation("settings");
  return (
    <PageHeader
      eyebrow={t("ui.workspaceSettings")}
      title={title}
      description={description}
      actions={actions}
    />
  );
}

export function SettingsWorkspaceRequired() {
  const { t } = useTranslation("settings");
  return (
    <EmptyState
      title={t("v2.workspaceRequired.title")}
      description={t("v2.workspaceRequired.description")}
    />
  );
}

export function SettingsSection({
  title,
  description,
  children,
  actions,
  className = "",
}: {
  title: string;
  description?: string;
  children: ReactNode;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <section className={`settings-v2-section ${className}`.trim()}>
      <header className="settings-v2-section-header">
        <div>
          <h2>{title}</h2>
          {description && <p>{description}</p>}
        </div>
        {actions && (
          <div className="settings-v2-section-actions">{actions}</div>
        )}
      </header>
      {children}
    </section>
  );
}

export function SettingsStatus({
  tone,
  children,
}: {
  tone: "success" | "warning" | "danger" | "muted";
  children: ReactNode;
}) {
  const Icon =
    tone === "success"
      ? CheckCircle2
      : tone === "danger"
        ? CircleAlert
        : tone === "warning"
          ? CircleAlert
          : Circle;
  return (
    <span className={`settings-v2-status ${tone}`}>
      <Icon size={13} aria-hidden="true" /> {children}
    </span>
  );
}

export function SettingsError({
  message,
  onRetry,
}: {
  message: string;
  onRetry?: () => void;
}) {
  const { t } = useTranslation("settings");
  return (
    <div className="settings-v2-error" role="alert">
      <CircleAlert size={15} aria-hidden="true" />
      <span>{message}</span>
      {onRetry && (
        <button className="text-button" type="button" onClick={onRetry}>
          {t("ui.retry")}
        </button>
      )}
    </div>
  );
}
