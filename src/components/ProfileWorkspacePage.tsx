import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import type { User } from "@supabase/supabase-js";
import { useTranslation } from "react-i18next";
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
  updateMyWorkspaceMemberDisplayName,
  updateWorkspace,
  type WorkspaceWithRole,
} from "../api/auth";
import { supabase } from "../lib/supabase";
import { ErrorState, LoadingState } from "../shared/ui/ResourceState";
import { Select } from "../shared/ui/Select";
import { LanguageSwitcher } from "./LanguageSwitcher";
import {
  applyInterfaceLanguage,
  currentInterfaceLanguage,
  saveInterfaceLanguage,
} from "../i18n/preferences";
import { normalizeLocale, type SupportedLocale } from "../i18n/resources";
import { localizedError } from "../shared/ui/localizedError";

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

function profileTabLabel(
  id: ProfileTab,
  t: (key: string, options?: Record<string, unknown>) => string,
) {
  return t(`profileTabs.${id}`, { ns: "settings" });
}

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

function formatDate(value: string | null | undefined, unavailable: string) {
  if (!value) return unavailable;
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : new Intl.DateTimeFormat(currentInterfaceLanguage(), {
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
  const [interfaceLanguage, setInterfaceLanguage] = useState<SupportedLocale>(
    currentInterfaceLanguage(),
  );
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
  const { t } = useTranslation(["common", "settings"]);

  const load = useCallback(async () => {
    if (!supabase) {
      setError(t("errors.supabaseUnavailable", { ns: "common" }));
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
      if (!nextUser) throw new Error("authenticated_account_unavailable");
      const nextName =
        typeof nextUser.user_metadata.full_name === "string" &&
        nextUser.user_metadata.full_name.trim()
          ? nextUser.user_metadata.full_name.trim()
          : (nextUser.email?.split("@")[0] ?? t("app.currentOperator"));
      setUser(nextUser);
      setWorkspace(nextWorkspace);
      setInterfaceLanguage(currentInterfaceLanguage());
      setProfileName(nextName);
      setWorkspaceForm({
        name: nextWorkspace.name,
        slug: nextWorkspace.slug,
        issuePrefix: nextWorkspace.issue_prefix,
        timezone: nextWorkspace.timezone,
        defaultLanguage: normalizeLocale(nextWorkspace.default_language),
      });
      onIdentityUpdated({ name: nextName, email: nextUser.email ?? "" });
    } catch (reason) {
      setError(
        localizedError(reason, t("profileLoadError", { ns: "settings" })),
      );
    } finally {
      setLoading(false);
    }
  }, [onIdentityUpdated, t, workspaceId]);

  const changeInterfaceLanguage = async (locale: SupportedLocale) => {
    const previous = interfaceLanguage;
    setInterfaceLanguage(locale);
    await applyInterfaceLanguage(locale);
    if (!supabase) return;
    try {
      await saveInterfaceLanguage(supabase, locale);
    } catch {
      setInterfaceLanguage(previous);
      await applyInterfaceLanguage(previous);
      onToast(t("errors.preferencesSave", { ns: "common" }));
    }
  };

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const syncStoredLanguage = () =>
      setInterfaceLanguage(currentInterfaceLanguage());
    window.addEventListener("storage", syncStoredLanguage);
    return () => window.removeEventListener("storage", syncStoredLanguage);
  }, []);

  const canEditWorkspace =
    workspace?.role === "owner" || workspace?.role === "admin";
  const accountName =
    profileName.trim() ||
    user?.email?.split("@")[0] ||
    t("app.currentOperator");
  const roleLabel = (role: WorkspaceWithRole["role"]) =>
    t(
      role === "owner"
        ? "ownerRole"
        : role === "admin"
          ? "adminRole"
          : role === "agent"
            ? "agentRole"
            : "viewerRole",
      { ns: "settings" },
    );
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
      if (workspaceId)
        await updateMyWorkspaceMemberDisplayName(
          workspaceId,
          profileName.trim(),
          supabase,
        );
      setUser(data.user);
      onIdentityUpdated({
        name: profileName.trim(),
        email: data.user.email ?? "",
      });
      onToast(t("profileSaved", { ns: "settings" }));
    } catch (reason) {
      onToast(
        localizedError(reason, t("profileSaveError", { ns: "settings" })),
      );
    } finally {
      setSaving(false);
    }
  };

  const saveWorkspace = async () => {
    if (!workspace || !canEditWorkspace) return;
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(workspaceForm.slug)) {
      onToast(t("workspaceSlugInvalid", { ns: "settings" }));
      return;
    }
    if (!/^[A-Z][A-Z0-9]{1,7}$/.test(workspaceForm.issuePrefix)) {
      onToast(t("issuePrefixInvalid", { ns: "settings" }));
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
        defaultLanguage: normalizeLocale(updated.default_language),
      });
      onWorkspaceUpdated(updated);
      onToast(t("workspaceSaved", { ns: "settings" }));
    } catch (reason) {
      onToast(
        localizedError(reason, t("workspaceSaveError", { ns: "settings" })),
      );
    } finally {
      setSaving(false);
    }
  };

  const leave = async () => {
    setSaving(true);
    const result = await signOut(supabase ?? undefined);
    setSaving(false);
    if (result.error)
      onToast(
        localizedError(result.error, t("signOutError", { ns: "settings" })),
      );
  };

  if (loading)
    return (
      <div className="page profile-page">
        <LoadingState label={t("profileLoading", { ns: "settings" })} />
      </div>
    );
  if (error || !user || !workspace)
    return (
      <div className="page profile-page">
        <ErrorState
          title={t("profileUnavailable", { ns: "settings" })}
          description={error ?? t("profileLoadError", { ns: "settings" })}
          onRetry={() => void load()}
        />
      </div>
    );

  return (
    <div className="page profile-page">
      <header className="page-header profile-header">
        <div>
          <div className="page-kicker">
            {t("profileEyebrow", { ns: "settings" })}
          </div>
          <h1>{t("profileTitle", { ns: "settings" })}</h1>
          <p>{t("profileDescription", { ns: "settings" })}</p>
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
          aria-label={t("profileSections", { ns: "settings" })}
        >
          {profileTabs.map(({ id, icon: Icon }) => (
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
              <span>
                {profileTabLabel(id, (key) => t(key, { ns: "settings" }))}
              </span>
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
                  <h2>{t("personalProfile", { ns: "settings" })}</h2>
                  <p>{t("profileDescriptionText", { ns: "settings" })}</p>
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
                <LanguageSwitcher
                  value={interfaceLanguage}
                  onChange={(locale) => void changeInterfaceLanguage(locale)}
                />
                <label>
                  {t("displayName", { ns: "settings" })}
                  <input
                    value={profileName}
                    maxLength={100}
                    onChange={(event) => setProfileName(event.target.value)}
                    autoComplete="name"
                  />
                </label>
                <label>
                  {t("email", { ns: "settings" })}
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
                  <Save size={14} />{" "}
                  {saving
                    ? t("saving", { ns: "settings" })
                    : t("saveProfile", { ns: "settings" })}
                </button>
              </div>
            </section>
          )}

          {activeTab === "workspace" && (
            <section className="profile-section">
              <div className="profile-section-heading">
                <div>
                  <h2>{t("workspaceIdentity", { ns: "settings" })}</h2>
                  <p>{t("workspaceFieldsDescription", { ns: "settings" })}</p>
                </div>
                <span className="role-pill">{roleLabel(workspace.role)}</span>
              </div>
              {!canEditWorkspace && (
                <div className="settings-note">
                  <ShieldCheck size={14} />
                  <span>
                    {t("workspaceFieldsPermission", { ns: "settings" })}
                  </span>
                </div>
              )}
              <div className="profile-form two-column">
                <label>
                  {t("workspaceName", { ns: "settings" })}
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
                  {t("workspaceSlug", { ns: "settings" })}
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
                  {t("issuePrefix", { ns: "settings" })}
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
                  {t("timezone", { ns: "settings" })}
                  <Select
                    value={workspaceForm.timezone}
                    options={[
                      {
                        value: "America/Sao_Paulo",
                        label: "America/Sao_Paulo",
                      },
                      { value: "UTC", label: "UTC" },
                    ]}
                    disabled={!canEditWorkspace}
                    onChange={(value) =>
                      setWorkspaceForm((current) => ({
                        ...current,
                        timezone: value,
                      }))
                    }
                  />
                </label>
                <label>
                  {t("automationLanguage", { ns: "settings" })}
                  <Select
                    value={workspaceForm.defaultLanguage}
                    options={[
                      {
                        value: "pt-BR",
                        label: t("language.portuguese", { ns: "common" }),
                      },
                      {
                        value: "en-US",
                        label: t("language.english", { ns: "common" }),
                      },
                    ]}
                    disabled={!canEditWorkspace}
                    onChange={(value) =>
                      setWorkspaceForm((current) => ({
                        ...current,
                        defaultLanguage: value,
                      }))
                    }
                  />
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
                  <Save size={14} />{" "}
                  {saving
                    ? t("saving", { ns: "settings" })
                    : t("saveWorkspace", { ns: "settings" })}
                </button>
              </div>
            </section>
          )}

          {activeTab === "subscription" && (
            <section className="profile-section">
              <div className="profile-section-heading">
                <div>
                  <h2>{t("subscriptionTitle", { ns: "settings" })}</h2>
                  <p>{t("subscriptionDescription", { ns: "settings" })}</p>
                </div>
              </div>
              <dl className="subscription-facts">
                <div>
                  <dt>{t("plan", { ns: "settings" })}</dt>
                  <dd>{t("privatePreview", { ns: "settings" })}</dd>
                </div>
                <div>
                  <dt>{t("billingStatus", { ns: "settings" })}</dt>
                  <dd>{t("notConfigured", { ns: "settings" })}</dd>
                </div>
                <div>
                  <dt>{t("workspaceLabel", { ns: "settings" })}</dt>
                  <dd>{workspace.name}</dd>
                </div>
                <div>
                  <dt>{t("access", { ns: "settings" })}</dt>
                  <dd>{t("workspaceMembersOnly", { ns: "settings" })}</dd>
                </div>
              </dl>
              <div className="settings-note">
                <CreditCard size={14} />
                <span>{t("billingNote", { ns: "settings" })}</span>
              </div>
            </section>
          )}

          {activeTab === "security" && (
            <section className="profile-section">
              <div className="profile-section-heading">
                <div>
                  <h2>{t("securityTitle", { ns: "settings" })}</h2>
                  <p>{t("securityDescription", { ns: "settings" })}</p>
                </div>
              </div>
              <dl className="security-facts">
                <div>
                  <dt>
                    <Mail size={14} /> {t("signInEmail", { ns: "settings" })}
                  </dt>
                  <dd>{user.email}</dd>
                </div>
                <div>
                  <dt>
                    <ShieldCheck size={14} />{" "}
                    {t("provider", { ns: "settings" })}
                  </dt>
                  <dd>{authProvider}</dd>
                </div>
                <div>
                  <dt>
                    <CalendarDays size={14} />{" "}
                    {t("lastSignIn", { ns: "settings" })}
                  </dt>
                  <dd>
                    {formatDate(
                      user.last_sign_in_at,
                      t("notAvailable", { ns: "settings" }),
                    )}
                  </dd>
                </div>
              </dl>
              <div className="danger-zone">
                <div>
                  <strong>{t("endSession", { ns: "settings" })}</strong>
                  <p>{t("endSessionDescription", { ns: "settings" })}</p>
                </div>
                <button
                  className="button button-danger"
                  type="button"
                  disabled={saving}
                  onClick={() => void leave()}
                >
                  <LogOut size={14} /> {t("signOut", { ns: "settings" })}
                </button>
              </div>
            </section>
          )}
        </main>
      </div>
    </div>
  );
}
