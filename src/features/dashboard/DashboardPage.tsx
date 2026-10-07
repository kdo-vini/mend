import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { ArrowRight, Inbox, CircleDot, Settings } from "lucide-react";
import { PageHeader } from "../../shared/ui/PageHeader";
import { StatusPill } from "../../shared/ui/DataDisplay";
import type { Issue } from "../../types";

const shortcuts = [
  { to: "/inbox", key: "whatsapp", icon: Inbox },
  { to: "/issues", key: "issues", icon: CircleDot },
  { to: "/settings", key: "settings", icon: Settings },
] as const;

export function DashboardPage({
  operator,
  issues,
  onOpenIssue,
}: {
  operator: { name: string; email: string };
  issues: Issue[];
  onOpenIssue: (id: string) => void;
}) {
  const { t } = useTranslation("common");
  const activeIssues = issues
    .filter((issue) => !["Done", "Canceled"].includes(issue.status))
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .slice(0, 5);
  return (
    <div className="page diagium-dashboard">
      <PageHeader
        title={t("dashboard.title")}
        description={t("dashboard.startHere")}
      />
      <div className="dashboard-overview-layout">
        <section className="dashboard-welcome">
          <span className="dashboard-welcome-label">
            {t("dashboard.welcome")}
          </span>
          <h2>{t("dashboard.greeting", { name: operator.name })}</h2>
          <p className="dashboard-welcome-description">
            {t("dashboard.operationDescription")}
          </p>
          <p className="dashboard-identity">
            {operator.email
              ? t("dashboard.signedIn", {
                  name: operator.name,
                  email: operator.email,
                })
              : operator.name}
          </p>
          <Link to="/inbox" className="button button-ghost">
            <Inbox size={16} aria-hidden="true" />
            {t("dashboard.whatsapp")}
            <ArrowRight size={16} aria-hidden="true" />
          </Link>
        </section>
        <nav className="dashboard-links" aria-label={t("dashboard.shortcuts")}>
          {shortcuts.map(({ to, key, icon: Icon }) => (
            <Link key={key} to={to} className="dashboard-link">
              <Icon size={18} aria-hidden="true" />
              <div>
                <h2>{t(`dashboard.${key}`)}</h2>
                <p>{t(`dashboard.${key}Description`)}</p>
              </div>
              <ArrowRight size={16} aria-hidden="true" />
            </Link>
          ))}
        </nav>
      </div>
      <section className="dashboard-operation-panel">
        <header>
          <div>
            <h2>{t("dashboard.resume")}</h2>
            <p>{t("dashboard.resumeDescription")}</p>
          </div>
          <Link to="/issues" className="button button-ghost">
            {t("dashboard.viewIssues")}
            <ArrowRight size={16} aria-hidden="true" />
          </Link>
        </header>
        {activeIssues.length ? (
          activeIssues.map((issue) => (
            <div className="dashboard-operation-row" key={issue.id}>
              <span className="dashboard-operation-id">{issue.identifier}</span>
              <strong>{issue.title}</strong>
              <StatusPill status={issue.status} />
              <button
                type="button"
                className="button button-ghost"
                onClick={() => onOpenIssue(issue.id)}
                aria-label={t("dashboard.openIssue", { title: issue.title })}
              >
                {t("dashboard.open")}
                <ArrowRight size={16} aria-hidden="true" />
              </button>
            </div>
          ))
        ) : (
          <p className="dashboard-operation-empty">
            {t("dashboard.noActiveIssues")}
          </p>
        )}
      </section>
    </div>
  );
}
