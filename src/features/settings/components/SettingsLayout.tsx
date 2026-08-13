import { ChevronRight } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Link, Outlet, useLocation, useNavigate } from "react-router-dom";
import {
  findSettingsNavItem,
  settingsNavigation,
  type SettingsNavGroupId,
  type SettingsRouteId,
} from "../settings-navigation";

export function SettingsLayout() {
  const { pathname, search } = useLocation();
  const navigate = useNavigate();
  const { t } = useTranslation("settings");
  const active = findSettingsNavItem(pathname);
  const groupLabels: Record<SettingsNavGroupId, string> = {
    workspace: t("v2.layout.groups.workspace"),
    support: t("v2.layout.groups.support"),
    engineering: t("v2.layout.groups.engineering"),
    connections: t("v2.layout.groups.connections"),
  };
  const itemLabels: Record<SettingsRouteId, string> = {
    overview: t("v2.layout.items.overview"),
    whatsapp: t("v2.layout.items.whatsapp"),
    team: t("v2.layout.items.team"),
    audit: t("v2.layout.items.audit"),
    automation: t("v2.layout.items.automation"),
    repositories: t("v2.layout.items.repositories"),
    agents: t("v2.layout.items.agents"),
    integrations: t("v2.layout.items.integrations"),
  };

  return (
    <div className="settings-v2-shell">
      <aside
        className="settings-v2-sidebar"
        aria-label={t("v2.layout.navigation")}
      >
        <div className="settings-v2-sidebar-intro">
          <span className="settings-v2-label">{t("v2.layout.eyebrow")}</span>
          <strong>{t("v2.layout.title")}</strong>
        </div>
        <label className="settings-v2-mobile-nav">
          <span>{t("v2.layout.sectionSelect")}</span>
          <select
            aria-label={t("v2.layout.sectionSelect")}
            value={active.path}
            onChange={(event) => navigate(`${event.target.value}${search}`)}
          >
            {settingsNavigation.map((group) => (
              <optgroup key={group.id} label={groupLabels[group.id]}>
                {group.items.map((item) => (
                  <option key={item.id} value={item.path}>
                    {itemLabels[item.id]}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </label>
        <nav className="settings-v2-nav">
          {settingsNavigation.map((group) => (
            <div className="settings-v2-nav-group" key={group.id}>
              <span className="settings-v2-nav-group-label">
                {groupLabels[group.id]}
              </span>
              {group.items.map(({ id, path, icon: Icon }) => (
                <Link
                  key={id}
                  to={`${path}${search}`}
                  aria-current={id === active.id ? "page" : undefined}
                  className={`settings-v2-nav-item ${id === active.id ? "selected" : ""}`.trim()}
                >
                  <Icon size={15} aria-hidden="true" />
                  <span>{itemLabels[id]}</span>
                </Link>
              ))}
            </div>
          ))}
        </nav>
      </aside>
      <main className="settings-v2-content">
        <div
          className="settings-v2-breadcrumb"
          aria-label={t("v2.layout.breadcrumb")}
        >
          <span>{t("v2.layout.title")}</span>
          <ChevronRight size={13} aria-hidden="true" />
          <strong>{itemLabels[active.id]}</strong>
        </div>
        <Outlet />
      </main>
    </div>
  );
}
