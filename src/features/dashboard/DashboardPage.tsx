import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { ArrowRight, Inbox, CircleDot, Settings } from "lucide-react";
import { PageHeader } from "../../shared/ui/PageHeader";
import { FinancePage } from "../finance/FinancePage";

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
        {t("dashboard.signedIn", {
          name: operator.name,
          email: operator.email,
        })}
      </p>
      <FinancePage compact />
      <div className="dashboard-links">
        <Link to="/inbox" className="dashboard-link">
          <Inbox size={20} aria-hidden="true" />
          <div>
            <h2>{t("dashboard.whatsapp")}</h2>
            <p>{t("dashboard.whatsappDescription")}</p>
          </div>
          <ArrowRight size={18} aria-hidden="true" />
        </Link>
        <Link to="/issues" className="dashboard-link">
          <CircleDot size={20} aria-hidden="true" />
          <div>
            <h2>{t("dashboard.issues")}</h2>
            <p>{t("dashboard.issuesDescription")}</p>
          </div>
          <ArrowRight size={18} aria-hidden="true" />
        </Link>
        <Link to="/settings" className="dashboard-link">
          <Settings size={20} aria-hidden="true" />
          <div>
            <h2>{t("dashboard.settings")}</h2>
            <p>{t("dashboard.settingsDescription")}</p>
          </div>
          <ArrowRight size={18} aria-hidden="true" />
        </Link>
      </div>
    </div>
  );
}
