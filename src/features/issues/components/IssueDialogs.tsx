import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  BookOpen,
  CircleDot,
  Command,
  CornerDownRight,
  GitBranch,
  Info,
  Keyboard,
  LoaderCircle,
  Plus,
  Save,
  Search,
  ShieldCheck,
  TerminalSquare,
  Inbox as InboxIcon,
  MessageCircle,
  Settings as SettingsIcon,
  UsersRound,
  X,
} from "lucide-react";
import type {
  CodingRun,
  Conversation,
  Issue,
  IssueStatus,
  IssueType,
  Priority,
} from "../../../types";
import { listLiveRepositories, type LiveRepository } from "../api";
import { normalizeSearch } from "../../../shared/lib/format";
import { EmptyState } from "../../../shared/ui/ResourceState";
import { Select } from "../../../shared/ui/Select";
import type { AssigneeOption } from "../../../shared/ui/DataDisplay";

function agentProviderLabel(provider: LiveRepository["agentProvider"]): string {
  return {
    openai: "ChatGPT",
    anthropic: "Claude",
    google: "Gemini",
    verboo: "Verboo",
  }[provider];
}

export function CommandPalette({
  conversations,
  issues,
  workspaces,
  currentWorkspaceId,
  onClose,
  onNewIssue,
  onOpenConversation,
  onOpenIssue,
  onStartRun,
  onSwitchWorkspace,
}: {
  conversations: Conversation[];
  issues: Issue[];
  workspaces: Array<{ id: string; name: string }>;
  currentWorkspaceId: string;
  onClose: () => void;
  onNewIssue: () => void;
  onOpenConversation: (id: string) => void;
  onOpenIssue: (identifier: string) => void;
  onStartRun: (issueId: string) => void;
  onSwitchWorkspace: (workspaceId: string) => void;
}) {
  const navigate = useNavigate();
  const { t } = useTranslation("issues");
  const [query, setQuery] = useState("");
  const actions = [
    {
      label: t("command.openInbox"),
      hint: "G then I",
      icon: InboxIcon,
      action: () => navigate("/inbox"),
    },
    {
      label: t("command.browseIssues"),
      hint: "G then X",
      icon: CircleDot,
      action: () => navigate("/issues"),
    },
    {
      label: t("command.createIssue"),
      hint: "C",
      icon: Plus,
      action: onNewIssue,
    },
    {
      label: t("command.viewRuns"),
      hint: "G then R",
      icon: TerminalSquare,
      action: () => navigate("/agent-runs"),
    },
    {
      label: t("command.openKnowledge"),
      hint: "G then K",
      icon: BookOpen,
      action: () => navigate("/knowledge"),
    },
    {
      label: t("command.openSettings"),
      hint: "",
      icon: SettingsIcon,
      action: () => navigate("/settings"),
    },
  ];
  const normalizedQuery = normalizeSearch(query);
  const entityActions = normalizedQuery
    ? [
        ...conversations
          .filter((conversation) =>
            normalizeSearch(
              `${conversation.name} ${conversation.company} ${conversation.phone} ${conversation.lastMessage}`,
            ).includes(normalizedQuery),
          )
          .slice(0, 6)
          .map((conversation) => ({
            label: `${t("detail.linkedConversation")}: ${conversation.name}`,
            hint: "WhatsApp",
            icon: MessageCircle,
            action: () => onOpenConversation(conversation.id),
          })),
        ...issues
          .filter((issue) =>
            normalizeSearch(
              `${issue.identifier} ${issue.title} ${issue.customer ?? ""} ${issue.labels.join(" ")}`,
            ).includes(normalizedQuery),
          )
          .slice(0, 6)
          .flatMap((issue) => [
            {
              label: `${issue.identifier}: ${issue.title}`,
              hint: t("detail.internal"),
              icon: CircleDot,
              action: () => onOpenIssue(issue.identifier),
            },
            ...(normalizedQuery.includes("agent") ||
            normalizedQuery.includes("run")
              ? [
                  {
                    label: `${t("detail.runAgent")} ${issue.identifier}`,
                    hint: t("command.startRun"),
                    icon: TerminalSquare,
                    action: () => onStartRun(issue.id),
                  },
                ]
              : []),
          ]),
        ...workspaces
          .filter(
            (workspace) =>
              workspace.id !== currentWorkspaceId &&
              normalizeSearch(`switch workspace ${workspace.name}`).includes(
                normalizedQuery,
              ),
          )
          .slice(0, 4)
          .map((workspace) => ({
            label: `${t("command.openSettings")}: ${workspace.name}`,
            hint: t("detail.source"),
            icon: UsersRound,
            action: () => onSwitchWorkspace(workspace.id),
          })),
      ]
    : [];
  const filteredActions = [
    ...actions.filter((action) =>
      normalizeSearch(action.label).includes(normalizedQuery),
    ),
    ...entityActions,
  ];
  const selectFirst = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter" && filteredActions[0]) {
      filteredActions[0].action();
      onClose();
    }
  };
  return (
    <div className="palette-backdrop" role="presentation" onClick={onClose}>
      <div
        className="command-palette"
        role="dialog"
        aria-modal="true"
        aria-labelledby="command-palette-title"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="palette-search">
          <Search size={17} />
          <input
            id="command-palette-title"
            autoFocus
            aria-label={t("command.searchActions")}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={selectFirst}
            placeholder={t("command.searchPlaceholder")}
          />
          <kbd>{t("command.escape")}</kbd>
        </div>
        <div className="palette-group">
          <span className="palette-label">
            {normalizedQuery ? t("command.results") : t("command.quickActions")}
          </span>
          {filteredActions.length ? (
            filteredActions.map(({ label, hint, icon: Icon, action }) => (
              <button
                key={label}
                type="button"
                onClick={() => {
                  action();
                  onClose();
                }}
              >
                <Icon size={16} />
                <span>{label}</span>
                <kbd>{hint}</kbd>
              </button>
            ))
          ) : (
            <EmptyState
              title={t("command.noMatching")}
              description={t("command.tryDifferent")}
              search
            />
          )}
        </div>
        <div className="palette-footer">
          <span>
            <Command size={13} /> {t("command.navigate")}
          </span>
          <span>
            <CornerDownRight size={13} /> {t("command.select")}
          </span>
          <span>
            <Keyboard size={13} /> {t("command.shortcuts")}
          </span>
        </div>
      </div>
    </div>
  );
}

export function CreateIssueDialog({
  conversations,
  onClose,
  onCreate,
}: {
  conversations: Conversation[];
  onClose: () => void;
  onCreate: (input: {
    title: string;
    type: IssueType;
    priority: Priority;
    conversationId?: string;
  }) => void;
}) {
  const { t } = useTranslation("issues");
  const [title, setTitle] = useState("");
  const [type, setType] = useState<IssueType>("Task");
  const [priority, setPriority] = useState<Priority>("Medium");
  const [conversationId, setConversationId] = useState("");
  const [error, setError] = useState("");
  const submit = () => {
    const cleanTitle = title.trim();
    if (!cleanTitle) {
      setError(t("dialogs.createTitleError"));
      return;
    }
    onCreate({
      title: cleanTitle,
      type,
      priority,
      conversationId: conversationId || undefined,
    });
  };
  return (
    <div className="modal-backdrop" role="presentation" onClick={onClose}>
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="create-issue-title"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="modal-header">
          <div>
            <span className="page-kicker">{t("dialogs.newWorkItem")}</span>
            <h2 id="create-issue-title">{t("dialogs.createIssue")}</h2>
          </div>
          <button
            className="icon-button"
            type="button"
            onClick={onClose}
            aria-label={t("dialogs.closeCreate")}
          >
            <X size={17} />
          </button>
        </div>
        <div className="modal-body">
          <label>
            {t("dialogs.title")}
            <input
              autoFocus
              required
              maxLength={240}
              aria-invalid={Boolean(error)}
              aria-describedby={error ? "create-issue-error" : undefined}
              value={title}
              onChange={(event) => {
                setTitle(event.target.value);
                if (event.target.value.trim()) setError("");
              }}
              placeholder={t("dialogs.createTitlePlaceholder")}
            />
            {error && (
              <span className="field-error" id="create-issue-error">
                {error}
              </span>
            )}
          </label>
          <div className="form-row">
            <label>
              {t("dialogs.type")}
              <Select
                value={type}
                options={[
                  "Production Bug",
                  "Bug",
                  "Incident",
                  "Feature",
                  "Task",
                  "Billing",
                  "Commercial",
                  "Question",
                  "Other",
                ].map((item) => ({ value: item, label: item }))}
                onChange={(value) => setType(value as IssueType)}
              />
            </label>
            <label>
              {t("dialogs.priority")}
              <Select
                value={priority}
                options={["Urgent", "High", "Medium", "Low", "No priority"].map(
                  (item) => ({ value: item, label: item }),
                )}
                onChange={(value) => setPriority(value as Priority)}
              />
            </label>
          </div>
          <label>
            {t("dialogs.linkConversation")}{" "}
            <Select
              value={conversationId}
              options={[
                { value: "", label: t("dialogs.internalIssue") },
                ...conversations.map((conversation) => ({
                  value: conversation.id,
                  label: `${conversation.name} · ${conversation.lastMessage.slice(0, 42)}`,
                })),
              ]}
              onChange={setConversationId}
            />
          </label>
          <div className="modal-note">
            <Info size={14} />
            <span>{t("dialogs.internalNote")}</span>
          </div>
        </div>
        <div className="modal-footer">
          <button
            className="button button-ghost"
            type="button"
            onClick={onClose}
          >
            {t("common:actions.cancel")}
          </button>
          <button
            className="button button-primary"
            type="button"
            disabled={!title.trim()}
            onClick={submit}
          >
            {t("dialogs.createIssue")}
          </button>
        </div>
      </div>
    </div>
  );
}

export function EditIssueDialog({
  issue,
  assigneeOptions,
  onClose,
  onSave,
}: {
  issue?: Issue;
  assigneeOptions: AssigneeOption[];
  onClose: () => void;
  onSave: (
    patch: Pick<
      Issue,
      | "title"
      | "type"
      | "priority"
      | "status"
      | "assignee"
      | "summary"
      | "impact"
    >,
  ) => void;
}) {
  const { t } = useTranslation("issues");
  const [title, setTitle] = useState(issue?.title ?? "");
  const [type, setType] = useState<IssueType>(issue?.type ?? "Task");
  const [priority, setPriority] = useState<Priority>(
    issue?.priority ?? "Medium",
  );
  const [status, setStatus] = useState<IssueStatus>(issue?.status ?? "Triage");
  const [assignee, setAssignee] = useState(issue?.assignee ?? "Unassigned");
  const [summary, setSummary] = useState(issue?.summary ?? "");
  const [impact, setImpact] = useState(issue?.impact ?? "");
  const [error, setError] = useState("");
  if (!issue) return null;

  const submit = () => {
    const cleanTitle = title.trim();
    if (!cleanTitle) {
      setError(t("dialogs.editTitleError"));
      return;
    }
    onSave({
      title: cleanTitle,
      type,
      priority,
      status,
      assignee,
      summary,
      impact,
    });
  };

  return (
    <div className="modal-backdrop" role="presentation" onClick={onClose}>
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="edit-issue-title"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="modal-header">
          <div>
            <span className="page-kicker">{issue.identifier}</span>
            <h2 id="edit-issue-title">{t("dialogs.editIssue")}</h2>
          </div>
          <button
            className="icon-button"
            type="button"
            onClick={onClose}
            aria-label={t("dialogs.closeEdit")}
          >
            <X size={17} />
          </button>
        </div>
        <div className="modal-body">
          <label>
            {t("dialogs.title")}
            <input
              autoFocus
              required
              maxLength={240}
              aria-invalid={Boolean(error)}
              value={title}
              onChange={(event) => {
                setTitle(event.target.value);
                if (event.target.value.trim()) setError("");
              }}
            />
            {error && <span className="field-error">{error}</span>}
          </label>
          <div className="form-row">
            <label>
              {t("dialogs.type")}
              <Select
                value={type}
                options={[
                  "Production Bug",
                  "Bug",
                  "Incident",
                  "Feature",
                  "Task",
                  "Billing",
                  "Commercial",
                  "Question",
                  "Other",
                ].map((item) => ({ value: item, label: item }))}
                onChange={(value) => setType(value as IssueType)}
              />
            </label>
            <label>
              {t("dialogs.priority")}
              <Select
                value={priority}
                options={["Urgent", "High", "Medium", "Low", "No priority"].map(
                  (item) => ({ value: item, label: item }),
                )}
                onChange={(value) => setPriority(value as Priority)}
              />
            </label>
          </div>
          <label>
            {t("dialogs.status")}
            <Select
              value={status}
              options={[
                "Triage",
                "Backlog",
                "Todo",
                "In Progress",
                "Review",
                "Done",
                "Canceled",
              ].map((item) => ({ value: item, label: item }))}
              onChange={(value) => setStatus(value as IssueStatus)}
            />
          </label>
          <label>
            {t("dialogs.assignee")}
            <Select
              value={assignee}
              options={assigneeOptions}
              onChange={setAssignee}
            />
          </label>
          <label>
            {t("dialogs.summary")}
            <textarea
              maxLength={20000}
              value={summary}
              onChange={(event) => setSummary(event.target.value)}
              placeholder={t("dialogs.summaryPlaceholder")}
              rows={4}
            />
          </label>
          <label>
            {t("dialogs.impact")}
            <textarea
              maxLength={20000}
              value={impact}
              onChange={(event) => setImpact(event.target.value)}
              placeholder={t("dialogs.impactPlaceholder")}
              rows={3}
            />
          </label>
        </div>
        <div className="modal-footer">
          <button
            className="button button-ghost"
            type="button"
            onClick={onClose}
          >
            {t("common:actions.cancel")}
          </button>
          <button
            className="button button-primary"
            type="button"
            disabled={!title.trim()}
            onClick={submit}
          >
            <Save size={14} /> {t("dialogs.saveChanges")}
          </button>
        </div>
      </div>
    </div>
  );
}

export function RunAgentDialog({
  issue,
  workspaceId,
  liveMode,
  initialMode = "Propose fix",
  initialRepositoryId,
  initialStage,
  initialParentRunId,
  initialResearchArtifactId,
  onClose,
  onStart,
}: {
  issue?: Issue;
  workspaceId: string | null;
  liveMode: boolean;
  initialMode?: CodingRun["mode"];
  initialRepositoryId?: string;
  initialStage?: "research" | "implement" | "review" | "verify";
  initialParentRunId?: string;
  initialResearchArtifactId?: string;
  onClose: () => void;
  onStart: (
    issueId: string,
    mode: CodingRun["mode"],
    options?: {
      repositoryId?: string;
      instructions?: string;
      stage?: "research" | "implement" | "review" | "verify";
      parentRunId?: string;
      researchArtifactId?: string;
    },
  ) => void | Promise<void>;
}) {
  const { t } = useTranslation("issues");
  const [mode, setMode] = useState<CodingRun["mode"]>(initialMode);
  const [repositoryId, setRepositoryId] = useState("");
  const [repositories, setRepositories] = useState<LiveRepository[]>([]);
  const [instructions, setInstructions] = useState("");
  const [loadingRepositories, setLoadingRepositories] = useState(liveMode);
  const [starting, setStarting] = useState(false);
  useEffect(() => {
    if (!liveMode || !workspaceId) {
      setLoadingRepositories(false);
      return;
    }
    void listLiveRepositories(workspaceId)
      .then((items) => {
        setRepositories(items);
        setRepositoryId(
          items.find((item) => item.id === initialRepositoryId)?.id ??
            items[0]?.id ??
            "",
        );
      })
      .catch(() => setRepositories([]))
      .finally(() => setLoadingRepositories(false));
  }, [initialRepositoryId, liveMode, workspaceId]);
  if (!issue) return null;
  const canStart =
    (!liveMode || Boolean(repositoryId)) &&
    (initialStage !== "implement" || Boolean(initialResearchArtifactId));
  const submit = async () => {
    if (!canStart || loadingRepositories || starting) return;
    setStarting(true);
    try {
      await onStart(issue.id, mode, {
        repositoryId: repositoryId || undefined,
        instructions: instructions.trim() || undefined,
        ...(initialStage ? { stage: initialStage } : {}),
        ...(initialParentRunId ? { parentRunId: initialParentRunId } : {}),
        ...(initialResearchArtifactId
          ? { researchArtifactId: initialResearchArtifactId }
          : {}),
      });
    } finally {
      setStarting(false);
    }
  };
  return (
    <div className="modal-backdrop" role="presentation" onClick={onClose}>
      <div
        className="modal run-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="run-agent-title"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="modal-header">
          <div>
            <span className="page-kicker">{t("dialogs.agentRepository")}</span>
            <h2 id="run-agent-title">
              {t("dialogs.runOn", { identifier: issue.identifier })}
            </h2>
          </div>
          <button
            className="icon-button"
            type="button"
            onClick={onClose}
            aria-label={t("dialogs.closeRun")}
          >
            <X size={17} />
          </button>
        </div>
        <div className="modal-body">
          <div className="run-context">
            <CircleDot size={15} />
            <div>
              <strong>{issue.title}</strong>
              <p>{issue.summary}</p>
            </div>
          </div>
          <label>
            {t("dialogs.mode")}
            <Select
              value={mode}
              options={[
                {
                  value: "Investigate",
                  label: t("common:data.runMode.investigate"),
                },
                {
                  value: "Propose fix",
                  label: t("common:data.runMode.proposeFix"),
                },
                {
                  value: "Implement fix",
                  label: t("common:data.runMode.implementFix"),
                },
              ]}
              onChange={(value) => setMode(value as CodingRun["mode"])}
              disabled={Boolean(
                initialParentRunId || initialResearchArtifactId,
              )}
            />
          </label>
          <label>
            {t("dialogs.repository")}
            <Select
              ariaLabel={t("dialogs.agentRepository")}
              value={repositoryId}
              options={[
                ...(!liveMode
                  ? [
                      {
                        value: "demo-repository",
                        label: t("dialogs.demoRepository"),
                      },
                    ]
                  : []),
                ...(liveMode && !repositories.length
                  ? [{ value: "", label: t("dialogs.noRepository") }]
                  : []),
                ...repositories.map((repository) => ({
                  value: repository.id,
                  label: `${repository.name} · ${agentProviderLabel(repository.agentProvider)} · ${
                    repository.githubOwner && repository.githubRepo
                      ? `${repository.githubOwner}/${repository.githubRepo}`
                      : t("dialogs.repository")
                  }`,
                })),
              ]}
              disabled={!liveMode || loadingRepositories}
              onChange={setRepositoryId}
            />
          </label>
          {liveMode && !loadingRepositories && !repositories.length && (
            <div className="inline-empty">
              <GitBranch size={15} />
              <span>{t("dialogs.repositoryRequired")}</span>
            </div>
          )}
          {initialStage === "implement" && initialResearchArtifactId && (
            <div className="modal-note">
              <ShieldCheck size={14} />
              <span>
                {t("dialogs.researchLinked", {
                  defaultValue:
                    "This implementation is linked to the current research artifact",
                })}{" "}
                <code>{initialResearchArtifactId}</code>.
              </span>
            </div>
          )}
          {initialParentRunId && (
            <div className="modal-note">
              <GitBranch size={14} />
              <span>{t("dialogs.continuationLinked")}</span>
            </div>
          )}
          <label>
            {t("dialogs.additionalInstructions")}
            <textarea
              aria-label={t("dialogs.additionalInstructions")}
              value={instructions}
              onChange={(event) => setInstructions(event.target.value)}
              placeholder={t("dialogs.instructionsPlaceholder")}
            />
          </label>
          <div className="modal-note">
            <ShieldCheck size={14} />
            <span>{t("dialogs.safetyNote")}</span>
          </div>
        </div>
        <div className="modal-footer">
          <button
            className="button button-ghost"
            type="button"
            onClick={onClose}
          >
            {t("common:actions.cancel")}
          </button>
          <button
            className="button button-primary"
            type="button"
            disabled={!canStart || loadingRepositories || starting}
            aria-busy={starting}
            onClick={submit}
          >
            {starting ? (
              <LoaderCircle className="spin" size={15} aria-hidden="true" />
            ) : (
              <TerminalSquare size={15} aria-hidden="true" />
            )}{" "}
            {starting ? t("dialogs.startingRun") : t("dialogs.startRun")}
          </button>
        </div>
      </div>
    </div>
  );
}
