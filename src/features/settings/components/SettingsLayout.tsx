import { ChevronRight } from "lucide-react";
import { useTranslation } from "react-i18next";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import {
  findSettingsNavItem,
  settingsNavigation,
  type SettingsRouteId,
} from "../settings-navigation";

export function SettingsLayout() {
  const { pathname, search } = useLocation();
  const navigate = useNavigate();
  const { t } = useTranslation("settings");
  const active = findSettingsNavItem(pathname);
  const groupLabels: Record<string, string> = {
    workspace: t("v2.layout.groups.workspace"),
    automation: t("v2.layout.groups.automation"),
    integrations: t("v2.layout.groups.integrations"),
    engineering: t("v2.layout.groups.engineering"),
  };
  const itemLabels: Record<SettingsRouteId, string> = {
    overview: t("v2.layout.items.overview"),
    whatsapp: t("v2.layout.items.whatsapp"),
    team: t("v2.layout.items.team"),
    audit: t("v2.layout.items.audit"),
    ai: t("v2.layout.items.ai"),
    flows: t("v2.layout.items.flows"),
    integrations: t("v2.layout.items.integrations"),
    github: t("v2.layout.items.github"),
    google: t("v2.layout.items.google"),
    mcp: t("v2.layout.items.mcp"),
    repositories: t("v2.layout.items.repositories"),
    "coding-connections": t("v2.layout.items.codingConnections"),
    "coding-routing": t("v2.layout.items.codingRouting"),
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
              <optgroup
                key={group.id}
                label={groupLabels[group.id] ?? group.label}
              >
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
                {groupLabels[group.id] ?? group.label}
              </span>
              {group.items.map(({ id, label, path, icon: Icon }) => (
                <NavLink
                  key={id}
                  to={`${path}${search}`}
                  end={path === "/settings"}
                  className={({ isActive }) =>
                    `settings-v2-nav-item ${isActive ? "selected" : ""}`.trim()
                  }
                >
                  <Icon size={15} aria-hidden="true" />
                  <span>{itemLabels[id] ?? label}</span>
                </NavLink>
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
          <strong>{itemLabels[active.id] ?? active.label}</strong>
        </div>
        <Outlet />
      </main>
    </div>
  );
}
