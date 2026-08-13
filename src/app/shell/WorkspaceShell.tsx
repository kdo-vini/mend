import { useLayoutEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { NavLink, useLocation, useNavigate } from "react-router-dom";
import {
  Bell,
  ChevronRight,
  LogOut,
  Menu,
  MoreHorizontal,
  Moon,
  Search,
  Sun,
} from "lucide-react";
import type {
  PushSetupResult,
  WorkspaceNotification,
} from "../../api/notifications";
import { BrandMark } from "../../components/BrandLockup";
import { formatActivityTime, identityInitials } from "../../shared/lib/format";
import { navItems } from "./navigation";

export function NotificationCenter({
  notifications,
  unreadNotificationCount,
  pushStatus,
  resolveDestination,
  onEnablePush,
  onDismissNotification,
  onDismissAllNotifications,
}: {
  notifications: WorkspaceNotification[];
  unreadNotificationCount: number;
  pushStatus: PushSetupResult | "idle";
  resolveDestination: (notification: WorkspaceNotification) => string;
  onEnablePush: () => void;
  onDismissNotification: (id: string) => void;
  onDismissAllNotifications: () => void;
}) {
  const { t } = useTranslation(["common", "notifications"]);
  const notificationText = (notification: WorkspaceNotification) => {
    if (notification.kind === "conversation_message") {
      return {
        title: t("conversationMessageTitle", { ns: "notifications" }),
        body: t("conversationMessageBody", { ns: "notifications" }),
      };
    }
    return { title: notification.title, body: notification.body };
  };
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [panelPosition, setPanelPosition] = useState<{
    top: number;
    left: number;
    maxHeight: number;
    side: "left" | "right";
  } | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const unread = notifications.filter((notification) => !notification.read_at);

  useLayoutEffect(() => {
    if (!open) return;

    const updatePanelPosition = () => {
      const trigger = triggerRef.current;
      if (!trigger) return;

      const rect = trigger.getBoundingClientRect();
      const viewportPadding = 12;
      const gap = 8;
      const panelWidth = Math.min(
        360,
        Math.max(0, window.innerWidth - viewportPadding * 2),
      );
      const side = rect.left < window.innerWidth / 2 ? "left" : "right";
      const left =
        side === "left"
          ? Math.min(
              rect.right + gap,
              window.innerWidth - panelWidth - viewportPadding,
            )
          : Math.min(
              Math.max(rect.right - panelWidth, viewportPadding),
              Math.max(
                viewportPadding,
                window.innerWidth - panelWidth - viewportPadding,
              ),
            );
      const desiredHeight = panelRef.current?.scrollHeight ?? 480;
      const belowSpace = Math.max(
        0,
        window.innerHeight - rect.bottom - viewportPadding - gap,
      );
      const aboveSpace = Math.max(0, rect.top - viewportPadding - gap);
      const openAbove = belowSpace < desiredHeight && aboveSpace > belowSpace;
      const availableSpace = openAbove ? aboveSpace : belowSpace;
      const panelHeight = Math.max(
        1,
        Math.min(Math.floor(desiredHeight), Math.floor(availableSpace)),
      );
      const top = openAbove
        ? Math.max(viewportPadding, rect.top - gap - panelHeight)
        : Math.min(
            rect.bottom + gap,
            window.innerHeight - viewportPadding - panelHeight,
          );

      setPanelPosition({
        top,
        left,
        maxHeight: panelHeight,
        side,
      });
    };

    updatePanelPosition();
    window.addEventListener("resize", updatePanelPosition);
    window.addEventListener("scroll", updatePanelPosition, true);
    return () => {
      window.removeEventListener("resize", updatePanelPosition);
      window.removeEventListener("scroll", updatePanelPosition, true);
    };
  }, [open, notifications.length, pushStatus]);

  const openNotification = (notification: WorkspaceNotification) => {
    onDismissNotification(notification.id);
    setOpen(false);
    navigate(resolveDestination(notification));
  };

  return (
    <div className="notification-center">
      <button
        ref={triggerRef}
        className="icon-button subtle notification-trigger"
        type="button"
        aria-label={t("navigation.notificationsLabel", {
          count: unreadNotificationCount
            ? ` (${t("navigation.unread", { count: unreadNotificationCount })})`
            : "",
        })}
        aria-expanded={open}
        onClick={() => {
          setPanelPosition(null);
          setOpen((current) => !current);
        }}
      >
        <Bell size={16} />
        {unreadNotificationCount > 0 && (
          <span className="notification-badge">{unreadNotificationCount}</span>
        )}
      </button>
      {open && (
        <div
          ref={panelRef}
          className={`notification-panel notification-panel-${panelPosition?.side ?? "right"}`}
          role="dialog"
          aria-label={t("navigation.notifications")}
          style={{
            top: panelPosition?.top ?? 12,
            left: panelPosition?.left ?? 12,
            maxHeight: panelPosition?.maxHeight,
            visibility: panelPosition ? "visible" : "hidden",
          }}
        >
          <div className="notification-panel-header">
            <div>
              <strong>{t("navigation.notifications")}</strong>
              <small>
                {unread.length
                  ? t("navigation.unread", { count: unread.length })
                  : t("states.allCaughtUp")}
              </small>
            </div>
            {unread.length > 0 && (
              <button
                className="text-button"
                type="button"
                onClick={onDismissAllNotifications}
              >
                {t("navigation.dismissAll")}
              </button>
            )}
          </div>
          <div className="notification-list">
            {notifications.length === 0 ? (
              <div className="notification-empty">
                {t("navigation.noNotifications")}
              </div>
            ) : (
              notifications.slice(0, 12).map((notification) => (
                <button
                  className="notification-item unread"
                  type="button"
                  key={notification.id}
                  onClick={() => openNotification(notification)}
                >
                  <span className="notification-item-icon">
                    <Bell size={14} />
                  </span>
                  <span className="notification-item-copy">
                    <strong>{notificationText(notification).title}</strong>
                    <span>{notificationText(notification).body}</span>
                    <small>{formatActivityTime(notification.created_at)}</small>
                  </span>
                </button>
              ))
            )}
          </div>
          <div className="notification-panel-footer">
            <span>
              {pushStatus === "enabled"
                ? t("navigation.nativeNotificationsEnabled")
                : t("navigation.awayAlerts")}
            </span>
            {pushStatus !== "enabled" && (
              <button
                className="button button-ghost"
                type="button"
                onClick={onEnablePush}
              >
                {t("navigation.enableNativeAlerts")}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export function Sidebar({
  collapsed,
  onToggle,
  onOpenCommand,
  operator,
  theme,
  onToggleTheme,
  onSignOut,
  notifications,
  unreadNotificationCount,
  pushStatus,
  resolveNotificationDestination,
  onEnablePush,
  onDismissNotification,
  onDismissAllNotifications,
}: {
  collapsed: boolean;
  onToggle: () => void;
  onOpenCommand: () => void;
  operator: { name: string; email: string };
  theme: "dark" | "light";
  onToggleTheme: () => void;
  onSignOut: () => void;
  notifications: WorkspaceNotification[];
  unreadNotificationCount: number;
  pushStatus: PushSetupResult | "idle";
  resolveNotificationDestination: (
    notification: WorkspaceNotification,
  ) => string;
  onEnablePush: () => void;
  onDismissNotification: (id: string) => void;
  onDismissAllNotifications: () => void;
}) {
  const { t } = useTranslation("common");
  const navigate = useNavigate();
  return (
    <aside className="sidebar">
      <div className="brand-row">
        <BrandMark />
        <div>
          <div className="brand-name">{t("brand.name")}</div>
          <div className="brand-subtitle">{t("brand.descriptor")}</div>
        </div>
        <button
          className="icon-button subtle sidebar-collapse"
          type="button"
          aria-label={
            collapsed
              ? t("navigation.expandSidebar")
              : t("navigation.collapseSidebar")
          }
          aria-expanded={!collapsed}
          onClick={onToggle}
        >
          <Menu size={16} />
        </button>
      </div>
      <button className="command-trigger" type="button" onClick={onOpenCommand}>
        <Search size={15} />
        <span>{t("navigation.searchEverything")}</span>
        <kbd>{t("navigation.shortcutCommand")}</kbd>
      </button>
      <nav
        className="primary-nav"
        aria-label={t("navigation.primaryNavigation")}
      >
        <div className="nav-section-label">{t("navigation.workspace")}</div>
        {navItems.map(({ id, to, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) => `nav-item ${isActive ? "active" : ""}`}
          >
            <Icon size={16} strokeWidth={1.7} />
            <span>{t(`navigation.${id}`)}</span>
          </NavLink>
        ))}
      </nav>
      <div className="sidebar-bottom">
        <div className="sidebar-bottom-header">
          <span className="sidebar-bottom-label">
            {t("navigation.session")}
          </span>
          <div className="sidebar-utilities">
            <NotificationCenter
              notifications={notifications}
              unreadNotificationCount={unreadNotificationCount}
              pushStatus={pushStatus}
              resolveDestination={resolveNotificationDestination}
              onEnablePush={onEnablePush}
              onDismissNotification={onDismissNotification}
              onDismissAllNotifications={onDismissAllNotifications}
            />
            <button
              className="icon-button subtle"
              type="button"
              aria-label={t("navigation.useTheme", {
                theme: t(
                  theme === "dark"
                    ? "navigation.themeLight"
                    : "navigation.themeDark",
                ),
              })}
              onClick={onToggleTheme}
            >
              {theme === "dark" ? <Sun size={15} /> : <Moon size={15} />}
            </button>
            <button
              className="icon-button subtle"
              type="button"
              aria-label={t("navigation.logout")}
              onClick={onSignOut}
            >
              <LogOut size={15} />
            </button>
          </div>
        </div>
        <button
          className="user-row"
          type="button"
          onClick={() => navigate("/profile")}
          aria-label={t("navigation.openProfile")}
        >
          <div className="avatar avatar-small avatar-violet">
            {identityInitials(operator.name)}
          </div>
          <span>
            <small className="user-row-label">
              {t("navigation.signedInAs")}
            </small>
            <strong>{operator.name}</strong>
            <small>{operator.email || t("navigation.workspaceMember")}</small>
          </span>
          <ChevronRight size={14} />
        </button>
      </div>
    </aside>
  );
}

export function MobileTopbar({
  onOpenCommand,
  notifications,
  unreadNotificationCount,
  pushStatus,
  resolveNotificationDestination,
  onEnablePush,
  onDismissNotification,
  onDismissAllNotifications,
}: {
  onOpenCommand: () => void;
  notifications: WorkspaceNotification[];
  unreadNotificationCount: number;
  pushStatus: PushSetupResult | "idle";
  resolveNotificationDestination: (
    notification: WorkspaceNotification,
  ) => string;
  onEnablePush: () => void;
  onDismissNotification: (id: string) => void;
  onDismissAllNotifications: () => void;
}) {
  const { t } = useTranslation("common");
  return (
    <header className="mobile-topbar">
      <NavLink
        className="mobile-brand"
        to="/inbox"
        aria-label={t("navigation.openInbox")}
      >
        <BrandMark />
        <strong>{t("brand.name")}</strong>
      </NavLink>
      <div className="mobile-topbar-actions">
        <NotificationCenter
          notifications={notifications}
          unreadNotificationCount={unreadNotificationCount}
          pushStatus={pushStatus}
          resolveDestination={resolveNotificationDestination}
          onEnablePush={onEnablePush}
          onDismissNotification={onDismissNotification}
          onDismissAllNotifications={onDismissAllNotifications}
        />
        <button
          className="mobile-command-button"
          type="button"
          onClick={onOpenCommand}
          aria-label={t("navigation.searchWorkspace")}
        >
          <Search size={17} />
        </button>
      </div>
    </header>
  );
}

export function MobileBottomNav({
  theme,
  onToggleTheme,
  onSignOut,
}: {
  theme: "dark" | "light";
  onToggleTheme: () => void;
  onSignOut: () => void;
}) {
  const { t } = useTranslation("common");
  const { search } = useLocation();
  const [moreOpen, setMoreOpen] = useState(false);
  const primary = navItems.filter(({ id }) =>
    ["inbox", "issues", "runs"].includes(id),
  );
  const secondarySearch = new URLSearchParams(search);
  secondarySearch.delete("mode");
  secondarySearch.delete("view");
  const secondaryQuery = secondarySearch.toString();
  const myWorkHref = `/my-work${secondaryQuery ? `?${secondaryQuery}` : ""}`;
  return (
    <nav
      className="mobile-bottom-nav"
      aria-label={t("navigation.mobileNavigation")}
    >
      {primary.map(({ id, to, icon: Icon }) => (
        <NavLink
          key={to}
          to={to}
          className={({ isActive }) =>
            `mobile-nav-item ${isActive ? "active" : ""}`
          }
        >
          <Icon size={19} strokeWidth={1.8} />
          <span>{t(`navigation.${id}`)}</span>
        </NavLink>
      ))}
      <div className={`mobile-more-menu ${moreOpen ? "is-open" : ""}`}>
        <button
          className="mobile-nav-item"
          type="button"
          aria-expanded={moreOpen}
          onClick={() => setMoreOpen((current) => !current)}
        >
          <MoreHorizontal size={19} strokeWidth={1.8} />
          <span>{t("navigation.more")}</span>
        </button>
        {moreOpen && (
          <div className="mobile-more-popover">
            <NavLink to="/knowledge" onClick={() => setMoreOpen(false)}>
              {t("navigation.knowledge")}
            </NavLink>
            <NavLink to={myWorkHref} onClick={() => setMoreOpen(false)}>
              {t("navigation.myWork")}
            </NavLink>
            <NavLink to="/settings" onClick={() => setMoreOpen(false)}>
              {t("navigation.settings")}
            </NavLink>
            <NavLink to="/profile" onClick={() => setMoreOpen(false)}>
              {t("navigation.profile")}
            </NavLink>
            <div className="mobile-more-actions">
              <button
                type="button"
                aria-label={t("navigation.useTheme", {
                  theme: t(
                    theme === "dark"
                      ? "navigation.themeLight"
                      : "navigation.themeDark",
                  ),
                })}
                onClick={onToggleTheme}
              >
                {theme === "dark" ? <Sun size={15} /> : <Moon size={15} />}
              </button>
              <button
                type="button"
                aria-label={t("navigation.logout")}
                onClick={onSignOut}
              >
                <LogOut size={15} />
              </button>
            </div>
          </div>
        )}
      </div>
    </nav>
  );
}
