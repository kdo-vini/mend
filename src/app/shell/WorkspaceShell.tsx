import { useState } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import {
  Bell,
  ChevronRight,
  LogOut,
  Menu,
  Moon,
  Search,
  Settings as SettingsIcon,
  Sun,
} from "lucide-react";
import type {
  PushSetupResult,
  WorkspaceNotification,
} from "../../api/notifications";
import type { WhatsAppInstance } from "../../api/live-actions";
import { formatActivityTime, identityInitials } from "../../shared/lib/format";
import { navItems } from "./navigation";

export function NotificationCenter({
  notifications,
  unreadNotificationCount,
  pushStatus,
  onEnablePush,
  onReadNotification,
}: {
  notifications: WorkspaceNotification[];
  unreadNotificationCount: number;
  pushStatus: PushSetupResult | "idle";
  onEnablePush: () => void;
  onReadNotification: (id: string) => void;
}) {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const unread = notifications.filter((notification) => !notification.read_at);
  const openNotification = (notification: WorkspaceNotification) => {
    onReadNotification(notification.id);
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
        className="icon-button subtle notification-trigger"
        type="button"
        aria-label={`Notifications${unreadNotificationCount ? ` (${unreadNotificationCount} unread)` : ""}`}
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
      >
        <Bell size={16} />
        {unreadNotificationCount > 0 && (
          <span className="notification-badge">{unreadNotificationCount}</span>
        )}
      </button>
      {open && (
        <div
          className="notification-panel"
          role="dialog"
          aria-label="Notifications"
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
                onClick={() =>
                  unread.forEach((notification) =>
                    onReadNotification(notification.id),
                  )
                }
              >
                Mark read
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
                  className={`notification-item${notification.read_at ? "" : " unread"}`}
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
  workspaceName,
  channel,
  demoMode,
  operator,
  theme,
  onToggleTheme,
  onSignOut,
  notifications,
  unreadNotificationCount,
  pushStatus,
  onEnablePush,
  onReadNotification,
}: {
  collapsed: boolean;
  onToggle: () => void;
  onOpenCommand: () => void;
  workspaceName: string;
  channel: WhatsAppInstance | null;
  demoMode: boolean;
  operator: { name: string; email: string };
  theme: "dark" | "light";
  onToggleTheme: () => void;
  onSignOut: () => void;
  notifications: WorkspaceNotification[];
  unreadNotificationCount: number;
  pushStatus: PushSetupResult | "idle";
  onEnablePush: () => void;
  onReadNotification: (id: string) => void;
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
      <button
        className="workspace-switcher"
        type="button"
        aria-label="Open workspace profile"
        onClick={() => navigate("/profile?tab=workspace")}
      >
        <span className="workspace-dot">
          {workspaceName.slice(0, 1).toUpperCase()}
        </span>
        <span className="workspace-copy">
          <strong>{workspaceName}</strong>
          <small>{demoMode ? "demo mode" : "live workspace"}</small>
        </span>
        <ChevronRight size={14} />
      </button>
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
        <div className="sidebar-utilities">
          <NotificationCenter
            notifications={notifications}
            unreadNotificationCount={unreadNotificationCount}
            pushStatus={pushStatus}
            onEnablePush={onEnablePush}
            onReadNotification={onReadNotification}
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
        <button
          className="live-connection"
          type="button"
          onClick={() => navigate("/settings")}
        >
          <span
            className={`live-dot ${channel?.state === "open" ? "" : "offline"}`}
          />
          <span>
            <strong>
              {channel?.state === "open"
                ? "WhatsApp connected"
                : "WhatsApp not connected"}
            </strong>
            <small>
              {channel?.instanceName ??
                (demoMode ? "Demo mode" : "Connect a number in Settings")}
            </small>
          </span>
          <SettingsIcon size={15} />
        </button>
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
  onReadNotification,
}: {
  operator: { name: string; email: string };
  onOpenCommand: () => void;
  notifications: WorkspaceNotification[];
  unreadNotificationCount: number;
  pushStatus: PushSetupResult | "idle";
  onEnablePush: () => void;
  onReadNotification: (id: string) => void;
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
          onReadNotification={onReadNotification}
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
  return (
    <nav className="mobile-bottom-nav" aria-label="Mobile navigation">
      {navItems.map(({ to, label, icon: Icon }) => (
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
    </nav>
  );
}
