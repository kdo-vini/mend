import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  const { t } = useTranslation("common");
  return (
    <header className="page-header">
      <div>
        <div className="page-kicker">
          {eyebrow ?? t("brand.workspaceEyebrow")}
        </div>
        <h1>{title}</h1>
        {description && <p>{description}</p>}
      </div>
      {actions && <div className="page-actions">{actions}</div>}
    </header>
  );
}
