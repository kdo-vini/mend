import { useLayoutEffect, useRef, useState } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import {
  Bell,
  ChevronRight,
  LogOut,
  Menu,
  MoreHorizontal,
  Moon,
  Search,
  Settings as SettingsIcon,
  Sun,
} from "lucide-react";
import type {
  PushSetupResult,
  WorkspaceNotification,
} from "../../api/notifications";
import { formatActivityTime, identityInitials } from "../../shared/lib/format";
import { navItems } from "./navigation";

export function NotificationCenter({
  notifications,
  unreadNotificationCount,
  pushStatus,
  onEnablePush,
  onDismissNotification,
  onDismissAllNotifications,
}: {
  notifications: WorkspaceNotification[];
  unreadNotificationCount: number;
  pushStatus: PushSetupResult | "idle";
  onEnablePush: () => void;
  onDismissNotification: (id: string) => void;
  onDismissAllNotifications: () => void;
}) {
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
    if (notification.entity_type === "conversation" && notification.entity_id)
      navigate(
        `/inbox?conversation=${encodeURIComponent(notification.entity_id)}`,
      );
    else if (notification.entity_type === "issue") navigate("/issues");
  };

  return (
    <div className="notification-center">
      <button
        ref={triggerRef}
        className="icon-button subtle notification-trigger"
        type="button"
        aria-label={`Notifications${unreadNotificationCount ? ` (${unreadNotificationCount} unread)` : ""}`}
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
          aria-label="Notifications"
          style={{
            top: panelPosition?.top ?? 12,
            left: panelPosition?.left ?? 12,
            maxHeight: panelPosition?.maxHeight,
            visibility: panelPosition ? "visible" : "hidden",
          }}
        >
          <div className="notification-panel-header">
            <div>
              <strong>Notifications</strong>
              <small>
                {unread.length ? `${unread.length} unread` : "All caught up"}
              </small>
            </div>
            {unread.length > 0 && (
              <button
                className="text-button"
                type="button"
                onClick={onDismissAllNotifications}
              >
                Dismiss all
              </button>
            )}
          </div>
          <div className="notification-list">
            {notifications.length === 0 ? (
              <div className="notification-empty">
                No workspace notifications yet.
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
                    <strong>{notification.title}</strong>
                    <span>{notification.body}</span>
                    <small>{formatActivityTime(notification.created_at)}</small>
                  </span>
                </button>
              ))
            )}
          </div>
          <div className="notification-panel-footer">
            <span>
              {pushStatus === "enabled"
                ? "Native notifications enabled"
                : "Get alerts when you are away"}
            </span>
            {pushStatus !== "enabled" && (
              <button
                className="button button-ghost"
                type="button"
                onClick={onEnablePush}
              >
                Enable native alerts
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
  onEnablePush: () => void;
  onDismissNotification: (id: string) => void;
  onDismissAllNotifications: () => void;
}) {
  const navigate = useNavigate();
  return (
    <aside className="sidebar">
      <div className="brand-row">
        <div className="brand-mark">
          <span />
        </div>
        <div>
          <div className="brand-name">Mend</div>
          <div className="brand-subtitle">support operations</div>
        </div>
        <button
          className="icon-button subtle sidebar-collapse"
          type="button"
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          aria-expanded={!collapsed}
          onClick={onToggle}
        >
          <Menu size={16} />
        </button>
      </div>
      <button className="command-trigger" type="button" onClick={onOpenCommand}>
        <Search size={15} />
        <span>Search everything</span>
        <kbd>⌘ K</kbd>
      </button>
      <nav className="primary-nav" aria-label="Primary navigation">
        <div className="nav-section-label">Workspace</div>
        {navItems.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) => `nav-item ${isActive ? "active" : ""}`}
          >
            <Icon size={16} strokeWidth={1.7} />
            <span>{label}</span>
          </NavLink>
        ))}
      </nav>
      <div className="sidebar-bottom">
        <div className="sidebar-bottom-header">
          <span className="sidebar-bottom-label">Session</span>
          <div className="sidebar-utilities">
            <NotificationCenter
              notifications={notifications}
              unreadNotificationCount={unreadNotificationCount}
              pushStatus={pushStatus}
              onEnablePush={onEnablePush}
              onDismissNotification={onDismissNotification}
              onDismissAllNotifications={onDismissAllNotifications}
            />
            <button
              className="icon-button subtle"
              type="button"
              aria-label={`Use ${theme === "dark" ? "light" : "dark"} theme`}
              onClick={onToggleTheme}
            >
              {theme === "dark" ? <Sun size={15} /> : <Moon size={15} />}
            </button>
            <button
              className="icon-button subtle"
              type="button"
              aria-label="Log out"
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
          aria-label="Open profile"
        >
          <div className="avatar avatar-small avatar-violet">
            {identityInitials(operator.name)}
          </div>
          <span>
            <small className="user-row-label">Signed in as</small>
            <strong>{operator.name}</strong>
            <small>{operator.email || "Workspace member"}</small>
          </span>
          <ChevronRight size={14} />
        </button>
      </div>
    </aside>
  );
}

export function MobileTopbar({
  operator,
  onOpenCommand,
  notifications,
  unreadNotificationCount,
  pushStatus,
  onEnablePush,
  onDismissNotification,
  onDismissAllNotifications,
}: {
  operator: { name: string; email: string };
  onOpenCommand: () => void;
  notifications: WorkspaceNotification[];
  unreadNotificationCount: number;
  pushStatus: PushSetupResult | "idle";
  onEnablePush: () => void;
  onDismissNotification: (id: string) => void;
  onDismissAllNotifications: () => void;
}) {
  return (
    <header className="mobile-topbar">
      <NavLink className="mobile-brand" to="/inbox" aria-label="Open Inbox">
        <span className="brand-mark">
          <span />
        </span>
        <strong>Mend</strong>
      </NavLink>
      <div className="mobile-topbar-actions">
        <NotificationCenter
          notifications={notifications}
          unreadNotificationCount={unreadNotificationCount}
          pushStatus={pushStatus}
          onEnablePush={onEnablePush}
          onDismissNotification={onDismissNotification}
          onDismissAllNotifications={onDismissAllNotifications}
        />
        <button
          className="mobile-command-button"
          type="button"
          onClick={onOpenCommand}
          aria-label="Search workspace"
        >
          <Search size={17} />
        </button>
        <NavLink
          className="mobile-profile-link"
          to="/profile"
          aria-label="Open profile"
        >
          <span className="avatar avatar-small avatar-violet">
            {identityInitials(operator.name)}
          </span>
        </NavLink>
      </div>
    </header>
  );
}

export function MobileBottomNav() {
  const primary = navItems.filter(({ to }) =>
    ["/inbox", "/kanban", "/issues", "/codex-runs"].includes(to),
  );
  return (
    <nav className="mobile-bottom-nav" aria-label="Mobile navigation">
      {primary.map(({ to, label, icon: Icon }) => (
        <NavLink
          key={to}
          to={to}
          className={({ isActive }) =>
            `mobile-nav-item ${isActive ? "active" : ""}`
          }
        >
          <Icon size={19} strokeWidth={1.8} />
          <span>{label === "Codex runs" ? "Runs" : label}</span>
        </NavLink>
      ))}
      <details className="mobile-more-menu">
        <summary className="mobile-nav-item">
          <MoreHorizontal size={19} strokeWidth={1.8} />
          <span>More</span>
        </summary>
        <div className="mobile-more-popover">
          <NavLink to="/knowledge">
            <span>Knowledge</span>
          </NavLink>
          <NavLink to="/settings">
            <SettingsIcon size={16} />
            <span>Settings</span>
          </NavLink>
          <NavLink to="/profile">
            <span>Profile</span>
          </NavLink>
        </div>
      </details>
    </nav>
  );
}
