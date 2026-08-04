import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import type { User } from "@supabase/supabase-js";
import {
  Building2,
  CalendarDays,
  CreditCard,
  LogOut,
  Mail,
  Save,
  ShieldCheck,
  UserRound,
} from "lucide-react";
import {
  getCurrentUser,
  getMyWorkspace,
  signOut,
  updateWorkspace,
  type WorkspaceWithRole,
} from "../api/auth";
import { supabase } from "../lib/supabase";
import { ErrorState, LoadingState } from "./ResourceState";

type ProfileTab = "profile" | "workspace" | "subscription" | "security";

const profileTabs: Array<{
  id: ProfileTab;
  label: string;
  icon: typeof UserRound;
}> = [
  { id: "profile", label: "Profile", icon: UserRound },
  { id: "workspace", label: "Workspace", icon: Building2 },
  { id: "subscription", label: "Subscription", icon: CreditCard },
  { id: "security", label: "Security", icon: ShieldCheck },
];

const isProfileTab = (value: string | null): value is ProfileTab =>
  profileTabs.some((tab) => tab.id === value);

function initials(name: string) {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0])
      .join("")
      .toUpperCase() || "OP"
  );
}

function formatDate(value?: string | null) {
  if (!value) return "Not available";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : new Intl.DateTimeFormat("pt-BR", {
        dateStyle: "medium",
        timeStyle: "short",
      }).format(date);
}

export function ProfileWorkspacePage({
  workspaceId,
  onToast,
  onWorkspaceUpdated,
  onIdentityUpdated,
}: {
  workspaceId: string | null;
  onToast: (message: string) => void;
  onWorkspaceUpdated: (workspace: { id: string; name: string }) => void;
  onIdentityUpdated: (identity: { name: string; email: string }) => void;
}) {
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedTab = searchParams.get("tab");
  const activeTab: ProfileTab = isProfileTab(requestedTab)
    ? requestedTab
    : "profile";
  const [user, setUser] = useState<User | null>(null);
  const [workspace, setWorkspace] = useState<WorkspaceWithRole | null>(null);
  const [profileName, setProfileName] = useState("");
  const [workspaceForm, setWorkspaceForm] = useState({
    name: "",
    slug: "",
    issuePrefix: "",
    timezone: "",
    defaultLanguage: "",
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!supabase) {
      setError("Supabase is required to load your profile.");
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const [nextUser, nextWorkspace] = await Promise.all([
        getCurrentUser(supabase),
        workspaceId
          ? getMyWorkspace(workspaceId, supabase)
          : getMyWorkspace(undefined, supabase),
      ]);
      if (!nextUser)
        throw new Error("Your authenticated account could not be loaded.");
      const nextName =
        typeof nextUser.user_metadata.full_name === "string" &&
        nextUser.user_metadata.full_name.trim()
          ? nextUser.user_metadata.full_name.trim()
          : (nextUser.email?.split("@")[0] ?? "Current operator");
      setUser(nextUser);
      setWorkspace(nextWorkspace);
      setProfileName(nextName);
      setWorkspaceForm({
        name: nextWorkspace.name,
        slug: nextWorkspace.slug,
        issuePrefix: nextWorkspace.issue_prefix,
        timezone: nextWorkspace.timezone,
        defaultLanguage: nextWorkspace.default_language,
      });
      onIdentityUpdated({ name: nextName, email: nextUser.email ?? "" });
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Your profile could not be loaded.",
      );
    } finally {
      setLoading(false);
    }
  }, [onIdentityUpdated, workspaceId]);

  useEffect(() => {
    void load();
  }, [load]);

  const canEditWorkspace =
    workspace?.role === "owner" || workspace?.role === "admin";
  const accountName =
    profileName.trim() || user?.email?.split("@")[0] || "Current operator";
  const authProvider = useMemo(() => {
    const provider = user?.app_metadata.provider;
    return typeof provider === "string" ? provider : "email";
  }, [user]);

  const selectTab = (tab: ProfileTab) => {
    const next = new URLSearchParams(searchParams);
    if (tab === "profile") next.delete("tab");
    else next.set("tab", tab);
    setSearchParams(next, { replace: true });
  };

  const saveProfile = async () => {
    if (!supabase || !profileName.trim()) return;
    setSaving(true);
    try {
      const { data, error: updateError } = await supabase.auth.updateUser({
        data: { full_name: profileName.trim() },
      });
      if (updateError) throw updateError;
      setUser(data.user);
      onIdentityUpdated({
        name: profileName.trim(),
        email: data.user.email ?? "",
      });
      onToast("Profile saved");
    } catch (reason) {
      onToast(
        reason instanceof Error
          ? reason.message
          : "Profile could not be saved.",
      );
    } finally {
      setSaving(false);
    }
  };

  const saveWorkspace = async () => {
    if (!workspace || !canEditWorkspace) return;
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(workspaceForm.slug)) {
      onToast(
        "Workspace slug must use lowercase letters, numbers and hyphens.",
      );
      return;
    }
    if (!/^[A-Z][A-Z0-9]{1,7}$/.test(workspaceForm.issuePrefix)) {
      onToast("Issue prefix must contain 2–8 uppercase letters or numbers.");
      return;
    }
    setSaving(true);
    try {
      const updated = await updateWorkspace(
        workspace.id,
        workspaceForm,
        supabase ?? undefined,
      );
      setWorkspace((current) =>
        current ? { ...updated, role: current.role } : current,
      );
      setWorkspaceForm({
        name: updated.name,
        slug: updated.slug,
        issuePrefix: updated.issue_prefix,
        timezone: updated.timezone,
        defaultLanguage: updated.default_language,
      });
      onWorkspaceUpdated(updated);
      onToast("Workspace saved");
    } catch (reason) {
      onToast(
        reason instanceof Error
          ? reason.message
          : "Workspace could not be saved.",
      );
    } finally {
      setSaving(false);
    }
  };

  const leave = async () => {
    setSaving(true);
    const result = await signOut(supabase ?? undefined);
    setSaving(false);
    if (result.error) onToast(result.error.message);
  };

  if (loading)
    return (
      <div className="page profile-page">
        <LoadingState label="Loading your profile…" />
      </div>
    );
  if (error || !user || !workspace)
    return (
      <div className="page profile-page">
        <ErrorState
          title="Profile unavailable"
          description={
            error ?? "Your account or workspace could not be loaded."
          }
          onRetry={() => void load()}
        />
      </div>
    );

  return (
    <div className="page profile-page">
      <header className="page-header profile-header">
        <div>
          <div className="page-kicker">Account & workspace</div>
          <h1>Profile</h1>
          <p>
            Manage one area at a time. Account details, workspace identity,
            subscription status and security stay separated.
          </p>
        </div>
        <div className="profile-summary">
          <div className="avatar profile-avatar">{initials(accountName)}</div>
          <div>
            <strong>{accountName}</strong>
            <span>{user.email}</span>
          </div>
        </div>
      </header>
      <div className="profile-layout">
        <nav
          className="profile-tabs"
          role="tablist"
          aria-label="Profile sections"
        >
          {profileTabs.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              id={`profile-tab-${id}`}
              className={`profile-tab ${activeTab === id ? "selected" : ""}`}
              type="button"
              role="tab"
              aria-selected={activeTab === id}
              aria-controls={`profile-panel-${id}`}
              tabIndex={activeTab === id ? 0 : -1}
              onClick={() => selectTab(id)}
            >
              <Icon size={16} />
              <span>{label}</span>
            </button>
          ))}
        </nav>
        <main
          className="profile-panel"
          id={`profile-panel-${activeTab}`}
          role="tabpanel"
          aria-labelledby={`profile-tab-${activeTab}`}
        >
          {activeTab === "profile" && (
            <section className="profile-section">
              <div className="profile-section-heading">
                <div>
                  <h2>Personal profile</h2>
                  <p>
                    This name identifies you inside Mend. Your email comes from
                    the authenticated Supabase account.
                  </p>
                </div>
              </div>
              <div className="profile-identity-row">
                <div className="avatar profile-avatar large">
                  {initials(accountName)}
                </div>
                <div>
                  <strong>{accountName}</strong>
                  <span>
                    {workspace.role} · {workspace.name}
                  </span>
                </div>
              </div>
              <div className="profile-form">
                <label>
                  Display name
                  <input
                    value={profileName}
                    maxLength={100}
                    onChange={(event) => setProfileName(event.target.value)}
                    autoComplete="name"
                  />
                </label>
                <label>
                  Email
                  <div className="readonly-field">
                    <Mail size={14} />
                    <span>{user.email}</span>
                  </div>
                </label>
              </div>
              <div className="profile-actions">
                <button
                  className="button button-primary"
                  type="button"
                  disabled={saving || !profileName.trim()}
                  onClick={() => void saveProfile()}
                >
                  <Save size={14} /> {saving ? "Saving…" : "Save profile"}
                </button>
              </div>
            </section>
          )}

          {activeTab === "workspace" && (
            <section className="profile-section">
              <div className="profile-section-heading">
                <div>
                  <h2>Workspace identity</h2>
                  <p>
                    These values are used by the Inbox, issue identifiers and
                    localized automation.
                  </p>
                </div>
                <span className="role-pill">{workspace.role}</span>
              </div>
              {!canEditWorkspace && (
                <div className="settings-note">
                  <ShieldCheck size={14} />
                  <span>
                    Only workspace owners and admins can change these fields.
                  </span>
                </div>
              )}
              <div className="profile-form two-column">
                <label>
                  Workspace name
                  <input
                    value={workspaceForm.name}
                    disabled={!canEditWorkspace}
                    onChange={(event) =>
                      setWorkspaceForm((current) => ({
                        ...current,
                        name: event.target.value,
                      }))
                    }
                  />
                </label>
                <label>
                  Workspace slug
                  <input
                    value={workspaceForm.slug}
                    disabled={!canEditWorkspace}
                    onChange={(event) =>
                      setWorkspaceForm((current) => ({
                        ...current,
                        slug: event.target.value
                          .toLowerCase()
                          .replace(/[^a-z0-9-]/g, "-"),
                      }))
                    }
                  />
                </label>
                <label>
                  Issue prefix
                  <input
                    value={workspaceForm.issuePrefix}
                    maxLength={8}
                    disabled={!canEditWorkspace}
                    onChange={(event) =>
                      setWorkspaceForm((current) => ({
                        ...current,
                        issuePrefix: event.target.value
                          .toUpperCase()
                          .replace(/[^A-Z0-9]/g, ""),
                      }))
                    }
                  />
                </label>
                <label>
                  Timezone
                  <select
                    value={workspaceForm.timezone}
                    disabled={!canEditWorkspace}
                    onChange={(event) =>
                      setWorkspaceForm((current) => ({
                        ...current,
                        timezone: event.target.value,
                      }))
                    }
                  >
                    <option value="America/Sao_Paulo">America/Sao_Paulo</option>
                    <option value="UTC">UTC</option>
                  </select>
                </label>
                <label>
                  Default language
                  <select
                    value={workspaceForm.defaultLanguage}
                    disabled={!canEditWorkspace}
                    onChange={(event) =>
                      setWorkspaceForm((current) => ({
                        ...current,
                        defaultLanguage: event.target.value,
                      }))
                    }
                  >
                    <option value="pt-BR">Português (Brasil)</option>
                    <option value="en">English</option>
                    <option value="es">Español</option>
                  </select>
                </label>
              </div>
              <div className="profile-actions">
                <button
                  className="button button-primary"
                  type="button"
                  disabled={
                    saving ||
                    !canEditWorkspace ||
                    !workspaceForm.name.trim() ||
                    !workspaceForm.slug.trim()
                  }
                  onClick={() => void saveWorkspace()}
                >
                  <Save size={14} /> {saving ? "Saving…" : "Save workspace"}
                </button>
              </div>
            </section>
          )}

          {activeTab === "subscription" && (
            <section className="profile-section">
              <div className="profile-section-heading">
                <div>
                  <h2>Subscription</h2>
                  <p>
                    Mend is running as a private preview workspace. Billing has
                    not been connected, so there is no fabricated plan or
                    checkout action.
                  </p>
                </div>
              </div>
              <dl className="subscription-facts">
                <div>
                  <dt>Plan</dt>
                  <dd>Private preview</dd>
                </div>
                <div>
                  <dt>Billing status</dt>
                  <dd>Not configured</dd>
                </div>
                <div>
                  <dt>Workspace</dt>
                  <dd>{workspace.name}</dd>
                </div>
                <div>
                  <dt>Access</dt>
                  <dd>Workspace members only</dd>
                </div>
              </dl>
              <div className="settings-note">
                <CreditCard size={14} />
                <span>
                  Plan selection, invoices and payment methods will be enabled
                  only after a real billing provider is integrated.
                </span>
              </div>
            </section>
          )}

          {activeTab === "security" && (
            <section className="profile-section">
              <div className="profile-section-heading">
                <div>
                  <h2>Security</h2>
                  <p>
                    Authentication is managed by Supabase Auth. Mend never
                    displays or stores your password in the workspace.
                  </p>
                </div>
              </div>
              <dl className="security-facts">
                <div>
                  <dt>
                    <Mail size={14} /> Sign-in email
                  </dt>
                  <dd>{user.email}</dd>
                </div>
                <div>
                  <dt>
                    <ShieldCheck size={14} /> Provider
                  </dt>
                  <dd>{authProvider}</dd>
                </div>
                <div>
                  <dt>
                    <CalendarDays size={14} /> Last sign-in
                  </dt>
                  <dd>{formatDate(user.last_sign_in_at)}</dd>
                </div>
              </dl>
              <div className="danger-zone">
                <div>
                  <strong>End this session</strong>
                  <p>
                    You will return to the secure Mend sign-in screen on this
                    device.
                  </p>
                </div>
                <button
                  className="button button-danger"
                  type="button"
                  disabled={saving}
                  onClick={() => void leave()}
                >
                  <LogOut size={14} /> Sign out
                </button>
              </div>
            </section>
          )}
        </main>
      </div>
    </div>
  );
}
