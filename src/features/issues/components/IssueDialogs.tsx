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
import { listLiveRepositories } from "../api";
import { normalizeSearch } from "../../../shared/lib/format";
import { EmptyState } from "../../../shared/ui/ResourceState";
import { Select } from "../../../shared/ui/Select";
import type { AssigneeOption } from "../../../shared/ui/DataDisplay";

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
  const { t } = useTranslation(["common", "issues"]);
  const [query, setQuery] = useState("");
  const actions = [
    {
      label: t("command.openInbox", { ns: "issues" }),
      hint: "G then I",
      icon: InboxIcon,
      action: () => navigate("/inbox"),
    },
    {
      label: t("command.browseIssues", { ns: "issues" }),
      hint: "G then X",
      icon: CircleDot,
      action: () => navigate("/issues"),
    },
    {
      label: t("command.createIssue", { ns: "issues" }),
      hint: "C",
      icon: Plus,
      action: onNewIssue,
    },
    {
      label: t("command.viewRuns", { ns: "issues" }),
      hint: "G then R",
      icon: TerminalSquare,
      action: () => navigate("/codex-runs"),
    },
    {
      label: t("command.openKnowledge", { ns: "issues" }),
      hint: "G then K",
      icon: BookOpen,
      action: () => navigate("/knowledge"),
    },
    {
      label: t("command.openSettings", { ns: "issues" }),
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
            label: `Conversation: ${conversation.name}`,
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
              hint: "Issue",
              icon: CircleDot,
              action: () => onOpenIssue(issue.identifier),
            },
            ...(normalizedQuery.includes("codex") ||
            normalizedQuery.includes("run")
              ? [
                  {
                    label: `Run Codex for ${issue.identifier}`,
                    hint: "Start",
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
            label: `Switch workspace: ${workspace.name}`,
            hint: "Workspace",
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
            aria-label={t("command.searchActions", { ns: "issues" })}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={selectFirst}
            placeholder={t("command.searchPlaceholder", { ns: "issues" })}
          />
          <kbd>{t("command.escape", { ns: "issues" })}</kbd>
        </div>
        <div className="palette-group">
          <span className="palette-label">
            {normalizedQuery
              ? t("command.results", { ns: "issues" })
              : t("command.quickActions", { ns: "issues" })}
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
              title={t("command.noMatching", { ns: "issues" })}
              description={t("command.tryDifferent", { ns: "issues" })}
              search
            />
          )}
        </div>
        <div className="palette-footer">
          <span>
            <Command size={13} /> {t("command.navigate", { ns: "issues" })}
          </span>
          <span>
            <CornerDownRight size={13} />{" "}
            {t("command.select", { ns: "issues" })}
          </span>
          <span>
            <Keyboard size={13} /> {t("command.shortcuts", { ns: "issues" })}
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
  const { t } = useTranslation(["common", "issues"]);
  const typeLabel = (value: IssueType) => {
    switch (value) {
      case "Production Bug":
        return t("ui.types.productionBug", { ns: "issues" });
      case "Bug":
        return t("ui.types.bug", { ns: "issues" });
      case "Incident":
        return t("ui.types.incident", { ns: "issues" });
      case "Feature":
        return t("ui.types.feature", { ns: "issues" });
      case "Task":
        return t("ui.types.task", { ns: "issues" });
      case "Billing":
        return t("ui.types.billing", { ns: "issues" });
      case "Commercial":
        return t("ui.types.commercial", { ns: "issues" });
      case "Question":
        return t("ui.types.question", { ns: "issues" });
      default:
        return t("ui.types.other", { ns: "issues" });
    }
  };
  const priorityLabel = (value: Priority) =>
    value === "Urgent"
      ? t("data.priority.urgent", { ns: "common" })
      : value === "High"
        ? t("data.priority.high", { ns: "common" })
        : value === "Medium"
          ? t("data.priority.medium", { ns: "common" })
          : value === "Low"
            ? t("data.priority.low", { ns: "common" })
            : t("data.priority.noPriority", { ns: "common" });
  const [title, setTitle] = useState("");
  const [type, setType] = useState<IssueType>("Task");
  const [priority, setPriority] = useState<Priority>("Medium");
  const [conversationId, setConversationId] = useState("");
  const [error, setError] = useState("");
  const submit = () => {
    const cleanTitle = title.trim();
    if (!cleanTitle) {
      setError(t("dialogs.createTitleError", { ns: "issues" }));
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
            <span className="page-kicker">
              {t("dialogs.newWorkItem", { ns: "issues" })}
            </span>
            <h2 id="create-issue-title">
              {t("dialogs.createIssue", { ns: "issues" })}
            </h2>
          </div>
          <button
            className="icon-button"
            type="button"
            onClick={onClose}
            aria-label={t("dialogs.closeCreate", { ns: "issues" })}
          >
            <X size={17} />
          </button>
        </div>
        <div className="modal-body">
          <label>
            {t("dialogs.title", { ns: "issues" })}
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
              placeholder={t("dialogs.createTitlePlaceholder", {
                ns: "issues",
              })}
            />
            {error && (
              <span className="field-error" id="create-issue-error">
                {error}
              </span>
            )}
          </label>
          <div className="form-row">
            <label>
              {t("dialogs.type", { ns: "issues" })}
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
                ].map((item) => ({
                  value: item,
                  label: typeLabel(item as IssueType),
                }))}
                onChange={(value) => setType(value as IssueType)}
              />
            </label>
            <label>
              {t("dialogs.priority", { ns: "issues" })}
              <Select
                value={priority}
                options={["Urgent", "High", "Medium", "Low", "No priority"].map(
                  (item) => ({
                    value: item,
                    label: priorityLabel(item as Priority),
                  }),
                )}
                onChange={(value) => setPriority(value as Priority)}
              />
            </label>
          </div>
          <label>
            {t("dialogs.linkConversation", { ns: "issues" })}{" "}
            <Select
              value={conversationId}
              options={[
                {
                  value: "",
                  label: t("dialogs.internalIssue", { ns: "issues" }),
                },
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
            <span>{t("dialogs.internalNote", { ns: "issues" })}</span>
          </div>
        </div>
        <div className="modal-footer">
          <button
            className="button button-ghost"
            type="button"
            onClick={onClose}
          >
            {t("actions.cancel", { ns: "common" })}
          </button>
          <button
            className="button button-primary"
            type="button"
            disabled={!title.trim()}
            onClick={submit}
          >
            {t("dialogs.createIssue", { ns: "issues" })}
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
  const { t } = useTranslation(["common", "issues"]);
  const typeLabel = (value: IssueType) => {
    switch (value) {
      case "Production Bug":
        return t("ui.types.productionBug", { ns: "issues" });
      case "Bug":
        return t("ui.types.bug", { ns: "issues" });
      case "Incident":
        return t("ui.types.incident", { ns: "issues" });
      case "Feature":
        return t("ui.types.feature", { ns: "issues" });
      case "Task":
        return t("ui.types.task", { ns: "issues" });
      case "Billing":
        return t("ui.types.billing", { ns: "issues" });
      case "Commercial":
        return t("ui.types.commercial", { ns: "issues" });
      case "Question":
        return t("ui.types.question", { ns: "issues" });
      default:
        return t("ui.types.other", { ns: "issues" });
    }
  };
  const priorityLabel = (value: Priority) =>
    value === "Urgent"
      ? t("data.priority.urgent", { ns: "common" })
      : value === "High"
        ? t("data.priority.high", { ns: "common" })
        : value === "Medium"
          ? t("data.priority.medium", { ns: "common" })
          : value === "Low"
            ? t("data.priority.low", { ns: "common" })
            : t("data.priority.noPriority", { ns: "common" });
  const statusLabel = (value: IssueStatus) =>
    value === "Triage"
      ? t("data.issueStatus.triage", { ns: "common" })
      : value === "Backlog"
        ? t("data.issueStatus.backlog", { ns: "common" })
        : value === "Todo"
          ? t("data.issueStatus.todo", { ns: "common" })
          : value === "In Progress"
            ? t("data.issueStatus.inProgress", { ns: "common" })
            : value === "Review"
              ? t("data.issueStatus.review", { ns: "common" })
              : value === "Done"
                ? t("data.issueStatus.done", { ns: "common" })
                : t("data.issueStatus.canceled", { ns: "common" });
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
      setError(t("dialogs.editTitleError", { ns: "issues" }));
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
            <h2 id="edit-issue-title">
              {t("dialogs.editIssue", { ns: "issues" })}
            </h2>
          </div>
          <button
            className="icon-button"
            type="button"
            onClick={onClose}
            aria-label={t("dialogs.closeEdit", { ns: "issues" })}
          >
            <X size={17} />
          </button>
        </div>
        <div className="modal-body">
          <label>
            {t("dialogs.title", { ns: "issues" })}
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
              {t("dialogs.type", { ns: "issues" })}
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
                ].map((item) => ({
                  value: item,
                  label: typeLabel(item as IssueType),
                }))}
                onChange={(value) => setType(value as IssueType)}
              />
            </label>
            <label>
              {t("dialogs.priority", { ns: "issues" })}
              <Select
                value={priority}
                options={["Urgent", "High", "Medium", "Low", "No priority"].map(
                  (item) => ({
                    value: item,
                    label: priorityLabel(item as Priority),
                  }),
                )}
                onChange={(value) => setPriority(value as Priority)}
              />
            </label>
          </div>
          <label>
            {t("dialogs.status", { ns: "issues" })}
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
              ].map((item) => ({
                value: item,
                label: statusLabel(item as IssueStatus),
              }))}
              onChange={(value) => setStatus(value as IssueStatus)}
            />
          </label>
          <label>
            {t("dialogs.assignee", { ns: "issues" })}
            <Select
              value={assignee}
              options={assigneeOptions}
              onChange={setAssignee}
            />
          </label>
          <label>
            {t("dialogs.summary", { ns: "issues" })}
            <textarea
              maxLength={20000}
              value={summary}
              onChange={(event) => setSummary(event.target.value)}
              placeholder={t("dialogs.summaryPlaceholder", { ns: "issues" })}
              rows={4}
            />
          </label>
          <label>
            {t("dialogs.impact", { ns: "issues" })}
            <textarea
              maxLength={20000}
              value={impact}
              onChange={(event) => setImpact(event.target.value)}
              placeholder={t("dialogs.impactPlaceholder", { ns: "issues" })}
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
            {t("actions.cancel", { ns: "common" })}
          </button>
          <button
            className="button button-primary"
            type="button"
            disabled={!title.trim()}
            onClick={submit}
          >
            <Save size={14} /> {t("dialogs.saveChanges", { ns: "issues" })}
          </button>
        </div>
      </div>
    </div>
  );
}

export function RunCodexDialog({
  issue,
  workspaceId,
  liveMode,
  onClose,
  onStart,
}: {
  issue?: Issue;
  workspaceId: string | null;
  liveMode: boolean;
  onClose: () => void;
  onStart: (
    issueId: string,
    mode: CodingRun["mode"],
    options?: { repositoryId?: string; instructions?: string },
  ) => void;
}) {
  const { t } = useTranslation(["common", "issues"]);
  const modeLabel = (value: CodingRun["mode"]) =>
    value === "Investigate"
      ? t("data.runMode.investigate", { ns: "common" })
      : value === "Propose fix"
        ? t("data.runMode.proposeFix", { ns: "common" })
        : t("data.runMode.implementFix", { ns: "common" });
  const [mode, setMode] = useState<CodingRun["mode"]>("Propose fix");
  const [repositoryId, setRepositoryId] = useState("");
  const [repositories, setRepositories] = useState<
    Array<{ id: string; name: string; localPath: string }>
  >([]);
  const [instructions, setInstructions] = useState("");
  const [loadingRepositories, setLoadingRepositories] = useState(liveMode);
  useEffect(() => {
    if (!liveMode || !workspaceId) {
      setLoadingRepositories(false);
      return;
    }
    void listLiveRepositories(workspaceId)
      .then((items) => {
        setRepositories(items);
        setRepositoryId(items[0]?.id ?? "");
      })
      .catch(() => setRepositories([]))
      .finally(() => setLoadingRepositories(false));
  }, [liveMode, workspaceId]);
  if (!issue) return null;
  const canStart = !liveMode || Boolean(repositoryId);
  return (
    <div className="modal-backdrop" role="presentation" onClick={onClose}>
      <div
        className="modal run-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="run-codex-title"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="modal-header">
          <div>
            <span className="page-kicker">
              {t("brand.codex", { ns: "common" })}
            </span>
            <h2 id="run-codex-title">
              {t("dialogs.runOn", {
                ns: "issues",
                identifier: issue.identifier,
              })}
            </h2>
          </div>
          <button
            className="icon-button"
            type="button"
            onClick={onClose}
            aria-label={t("dialogs.closeRun", { ns: "issues" })}
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
            {t("dialogs.mode", { ns: "issues" })}
            <Select
              value={mode}
              options={["Investigate", "Propose fix", "Implement fix"].map(
                (item) => ({
                  value: item,
                  label: modeLabel(item as CodingRun["mode"]),
                }),
              )}
              onChange={(value) => setMode(value as CodingRun["mode"])}
            />
          </label>
          <label>
            {t("dialogs.repository", { ns: "issues" })}
            <Select
              ariaLabel={t("dialogs.codexRepository", { ns: "issues" })}
              value={repositoryId}
              options={[
                ...(!liveMode
                  ? [
                      {
                        value: "demo-repository",
                        label: t("dialogs.demoRepository", { ns: "issues" }),
                      },
                    ]
                  : []),
                ...(liveMode && !repositories.length
                  ? [
                      {
                        value: "",
                        label: t("dialogs.noRepository", { ns: "issues" }),
                      },
                    ]
                  : []),
                ...repositories.map((repository) => ({
                  value: repository.id,
                  label: `${repository.name} · ${repository.localPath}`,
                })),
              ]}
              disabled={!liveMode || loadingRepositories}
              onChange={setRepositoryId}
            />
          </label>
          {liveMode && !loadingRepositories && !repositories.length && (
            <div className="inline-empty">
              <GitBranch size={15} />
              <span>{t("dialogs.repositoryRequired", { ns: "issues" })}</span>
            </div>
          )}
          <label>
            {t("dialogs.additionalInstructions", { ns: "issues" })}
            <textarea
              aria-label={t("dialogs.additionalInstructions", { ns: "issues" })}
              value={instructions}
              onChange={(event) => setInstructions(event.target.value)}
              placeholder={t("dialogs.instructionsPlaceholder", {
                ns: "issues",
              })}
            />
          </label>
          <div className="modal-note">
            <ShieldCheck size={14} />
            <span>{t("dialogs.safetyNote", { ns: "issues" })}</span>
          </div>
        </div>
        <div className="modal-footer">
          <button
            className="button button-ghost"
            type="button"
            onClick={onClose}
          >
            {t("actions.cancel", { ns: "common" })}
          </button>
          <button
            className="button button-primary"
            type="button"
            disabled={!canStart || loadingRepositories}
            onClick={() =>
              onStart(issue.id, mode, {
                repositoryId: repositoryId || undefined,
                instructions: instructions.trim() || undefined,
              })
            }
          >
            <TerminalSquare size={15} />{" "}
            {t("dialogs.startRun", { ns: "issues" })}
          </button>
        </div>
      </div>
    </div>
  );
}
