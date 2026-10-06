import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { ArrowRight, Inbox, CircleDot, Settings } from "lucide-react";
import { PageHeader } from "../../shared/ui/PageHeader";
import { FinanceOverview } from "../finance/FinanceOverview";

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
      <PageHeader
        title={t("dashboard.title")}
        description={t("dashboard.description")}
      />
      <p className="dashboard-identity">
        {operator.email
          ? t("dashboard.signedIn", {
              name: operator.name,
              email: operator.email,
            })
          : operator.name}
      </p>
      <FinanceOverview />
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
  );
}
