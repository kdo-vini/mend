import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  ExternalLink,
  Github,
  Link2,
  Plus,
  RefreshCw,
  Trash2,
} from "lucide-react";
import { Link } from "react-router-dom";
import type { Confirm } from "../../../shared/ui/ConfirmDialog";
import { EmptyState, LoadingState } from "../../../shared/ui/ResourceState";
import { Select } from "../../../shared/ui/Select";
import {
  disconnectLiveGitHub,
  getLiveGitHubConnection,
  listLiveGitHubRepositories,
  startLiveGitHubWorkspaceSetup,
  type LiveGitHubConnection,
  type LiveGitHubRepository,
} from "../api";
import {
  disconnectLiveGoogleConnection,
  listLiveGoogleConnections,
  saveLiveGoogleCalendarSelection,
  startLiveGoogleOAuth,
  type GoogleConnection,
} from "../api";
import {
  createLiveMcpConnection,
  disconnectLiveMcpConnection,
  listLiveMcpConnections,
  startLiveMcpOAuth,
  supabaseMcpFeatures,
  testLiveMcpConnection,
  updateLiveMcpConnection,
  type McpConnection,
  type SupabaseMcpFeature,
} from "../api";
import {
  SettingsError,
  SettingsPageHeader,
  SettingsSection,
  SettingsStatus,
  SettingsWorkspaceRequired,
} from "../components/SettingsShared";
import { formatSettingsDate } from "../settings-utils";

export function SettingsIntegrationsPage() {
  const { t } = useTranslation("settings");
  return (
    <div className="settings-v2-page">
      <SettingsPageHeader
        title={t("v2.pages.integrationsTitle")}
        description={t("v2.pages.integrationsDescription")}
      />
      <SettingsSection
        title={t("v2.pages.integrationDirectory")}
        description={t("v2.pages.integrationDirectoryDescription")}
      >
        <div className="settings-integration-grid">
          <IntegrationLink
            to="/settings/integrations/github"
            icon={<Github size={17} />}
            title="GitHub"
            description={t("v2.integrations.githubDescription")}
          />
          <IntegrationLink
            to="/settings/integrations/google"
            icon={<span className="integration-letter">G</span>}
            title="Google Calendar"
            description={t("v2.integrations.googleDescription")}
          />
          <IntegrationLink
            to="/settings/integrations/mcp"
            icon={<span className="integration-letter">S</span>}
            title="Supabase"
            description={t("v2.integrations.supabaseDescription")}
          />
          <IntegrationLink
            to="/settings/integrations/mcp"
            icon={<Link2 size={17} />}
            title={t("v2.integrations.mcpTitle")}
            description={t("v2.integrations.mcpDescription")}
          />
        </div>
      </SettingsSection>
    </div>
  );
}

function IntegrationLink({
  to,
  icon,
  title,
  description,
}: {
  to: string;
  icon: import("react").ReactNode;
  title: string;
  description: string;
}) {
  return (
    <Link className="settings-integration-link" to={to}>
      <span className="settings-integration-icon">{icon}</span>
      <span>
        <strong>{title}</strong>
        <small>{description}</small>
      </span>
      <ExternalLink size={14} aria-hidden="true" />
    </Link>
  );
}

export function SettingsGithubPage({
  workspaceId,
  onToast,
  onConfirm,
}: {
  workspaceId: string | null;
  onToast: (message: string) => void;
  onConfirm: Confirm;
}) {
  const { t } = useTranslation("settings");
  const [connection, setConnection] = useState<LiveGitHubConnection>({
    connected: false,
  });
  const [repositories, setRepositories] = useState<LiveGitHubRepository[]>([]);
  const [loading, setLoading] = useState(true);
  const [action, setAction] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(async () => {
    if (!workspaceId) return;
    setLoading(true);
    setError(null);
    try {
      const next = await getLiveGitHubConnection(workspaceId);
      setConnection(next);
      setRepositories(
        next.connected ? await listLiveGitHubRepositories(workspaceId) : [],
      );
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : t("v2.integrations.errors.github"),
      );
    } finally {
      setLoading(false);
    }
  }, [t, workspaceId]);
  useEffect(() => void load(), [load]);
  const connect = async () => {
    if (!workspaceId) return;
    setAction("connect");
    try {
      const result = await startLiveGitHubWorkspaceSetup(workspaceId);
      window.location.assign(result.installationUrl);
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : t("v2.integrations.errors.github"),
      );
      setAction(null);
    }
  };
  const disconnect = async () => {
    if (
      !workspaceId ||
      !(await onConfirm({
        title: t("v2.integrations.confirmDisconnectGithubTitle"),
        description: t("v2.integrations.confirmDisconnectGithubDescription"),
        confirmLabel: t("v2.integrations.confirmDisconnect"),
        destructive: true,
      }))
    )
      return;
    setAction("disconnect");
    try {
      await disconnectLiveGitHub(workspaceId);
      setConnection({ connected: false });
      setRepositories([]);
      onToast(t("v2.integrations.githubDisconnected"));
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : t("v2.integrations.errors.github"),
      );
    } finally {
      setAction(null);
    }
  };
  return (
    <div className="settings-v2-page">
      <SettingsPageHeader
        title={t("v2.integrations.githubTitle")}
        description={t("v2.pages.githubDescription")}
        actions={
          <button
            className="button button-ghost button-small"
            type="button"
            onClick={() => void load()}
            disabled={loading}
          >
            <RefreshCw size={13} /> {t("v2.integrations.refresh")}
          </button>
        }
      />
      {error && <SettingsError message={error} onRetry={() => void load()} />}
      {!workspaceId ? (
        <SettingsWorkspaceRequired />
      ) : loading ? (
        <LoadingState label={t("v2.integrations.checkingGithub")} />
      ) : (
        <>
          <SettingsSection
            title={t("v2.integrations.workspaceGithub")}
            description={t("v2.integrations.githubDescription")}
            actions={
              <SettingsStatus
                tone={connection.connected ? "success" : "warning"}
              >
                {connection.connected
                  ? t("v2.integrations.connected")
                  : t("v2.integrations.notConnected")}
              </SettingsStatus>
            }
          >
            {connection.connected ? (
              <div className="settings-v2-connection-summary">
                <div>
                  <Github size={18} />
                  <strong>{connection.owner ?? "GitHub account"}</strong>
                  <span>
                    {t("v2.integrations.connectedDate", {
                      date: formatSettingsDate(connection.connectedAt),
                    })}
                  </span>
                </div>
                <button
                  className="button button-danger button-small"
                  type="button"
                  onClick={() => void disconnect()}
                  disabled={action !== null}
                >
                  {t("v2.integrations.disconnect")}
                </button>
              </div>
            ) : (
              <div className="settings-v2-callout">
                <div>
                  <strong>{t("v2.integrations.connectGithubToSelect")}</strong>
                  <p>{t("v2.integrations.githubAccessDescription")}</p>
                </div>
                <button
                  className="button button-primary button-small"
                  type="button"
                  onClick={() => void connect()}
                  disabled={action !== null}
                >
                  <Github size={13} />{" "}
                  {action === "connect"
                    ? t("v2.integrations.openingGithub")
                    : t("v2.integrations.connectGithub")}
                </button>
              </div>
            )}
          </SettingsSection>
          {connection.connected && (
            <SettingsSection
              title={t("v2.integrations.availableRepositories")}
              description={t(
                "v2.integrations.availableRepositoriesDescription",
              )}
            >
              {repositories.length ? (
                <div className="settings-v2-list">
                  {repositories.map((repo) => (
                    <div
                      className="settings-v2-row"
                      key={`${repo.owner}/${repo.repo}`}
                    >
                      <div className="settings-v2-row-icon">
                        <Github size={15} />
                      </div>
                      <div className="settings-v2-row-main">
                        <strong>
                          {repo.owner}/{repo.repo}
                        </strong>
                        <span>
                          {t("v2.integrations.defaultBranch")} ·{" "}
                          {repo.defaultBranch}
                        </span>
                      </div>
                      <Link
                        className="button button-ghost button-small"
                        to="/settings/engineering/repositories"
                      >
                        {t("v2.integrations.configure")}
                      </Link>
                    </div>
                  ))}
                </div>
              ) : (
                <EmptyState
                  title={t("v2.integrations.noRepositories")}
                  description={t("v2.integrations.noRepositoriesDescription")}
                />
              )}
            </SettingsSection>
          )}
        </>
      )}
    </div>
  );
}

export function SettingsGooglePage({
  workspaceId,
  onToast,
  onConfirm,
}: {
  workspaceId: string | null;
  onToast: (message: string) => void;
  onConfirm: Confirm;
}) {
  const { t } = useTranslation("settings");
  const [connections, setConnections] = useState<GoogleConnection[]>([]);
  const [loading, setLoading] = useState(true);
  const [action, setAction] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(async () => {
    if (!workspaceId) return;
    setLoading(true);
    setError(null);
    try {
      setConnections(await listLiveGoogleConnections(workspaceId));
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : t("v2.integrations.errors.google"),
      );
    } finally {
      setLoading(false);
    }
  }, [t, workspaceId]);
  useEffect(() => void load(), [load]);
  const connect = async () => {
    if (!workspaceId) return;
    setAction("connect");
    try {
      const result = await startLiveGoogleOAuth(workspaceId);
      window.location.assign(result.oauthUrl);
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : t("v2.integrations.errors.oauth"),
      );
      setAction(null);
    }
  };
  const disconnect = async (connection: GoogleConnection) => {
    if (
      !workspaceId ||
      !(await onConfirm({
        title: t("v2.integrations.confirmDisconnectGoogleTitle"),
        description: t("v2.integrations.confirmDisconnectGoogleDescription", {
          account:
            connection.accountEmail ?? t("v2.integrations.googleAccount"),
        }),
        confirmLabel: t("v2.integrations.confirmDisconnect"),
        destructive: true,
      }))
    )
      return;
    setAction(connection.id);
    try {
      await disconnectLiveGoogleConnection(workspaceId, connection.id);
      await load();
      onToast(t("v2.integrations.googleDisconnected"));
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : t("v2.integrations.errors.google"),
      );
    } finally {
      setAction(null);
    }
  };
  const saveCalendars = async (
    connection: GoogleConnection,
    selectedCalendarIds: string[],
  ) => {
    if (!workspaceId) return;
    setAction(connection.id);
    try {
      const next = await saveLiveGoogleCalendarSelection(
        workspaceId,
        connection.id,
        selectedCalendarIds,
      );
      setConnections((current) =>
        current.map((item) => (item.id === next.id ? next : item)),
      );
      onToast(t("v2.integrations.googleCalendarSaved"));
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : t("v2.integrations.errors.googleSave"),
      );
    } finally {
      setAction(null);
    }
  };
  return (
    <div className="settings-v2-page">
      <SettingsPageHeader
        title={t("google.title")}
        description={t("google.description")}
        actions={
          <button
            className="button button-primary button-small"
            type="button"
            onClick={() => void connect()}
            disabled={action === "connect"}
          >
            <span>+</span> {t("v2.integrations.connectAccount")}
          </button>
        }
      />
      {error && <SettingsError message={error} onRetry={() => void load()} />}
      {!workspaceId ? (
        <SettingsWorkspaceRequired />
      ) : loading ? (
        <LoadingState label={t("v2.integrations.loadingGoogle")} />
      ) : (
        <SettingsSection
          title={t("v2.integrations.connectedAccounts")}
          description={t("v2.integrations.googleAccountsDescription")}
        >
          {!connections.length ? (
            <EmptyState
              title={t("v2.integrations.noGoogleAccounts")}
              description={t("v2.integrations.connectGoogleDescription")}
            />
          ) : (
            <div className="settings-v2-list">
              {connections.map((connection) => (
                <div
                  className="settings-v2-row settings-v2-row-stack"
                  key={connection.id}
                >
                  <div className="settings-v2-row-main">
                    <strong>
                      {connection.accountName ??
                        connection.accountEmail ??
                        t("v2.integrations.googleAccount")}
                    </strong>
                    <span>
                      {connection.accountEmail ??
                        t("v2.integrations.emailNotReported")}{" "}
                      ·{" "}
                      {t(`google.statuses.${connection.status}`, {
                        defaultValue: connection.status,
                      })}
                    </span>
                    <div className="settings-v2-calendar-grid">
                      {connection.calendars.map((calendar) => (
                        <label key={calendar.id}>
                          <input
                            type="checkbox"
                            checked={connection.selectedCalendarIds.includes(
                              calendar.id,
                            )}
                            disabled={action === connection.id}
                            onChange={(event) => {
                              const selected = new Set(
                                connection.selectedCalendarIds,
                              );
                              if (event.target.checked)
                                selected.add(calendar.id);
                              else selected.delete(calendar.id);
                              void saveCalendars(connection, [...selected]);
                            }}
                          />
                          {calendar.summary}
                          {calendar.primary
                            ? ` (${t("v2.integrations.primary")})`
                            : ""}
                        </label>
                      ))}
                    </div>
                  </div>
                  <button
                    className="button button-danger button-small"
                    type="button"
                    onClick={() => void disconnect(connection)}
                    disabled={action === connection.id}
                  >
                    <Trash2 size={13} /> {t("v2.integrations.disconnect")}
                  </button>
                </div>
              ))}
            </div>
          )}
        </SettingsSection>
      )}
    </div>
  );
}

export function SettingsMcpPage({
  workspaceId,
  onToast,
  onConfirm,
}: {
  workspaceId: string | null;
  onToast: (message: string) => void;
  onConfirm: Confirm;
}) {
  const { t } = useTranslation("settings");
  const [connections, setConnections] = useState<McpConnection[]>([]);
  const [provider, setProvider] =
    useState<McpConnection["provider"]>("supabase");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [url, setUrl] = useState("");
  const [authMode, setAuthMode] = useState<McpConnection["authMode"]>("none");
  const [headers, setHeaders] = useState("{}");
  const [supabaseProjectRef, setSupabaseProjectRef] = useState("");
  const [supabaseReadOnly, setSupabaseReadOnly] = useState(true);
  const [supabaseFeatures, setSupabaseFeatures] = useState<
    SupabaseMcpFeature[]
  >(["database", "debugging", "docs"]);
  const [loading, setLoading] = useState(true);
  const [action, setAction] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(async () => {
    if (!workspaceId) return;
    setLoading(true);
    setError(null);
    try {
      setConnections(await listLiveMcpConnections(workspaceId));
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : t("v2.integrations.errors.mcp"),
      );
    } finally {
      setLoading(false);
    }
  }, [t, workspaceId]);
  useEffect(() => void load(), [load]);
  const create = async () => {
    if (
      !workspaceId ||
      (provider === "custom" && (!name.trim() || !url.trim())) ||
      (provider === "supabase" &&
        (!supabaseProjectRef.trim() || !supabaseFeatures.length))
    )
      return;
    if (
      provider === "supabase" &&
      !supabaseReadOnly &&
      !(await onConfirm({
        title: t("v2.integrations.confirmDatabaseWritesTitle"),
        description: t("v2.integrations.confirmDatabaseWritesDescription"),
        confirmLabel: t("v2.integrations.allowDatabaseWrites"),
        destructive: true,
      }))
    )
      return;
    setAction("create");
    setError(null);
    try {
      const parsed = provider === "custom" ? JSON.parse(headers) : {};
      if (
        provider === "custom" &&
        authMode === "headers" &&
        (!parsed || Array.isArray(parsed) || typeof parsed !== "object")
      )
        throw new Error(t("v2.integrations.errors.headers"));
      await createLiveMcpConnection(workspaceId, {
        name:
          provider === "supabase"
            ? `Supabase ${supabaseProjectRef.trim()}`
            : name,
        description:
          provider === "supabase"
            ? `Supabase project ${supabaseProjectRef.trim()}`
            : description,
        serverUrl:
          provider === "supabase" ? "https://mcp.supabase.com/mcp" : url,
        authMode: provider === "supabase" ? "oauth" : authMode,
        headers:
          provider === "custom" && authMode === "headers" ? parsed : undefined,
        provider,
        supabase:
          provider === "supabase"
            ? {
                projectRef: supabaseProjectRef.trim(),
                readOnly: supabaseReadOnly,
                features: supabaseFeatures,
              }
            : undefined,
      });
      setName("");
      setDescription("");
      setUrl("");
      setHeaders("{}");
      setSupabaseProjectRef("");
      await load();
      onToast(t("v2.integrations.connectedToast"));
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : t("v2.integrations.errors.connect"),
      );
    } finally {
      setAction(null);
    }
  };
  const update = async (
    connection: McpConnection,
    input: Pick<
      McpConnection,
      "name" | "description" | "allowedToolNames" | "writeModes"
    >,
  ) => {
    if (!workspaceId) return;
    setAction(connection.id);
    try {
      const next = await updateLiveMcpConnection(
        workspaceId,
        connection.id,
        input,
      );
      setConnections((current) =>
        current.map((item) => (item.id === next.id ? next : item)),
      );
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : t("v2.integrations.errors.save"),
      );
    } finally {
      setAction(null);
    }
  };
  const disconnect = async (connection: McpConnection) => {
    if (
      !workspaceId ||
      !(await onConfirm({
        title: t("v2.integrations.confirmDisconnectMcpTitle"),
        description: t("v2.integrations.confirmDisconnectMcpDescription"),
        confirmLabel: t("v2.integrations.confirmDisconnect"),
        destructive: true,
      }))
    )
      return;
    setAction(connection.id);
    try {
      await disconnectLiveMcpConnection(workspaceId, connection.id);
      setConnections((current) =>
        current.filter((item) => item.id !== connection.id),
      );
      onToast(t("v2.integrations.disconnectedToast"));
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : t("v2.integrations.errors.disconnect"),
      );
    } finally {
      setAction(null);
    }
  };
  return (
    <div className="settings-v2-page">
      <SettingsPageHeader
        title={t("mcp.title")}
        description={t("mcp.description")}
      />
      {error && <SettingsError message={error} onRetry={() => void load()} />}
      {!workspaceId ? (
        <SettingsWorkspaceRequired />
      ) : loading ? (
        <LoadingState label={t("v2.integrations.loadingMcp")} />
      ) : (
        <>
          <SettingsSection
            title={t("v2.integrations.addPlugin")}
            description={t("v2.integrations.mcpCredentialsDescription")}
          >
            <div className="settings-v2-form-grid">
              <label>
                {t("v2.integrations.pluginType")}
                <Select
                  value={provider}
                  onChange={(value) =>
                    setProvider(value as McpConnection["provider"])
                  }
                  options={[
                    {
                      value: "supabase",
                      label: t("v2.integrations.supabase"),
                    },
                    {
                      value: "custom",
                      label: t("v2.integrations.customMcp"),
                    },
                  ]}
                />
              </label>
              {provider === "supabase" ? (
                <>
                  <label>
                    {t("v2.integrations.supabaseProjectRef")}
                    <input
                      value={supabaseProjectRef}
                      onChange={(event) =>
                        setSupabaseProjectRef(event.target.value)
                      }
                      placeholder="abcdefghijklmnopqrst"
                      autoCapitalize="none"
                    />
                  </label>
                  <fieldset className="settings-v2-mcp-scope settings-form-wide">
                    <legend>{t("v2.integrations.supabaseCapabilities")}</legend>
                    <p>{t("v2.integrations.supabaseCapabilitiesHelp")}</p>
                    <div className="settings-v2-mcp-tools">
                      {supabaseMcpFeatures.map((feature) => (
                        <label key={feature}>
                          <input
                            type="checkbox"
                            checked={supabaseFeatures.includes(feature)}
                            onChange={(event) =>
                              setSupabaseFeatures((current) =>
                                event.target.checked
                                  ? [...new Set([...current, feature])]
                                  : current.filter((item) => item !== feature),
                              )
                            }
                          />
                          {t(`v2.integrations.supabaseFeatures.${feature}`)}
                        </label>
                      ))}
                    </div>
                  </fieldset>
                  <label className="settings-v2-checkbox-field settings-form-wide">
                    <input
                      type="checkbox"
                      checked={supabaseReadOnly}
                      onChange={(event) =>
                        setSupabaseReadOnly(event.target.checked)
                      }
                    />
                    <span>
                      <strong>{t("v2.integrations.supabaseReadOnly")}</strong>
                      <small>
                        {t("v2.integrations.supabaseReadOnlyDescription")}
                      </small>
                    </span>
                  </label>
                  <div className="settings-v2-callout settings-form-wide">
                    <p>{t("v2.integrations.supabaseSecurityNote")}</p>
                  </div>
                </>
              ) : (
                <>
                  <label>
                    {t("v2.integrations.pluginName")}
                    <input
                      value={name}
                      onChange={(event) => setName(event.target.value)}
                      placeholder="Zelo workspace"
                    />
                  </label>
                  <label>
                    {t("v2.integrations.purpose")}
                    <input
                      value={description}
                      onChange={(event) => setDescription(event.target.value)}
                      placeholder="Find customers and account status"
                    />
                  </label>
                  <label>
                    {t("v2.integrations.serverUrl")}
                    <input
                      value={url}
                      onChange={(event) => setUrl(event.target.value)}
                      placeholder="https://mcp.example.com"
                      inputMode="url"
                    />
                  </label>
                  <label>
                    {t("v2.integrations.authentication")}
                    <Select
                      value={authMode}
                      onChange={(value) =>
                        setAuthMode(value as McpConnection["authMode"])
                      }
                      options={[
                        { value: "none", label: t("v2.integrations.none") },
                        {
                          value: "headers",
                          label: t("v2.integrations.secretHeaders"),
                        },
                        { value: "oauth", label: t("v2.integrations.oauth") },
                      ]}
                    />
                  </label>
                  {authMode === "headers" && (
                    <label className="settings-form-wide">
                      {t("v2.integrations.secretHeaders")}
                      <textarea
                        rows={3}
                        value={headers}
                        onChange={(event) => setHeaders(event.target.value)}
                      />
                    </label>
                  )}
                </>
              )}
            </div>
            <button
              className="button button-primary"
              type="button"
              onClick={() => void create()}
              disabled={
                action === "create" ||
                (provider === "custom"
                  ? !name.trim() || !url.trim()
                  : !supabaseProjectRef.trim() || !supabaseFeatures.length)
              }
            >
              <Plus size={14} /> {t("v2.integrations.addPlugin")}
            </button>
          </SettingsSection>
          <SettingsSection
            title={t("v2.integrations.connectedPlugins")}
            description={t("v2.integrations.connectedPluginsDescription")}
          >
            {!connections.length ? (
              <EmptyState
                title={t("v2.integrations.noPlugins")}
                description={t("v2.integrations.connectPluginDescription")}
              />
            ) : (
              <div className="settings-v2-list">
                {connections.map((connection) => (
                  <McpRow
                    key={connection.id}
                    connection={connection}
                    action={action}
                    onTest={() => {
                      if (!workspaceId) return;
                      setAction(connection.id);
                      void testLiveMcpConnection(workspaceId, connection.id)
                        .then((next) =>
                          setConnections((current) =>
                            current.map((item) =>
                              item.id === next.id ? next : item,
                            ),
                          ),
                        )
                        .catch((reason) =>
                          setError(
                            reason instanceof Error
                              ? reason.message
                              : t("v2.integrations.errors.test"),
                          ),
                        )
                        .finally(() => setAction(null));
                    }}
                    onOAuth={() => {
                      if (!workspaceId) return;
                      setAction(connection.id);
                      void startLiveMcpOAuth(workspaceId, connection.id)
                        .then(({ oauthUrl }) =>
                          window.location.assign(oauthUrl),
                        )
                        .catch((reason) =>
                          setError(
                            reason instanceof Error
                              ? reason.message
                              : t("v2.integrations.errors.oauth"),
                          ),
                        )
                        .finally(() => setAction(null));
                    }}
                    onUpdate={update}
                    onConfirm={onConfirm}
                    onDisconnect={() => void disconnect(connection)}
                  />
                ))}
              </div>
            )}
          </SettingsSection>
        </>
      )}
    </div>
  );
}

function McpRow({
  connection,
  action,
  onTest,
  onOAuth,
  onUpdate,
  onConfirm,
  onDisconnect,
}: {
  connection: McpConnection;
  action: string | null;
  onTest: () => void;
  onOAuth: () => void;
  onUpdate: (
    connection: McpConnection,
    input: Pick<
      McpConnection,
      "name" | "description" | "allowedToolNames" | "writeModes"
    >,
  ) => Promise<void>;
  onConfirm: Confirm;
  onDisconnect: () => void;
}) {
  const { t } = useTranslation("settings");
  const [enabled, setEnabled] = useState(new Set(connection.allowedToolNames));
  const [writeModes, setWriteModes] = useState(connection.writeModes);
  useEffect(() => {
    setEnabled(new Set(connection.allowedToolNames));
    setWriteModes(connection.writeModes);
  }, [connection.allowedToolNames, connection.writeModes]);
  const save = (nextEnabled = enabled, nextModes = writeModes) =>
    onUpdate(connection, {
      name: connection.name,
      description: connection.description,
      allowedToolNames: [...nextEnabled],
      writeModes: nextModes,
    });
  const setAccess = async (
    nextEnabled: Set<string>,
    nextModes: Array<"draft" | "safe_auto">,
  ) => {
    const addsWriteAccess = nextModes.some(
      (mode) => !connection.writeModes.includes(mode),
    );
    if (
      addsWriteAccess &&
      !(await onConfirm({
        title: t("v2.integrations.confirmAllowWritesTitle"),
        description: t("v2.integrations.confirmAllowWritesDescription"),
        confirmLabel: t("v2.integrations.allowWrites"),
        destructive: true,
      }))
    )
      return;
    setEnabled(nextEnabled);
    setWriteModes(nextModes);
    await save(nextEnabled, nextModes);
  };
  return (
    <div className="settings-v2-row settings-v2-row-stack">
      <div className="settings-v2-row-main">
        <strong>{connection.name}</strong>
        <span>
          {connection.description || connection.serverUrl} ·{" "}
          {t(`mcp.statuses.${connection.status}`, {
            defaultValue: connection.status,
          })}
        </span>
        {connection.supabaseScope && (
          <small>
            {t("v2.integrations.supabaseScopeSummary", {
              projectRef: connection.supabaseScope.projectRef,
              count: connection.supabaseScope.features.length,
              access: connection.supabaseScope.readOnly
                ? t("v2.integrations.databaseReadOnly")
                : t("v2.integrations.databaseWriteEnabled"),
            })}
          </small>
        )}
        {connection.lastError && (
          <small role="alert">{connection.lastError}</small>
        )}
        <div className="settings-v2-mcp-tools">
          {connection.tools.map((tool) => (
            <label key={tool.name}>
              <input
                type="checkbox"
                checked={enabled.has(tool.name)}
                disabled={action === connection.id}
                onChange={(event) => {
                  const next = new Set(enabled);
                  if (event.target.checked) next.add(tool.name);
                  else next.delete(tool.name);
                  void setAccess(next, writeModes);
                }}
              />
              {tool.name}{" "}
              {tool.readOnly
                ? t("v2.integrations.read")
                : t("v2.integrations.write")}
            </label>
          ))}
        </div>
        <label className="settings-v2-inline-field">
          {t("v2.integrations.writeAccess")}
          <Select
            value={writeModes.length === 2 ? "both" : (writeModes[0] ?? "none")}
            onChange={(value) => {
              const next =
                value === "both"
                  ? (["draft", "safe_auto"] as const)
                  : value === "none"
                    ? ([] as const)
                    : [value as "draft" | "safe_auto"];
              void setAccess(enabled, [...next]);
            }}
            options={[
              { value: "none", label: t("v2.integrations.none") },
              {
                value: "draft",
                label: t("v2.integrations.copilotDraft"),
              },
              {
                value: "safe_auto",
                label: t("v2.integrations.autoReply"),
              },
              {
                value: "both",
                label: t("v2.integrations.copilotAutoReply"),
              },
            ]}
          />
        </label>
        {connection.tools.length > 0 && (
          <div className="settings-v2-inline-actions">
            <button
              className="button button-secondary button-small"
              type="button"
              disabled={action === connection.id}
              onClick={() =>
                void setAccess(
                  new Set(connection.tools.map((tool) => tool.name)),
                  writeModes,
                )
              }
            >
              {t("v2.integrations.allowAllTools")}
            </button>
            <button
              className="button button-danger button-small"
              type="button"
              disabled={action === connection.id}
              onClick={() =>
                void setAccess(
                  new Set(connection.tools.map((tool) => tool.name)),
                  ["draft", "safe_auto"],
                )
              }
            >
              {t("v2.integrations.allowAllAutonomous")}
            </button>
          </div>
        )}
        <small>{t("v2.integrations.autonomyPolicyNote")}</small>
      </div>
      <div className="settings-v2-row-actions">
        {connection.authMode === "oauth" &&
          connection.status !== "connected" && (
            <button
              className="button button-secondary button-small"
              type="button"
              onClick={onOAuth}
              disabled={action === connection.id}
            >
              {t("v2.integrations.authorize")}
            </button>
          )}
        <button
          className="button button-ghost button-small"
          type="button"
          onClick={onTest}
          disabled={action === connection.id}
        >
          <RefreshCw size={13} /> {t("v2.integrations.test")}
        </button>
        <button
          className="button button-danger button-small"
          type="button"
          onClick={onDisconnect}
          disabled={action === connection.id}
        >
          <Trash2 size={13} /> {t("v2.integrations.disconnect")}
        </button>
      </div>
    </div>
  );
}
