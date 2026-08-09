import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  BookOpenCheck,
  Github,
  KeyRound,
  RefreshCw,
  Save,
  Trash2,
} from "lucide-react";
import { Link } from "react-router-dom";
import type { Confirm } from "../../../shared/ui/ConfirmDialog";
import { EmptyState, LoadingState } from "../../../shared/ui/ResourceState";
import { Select } from "../../../shared/ui/Select";
import {
  createLiveRepository,
  createLiveAgentConnection,
  cancelLiveAgentLogin,
  getLiveGitHubConnection,
  listLiveAgentConnections,
  listLiveAgentRoutingPolicies,
  listLiveGitHubRepositories,
  listLiveRepositories,
  pollLiveAgentLogin,
  refreshLiveAgentModels,
  removeLiveRepository,
  revokeLiveAgentConnection,
  saveLiveAgentRoutingPolicy,
  startLiveAgentLogin,
  updateLiveAgentConnection,
  updateLiveRepository,
  verifyLiveAgentConnection,
  type CodingStage,
  type LiveAgentConnection,
  type LiveAgentLoginJob,
  type LiveRepository,
  type LiveStageRoutingPolicy,
} from "../api";
import {
  SettingsError,
  SettingsPageHeader,
  SettingsSection,
  SettingsStatus,
  SettingsWorkspaceRequired,
} from "../components/SettingsShared";
import { formatSettingsDate, providerLabel } from "../settings-utils";

export function SettingsRepositoriesPage({
  workspaceId,
  onToast,
  onConfirm,
}: {
  workspaceId: string | null;
  onToast: (message: string) => void;
  onConfirm: Confirm;
}) {
  const { t } = useTranslation("settings");
  const [repositories, setRepositories] = useState<LiveRepository[]>([]);
  const [githubConnected, setGithubConnected] = useState(false);
  const [githubOwner, setGithubOwner] = useState("");
  const [githubRepos, setGithubRepos] = useState<
    Array<{ owner: string; repo: string; defaultBranch: string }>
  >([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [action, setAction] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [branch, setBranch] = useState("main");
  const [githubRepo, setGithubRepo] = useState("");
  const load = useCallback(async () => {
    if (!workspaceId) return;
    setLoading(true);
    setError(null);
    try {
      const [rows, github] = await Promise.all([
        listLiveRepositories(workspaceId),
        getLiveGitHubConnection(workspaceId),
      ]);
      setRepositories(rows);
      setGithubConnected(github.connected);
      setGithubOwner(github.owner ?? "");
      setGithubRepos(
        github.connected ? await listLiveGitHubRepositories(workspaceId) : [],
      );
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Repositories could not be loaded.",
      );
    } finally {
      setLoading(false);
    }
  }, [workspaceId]);
  useEffect(() => void load(), [load]);
  const reset = () => {
    setEditing(null);
    setName("");
    setBranch("main");
    setGithubRepo("");
  };
  const edit = (repository: LiveRepository) => {
    setEditing(repository.id);
    setName(repository.name);
    setBranch(repository.defaultBranch);
    setGithubRepo(
      repository.githubOwner && repository.githubRepo
        ? `${repository.githubOwner}/${repository.githubRepo}`
        : "",
    );
    document
      .getElementById("settings-repository-editor")
      ?.scrollIntoView({ behavior: "smooth", block: "start" });
  };
  const save = async () => {
    if (!workspaceId || !name.trim() || !githubRepo) return;
    const [owner, repo] = githubRepo.split("/");
    setAction("save");
    try {
      const current = repositories.find((item) => item.id === editing);
      const input = {
        workspaceId,
        name,
        defaultBranch: branch,
        githubOwner: owner,
        githubRepo: repo,
        ...(current
          ? {
              agentProvider: current.agentProvider,
              executionPlane: current.executionPlane,
            }
          : {
              agentProvider: "openai" as const,
              executionPlane: "dokploy" as const,
            }),
      };
      const next = editing
        ? await updateLiveRepository({ ...input, repositoryId: editing })
        : await createLiveRepository(input);
      setRepositories((rows) =>
        editing
          ? rows.map((row) => (row.id === next.id ? next : row))
          : [next, ...rows],
      );
      reset();
      onToast(editing ? "Repository updated." : "Repository configured.");
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Repository could not be saved.",
      );
    } finally {
      setAction(null);
    }
  };
  const remove = async (repository: LiveRepository) => {
    if (
      !workspaceId ||
      !(await onConfirm({
        title: "Remove repository?",
        description: `${repository.name} will no longer be available for coding runs.`,
        confirmLabel: "Remove repository",
        destructive: true,
      }))
    )
      return;
    setAction(repository.id);
    try {
      await removeLiveRepository({ workspaceId, repositoryId: repository.id });
      setRepositories((rows) => rows.filter((row) => row.id !== repository.id));
      if (editing === repository.id) reset();
      onToast("Repository removed.");
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Repository could not be removed.",
      );
    } finally {
      setAction(null);
    }
  };
  return (
    <div className="settings-v2-page">
      <SettingsPageHeader
        title={t("repositories.title")}
        description={t("repositories.description")}
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
        <LoadingState label="Loading repositories…" />
      ) : (
        <>
          <SettingsSection
            title="Repository access"
            description="GitHub controls source access; this page controls which repositories are part of the Mend workspace."
            actions={
              <SettingsStatus tone={githubConnected ? "success" : "warning"}>
                {githubConnected
                  ? `GitHub · ${githubOwner}`
                  : "GitHub not connected"}
              </SettingsStatus>
            }
          >
            {!githubConnected && (
              <div className="settings-v2-callout">
                <div>
                  <strong>Connect GitHub before adding a repository</strong>
                  <p>
                    Mend only lists repositories from the official GitHub App
                    installation.
                  </p>
                </div>
                <Link
                  className="button button-secondary button-small"
                  to="/settings/integrations/github"
                >
                  <Github size={13} /> Manage GitHub
                </Link>
              </div>
            )}
            {repositories.length ? (
              <div className="settings-v2-list">
                {repositories.map((repository) => (
                  <div className="settings-v2-row" key={repository.id}>
                    <div className="settings-v2-row-icon">
                      <BookOpenCheck size={15} />
                    </div>
                    <div className="settings-v2-row-main">
                      <strong>{repository.name}</strong>
                      <span>
                        {repository.githubOwner && repository.githubRepo
                          ? `${repository.githubOwner}/${repository.githubRepo}`
                          : "GitHub repository not selected"}
                      </span>
                      <small>
                        {repository.defaultBranch} ·{" "}
                        {repository.executionPlane === "github_actions"
                          ? "GitHub Actions"
                          : "Dokploy runner"}
                      </small>
                    </div>
                    <div className="settings-v2-row-actions">
                      <button
                        className="button button-ghost button-small"
                        type="button"
                        onClick={() => edit(repository)}
                      >
                        Edit
                      </button>
                      <button
                        className="button button-danger button-small"
                        type="button"
                        onClick={() => void remove(repository)}
                        disabled={action === repository.id}
                      >
                        <Trash2 size={13} /> Remove
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <EmptyState
                title="No repositories configured"
                description="Add the first codebase below, then choose its default branch."
              />
            )}
          </SettingsSection>
          <SettingsSection
            title={editing ? "Edit repository" : "Add a repository"}
            description="Routing, models and coding connections are managed separately so repository identity stays simple."
          >
            <div
              id="settings-repository-editor"
              className="settings-v2-form-grid"
            >
              <label>
                Name
                <input
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  placeholder="Support app"
                />
              </label>
              <label>
                Default branch
                <input
                  value={branch}
                  onChange={(event) => setBranch(event.target.value)}
                  placeholder="main"
                />
              </label>
              <label className="settings-form-wide">
                GitHub repository
                <Select
                  value={githubRepo}
                  onChange={(value) => {
                    setGithubRepo(value);
                    const option = githubRepos.find(
                      (item) => `${item.owner}/${item.repo}` === value,
                    );
                    if (option) {
                      setBranch(option.defaultBranch);
                      if (!name.trim()) setName(option.repo);
                    }
                  }}
                  options={[
                    {
                      value: "",
                      label: githubConnected
                        ? "Select a repository"
                        : "Connect GitHub first",
                      disabled: true,
                    },
                    ...githubRepos.map((item) => ({
                      value: `${item.owner}/${item.repo}`,
                      label: `${item.owner}/${item.repo}`,
                    })),
                  ]}
                  disabled={!githubConnected}
                />
              </label>
            </div>
            <div className="settings-v2-form-actions">
              {editing && (
                <button
                  className="button button-ghost"
                  type="button"
                  onClick={reset}
                >
                  Cancel
                </button>
              )}
              <button
                className="button button-primary"
                type="button"
                onClick={() => void save()}
                disabled={action === "save" || !name.trim() || !githubRepo}
              >
                <Save size={14} />{" "}
                {action === "save"
                  ? "Saving…"
                  : editing
                    ? "Save changes"
                    : "Add repository"}
              </button>
            </div>
          </SettingsSection>
        </>
      )}
    </div>
  );
}

export function SettingsCodingConnectionsPage({
  workspaceId,
  onToast,
  onConfirm,
}: {
  workspaceId: string | null;
  onToast: (message: string) => void;
  onConfirm: Confirm;
}) {
  const { t } = useTranslation("settings");
  const [connections, setConnections] = useState<LiveAgentConnection[]>([]);
  const [label, setLabel] = useState("");
  const [provider, setProvider] = useState<
    "openai" | "anthropic" | "google" | "verboo"
  >("openai");
  const [authMethod, setAuthMethod] = useState<"api_key" | "subscription">(
    "api_key",
  );
  const [apiKey, setApiKey] = useState("");
  const [loginJob, setLoginJob] = useState<LiveAgentLoginJob | null>(null);
  const [loading, setLoading] = useState(true);
  const [action, setAction] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(async () => {
    if (!workspaceId) return;
    setLoading(true);
    setError(null);
    try {
      setConnections(await listLiveAgentConnections(workspaceId));
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Coding connections are unavailable.",
      );
    } finally {
      setLoading(false);
    }
  }, [workspaceId]);
  useEffect(() => void load(), [load]);
  useEffect(() => {
    if (
      !workspaceId ||
      !loginJob ||
      !["pending", "awaiting_user"].includes(loginJob.status)
    )
      return;
    const timer = window.setInterval(() => {
      void pollLiveAgentLogin({ workspaceId, jobId: loginJob.id })
        .then((job) => {
          setLoginJob(job);
          if (job.status === "completed") {
            onToast("Subscription connected.");
            void load();
          }
        })
        .catch(() => undefined);
    }, 2000);
    return () => window.clearInterval(timer);
  }, [load, loginJob, onToast, workspaceId]);
  const create = async () => {
    if (!workspaceId || !label.trim()) return;
    setAction("create");
    setError(null);
    try {
      if (authMethod === "subscription") {
        if (provider !== "openai")
          throw new Error(
            provider === "anthropic"
              ? "Claude.ai login is unavailable on hosted Mend runners for compliance reasons. Use an Anthropic API key."
              : "Subscription login is not available for this provider on the hosted runner.",
          );
        setLoginJob(
          await startLiveAgentLogin({ workspaceId, provider: "openai", label }),
        );
        onToast("Official subscription login started.");
      } else {
        const connection = await createLiveAgentConnection({
          workspaceId,
          label,
          provider,
          authMethod: "api_key",
          apiKey,
        });
        setConnections((rows) => [connection, ...rows]);
        setApiKey("");
        setLabel("");
        onToast("Coding API key saved securely.");
      }
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Connection could not be created.",
      );
    } finally {
      setAction(null);
    }
  };
  const updateConsent = async (
    connection: LiveAgentConnection,
    value: boolean,
  ) => {
    if (!workspaceId) return;
    try {
      const next = await updateLiveAgentConnection({
        workspaceId,
        connectionId: connection.id,
        automationConsent: value,
      });
      setConnections((rows) =>
        rows.map((row) => (row.id === next.id ? next : row)),
      );
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Consent could not be updated.",
      );
    }
  };
  const verify = async (connection: LiveAgentConnection) => {
    if (!workspaceId) return;
    setAction(connection.id);
    try {
      const next = await verifyLiveAgentConnection({
        workspaceId,
        connectionId: connection.id,
      });
      setConnections((rows) =>
        rows.map((row) => (row.id === next.id ? next : row)),
      );
      onToast(
        next.status === "connected"
          ? "Coding connection verified."
          : "Coding connection needs attention.",
      );
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Connection verification failed.",
      );
    } finally {
      setAction(null);
    }
  };
  const catalog = async (connection: LiveAgentConnection) => {
    if (!workspaceId) return;
    setAction(connection.id);
    try {
      const next = await refreshLiveAgentModels({
        workspaceId,
        connectionId: connection.id,
      });
      setConnections((rows) =>
        rows.map((row) =>
          row.id === connection.id
            ? { ...row, catalog: next, status: "connected" }
            : row,
        ),
      );
      onToast("Model catalog refreshed.");
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Model catalog is unavailable.",
      );
    } finally {
      setAction(null);
    }
  };
  const revoke = async (connection: LiveAgentConnection) => {
    if (
      !workspaceId ||
      !(await onConfirm({
        title: "Revoke coding connection?",
        description:
          "This disables the connection for future runs and removes its server-side secret.",
        confirmLabel: "Revoke connection",
        destructive: true,
      }))
    )
      return;
    setAction(connection.id);
    try {
      await revokeLiveAgentConnection({
        workspaceId,
        connectionId: connection.id,
      });
      setConnections((rows) => rows.filter((row) => row.id !== connection.id));
      onToast("Coding connection revoked.");
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Connection could not be revoked.",
      );
    } finally {
      setAction(null);
    }
  };
  const cancelLogin = async () => {
    if (!workspaceId || !loginJob) return;
    try {
      setLoginJob(
        await cancelLiveAgentLogin({ workspaceId, jobId: loginJob.id }),
      );
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Login could not be cancelled.",
      );
    }
  };
  return (
    <div className="settings-v2-page">
      <SettingsPageHeader
        title={t("v2.pages.codingConnectionsTitle")}
        description={t("v2.pages.codingConnectionsDescription")}
      />
      {error && <SettingsError message={error} onRetry={() => void load()} />}
      {!workspaceId ? (
        <SettingsWorkspaceRequired />
      ) : loading ? (
        <LoadingState label="Loading coding connections…" />
      ) : (
        <>
          <SettingsSection
            title="Add a connection"
            description="API keys are encrypted server-side and never returned after saving."
          >
            <div className="settings-v2-form-grid">
              <label>
                Connection label
                <input
                  value={label}
                  onChange={(event) => setLabel(event.target.value)}
                  placeholder="Research Claude API"
                />
              </label>
              <label>
                Provider
                <Select
                  value={provider}
                  onChange={(value) => {
                    setProvider(value as typeof provider);
                    if (value !== "openai") setAuthMethod("api_key");
                  }}
                  options={[
                    { value: "openai", label: "OpenAI / Codex" },
                    { value: "anthropic", label: "Anthropic / Claude" },
                    { value: "google", label: "Google / Gemini" },
                    { value: "verboo", label: "Verboo" },
                  ]}
                />
              </label>
              <label>
                Authentication
                <Select
                  value={authMethod}
                  onChange={(value) =>
                    setAuthMethod(value as typeof authMethod)
                  }
                  options={[
                    { value: "api_key", label: "API key" },
                    {
                      value: "subscription",
                      label: "Personal subscription",
                      disabled: provider !== "openai",
                    },
                  ]}
                />
              </label>
              {authMethod === "api_key" && (
                <label>
                  API key
                  <input
                    type="password"
                    value={apiKey}
                    onChange={(event) => setApiKey(event.target.value)}
                    placeholder="Stored encrypted and never returned"
                    autoComplete="off"
                  />
                </label>
              )}
            </div>
            {authMethod === "subscription" && (
              <div className="coding-auth-tutorial">
                <strong>Connect your ChatGPT subscription</strong>
                <ol>
                  <li>
                    <a
                      href="https://chatgpt.com/#settings/Security"
                      target="_blank"
                      rel="noreferrer"
                    >
                      Enable ChatGPT authorization here
                    </a>{" "}
                    in Security &amp; login.
                  </li>
                  <li>Turn on “Authorize device code for Codex”.</li>
                  <li>Return to Mend and start the official login.</li>
                  <li>
                    Open the official login link and enter the one-time code
                    shown here.
                  </li>
                </ol>
                <p>
                  Claude.ai subscription login is intentionally unavailable on
                  hosted Mend runners. The subscription belongs to you and
                  automation requires separate consent.
                </p>
              </div>
            )}
            {loginJob &&
              ["pending", "awaiting_user"].includes(loginJob.status) && (
                <div className="coding-login-challenge">
                  <strong>Finish official login</strong>
                  <span>Expires {formatSettingsDate(loginJob.expiresAt)}</span>
                  {loginJob.url && (
                    <a href={loginJob.url} target="_blank" rel="noreferrer">
                      Open official login
                    </a>
                  )}
                  {loginJob.code && <code>{loginJob.code}</code>}
                  <button
                    className="button button-ghost button-small"
                    type="button"
                    onClick={() => void cancelLogin()}
                  >
                    Cancel login
                  </button>
                </div>
              )}
            <button
              className="button button-primary"
              type="button"
              onClick={() => void create()}
              disabled={
                action === "create" ||
                !label.trim() ||
                (authMethod === "api_key" && !apiKey.trim())
              }
            >
              <KeyRound size={14} />{" "}
              {authMethod === "subscription"
                ? "Start official login"
                : "Save connection"}
            </button>
          </SettingsSection>
          <SettingsSection
            title="Connected providers"
            description="Verify access and refresh the catalog before using a connection in routing."
          >
            {!connections.length ? (
              <EmptyState
                title="No coding connections yet"
                description="Add an API key or connect your ChatGPT subscription above."
              />
            ) : (
              <div className="settings-v2-list">
                {connections.map((connection) => (
                  <div
                    className="settings-v2-row settings-v2-row-stack"
                    key={connection.id}
                  >
                    <div className="settings-v2-row-main">
                      <strong>{connection.label}</strong>
                      <span>
                        {providerLabel(connection.provider)} ·{" "}
                        {connection.authMethod === "subscription"
                          ? "Personal subscription"
                          : "API key"}{" "}
                        · {connection.status}
                      </span>
                      <small>
                        {connection.catalog
                          ? `${connection.catalog.models.length} models · verified ${formatSettingsDate(connection.catalog.lastVerifiedAt)}`
                          : "Catalog not verified"}
                      </small>
                      {connection.authMethod === "subscription" && (
                        <label className="coding-consent">
                          <input
                            type="checkbox"
                            checked={connection.automationConsent}
                            onChange={(event) =>
                              void updateConsent(
                                connection,
                                event.target.checked,
                              )
                            }
                          />
                          Allow this subscription in automations
                        </label>
                      )}
                    </div>
                    <div className="settings-v2-row-actions">
                      <button
                        className="button button-ghost button-small"
                        type="button"
                        onClick={() => void catalog(connection)}
                        disabled={action === connection.id}
                      >
                        Catalog
                      </button>
                      <button
                        className="button button-secondary button-small"
                        type="button"
                        onClick={() => void verify(connection)}
                        disabled={action === connection.id}
                      >
                        Verify
                      </button>
                      <button
                        className="button button-danger button-small"
                        type="button"
                        onClick={() => void revoke(connection)}
                        disabled={action === connection.id}
                      >
                        Revoke
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </SettingsSection>
        </>
      )}
    </div>
  );
}

const codingStages: CodingStage[] = [
  "research",
  "implement",
  "review",
  "verify",
];

export function SettingsCodingRoutingPage({
  workspaceId,
  onToast,
}: {
  workspaceId: string | null;
  onToast: (message: string) => void;
}) {
  const { t } = useTranslation("settings");
  const [connections, setConnections] = useState<LiveAgentConnection[]>([]);
  const [repositories, setRepositories] = useState<LiveRepository[]>([]);
  const [repositoryId, setRepositoryId] = useState("");
  const [policies, setPolicies] = useState<LiveStageRoutingPolicy[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(async () => {
    if (!workspaceId) return;
    setLoading(true);
    setError(null);
    try {
      const [nextConnections, nextRepositories] = await Promise.all([
        listLiveAgentConnections(workspaceId),
        listLiveRepositories(workspaceId),
      ]);
      setConnections(nextConnections);
      setRepositories(nextRepositories);
      setPolicies(
        await listLiveAgentRoutingPolicies({
          workspaceId,
          repositoryId: repositoryId || undefined,
        }),
      );
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Coding routing is unavailable.",
      );
    } finally {
      setLoading(false);
    }
  }, [repositoryId, workspaceId]);
  useEffect(() => void load(), [load]);
  const policyFor = (stage: CodingStage) =>
    policies.find((policy) => policy.stage === stage) ?? {
      stage,
      preset: "Custom" as const,
      ...(repositoryId ? { repositoryId } : {}),
    };
  const update = (stage: CodingStage, patch: Partial<LiveStageRoutingPolicy>) =>
    setPolicies((current) => {
      const existing = policyFor(stage);
      const next = { ...existing, ...patch };
      return [...current.filter((policy) => policy.stage !== stage), next];
    });
  const save = async (stage: CodingStage) => {
    if (!workspaceId) return;
    setSaving(stage);
    try {
      const next = await saveLiveAgentRoutingPolicy({
        workspaceId,
        policy: policyFor(stage),
      });
      setPolicies((current) => [
        ...current.filter((policy) => policy.stage !== stage),
        next,
      ]);
      onToast(`${stage} routing saved.`);
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Routing policy could not be saved.",
      );
    } finally {
      setSaving(null);
    }
  };
  const connectionFor = (id?: string) =>
    connections.find((connection) => connection.id === id);
  return (
    <div className="settings-v2-page">
      <SettingsPageHeader
        title={t("v2.pages.codingRoutingTitle")}
        description={t("v2.pages.codingRoutingDescription")}
      />
      {error && <SettingsError message={error} onRetry={() => void load()} />}
      {!workspaceId ? (
        <SettingsWorkspaceRequired />
      ) : loading ? (
        <LoadingState label="Loading coding routes…" />
      ) : (
        <>
          <SettingsSection
            title="Routing scope"
            description="Workspace defaults apply unless a repository override is selected."
          >
            <div className="settings-v2-form-grid">
              <label>
                Scope
                <Select
                  value={repositoryId}
                  onChange={(value) => setRepositoryId(value)}
                  options={[
                    { value: "", label: "Workspace default" },
                    ...repositories.map((repository) => ({
                      value: repository.id,
                      label: `Repository · ${repository.name}`,
                    })),
                  ]}
                />
              </label>
            </div>
          </SettingsSection>
          <SettingsSection
            title="Stages"
            description="A verified catalog is required before a model can be selected. Fallback remains off unless you explicitly enable it."
          >
            <div className="settings-v2-routing-list">
              {codingStages.map((stage) => {
                const policy = policyFor(stage);
                const connection = connectionFor(policy.connectionId);
                const model = connection?.catalog?.models.find(
                  (item) => item.id === policy.model,
                );
                const budget = (policy.budget ?? {}) as Record<string, unknown>;
                const updateBudget = (key: string, value: string) =>
                  update(stage, {
                    budget: {
                      ...budget,
                      [key]: value ? Number(value) : undefined,
                    },
                  });
                return (
                  <div className="settings-v2-routing-row" key={stage}>
                    <div className="settings-v2-routing-heading">
                      <strong>{stage}</strong>
                      <span>
                        {stage === "research"
                          ? "Evidence and diagnosis"
                          : stage === "implement"
                            ? "Apply the proposed change"
                            : stage === "review"
                              ? "Review diff and checks"
                              : "Interpret verification failures"}
                      </span>
                    </div>
                    <div className="settings-v2-form-grid">
                      <label>
                        Connection
                        <Select
                          value={policy.connectionId ?? ""}
                          onChange={(value) =>
                            update(stage, {
                              connectionId: value || undefined,
                              model: undefined,
                              effort: undefined,
                            })
                          }
                          options={[
                            { value: "", label: "Select connection" },
                            ...connections.map((item) => ({
                              value: item.id,
                              label: `${item.label} · ${providerLabel(item.provider)}`,
                              disabled:
                                item.status !== "connected" ||
                                (item.authMethod === "subscription" &&
                                  !item.automationConsent),
                            })),
                          ]}
                        />
                      </label>
                      <label>
                        Model
                        <Select
                          value={policy.model ?? ""}
                          disabled={!connection?.catalog?.models.length}
                          onChange={(value) =>
                            update(stage, {
                              model: value || undefined,
                              effort: undefined,
                            })
                          }
                          options={
                            connection?.catalog?.models.length
                              ? connection.catalog.models.map((item) => ({
                                  value: item.id,
                                  label: item.label ?? item.id,
                                }))
                              : [
                                  {
                                    value: "",
                                    label: "Refresh a verified catalog",
                                    disabled: true,
                                  },
                                ]
                          }
                        />
                      </label>
                      {model?.efforts?.length ? (
                        <label>
                          Effort
                          <Select
                            value={policy.effort ?? ""}
                            onChange={(value) =>
                              update(stage, { effort: value || undefined })
                            }
                            options={[
                              { value: "", label: "Default effort" },
                              ...model.efforts.map((effort) => ({
                                value: effort,
                                label: effort,
                              })),
                            ]}
                          />
                        </label>
                      ) : (
                        <div className="settings-v2-capability-note">
                          No effort capability
                        </div>
                      )}
                      <label>
                        Max duration (s)
                        <input
                          type="number"
                          min="1"
                          value={String(budget.maxDurationSeconds ?? "")}
                          onChange={(event) =>
                            updateBudget(
                              "maxDurationSeconds",
                              event.target.value,
                            )
                          }
                        />
                      </label>
                      <label>
                        Max output tokens
                        <input
                          type="number"
                          min="1"
                          value={String(budget.maxOutputTokens ?? "")}
                          onChange={(event) =>
                            updateBudget("maxOutputTokens", event.target.value)
                          }
                        />
                      </label>
                      <label>
                        Max repairs
                        <input
                          type="number"
                          min="0"
                          value={String(budget.maxRepairs ?? "")}
                          onChange={(event) =>
                            updateBudget("maxRepairs", event.target.value)
                          }
                        />
                      </label>
                    </div>
                    <div className="settings-v2-routing-footer">
                      <label className="coding-fallback-toggle">
                        <input
                          type="checkbox"
                          checked={policy.fallbackEnabled === true}
                          onChange={(event) =>
                            update(stage, {
                              fallbackEnabled: event.target.checked,
                            })
                          }
                        />
                        Enable explicit fallback
                      </label>
                      {policy.fallbackEnabled && (
                        <select
                          className="coding-fallback-select"
                          multiple
                          aria-label={`${stage} fallback connections`}
                          value={policy.fallbackConnectionIds ?? []}
                          onChange={(event) =>
                            update(stage, {
                              fallbackConnectionIds: Array.from(
                                event.target.selectedOptions,
                                (option) => option.value,
                              ),
                            })
                          }
                        >
                          {connections
                            .filter((item) => item.id !== policy.connectionId)
                            .map((item) => (
                              <option
                                key={item.id}
                                value={item.id}
                                disabled={
                                  item.status !== "connected" ||
                                  (item.authMethod === "subscription" &&
                                    !item.automationConsent)
                                }
                              >
                                {item.label}
                              </option>
                            ))}
                        </select>
                      )}
                      <button
                        className="button button-primary button-small"
                        type="button"
                        onClick={() => void save(stage)}
                        disabled={
                          saving === stage ||
                          !policy.connectionId ||
                          !policy.model
                        }
                      >
                        <Save size={13} />{" "}
                        {saving === stage ? "Saving…" : "Save stage"}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </SettingsSection>
        </>
      )}
    </div>
  );
}
