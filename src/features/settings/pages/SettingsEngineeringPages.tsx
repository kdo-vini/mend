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
import { Link, useLocation } from "react-router-dom";
import type { Confirm } from "../../../shared/ui/ConfirmDialog";
import { ActionMenu } from "../../../shared/ui/ActionMenu";
import { EmptyState, LoadingState } from "../../../shared/ui/ResourceState";
import { Select } from "../../../shared/ui/Select";
import { ViewTabs } from "../../../shared/ui/ViewTabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../../../components/ui/table";
import {
  createLiveRepository,
  createLiveAgentConnection,
  cancelLiveAgentLogin,
  getLiveGitHubConnection,
  listLiveAgentConnections,
  listLiveAgentLoginJobs,
  listLiveAgentRoutingPolicies,
  listLiveGitHubRepositories,
  listLiveRepositories,
  pollLiveAgentLogin,
  refreshLiveAgentModels,
  rotateLiveSupportConnectionSecret,
  removeLiveRepository,
  revokeLiveAgentConnection,
  saveLiveAgentRoutingPolicy,
  saveLiveSupportModelConfig,
  startLiveAgentLogin,
  updateLiveAgentConnection,
  updateLiveRepository,
  verifyLiveAgentConnection,
  type CodingStage,
  type LiveAgentConnection,
  type LiveAgentLoginJob,
  type LiveRepository,
  type LiveSupportModelConfig,
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
import { catalogFailurePresentation } from "../catalog-errors";
import type { SettingsWorkspacePageProps } from "./SettingsWorkspacePage";

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
          : t("v2.repositories.loadError"),
      );
    } finally {
      setLoading(false);
    }
  }, [t, workspaceId]);
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
      onToast(
        editing
          ? t("v2.repositories.updatedToast")
          : t("v2.repositories.configuredToast"),
      );
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : t("v2.repositories.saveError"),
      );
    } finally {
      setAction(null);
    }
  };
  const remove = async (repository: LiveRepository) => {
    if (
      !workspaceId ||
      !(await onConfirm({
        title: t("v2.repositories.confirmTitle"),
        description: t("v2.repositories.confirmDescription", {
          name: repository.name,
        }),
        confirmLabel: t("v2.repositories.confirmLabel"),
        destructive: true,
      }))
    )
      return;
    setAction(repository.id);
    try {
      await removeLiveRepository({ workspaceId, repositoryId: repository.id });
      setRepositories((rows) => rows.filter((row) => row.id !== repository.id));
      if (editing === repository.id) reset();
      onToast(t("v2.repositories.removedToast"));
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : t("v2.repositories.removeError"),
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
            <RefreshCw size={13} /> {t("v2.repositories.refresh")}
          </button>
        }
      />
      {error && <SettingsError message={error} onRetry={() => void load()} />}
      {!workspaceId ? (
        <SettingsWorkspaceRequired />
      ) : loading ? (
        <LoadingState label={t("v2.repositories.loading")} />
      ) : (
        <>
          <SettingsSection
            title={t("v2.repositories.accessTitle")}
            description={t("v2.repositories.accessDescription")}
            actions={
              <SettingsStatus tone={githubConnected ? "success" : "warning"}>
                {githubConnected
                  ? `GitHub · ${githubOwner}`
                  : t("v2.repositories.githubNotConnected")}
              </SettingsStatus>
            }
          >
            {!githubConnected && (
              <div className="settings-v2-callout">
                <div>
                  <strong>{t("v2.repositories.connectBeforeAdd")}</strong>
                  <p>{t("v2.repositories.githubAppDescription")}</p>
                </div>
                <Link
                  className="button button-secondary button-small"
                  to="/settings/integrations/github"
                >
                  <Github size={13} /> {t("v2.repositories.manageGithub")}
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
                          : t("v2.repositories.repositoryNotSelected")}
                      </span>
                      <small>
                        {repository.defaultBranch} ·{" "}
                        {repository.executionPlane === "github_actions"
                          ? t("v2.repositories.githubActions")
                          : t("v2.repositories.dokployRunner")}
                      </small>
                    </div>
                    <div className="settings-v2-row-actions">
                      <button
                        className="button button-ghost button-small"
                        type="button"
                        onClick={() => edit(repository)}
                      >
                        {t("v2.repositories.edit")}
                      </button>
                      <button
                        className="button button-danger button-small"
                        type="button"
                        onClick={() => void remove(repository)}
                        disabled={action === repository.id}
                      >
                        <Trash2 size={13} /> {t("v2.repositories.remove")}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <EmptyState
                title={t("v2.repositories.emptyTitle")}
                description={t("v2.repositories.emptyDescription")}
              />
            )}
          </SettingsSection>
          <SettingsSection
            title={
              editing
                ? t("v2.repositories.editTitle")
                : t("v2.repositories.addTitle")
            }
            description={t("v2.repositories.formDescription")}
          >
            <div
              id="settings-repository-editor"
              className="settings-v2-form-grid"
            >
              <label>
                {t("v2.repositories.name")}
                <input
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  placeholder={t("v2.repositories.namePlaceholder")}
                />
              </label>
              <label>
                {t("v2.repositories.defaultBranch")}
                <input
                  value={branch}
                  onChange={(event) => setBranch(event.target.value)}
                  placeholder={t("v2.repositories.branchPlaceholder")}
                />
              </label>
              <label className="settings-form-wide">
                {t("v2.repositories.githubRepository")}
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
                        ? t("v2.repositories.selectRepository")
                        : t("v2.repositories.connectGithubFirst"),
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
                  {t("v2.repositories.cancel")}
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
                  ? t("v2.repositories.saving")
                  : editing
                    ? t("v2.repositories.saveChanges")
                    : t("v2.repositories.addRepository")}
              </button>
            </div>
          </SettingsSection>
        </>
      )}
    </div>
  );
}

export function SettingsAgentsPage({
  section,
  ...props
}: SettingsWorkspacePageProps & {
  section: "issues-providers" | "issues-run-policy" | "support";
}) {
  const { search } = useLocation();
  const { t } = useTranslation("settings");
  const issues = section !== "support";
  return (
    <div className="settings-v2-page">
      <SettingsPageHeader
        title={t("v2.agents.title")}
        description={
          section === "support"
            ? t("v2.agents.supportDescription")
            : t("v2.agents.description")
        }
      />
      <ViewTabs
        label={t("v2.agents.sections")}
        items={[
          {
            id: "issues",
            label: t("v2.agents.issues"),
            href: `/settings/engineering/agents/issues/providers${search}`,
            active: issues,
          },
          {
            id: "support",
            label: t("v2.agents.support"),
            href: `/settings/engineering/agents/support${search}`,
            active: section === "support",
          },
        ]}
      />
      {issues ? (
        <>
          <ViewTabs
            label={t("v2.agents.issuesSections")}
            items={[
              {
                id: "issues-providers",
                label: t("v2.agents.providers"),
                href: `/settings/engineering/agents/issues/providers${search}`,
                active: section === "issues-providers",
              },
              {
                id: "issues-run-policy",
                label: t("v2.agents.runPolicy"),
                href: `/settings/engineering/agents/issues/run-policy${search}`,
                active: section === "issues-run-policy",
              },
            ]}
          />
          {section === "issues-providers" ? (
            <CodingProvidersContent {...props} />
          ) : (
            <CodingRunPolicyContent {...props} />
          )}
        </>
      ) : (
        <SupportAiContent {...props} />
      )}
    </div>
  );
}

export function ProviderComparisonTable({
  connections,
  action,
  onCatalog,
  onVerify,
  onRevoke,
  onAutomationConsent,
}: {
  connections: LiveAgentConnection[];
  action: string | null;
  onCatalog: (connection: LiveAgentConnection) => void;
  onVerify: (connection: LiveAgentConnection) => void;
  onRevoke: (connection: LiveAgentConnection) => void;
  onAutomationConsent: (
    connection: LiveAgentConnection,
    value: boolean,
  ) => void;
}) {
  const { t } = useTranslation("settings");
  return (
    <Table className="settings-provider-table">
      <TableHeader>
        <TableRow>
          <TableHead>{t("v2.agents.connection")}</TableHead>
          <TableHead>{t("v2.agents.authentication")}</TableHead>
          <TableHead>{t("v2.agents.catalog")}</TableHead>
          <TableHead>{t("v2.agents.automation")}</TableHead>
          <TableHead>{t("v2.agents.status")}</TableHead>
          <TableHead className="settings-provider-actions">
            {t("v2.agents.actions")}
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {connections.map((connection) => {
          const statusLabel = t(
            `v2.codingConnections.statuses.${connection.status}`,
            { defaultValue: connection.status },
          );
          const statusTone =
            connection.status === "connected"
              ? "success"
              : ["pending", "awaiting_user"].includes(connection.status)
                ? "warning"
                : "danger";
          const pending = action === connection.id;
          return (
            <TableRow key={connection.id}>
              <TableCell data-label={t("v2.agents.connection")}>
                <span className="settings-provider-primary">
                  <strong>{connection.label}</strong>
                  <small>{providerLabel(connection.provider)}</small>
                </span>
              </TableCell>
              <TableCell data-label={t("v2.agents.authentication")}>
                {connection.authMethod === "subscription"
                  ? t("v2.codingConnections.personalSubscription")
                  : t("v2.codingConnections.apiKeyShort")}
              </TableCell>
              <TableCell data-label={t("v2.agents.catalog")}>
                <span className="settings-provider-catalog">
                  {connection.catalog ? (
                    <>
                      <strong>
                        {t("v2.codingConnections.models", {
                          count: connection.catalog.models.length,
                        })}
                      </strong>
                      <small>
                        {t("v2.codingConnections.verified", {
                          date: formatSettingsDate(
                            connection.catalog.lastVerifiedAt,
                          ),
                        })}
                      </small>
                    </>
                  ) : (
                    t("v2.codingConnections.catalogNotVerified")
                  )}
                </span>
              </TableCell>
              <TableCell data-label={t("v2.agents.automation")}>
                {connection.authMethod === "subscription" ? (
                  <label className="coding-consent">
                    <input
                      type="checkbox"
                      checked={connection.automationConsent}
                      disabled={
                        connection.status !== "connected" || !connection.catalog
                      }
                      title={
                        connection.status === "connected" && connection.catalog
                          ? undefined
                          : t("v2.codingConnections.automationRequiresCatalog")
                      }
                      onChange={(event) =>
                        onAutomationConsent(connection, event.target.checked)
                      }
                    />
                    <span className="sr-only">
                      {t("v2.codingConnections.allowAutomation")}
                    </span>
                  </label>
                ) : (
                  <span className="settings-provider-muted">
                    {t("v2.agents.automationNotRequired")}
                  </span>
                )}
              </TableCell>
              <TableCell data-label={t("v2.agents.status")}>
                <SettingsStatus tone={statusTone}>{statusLabel}</SettingsStatus>
              </TableCell>
              <TableCell
                className="settings-provider-actions"
                data-label={t("v2.agents.actions")}
              >
                <div className="settings-provider-desktop-actions">
                  <button
                    className="button button-ghost button-small"
                    type="button"
                    onClick={() => onCatalog(connection)}
                    disabled={pending}
                  >
                    {t("v2.codingConnections.catalog")}
                  </button>
                  <button
                    className="button button-secondary button-small"
                    type="button"
                    onClick={() => onVerify(connection)}
                    disabled={pending}
                  >
                    {t("v2.codingConnections.verify")}
                  </button>
                  <button
                    className="button button-danger button-small"
                    type="button"
                    onClick={() => onRevoke(connection)}
                    disabled={pending}
                  >
                    {t("v2.codingConnections.revoke")}
                  </button>
                </div>
                <div className="settings-provider-mobile-actions">
                  <ActionMenu label={connection.label}>
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => onCatalog(connection)}
                      disabled={pending}
                    >
                      <RefreshCw size={14} />
                      {t("v2.codingConnections.catalog")}
                    </button>
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => onVerify(connection)}
                      disabled={pending}
                    >
                      <BookOpenCheck size={14} />
                      {t("v2.codingConnections.verify")}
                    </button>
                    <button
                      className="danger"
                      type="button"
                      role="menuitem"
                      onClick={() => onRevoke(connection)}
                      disabled={pending}
                    >
                      <Trash2 size={14} />
                      {t("v2.codingConnections.revoke")}
                    </button>
                  </ActionMenu>
                </div>
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}

function CodingProvidersContent({
  workspaceId,
  onToast,
  onConfirm,
}: SettingsWorkspacePageProps) {
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
      const [nextConnections, activeJobs] = await Promise.all([
        listLiveAgentConnections(workspaceId, "coding"),
        listLiveAgentLoginJobs(workspaceId),
      ]);
      setConnections(nextConnections);
      setLoginJob(activeJobs.find((job) => job.provider === "openai") ?? null);
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : t("v2.codingConnections.errors.load"),
      );
    } finally {
      setLoading(false);
    }
  }, [t, workspaceId]);
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
          if (job.status === "completed") {
            onToast(t("v2.codingConnections.subscriptionConnected"));
            setLoginJob(null);
            void load();
          } else if (["failed", "expired", "canceled"].includes(job.status)) {
            setLoginJob(job);
            setError(
              t(`v2.codingConnections.loginStatus.${job.status}`, {
                defaultValue: t("v2.codingConnections.errors.loginFailed"),
              }),
            );
          } else {
            setLoginJob(job);
          }
        })
        .catch((reason) =>
          setError(
            reason instanceof Error
              ? reason.message
              : t("v2.codingConnections.errors.poll"),
          ),
        );
    }, 2000);
    return () => window.clearInterval(timer);
  }, [load, loginJob, onToast, t, workspaceId]);
  const create = async () => {
    if (!workspaceId || !label.trim()) return;
    setAction("create");
    setError(null);
    try {
      if (authMethod === "subscription") {
        if (provider !== "openai")
          throw new Error(
            provider === "anthropic"
              ? t("v2.codingConnections.errors.anthropicSubscription")
              : t("v2.codingConnections.errors.providerSubscription"),
          );
        const nextJob = await startLiveAgentLogin({
          workspaceId,
          provider: "openai",
          label,
        });
        if (["pending", "awaiting_user"].includes(nextJob.status)) {
          setLoginJob(nextJob);
          onToast(t("v2.codingConnections.officialLoginStarted"));
        } else {
          setLoginJob(nextJob);
          setError(
            t(`v2.codingConnections.loginStatus.${nextJob.status}`, {
              defaultValue: t("v2.codingConnections.errors.loginFailed"),
            }),
          );
        }
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
        onToast(t("v2.codingConnections.apiKeySaved"));
      }
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : t("v2.codingConnections.errors.create"),
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
          : t("v2.codingConnections.errors.consent"),
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
          ? t("v2.codingConnections.verifiedToast")
          : t("v2.codingConnections.needsAttentionToast"),
      );
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : t("v2.codingConnections.errors.verify"),
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
      onToast(t("v2.codingConnections.catalogRefreshed"));
    } catch (reason) {
      const failure = catalogFailurePresentation(reason);
      setConnections((rows) =>
        rows.map((row) =>
          row.id === connection.id ? { ...row, status: failure.status } : row,
        ),
      );
      setError(t(`v2.codingConnections.errors.${failure.messageKey}`));
    } finally {
      setAction(null);
    }
  };
  const revoke = async (connection: LiveAgentConnection) => {
    if (
      !workspaceId ||
      !(await onConfirm({
        title: t("v2.codingConnections.confirmTitle"),
        description: t("v2.codingConnections.confirmDescription"),
        confirmLabel: t("v2.codingConnections.confirmLabel"),
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
      onToast(t("v2.codingConnections.revokedToast"));
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : t("v2.codingConnections.errors.revoke"),
      );
    } finally {
      setAction(null);
    }
  };
  const cancelLogin = async () => {
    if (!workspaceId || !loginJob) return;
    setAction("cancel-login");
    try {
      await cancelLiveAgentLogin({ workspaceId, jobId: loginJob.id });
      setLoginJob(null);
      await load();
      onToast(t("v2.codingConnections.loginCanceled"));
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : t("v2.codingConnections.errors.cancel"),
      );
    } finally {
      setAction(null);
    }
  };
  const loginActive =
    loginJob && ["pending", "awaiting_user"].includes(loginJob.status);
  return (
    <div className="settings-v2-content">
      {error && <SettingsError message={error} onRetry={() => void load()} />}
      {!workspaceId ? (
        <SettingsWorkspaceRequired />
      ) : loading ? (
        <LoadingState label={t("v2.codingConnections.loading")} />
      ) : (
        <>
          <SettingsSection
            title={t("v2.codingConnections.addTitle")}
            description={t("v2.codingConnections.addDescription")}
          >
            <div className="settings-v2-form-grid">
              <label>
                {t("v2.codingConnections.label")}
                <input
                  value={label}
                  onChange={(event) => setLabel(event.target.value)}
                  placeholder={t("v2.codingConnections.labelPlaceholder")}
                />
              </label>
              <label>
                {t("v2.codingConnections.provider")}
                <Select
                  value={provider}
                  onChange={(value) => {
                    setProvider(value as typeof provider);
                    if (value !== "openai") setAuthMethod("api_key");
                  }}
                  options={[
                    {
                      value: "openai",
                      label: t("v2.codingConnections.providerOpenai"),
                    },
                    {
                      value: "anthropic",
                      label: t("v2.codingConnections.providerAnthropic"),
                    },
                    {
                      value: "google",
                      label: t("v2.codingConnections.providerGoogle"),
                    },
                    {
                      value: "verboo",
                      label: t("v2.codingConnections.providerVerboo"),
                    },
                  ]}
                />
              </label>
              <label>
                {t("v2.codingConnections.authentication")}
                <Select
                  value={authMethod}
                  onChange={(value) =>
                    setAuthMethod(value as typeof authMethod)
                  }
                  options={[
                    {
                      value: "api_key",
                      label: t("v2.codingConnections.apiKeyMethod"),
                    },
                    {
                      value: "subscription",
                      label: t("v2.codingConnections.subscriptionMethod"),
                      disabled: provider !== "openai",
                    },
                  ]}
                />
              </label>
              {authMethod === "api_key" && (
                <label>
                  {t("v2.codingConnections.apiKey")}
                  <input
                    type="password"
                    value={apiKey}
                    onChange={(event) => setApiKey(event.target.value)}
                    placeholder={t("v2.codingConnections.apiKeyPlaceholder")}
                    autoComplete="off"
                  />
                </label>
              )}
            </div>
            {provider !== "openai" && (
              <div className="settings-v2-callout">
                <div>
                  <strong>
                    {t("v2.codingConnections.subscriptionAvailability")}
                  </strong>
                  <p>
                    {provider === "anthropic"
                      ? t("v2.codingConnections.errors.anthropicSubscription")
                      : t("v2.codingConnections.errors.providerSubscription")}
                  </p>
                </div>
              </div>
            )}
            {authMethod === "subscription" && provider === "openai" && (
              <div className="settings-v2-callout">
                <div>
                  <strong>
                    {t("v2.codingConnections.officialLoginLabel")}
                  </strong>
                  <p>{t("v2.codingConnections.officialLoginDescription")}</p>
                </div>
              </div>
            )}
            {authMethod === "subscription" && provider === "openai" && (
              <div className="coding-auth-tutorial">
                <strong>{t("v2.codingConnections.tutorialTitle")}</strong>
                <ol>
                  <li>
                    <a
                      href="https://chatgpt.com/#settings/Security"
                      target="_blank"
                      rel="noreferrer"
                    >
                      {t("v2.codingConnections.tutorialAuthorize")}
                    </a>{" "}
                    {t("v2.codingConnections.tutorialSecurity")}
                  </li>
                  <li>{t("v2.codingConnections.tutorialStep2")}</li>
                  <li>{t("v2.codingConnections.tutorialStep3")}</li>
                  <li>{t("v2.codingConnections.tutorialStep4")}</li>
                </ol>
                <p>{t("v2.codingConnections.tutorialCompliance")}</p>
              </div>
            )}
            {loginJob &&
              ["pending", "awaiting_user"].includes(loginJob.status) && (
                <div className="coding-login-challenge">
                  <strong>{t("v2.codingConnections.finishLogin")}</strong>
                  <span>
                    {t("v2.codingConnections.expires", {
                      date: formatSettingsDate(loginJob.expiresAt),
                    })}
                  </span>
                  {loginJob.url && (
                    <a href={loginJob.url} target="_blank" rel="noreferrer">
                      {t("v2.codingConnections.openOfficialLogin")}
                    </a>
                  )}
                  {loginJob.code && <code>{loginJob.code}</code>}
                  <button
                    className="button button-ghost button-small"
                    type="button"
                    onClick={() => void cancelLogin()}
                    disabled={action === "cancel-login"}
                  >
                    {t("v2.codingConnections.cancelLogin")}
                  </button>
                </div>
              )}
            {loginJob &&
              ["failed", "expired", "canceled"].includes(loginJob.status) && (
                <div className="settings-v2-error" role="alert">
                  <span>
                    {t(`v2.codingConnections.loginStatus.${loginJob.status}`, {
                      defaultValue: t(
                        "v2.codingConnections.errors.loginFailed",
                      ),
                    })}
                  </span>
                  <button
                    className="text-button"
                    type="button"
                    onClick={() => setLoginJob(null)}
                  >
                    {t("v2.codingConnections.tryAgain")}
                  </button>
                </div>
              )}
            <button
              className="button button-primary"
              type="button"
              onClick={() => void create()}
              disabled={
                action === "create" ||
                (authMethod === "subscription" && Boolean(loginActive)) ||
                !label.trim() ||
                (authMethod === "api_key" && !apiKey.trim())
              }
            >
              <KeyRound size={14} />{" "}
              {authMethod === "subscription"
                ? t("v2.codingConnections.startOfficialLogin")
                : t("v2.codingConnections.saveConnection")}
            </button>
          </SettingsSection>
          <SettingsSection
            title={t("v2.codingConnections.connectedTitle")}
            description={t("v2.codingConnections.connectedDescription")}
          >
            {!connections.length ? (
              <EmptyState
                title={t("v2.codingConnections.emptyTitle")}
                description={t("v2.codingConnections.emptyDescription")}
              />
            ) : (
              <ProviderComparisonTable
                connections={connections}
                action={action}
                onCatalog={(connection) => void catalog(connection)}
                onVerify={(connection) => void verify(connection)}
                onRevoke={(connection) => void revoke(connection)}
                onAutomationConsent={(connection, value) =>
                  void updateConsent(connection, value)
                }
              />
            )}
          </SettingsSection>
        </>
      )}
    </div>
  );
}

function SupportAiContent({
  workspaceId,
  onToast,
  onConfirm,
}: SettingsWorkspacePageProps) {
  const { t } = useTranslation("settings");
  const [connection, setConnection] = useState<LiveAgentConnection | null>(
    null,
  );
  const [config, setConfig] = useState<LiveSupportModelConfig>({
    supportModel: "",
    visionModel: "",
    transcriptionModel: "",
    embeddingModel: "",
  });
  const [label, setLabel] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [loading, setLoading] = useState(true);
  const [action, setAction] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const supportError = useCallback(
    (reason: unknown, fallback: string) => {
      const code =
        reason && typeof reason === "object" && "code" in reason
          ? String((reason as { code?: unknown }).code ?? "")
          : "";
      const key =
        code === "support_ai_byok_required"
          ? "v2.agents.supportErrors.byok"
          : code === "support_ai_catalog_required"
            ? "v2.agents.supportErrors.catalog"
            : code === "support_ai_model_invalid"
              ? "v2.agents.supportErrors.modelInvalid"
              : code === "support_ai_embedding_failed"
                ? "v2.agents.supportErrors.embedding"
                : code === "support_ai_configuration_required"
                  ? "v2.agents.supportErrors.configuration"
                  : code === "support_ai_model_missing"
                    ? "v2.agents.supportErrors.modelMissing"
                    : undefined;
      return key ? t(key) : reason instanceof Error ? reason.message : fallback;
    },
    [t],
  );

  const load = useCallback(async () => {
    if (!workspaceId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const rows = await listLiveAgentConnections(workspaceId, "support");
      const next = rows[0] ?? null;
      setConnection(next);
      setLabel(next?.label ?? t("v2.agents.supportDefaultLabel"));
      setConfig(
        next?.supportConfig ?? {
          supportModel: "",
          visionModel: "",
          transcriptionModel: "",
          embeddingModel: "",
        },
      );
    } catch (reason) {
      setError(supportError(reason, t("v2.agents.supportLoadError")));
    } finally {
      setLoading(false);
    }
  }, [supportError, t, workspaceId]);
  useEffect(() => void load(), [load]);

  const refresh = async (target: LiveAgentConnection) => {
    if (!workspaceId) return;
    setAction("catalog");
    setError(null);
    try {
      const catalog = await refreshLiveAgentModels({
        workspaceId,
        connectionId: target.id,
      });
      setConnection((current) =>
        current ? { ...current, catalog, status: "connected" } : current,
      );
      onToast(t("v2.agents.supportCatalogRefreshed"));
    } catch (reason) {
      setConnection((current) =>
        current ? { ...current, status: "error" } : current,
      );
      setError(supportError(reason, t("v2.agents.supportCatalogError")));
    } finally {
      setAction(null);
    }
  };

  const createOrRotate = async () => {
    if (!workspaceId || !apiKey.trim()) return;
    setAction(connection ? "rotate" : "create");
    setError(null);
    try {
      const next = connection
        ? await rotateLiveSupportConnectionSecret({
            workspaceId,
            connectionId: connection.id,
            apiKey,
          })
        : await createLiveAgentConnection({
            workspaceId,
            label: label || t("v2.agents.supportDefaultLabel"),
            provider: "openai",
            authMethod: "api_key",
            purpose: "support",
            apiKey,
          });
      setConnection(next);
      setApiKey("");
      setConfig({
        supportModel: "",
        visionModel: "",
        transcriptionModel: "",
        embeddingModel: "",
      });
      await refresh(next);
    } catch (reason) {
      setError(supportError(reason, t("v2.agents.supportSaveError")));
    } finally {
      setAction(null);
    }
  };

  const save = async () => {
    if (!workspaceId || !connection) return;
    setAction("save");
    setError(null);
    try {
      const next = await saveLiveSupportModelConfig({
        workspaceId,
        connectionId: connection.id,
        config,
      });
      setConnection(next);
      onToast(t("v2.agents.supportSaved"));
    } catch (reason) {
      setError(supportError(reason, t("v2.agents.supportSaveError")));
    } finally {
      setAction(null);
    }
  };

  const revoke = async () => {
    if (
      !workspaceId ||
      !connection ||
      !(await onConfirm({
        title: t("v2.agents.supportRevokeTitle"),
        description: t("v2.agents.supportRevokeDescription"),
        confirmLabel: t("v2.codingConnections.confirmLabel"),
        destructive: true,
      }))
    )
      return;
    setAction("revoke");
    try {
      await revokeLiveAgentConnection({
        workspaceId,
        connectionId: connection.id,
      });
      setConnection(null);
      setConfig({
        supportModel: "",
        visionModel: "",
        transcriptionModel: "",
        embeddingModel: "",
      });
      onToast(t("v2.agents.supportRevoked"));
    } catch (reason) {
      setError(supportError(reason, t("v2.agents.supportSaveError")));
    } finally {
      setAction(null);
    }
  };

  const catalogModels = connection?.catalog?.models ?? [];
  const optionsFor = (
    capability: "text" | "vision" | "transcription" | "embedding",
  ) => [
    { value: "", label: t("v2.agents.supportSelectModel") },
    ...catalogModels
      .filter((model) => model.capabilities?.includes(capability))
      .map((model) => ({
        value: model.id,
        label: model.label ? `${model.label} · ${model.id}` : model.id,
      })),
  ];
  const status = !connection
    ? "notConfigured"
    : connection.status === "error"
      ? "error"
      : !connection.catalog
        ? "needsVerification"
        : !connection.supportConfig
          ? "incomplete"
          : "ready";
  const statusTone =
    status === "ready" ? "success" : status === "error" ? "danger" : "warning";

  return (
    <div className="settings-v2-content">
      {error && <SettingsError message={error} onRetry={() => void load()} />}
      {!workspaceId ? (
        <SettingsWorkspaceRequired />
      ) : loading ? (
        <LoadingState label={t("v2.agents.supportLoading")} />
      ) : (
        <>
          <SettingsSection
            title={t("v2.agents.supportTitle")}
            description={t("v2.agents.supportDescription")}
            actions={
              <SettingsStatus tone={statusTone}>
                {t(`v2.agents.supportStatuses.${status}`)}
              </SettingsStatus>
            }
          >
            <div className="settings-v2-callout">
              <div>
                <strong>{t("v2.agents.supportOnlyByok")}</strong>
                <p>{t("v2.agents.supportOnlyByokDescription")}</p>
              </div>
            </div>
            <div className="settings-v2-form-grid">
              <label>
                {t("v2.agents.supportProvider")}
                <input value="OpenAI" readOnly />
              </label>
              <label>
                {t("v2.agents.supportAuthMethod")}
                <input value={t("v2.agents.supportApiKeyMethod")} readOnly />
              </label>
              <label>
                {t("v2.agents.supportLabel")}
                <input
                  value={label}
                  onChange={(event) => setLabel(event.target.value)}
                  disabled={Boolean(connection)}
                />
              </label>
              <label>
                {connection
                  ? t("v2.agents.supportReplaceKey")
                  : t("v2.agents.supportApiKey")}
                <input
                  type="password"
                  value={apiKey}
                  onChange={(event) => setApiKey(event.target.value)}
                  placeholder={t("v2.agents.supportApiKeyPlaceholder")}
                  autoComplete="off"
                />
              </label>
            </div>
            <div className="settings-v2-form-actions">
              <button
                className="button button-primary"
                type="button"
                onClick={() => void createOrRotate()}
                disabled={!apiKey.trim() || Boolean(action)}
              >
                <KeyRound size={14} />{" "}
                {connection
                  ? t("v2.agents.supportReplaceKey")
                  : t("v2.agents.supportConnect")}
              </button>
              {connection && (
                <>
                  <button
                    className="button button-secondary"
                    type="button"
                    onClick={() => void refresh(connection)}
                    disabled={Boolean(action)}
                  >
                    <RefreshCw size={14} />{" "}
                    {t("v2.agents.supportRefreshCatalog")}
                  </button>
                  <button
                    className="button button-danger"
                    type="button"
                    onClick={() => void revoke()}
                    disabled={Boolean(action)}
                  >
                    <Trash2 size={14} /> {t("v2.agents.supportRevoke")}
                  </button>
                </>
              )}
            </div>
          </SettingsSection>
          {connection && (
            <SettingsSection
              title={t("v2.agents.supportModelsTitle")}
              description={t("v2.agents.supportModelsDescription")}
              actions={
                connection.catalog ? (
                  <span className="settings-provider-muted">
                    {t("v2.agents.supportLastVerified", {
                      date: formatSettingsDate(
                        connection.catalog.lastVerifiedAt,
                      ),
                    })}
                  </span>
                ) : undefined
              }
            >
              {!connection.catalog ? (
                <div className="settings-v2-callout">
                  <div>
                    <strong>{t("v2.agents.supportCatalogRequired")}</strong>
                    <p>{t("v2.agents.supportCatalogRequiredDescription")}</p>
                  </div>
                </div>
              ) : (
                <>
                  <div className="settings-v2-form-grid">
                    <label>
                      {t("v2.agents.supportModel")}
                      <Select
                        value={config.supportModel}
                        onChange={(value) =>
                          setConfig((current) => ({
                            ...current,
                            supportModel: value,
                          }))
                        }
                        options={optionsFor("text")}
                      />
                    </label>
                    <label>
                      {t("v2.agents.visionModel")}
                      <Select
                        value={config.visionModel}
                        onChange={(value) =>
                          setConfig((current) => ({
                            ...current,
                            visionModel: value,
                          }))
                        }
                        options={optionsFor("vision")}
                      />
                    </label>
                    <label>
                      {t("v2.agents.transcriptionModel")}
                      <Select
                        value={config.transcriptionModel}
                        onChange={(value) =>
                          setConfig((current) => ({
                            ...current,
                            transcriptionModel: value,
                          }))
                        }
                        options={optionsFor("transcription")}
                      />
                    </label>
                    <label>
                      {t("v2.agents.embeddingModel")}
                      <Select
                        value={config.embeddingModel}
                        onChange={(value) =>
                          setConfig((current) => ({
                            ...current,
                            embeddingModel: value,
                          }))
                        }
                        options={optionsFor("embedding")}
                      />
                    </label>
                  </div>
                  <p className="settings-v2-capability-note">
                    {t("v2.agents.supportCapabilitiesNote")}
                  </p>
                  <div className="settings-v2-form-actions">
                    <button
                      className="button button-primary"
                      type="button"
                      onClick={() => void save()}
                      disabled={
                        Boolean(action) ||
                        Object.values(config).some((value) => !value)
                      }
                    >
                      <Save size={14} /> {t("v2.agents.supportSave")}
                    </button>
                  </div>
                </>
              )}
            </SettingsSection>
          )}
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

function CodingRunPolicyContent({
  workspaceId,
  onToast,
}: SettingsWorkspacePageProps) {
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
        listLiveAgentConnections(workspaceId, "coding"),
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
          : t("v2.codingRouting.loadError"),
      );
    } finally {
      setLoading(false);
    }
  }, [repositoryId, t, workspaceId]);
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
      onToast(
        t("v2.codingRouting.saved", {
          stage: t(`v2.codingRouting.stageLabels.${stage}`),
        }),
      );
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : t("v2.codingRouting.saveError", {
              stage: t(`v2.codingRouting.stageLabels.${stage}`),
            }),
      );
    } finally {
      setSaving(null);
    }
  };
  const connectionFor = (id?: string) =>
    connections.find((connection) => connection.id === id);
  return (
    <div className="settings-v2-content">
      {error && <SettingsError message={error} onRetry={() => void load()} />}
      {!workspaceId ? (
        <SettingsWorkspaceRequired />
      ) : loading ? (
        <LoadingState label={t("v2.codingRouting.loading")} />
      ) : (
        <>
          <SettingsSection
            title={t("v2.codingRouting.scopeTitle")}
            description={t("v2.codingRouting.scopeDescription")}
          >
            <div className="settings-v2-form-grid">
              <label>
                {t("v2.codingRouting.scope")}
                <Select
                  value={repositoryId}
                  onChange={(value) => setRepositoryId(value)}
                  options={[
                    {
                      value: "",
                      label: t("v2.codingRouting.workspaceDefault"),
                    },
                    ...repositories.map((repository) => ({
                      value: repository.id,
                      label: t("v2.codingRouting.repositoryOption", {
                        name: repository.name,
                      }),
                    })),
                  ]}
                />
              </label>
            </div>
          </SettingsSection>
          <SettingsSection
            title={t("v2.codingRouting.stagesTitle")}
            description={t("v2.codingRouting.stagesDescription")}
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
                      <strong>
                        {t(`v2.codingRouting.stageLabels.${stage}`)}
                      </strong>
                      <span>
                        {t(`v2.codingRouting.stageDescriptions.${stage}`)}
                      </span>
                    </div>
                    <div className="settings-v2-form-grid">
                      <label>
                        {t("v2.codingRouting.connection")}
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
                            {
                              value: "",
                              label: t("v2.codingRouting.selectConnection"),
                            },
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
                        {t("v2.codingRouting.model")}
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
                                    label: t("v2.codingRouting.refreshCatalog"),
                                    disabled: true,
                                  },
                                ]
                          }
                        />
                      </label>
                      {model?.efforts?.length ? (
                        <label>
                          {t("v2.codingRouting.effort")}
                          <Select
                            value={policy.effort ?? ""}
                            onChange={(value) =>
                              update(stage, { effort: value || undefined })
                            }
                            options={[
                              {
                                value: "",
                                label: t("v2.codingRouting.defaultEffort"),
                              },
                              ...model.efforts.map((effort) => ({
                                value: effort,
                                label: effort,
                              })),
                            ]}
                          />
                        </label>
                      ) : (
                        <div className="settings-v2-capability-note">
                          {t("v2.codingRouting.noEffort")}
                        </div>
                      )}
                      <label>
                        {t("v2.codingRouting.maxDuration")}
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
                        {t("v2.codingRouting.maxOutput")}
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
                        {t("v2.codingRouting.maxRepairs")}
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
                        {t("v2.codingRouting.explicitFallback")}
                      </label>
                      {policy.fallbackEnabled && (
                        <select
                          className="coding-fallback-select"
                          multiple
                          aria-label={t(
                            "v2.codingRouting.fallbackConnections",
                            {
                              stage,
                            },
                          )}
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
                        {saving === stage
                          ? t("v2.codingRouting.saving")
                          : t("v2.codingRouting.saveStage")}
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
