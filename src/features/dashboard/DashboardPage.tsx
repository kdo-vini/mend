import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { ArrowRight, Inbox, CircleDot, Settings } from "lucide-react";
import { PageHeader } from "../../shared/ui/PageHeader";

const shortcuts = [
  { to: "/inbox", key: "whatsapp", icon: Inbox },
  { to: "/issues", key: "issues", icon: CircleDot },
  { to: "/settings", key: "settings", icon: Settings },
] as const;

export function DashboardPage({
  operator,
}: {
  operator: { name: string; email: string };
}) {
  const { t } = useTranslation("common");
  return (
    <div className="page diagium-dashboard">
      <PageHeader title={t("dashboard.title")} />
      <div className="dashboard-overview-layout">
        <section className="dashboard-welcome">
          <h2>{t("dashboard.description")}</h2>
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
    </div>
  );
}
