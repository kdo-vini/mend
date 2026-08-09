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
  testLiveMcpConnection,
  updateLiveMcpConnection,
  type McpConnection,
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
            description="Repository selection, branches and publishing access."
          />
          <IntegrationLink
            to="/settings/integrations/google"
            icon={<span className="integration-letter">G</span>}
            title="Google Calendar"
            description="Calendars available to authorized actions."
          />
          <IntegrationLink
            to="/settings/integrations/mcp"
            icon={<Link2 size={17} />}
            title="MCP plugins"
            description="Trusted tools with explicit read and write controls."
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
        reason instanceof Error ? reason.message : "GitHub is unavailable.",
      );
    } finally {
      setLoading(false);
    }
  }, [workspaceId]);
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
          : "GitHub setup could not start.",
      );
      setAction(null);
    }
  };
  const disconnect = async () => {
    if (
      !workspaceId ||
      !(await onConfirm({
        title: "Disconnect GitHub?",
        description:
          "Repository selection and publishing access will stop until the GitHub App is connected again.",
        confirmLabel: "Disconnect",
        destructive: true,
      }))
    )
      return;
    setAction("disconnect");
    try {
      await disconnectLiveGitHub(workspaceId);
      setConnection({ connected: false });
      setRepositories([]);
      onToast("GitHub disconnected.");
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "GitHub could not be disconnected.",
      );
    } finally {
      setAction(null);
    }
  };
  return (
    <div className="settings-v2-page">
      <SettingsPageHeader
        title={t("v2.layout.items.github")}
        description={t("v2.pages.githubDescription")}
        actions={
          <button
            className="button button-ghost button-small"
            type="button"
            onClick={() => void load()}
            disabled={loading}
          >
            <RefreshCw size={13} /> Refresh
          </button>
        }
      />
      {error && <SettingsError message={error} onRetry={() => void load()} />}
      {!workspaceId ? (
        <SettingsWorkspaceRequired />
      ) : loading ? (
        <LoadingState label="Checking GitHub access…" />
      ) : (
        <>
          <SettingsSection
            title="Workspace GitHub space"
            description="This connection is the source for repository selection and publishing access."
            actions={
              <SettingsStatus
                tone={connection.connected ? "success" : "warning"}
              >
                {connection.connected ? "Connected" : "Not connected"}
              </SettingsStatus>
            }
          >
            {connection.connected ? (
              <div className="settings-v2-connection-summary">
                <div>
                  <Github size={18} />
                  <strong>{connection.owner ?? "GitHub account"}</strong>
                  <span>
                    Connected {formatSettingsDate(connection.connectedAt)}
                  </span>
                </div>
                <button
                  className="button button-danger button-small"
                  type="button"
                  onClick={() => void disconnect()}
                  disabled={action !== null}
                >
                  Disconnect
                </button>
              </div>
            ) : (
              <div className="settings-v2-callout">
                <div>
                  <strong>Connect GitHub to select repositories</strong>
                  <p>
                    The official GitHub App controls which codebases Mend can
                    access. No repository is selected automatically.
                  </p>
                </div>
                <button
                  className="button button-primary button-small"
                  type="button"
                  onClick={() => void connect()}
                  disabled={action !== null}
                >
                  <Github size={13} />{" "}
                  {action === "connect" ? "Opening GitHub…" : "Connect GitHub"}
                </button>
              </div>
            )}
          </SettingsSection>
          {connection.connected && (
            <SettingsSection
              title="Available repositories"
              description="These repositories are visible to the GitHub App. Configure a repository under Engineering when you are ready."
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
                        <span>Default branch · {repo.defaultBranch}</span>
                      </div>
                      <Link
                        className="button button-ghost button-small"
                        to="/settings/engineering/repositories"
                      >
                        Configure
                      </Link>
                    </div>
                  ))}
                </div>
              ) : (
                <EmptyState
                  title="No repositories available"
                  description="Grant the Mend GitHub App access to at least one repository, then refresh."
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
          : "Google connections are unavailable.",
      );
    } finally {
      setLoading(false);
    }
  }, [workspaceId]);
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
          : "Google OAuth could not start.",
      );
      setAction(null);
    }
  };
  const disconnect = async (connection: GoogleConnection) => {
    if (
      !workspaceId ||
      !(await onConfirm({
        title: "Disconnect Google account?",
        description: `Disconnect ${connection.accountEmail ?? "this account"}? Its server-side tokens will be removed.`,
        confirmLabel: "Disconnect",
        destructive: true,
      }))
    )
      return;
    setAction(connection.id);
    try {
      await disconnectLiveGoogleConnection(workspaceId, connection.id);
      await load();
      onToast("Google account disconnected.");
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Google account could not be disconnected.",
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
      onToast("Google calendar selection saved.");
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Calendar selection could not be saved.",
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
            <span>+</span> Connect account
          </button>
        }
      />
      {error && <SettingsError message={error} onRetry={() => void load()} />}
      {!workspaceId ? (
        <SettingsWorkspaceRequired />
      ) : loading ? (
        <LoadingState label="Loading Google connections…" />
      ) : (
        <SettingsSection
          title="Connected accounts"
          description="Calendar access stays scoped to the calendars you select."
        >
          {!connections.length ? (
            <EmptyState
              title="No Google account connected"
              description="Connect a Google account when OAuth credentials are configured for this server."
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
                        "Google account"}
                    </strong>
                    <span>
                      {connection.accountEmail ?? "Email not reported"} ·{" "}
                      {connection.status}
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
                          {calendar.primary ? " (primary)" : ""}
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
                    <Trash2 size={13} /> Disconnect
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
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [url, setUrl] = useState("");
  const [authMode, setAuthMode] = useState<McpConnection["authMode"]>("none");
  const [headers, setHeaders] = useState("{}");
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
          : "MCP plugins are unavailable.",
      );
    } finally {
      setLoading(false);
    }
  }, [workspaceId]);
  useEffect(() => void load(), [load]);
  const create = async () => {
    if (!workspaceId || !name.trim() || !url.trim()) return;
    setAction("create");
    setError(null);
    try {
      const parsed = JSON.parse(headers);
      if (
        authMode === "headers" &&
        (!parsed || Array.isArray(parsed) || typeof parsed !== "object")
      )
        throw new Error("Secret headers must be a JSON object.");
      await createLiveMcpConnection(workspaceId, {
        name,
        description,
        serverUrl: url,
        authMode,
        headers: authMode === "headers" ? parsed : undefined,
      });
      setName("");
      setDescription("");
      setUrl("");
      setHeaders("{}");
      await load();
      onToast("MCP plugin connected.");
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "MCP plugin could not be connected.",
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
          : "MCP settings could not be saved.",
      );
    } finally {
      setAction(null);
    }
  };
  const disconnect = async (connection: McpConnection) => {
    if (
      !workspaceId ||
      !(await onConfirm({
        title: "Disconnect MCP plugin?",
        description:
          "This removes its server-side credentials and disables all tools.",
        confirmLabel: "Disconnect",
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
      onToast("MCP plugin disconnected.");
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "MCP plugin could not be disconnected.",
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
        <LoadingState label="Loading MCP plugins…" />
      ) : (
        <>
          <SettingsSection
            title="Add a plugin"
            description="Credentials are encrypted server-side and never returned to this page."
          >
            <div className="settings-v2-form-grid">
              <label>
                Plugin name
                <input
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  placeholder="Zelo workspace"
                />
              </label>
              <label>
                Purpose
                <input
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                  placeholder="Find customers and account status"
                />
              </label>
              <label>
                Server URL
                <input
                  value={url}
                  onChange={(event) => setUrl(event.target.value)}
                  placeholder="https://mcp.example.com"
                  inputMode="url"
                />
              </label>
              <label>
                Authentication
                <Select
                  value={authMode}
                  onChange={(value) =>
                    setAuthMode(value as McpConnection["authMode"])
                  }
                  options={[
                    { value: "none", label: "None" },
                    { value: "headers", label: "Secret headers" },
                    { value: "oauth", label: "OAuth" },
                  ]}
                />
              </label>
              {authMode === "headers" && (
                <label className="settings-form-wide">
                  Secret headers
                  <textarea
                    rows={3}
                    value={headers}
                    onChange={(event) => setHeaders(event.target.value)}
                  />
                </label>
              )}
            </div>
            <button
              className="button button-primary"
              type="button"
              onClick={() => void create()}
              disabled={action === "create" || !name.trim() || !url.trim()}
            >
              <Plus size={14} /> Add plugin
            </button>
          </SettingsSection>
          <SettingsSection
            title="Connected plugins"
            description="Write access is an explicit workspace policy, not a side effect of connecting a server."
          >
            {!connections.length ? (
              <EmptyState
                title="No MCP plugins connected"
                description="Connect a trusted server above, then choose which tools Mend may use."
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
                              : "MCP test failed.",
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
                              : "OAuth could not start.",
                          ),
                        )
                        .finally(() => setAction(null));
                    }}
                    onUpdate={update}
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
  ) => void;
  onDisconnect: () => void;
}) {
  const [enabled, setEnabled] = useState(new Set(connection.allowedToolNames));
  const [writeModes, setWriteModes] = useState(connection.writeModes);
  const save = (nextEnabled = enabled, nextModes = writeModes) =>
    onUpdate(connection, {
      name: connection.name,
      description: connection.description,
      allowedToolNames: [...nextEnabled],
      writeModes: nextModes,
    });
  return (
    <div className="settings-v2-row settings-v2-row-stack">
      <div className="settings-v2-row-main">
        <strong>{connection.name}</strong>
        <span>
          {connection.description || connection.serverUrl} · {connection.status}
        </span>
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
                  setEnabled(next);
                  void save(next);
                }}
              />
              {tool.name} {tool.readOnly ? "(read)" : "(write)"}
            </label>
          ))}
        </div>
        <label className="settings-v2-inline-field">
          Write access
          <Select
            value={writeModes.length === 2 ? "both" : (writeModes[0] ?? "none")}
            onChange={(value) => {
              const next =
                value === "both"
                  ? (["draft", "safe_auto"] as const)
                  : value === "none"
                    ? ([] as const)
                    : [value as "draft" | "safe_auto"];
              setWriteModes([...next]);
              void save(enabled, [...next]);
            }}
            options={[
              { value: "none", label: "None" },
              { value: "draft", label: "Copilot / draft" },
              { value: "safe_auto", label: "Auto-reply" },
              { value: "both", label: "Copilot and auto-reply" },
            ]}
          />
        </label>
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
              Authorize
            </button>
          )}
        <button
          className="button button-ghost button-small"
          type="button"
          onClick={onTest}
          disabled={action === connection.id}
        >
          <RefreshCw size={13} /> Test
        </button>
        <button
          className="button button-danger button-small"
          type="button"
          onClick={onDisconnect}
          disabled={action === connection.id}
        >
          <Trash2 size={13} /> Disconnect
        </button>
      </div>
    </div>
  );
}
