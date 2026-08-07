import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
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
import { listLiveRepositories, type LiveRepository } from "../api";
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
  const [query, setQuery] = useState("");
  const actions = [
    {
      label: "Open inbox",
      hint: "G then I",
      icon: InboxIcon,
      action: () => navigate("/inbox"),
    },
    {
      label: "Browse issues",
      hint: "G then X",
      icon: CircleDot,
      action: () => navigate("/issues"),
    },
    { label: "Create new issue", hint: "C", icon: Plus, action: onNewIssue },
    {
      label: "View engineering runs",
      hint: "G then R",
      icon: TerminalSquare,
      action: () => navigate("/codex-runs"),
    },
    {
      label: "Open knowledge",
      hint: "G then K",
      icon: BookOpen,
      action: () => navigate("/knowledge"),
    },
    {
      label: "Open settings",
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
                    label: `Run coding agent for ${issue.identifier}`,
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
            aria-label="Search actions"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={selectFirst}
            placeholder="Search actions or jump to…"
          />
          <kbd>ESC</kbd>
        </div>
        <div className="palette-group">
          <span className="palette-label">
            {normalizedQuery
              ? "Actions and workspace results"
              : "Quick actions"}
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
              title="No matching actions"
              description="Try a different command."
              search
            />
          )}
        </div>
        <div className="palette-footer">
          <span>
            <Command size={13} /> Navigate
          </span>
          <span>
            <CornerDownRight size={13} /> Select
          </span>
          <span>
            <Keyboard size={13} /> Shortcuts
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
  const [title, setTitle] = useState("");
  const [type, setType] = useState<IssueType>("Task");
  const [priority, setPriority] = useState<Priority>("Medium");
  const [conversationId, setConversationId] = useState("");
  const [error, setError] = useState("");
  const submit = () => {
    const cleanTitle = title.trim();
    if (!cleanTitle) {
      setError("Add a short title so the team knows what needs attention.");
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
            <span className="page-kicker">New work item</span>
            <h2 id="create-issue-title">Create issue</h2>
          </div>
          <button
            className="icon-button"
            type="button"
            onClick={onClose}
            aria-label="Close create issue dialog"
          >
            <X size={17} />
          </button>
        </div>
        <div className="modal-body">
          <label>
            Title
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
              placeholder="What needs to be done?"
            />
            {error && (
              <span className="field-error" id="create-issue-error">
                {error}
              </span>
            )}
          </label>
          <div className="form-row">
            <label>
              Type
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
              Priority
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
            Link conversation{" "}
            <Select
              value={conversationId}
              options={[
                { value: "", label: "Internal issue" },
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
            <span>
              Issues stay inside Techne. No external ticket tracker is
              connected.
            </span>
          </div>
        </div>
        <div className="modal-footer">
          <button
            className="button button-ghost"
            type="button"
            onClick={onClose}
          >
            Cancel
          </button>
          <button
            className="button button-primary"
            type="button"
            disabled={!title.trim()}
            onClick={submit}
          >
            Create issue
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
      setError("Add a short title so the issue remains actionable.");
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
            <h2 id="edit-issue-title">Edit issue</h2>
          </div>
          <button
            className="icon-button"
            type="button"
            onClick={onClose}
            aria-label="Close edit issue dialog"
          >
            <X size={17} />
          </button>
        </div>
        <div className="modal-body">
          <label>
            Title
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
              Type
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
              Priority
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
            Status
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
            Assignee
            <Select
              value={assignee}
              options={assigneeOptions}
              onChange={setAssignee}
            />
          </label>
          <label>
            Summary
            <textarea
              maxLength={20000}
              value={summary}
              onChange={(event) => setSummary(event.target.value)}
              placeholder="What is happening?"
              rows={4}
            />
          </label>
          <label>
            Impact
            <textarea
              maxLength={20000}
              value={impact}
              onChange={(event) => setImpact(event.target.value)}
              placeholder="Who or what is affected?"
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
            Cancel
          </button>
          <button
            className="button button-primary"
            type="button"
            disabled={!title.trim()}
            onClick={submit}
          >
            <Save size={14} /> Save changes
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
  const [mode, setMode] = useState<CodingRun["mode"]>("Propose fix");
  const [repositoryId, setRepositoryId] = useState("");
  const [repositories, setRepositories] = useState<LiveRepository[]>([]);
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
            <span className="page-kicker">Coding agent CLI</span>
            <h2 id="run-codex-title">Run on {issue.identifier}</h2>
          </div>
          <button
            className="icon-button"
            type="button"
            onClick={onClose}
            aria-label="Close engineering run dialog"
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
            Mode
            <Select
              value={mode}
              options={["Investigate", "Propose fix", "Implement fix"].map(
                (item) => ({ value: item, label: item }),
              )}
              onChange={(value) => setMode(value as CodingRun["mode"])}
            />
          </label>
          <label>
            Repository
            <Select
              ariaLabel="Engineering repository"
              value={repositoryId}
              options={[
                ...(!liveMode
                  ? [{ value: "demo-repository", label: "Demo repository" }]
                  : []),
                ...(liveMode && !repositories.length
                  ? [{ value: "", label: "No repository configured" }]
                  : []),
                ...repositories.map((repository) => ({
                  value: repository.id,
                  label: `${repository.name} · ${repository.agentProvider} · ${
                    repository.executionPlane === "github_actions"
                      ? `${repository.githubOwner}/${repository.githubRepo}`
                      : repository.localPath
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
              <span>
                Configure a repository and CLI agent in Settings before starting
                a run.
              </span>
            </div>
          )}
          <label>
            Additional instructions
            <textarea
              aria-label="Additional run instructions"
              value={instructions}
              onChange={(event) => setInstructions(event.target.value)}
              placeholder="Optional acceptance criteria or context…"
            />
          </label>
          <div className="modal-note">
            <ShieldCheck size={14} />
            <span>
              Secrets are excluded. Push, merge, deploy and unrestricted shell
              are disabled.
            </span>
          </div>
        </div>
        <div className="modal-footer">
          <button
            className="button button-ghost"
            type="button"
            onClick={onClose}
          >
            Cancel
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
            <TerminalSquare size={15} /> Start run
          </button>
        </div>
      </div>
    </div>
  );
}
