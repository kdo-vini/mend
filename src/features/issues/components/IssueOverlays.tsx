import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  ArrowUp,
  ChevronRight,
  CircleDot,
  FileText,
  Info,
  MessageCircle,
  Plus,
  RefreshCw,
  Send,
  Tag,
  TerminalSquare,
  UserRound,
  UsersRound,
  X,
} from "lucide-react";
import type {
  CodingRun,
  Issue,
  IssueStatus,
  IssueType,
  Priority,
} from "../../../types";
import { formatActivityTime } from "../../../shared/lib/format";
import {
  ActivityItem,
  AssigneeOption,
  InlineSelect,
  InlineText,
  PriorityDot,
  Property,
  RunRow,
  SectionTitle,
  StatusPill,
} from "../../../shared/ui/DataDisplay";
import { EmptyState, LoadingState } from "../../../shared/ui/ResourceState";
import { PageHeader } from "../../../shared/ui/PageHeader";
import {
  addLiveTextEvidence,
  createLiveIssueComment,
  getLiveIssueHistory,
  supabase,
} from "../api";

export function IssueDetailPage({
  issues,
  runs,
  workspaceId,
  liveMode,
  assigneeOptions,
  assigneeLabel,
  onToast,
  onOpenIssue,
  onOpenConversation,
  onStartRun,
  onUpdateIssue,
  onResolveAndNotify,
}: {
  issues: Issue[];
  runs: CodingRun[];
  workspaceId: string | null;
  liveMode: boolean;
  assigneeOptions: AssigneeOption[];
  assigneeLabel: (value: string) => string;
  onToast: (message: string) => void;
  onOpenIssue: (id: string) => void;
  onOpenConversation: (id: string) => void;
  onStartRun: (id: string) => void;
  onUpdateIssue: (id: string, patch: Partial<Issue>) => void;
  onResolveAndNotify: (issueId: string, message: string) => Promise<boolean>;
}) {
  const navigate = useNavigate();
  const location = useLocation();
  const identifier = location.pathname.split("/").pop();
  const issue =
    issues.find((item) => item.identifier === identifier) ?? issues[0];
  const [comment, setComment] = useState("");
  const [comments, setComments] = useState<
    Array<{ id: string; body: string; createdAt: string }>
  >([]);
  const [evidenceItems, setEvidenceItems] = useState<
    Array<{ id: string; label: string; body: string; createdAt: string }>
  >([]);
  const [timelineItems, setTimelineItems] = useState<
    Array<{ id: string; title: string; createdAt: string }>
  >([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [evidenceLabel, setEvidenceLabel] = useState("Customer evidence");
  const [evidenceBody, setEvidenceBody] = useState("");
  const [savingActivity, setSavingActivity] = useState(false);
  const [labelDraft, setLabelDraft] = useState("");
  const [resolutionOpen, setResolutionOpen] = useState(false);
  const [resolutionSaving, setResolutionSaving] = useState(false);
  const [resolutionMessage, setResolutionMessage] = useState("");
  useEffect(() => {
    if (!liveMode || !workspaceId || !issue?.identifier) {
      setComments([]);
      setEvidenceItems([]);
      setTimelineItems([]);
      return;
    }
    let active = true;
    setHistoryLoading(true);
    void getLiveIssueHistory({ workspaceId, identifier: issue.identifier })
      .then((history) => {
        if (!active) return;
        const records = (items: unknown[]) =>
          items.filter(
            (item): item is Record<string, unknown> =>
              Boolean(item) && typeof item === "object" && !Array.isArray(item),
          );
        setComments(
          records(history.comments).map((item, index) => ({
            id: String(item.id ?? `comment-${index}`),
            body: String(item.body ?? ""),
            createdAt: formatActivityTime(item.createdAt ?? item.created_at),
          })),
        );
        setEvidenceItems(
          records(history.evidence).map((item, index) => ({
            id: String(item.id ?? `evidence-${index}`),
            label: String(item.label ?? item.kind ?? "Evidence"),
            body: String(
              item.textContent ?? item.text_content ?? item.body ?? "",
            ),
            createdAt: formatActivityTime(item.createdAt ?? item.created_at),
          })),
        );
        setTimelineItems(
          records(history.timeline).map((item, index) => ({
            id: String(item.id ?? `timeline-${index}`),
            title: String(
              item.eventType ?? item.event_type ?? "Issue updated",
            ).replaceAll("_", " "),
            createdAt: formatActivityTime(item.createdAt ?? item.created_at),
          })),
        );
      })
      .catch((error) => {
        if (active)
          onToast(
            error instanceof Error
              ? error.message
              : "Issue history could not be loaded.",
          );
      })
      .finally(() => {
        if (active) setHistoryLoading(false);
      });
    return () => {
      active = false;
    };
  }, [issue?.identifier, liveMode, onToast, workspaceId]);
  if (!issue)
    return (
      <div className="page">
        <EmptyState
          title="Issue not found"
          description="This issue may have been removed or is not available in the current workspace."
          action={
            <button
              className="button button-ghost"
              type="button"
              onClick={() => navigate("/issues")}
            >
              <ArrowLeft size={14} /> Back to issues
            </button>
          }
        />
      </div>
    );
  const issueRuns = runs.filter((run) => run.issueId === issue.id);
  const addComment = async () => {
    if (!comment.trim()) return;
    setSavingActivity(true);
    try {
      if (liveMode && workspaceId)
        await createLiveIssueComment(
          {
            workspaceId,
            issueId: issue.id,
            issueIdentifier: issue.identifier,
            body: comment,
          },
          supabase,
        );
      setComments((current) => [
        ...current,
        {
          id: `comment-${Date.now()}`,
          body: comment.trim(),
          createdAt: "Just now",
        },
      ]);
      setComment("");
      onToast("Comment added");
    } catch (error) {
      onToast(
        error instanceof Error ? error.message : "Comment could not be added.",
      );
    } finally {
      setSavingActivity(false);
    }
  };
  const addEvidence = async () => {
    if (!evidenceBody.trim() || !workspaceId) return;
    setSavingActivity(true);
    try {
      await addLiveTextEvidence(
        {
          workspaceId,
          issueId: issue.id,
          issueIdentifier: issue.identifier,
          label: evidenceLabel,
          body: evidenceBody,
        },
        supabase,
      );
      setEvidenceItems((current) => [
        ...current,
        {
          id: `evidence-${Date.now()}`,
          label: evidenceLabel.trim() || "Evidence",
          body: evidenceBody.trim(),
          createdAt: "Just now",
        },
      ]);
      setEvidenceBody("");
      onToast("Evidence linked to issue");
    } catch (error) {
      onToast(
        error instanceof Error ? error.message : "Evidence could not be added.",
      );
    } finally {
      setSavingActivity(false);
    }
  };
  const addLabel = () => {
    const label = labelDraft.trim();
    if (!label || issue.labels.includes(label)) return;
    onUpdateIssue(issue.id, { labels: [...issue.labels, label] });
    setLabelDraft("");
  };
  return (
    <div className="page issue-detail-page">
      <button
        className="back-link"
        type="button"
        onClick={() => navigate("/issues")}
      >
        <ArrowLeft size={14} /> Back to issues
      </button>
      <PageHeader
        eyebrow={`${issue.identifier} · ${issue.source.toLowerCase()}`}
        title={issue.title}
        actions={
          <>
            <button
              className="button button-ghost"
              type="button"
              onClick={() => {
                if (issue.status === "Done") {
                  onUpdateIssue(issue.id, { status: "In Progress" });
                  return;
                }
                if (issue.conversationId) {
                  setResolutionMessage(
                    `Olá! O chamado ${issue.identifier} foi resolvido. Se o problema continuar, responda por aqui e reabrimos o atendimento.`,
                  );
                  setResolutionOpen(true);
                  return;
                }
                onUpdateIssue(issue.id, { status: "Done" });
              }}
            >
              {issue.status === "Done"
                ? "Reopen"
                : issue.conversationId
                  ? "Resolve & notify"
                  : "Resolve"}
            </button>
            <button
              className="button button-primary"
              type="button"
              onClick={() => onStartRun(issue.id)}
            >
              <TerminalSquare size={15} /> Run Codex
            </button>
          </>
        }
      />
      <div className="issue-detail-grid">
        <div className="issue-main-column">
          <div className="detail-properties">
            <Property label="Status">
              <InlineSelect
                label="Status"
                value={issue.status}
                options={[
                  "Triage",
                  "Backlog",
                  "Todo",
                  "In Progress",
                  "Review",
                  "Done",
                  "Canceled",
                ]}
                renderValue={(value) => (
                  <StatusPill status={value as IssueStatus} />
                )}
                onChange={(value) =>
                  onUpdateIssue(issue.id, { status: value as IssueStatus })
                }
              />
            </Property>
            <Property label="Priority">
              <InlineSelect
                label="Priority"
                value={issue.priority}
                options={["Urgent", "High", "Medium", "Low", "No priority"]}
                renderValue={(value) => (
                  <PriorityDot priority={value as Priority} showLabel />
                )}
                onChange={(value) =>
                  onUpdateIssue(issue.id, { priority: value as Priority })
                }
              />
            </Property>
            <Property label="Type">
              <InlineSelect
                label="Type"
                value={issue.type}
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
                ]}
                renderValue={(value) => (
                  <span className="plain-value">
                    <CircleDot size={14} /> {value}
                  </span>
                )}
                onChange={(value) =>
                  onUpdateIssue(issue.id, { type: value as IssueType })
                }
              />
            </Property>
            <Property label="Assignee">
              <InlineSelect
                label="Assignee"
                value={issue.assignee}
                options={assigneeOptions}
                renderValue={(value) => (
                  <span className="plain-value">
                    <UserRound size={14} /> {assigneeLabel(value)}
                  </span>
                )}
                onChange={(value) =>
                  onUpdateIssue(issue.id, { assignee: value })
                }
              />
            </Property>
            <Property label="Customer">
              <span className="plain-value">
                <UsersRound size={14} /> {issue.customer ?? "Internal issue"}
              </span>
            </Property>
          </div>
          <section className="detail-section">
            <SectionTitle title="Summary" />
            <InlineText
              label="Issue summary"
              value={issue.summary}
              onSave={(value) => onUpdateIssue(issue.id, { summary: value })}
            />
            <div className="impact-note">
              <Info size={15} />
              <span>
                <strong>Impact</strong>
                <InlineText
                  label="Issue impact"
                  value={issue.impact}
                  onSave={(value) => onUpdateIssue(issue.id, { impact: value })}
                />
              </span>
            </div>
          </section>
          <section className="detail-section">
            <SectionTitle title="Activity" />
            <div className="comment-box">
              <div className="avatar avatar-small avatar-violet">OP</div>
              <div>
                <textarea
                  aria-label="Internal comment"
                  value={comment}
                  onChange={(event) => setComment(event.target.value)}
                  placeholder="Leave an internal comment…"
                />
                <div className="comment-actions">
                  <span>Markdown supported</span>
                  <button
                    className="button button-primary button-small"
                    type="button"
                    disabled={savingActivity || !comment.trim()}
                    onClick={() => void addComment()}
                  >
                    Comment
                  </button>
                </div>
              </div>
            </div>
            <ActivityItem
              icon={<CircleDot size={14} />}
              title={
                issue.source === "Conversation"
                  ? "Issue created from conversation"
                  : "Issue created in workspace"
              }
              detail={`${issue.customer ?? "Internal workspace"} · ${issue.createdAt}`}
            />
            {comments.map((item) => (
              <ActivityItem
                key={item.id}
                icon={<MessageCircle size={14} />}
                title="Internal comment"
                detail={`${item.body} · ${item.createdAt}`}
              />
            ))}
            {timelineItems.map((item) => (
              <ActivityItem
                key={item.id}
                icon={<RefreshCw size={14} />}
                title={item.title}
                detail={item.createdAt}
              />
            ))}
            {historyLoading && <LoadingState label="Loading issue activity…" />}
          </section>
          <section className="detail-section">
            <SectionTitle title="Evidence" />
            <div className="evidence-form">
              <input
                aria-label="Evidence label"
                value={evidenceLabel}
                onChange={(event) => setEvidenceLabel(event.target.value)}
                placeholder="Evidence label"
              />
              <textarea
                aria-label="Evidence text"
                value={evidenceBody}
                onChange={(event) => setEvidenceBody(event.target.value)}
                placeholder="Paste the relevant customer message, log excerpt or reproduction note…"
              />
              <button
                className="button button-ghost button-small"
                type="button"
                disabled={
                  savingActivity || !workspaceId || !evidenceBody.trim()
                }
                onClick={() => void addEvidence()}
              >
                <FileText size={13} /> Add evidence
              </button>
            </div>
            {evidenceItems.length > 0 && (
              <div className="evidence-list">
                {evidenceItems.map((item) => (
                  <div className="evidence-item" key={item.id}>
                    <FileText size={14} />
                    <span>
                      <strong>{item.label}</strong>
                      <p>{item.body}</p>
                      <small>{item.createdAt}</small>
                    </span>
                  </div>
                ))}
              </div>
            )}
          </section>
          <section className="detail-section">
            <SectionTitle
              title="Codex runs"
              action={issueRuns.length ? "View all" : undefined}
            />
            {issueRuns.length ? (
              issueRuns.map((run) => (
                <RunRow
                  key={run.id}
                  run={run}
                  onClick={() => onOpenIssue(issue.id)}
                />
              ))
            ) : (
              <div className="inline-empty">
                <TerminalSquare size={18} />
                <span>No Codex runs yet.</span>
                <button
                  className="text-button"
                  type="button"
                  onClick={() => onStartRun(issue.id)}
                >
                  Start one
                </button>
              </div>
            )}
          </section>
        </div>
        <aside className="issue-side-column">
          <div className="side-block">
            <div className="side-block-title">Linked conversation</div>
            {issue.customer && (
              <button
                className="linked-conversation"
                type="button"
                onClick={() =>
                  issue.conversationId &&
                  onOpenConversation(issue.conversationId)
                }
              >
                <div
                  className="conversation-avatar"
                  style={{ background: "#7c91ff18", color: "#9eafff" }}
                >
                  {issue.customer.slice(0, 2).toUpperCase()}
                </div>
                <div>
                  <strong>{issue.customer}</strong>
                  <small>
                    WhatsApp · {issue.conversationId ? "open" : "internal"}
                  </small>
                </div>
                <ChevronRight size={15} />
              </button>
            )}
          </div>
          <div className="side-block">
            <div className="side-block-title">Labels</div>
            <div className="labels-cloud">
              {issue.labels.length ? (
                issue.labels.map((label) => (
                  <span key={label} className="label-pill large">
                    <Tag size={11} /> {label}
                  </span>
                ))
              ) : (
                <span className="muted-copy">No labels</span>
              )}
            </div>
            <div className="label-editor">
              <input
                aria-label="New issue label"
                value={labelDraft}
                onChange={(event) => setLabelDraft(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") addLabel();
                }}
                placeholder="Add a label"
              />
              <button
                className="icon-button subtle"
                type="button"
                aria-label="Add issue label"
                onClick={addLabel}
              >
                <Plus size={14} />
              </button>
            </div>
          </div>
          <div className="side-block">
            <div className="side-block-title">Details</div>
            <div className="detail-list">
              <span>
                Created <b>{issue.createdAt}</b>
              </span>
              <span>
                Updated <b>{issue.updatedAt}</b>
              </span>
              <span>
                Source <b>{issue.source}</b>
              </span>
            </div>
          </div>
        </aside>
      </div>
      {resolutionOpen && (
        <div
          className="modal-backdrop"
          role="presentation"
          onClick={() => setResolutionOpen(false)}
        >
          <div
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="resolution-title"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="modal-header">
              <div>
                <span className="page-kicker">Customer update</span>
                <h2 id="resolution-title">Resolve {issue.identifier}</h2>
              </div>
              <button
                className="icon-button"
                type="button"
                aria-label="Close resolution dialog"
                onClick={() => setResolutionOpen(false)}
              >
                <X size={17} />
              </button>
            </div>
            <div className="modal-body">
              <label>
                Resolution message
                <textarea
                  autoFocus
                  value={resolutionMessage}
                  maxLength={4000}
                  onChange={(event) => setResolutionMessage(event.target.value)}
                />
              </label>
              <div className="modal-note">
                <Send size={14} />
                <span>
                  This sends one WhatsApp message, marks the issue Done and
                  resolves the conversation.
                </span>
              </div>
            </div>
            <div className="modal-footer">
              <button
                className="button button-ghost"
                type="button"
                onClick={() => setResolutionOpen(false)}
              >
                Cancel
              </button>
              <button
                className="button button-primary"
                type="button"
                disabled={resolutionSaving || !resolutionMessage.trim()}
                onClick={() => {
                  setResolutionSaving(true);
                  void onResolveAndNotify(issue.id, resolutionMessage).then(
                    (resolved) => {
                      setResolutionSaving(false);
                      if (resolved) setResolutionOpen(false);
                    },
                  );
                }}
              >
                <Send size={14} />
                {resolutionSaving ? "Sending…" : "Resolve and send"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
export function IssueInspector({
  issue,
  assigneeOptions,
  assigneeLabel,
  onClose,
  onOpenFull,
  onStartRun,
  onUpdateIssue,
}: {
  issue?: Issue;
  assigneeOptions: AssigneeOption[];
  assigneeLabel: (value: string) => string;
  onClose: () => void;
  onOpenFull: (identifier: string) => void;
  onStartRun: (id: string) => void;
  onUpdateIssue: (id: string, patch: Partial<Issue>) => void;
}) {
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (issue) closeButtonRef.current?.focus();
  }, [issue]);
  if (!issue) return null;
  return (
    <div className="drawer-backdrop" role="presentation" onClick={onClose}>
      <aside
        className="issue-inspector"
        role="dialog"
        aria-modal="true"
        aria-labelledby="issue-inspector-title"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="inspector-header">
          <div>
            <span className="page-kicker">Issue inspector</span>
            <h2 id="issue-inspector-title">{issue.identifier}</h2>
          </div>
          <button
            ref={closeButtonRef}
            className="icon-button"
            type="button"
            onClick={onClose}
            aria-label="Close issue inspector"
          >
            <X size={17} />
          </button>
        </div>
        <div className="inspector-scroll">
          <h3>{issue.title}</h3>
          <div className="inspector-props">
            <InlineSelect
              label="Status"
              value={issue.status}
              options={[
                "Triage",
                "Backlog",
                "Todo",
                "In Progress",
                "Review",
                "Done",
                "Canceled",
              ]}
              renderValue={(value) => (
                <StatusPill status={value as IssueStatus} />
              )}
              onChange={(value) =>
                onUpdateIssue(issue.id, { status: value as IssueStatus })
              }
            />
            <InlineSelect
              label="Priority"
              value={issue.priority}
              options={["Urgent", "High", "Medium", "Low", "No priority"]}
              renderValue={(value) => (
                <PriorityDot priority={value as Priority} showLabel />
              )}
              onChange={(value) =>
                onUpdateIssue(issue.id, { priority: value as Priority })
              }
            />
            <InlineSelect
              label="Assignee"
              value={issue.assignee}
              options={assigneeOptions}
              renderValue={(value) => (
                <span className="plain-value">{assigneeLabel(value)}</span>
              )}
              onChange={(value) => onUpdateIssue(issue.id, { assignee: value })}
            />
            <InlineSelect
              label="Type"
              value={issue.type}
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
              ]}
              renderValue={(value) => (
                <span className="plain-value">{value}</span>
              )}
              onChange={(value) =>
                onUpdateIssue(issue.id, { type: value as IssueType })
              }
            />
          </div>
          <section className="inspector-section">
            <SectionTitle title="Summary" />
            <InlineText
              label="Issue summary"
              value={issue.summary}
              onSave={(value) => onUpdateIssue(issue.id, { summary: value })}
            />
          </section>
          <section className="inspector-section">
            <SectionTitle title="Impact" />
            <InlineText
              label="Issue impact"
              value={issue.impact}
              onSave={(value) => onUpdateIssue(issue.id, { impact: value })}
            />
          </section>
          <section className="inspector-section">
            <SectionTitle title="Activity" />
            <ActivityItem
              icon={<CircleDot size={13} />}
              title="Issue linked to conversation"
              detail={`${issue.customer ?? "Internal"} · ${issue.updatedAt}`}
            />
          </section>
        </div>
        <div className="inspector-footer">
          <button
            className="button button-ghost"
            type="button"
            onClick={() => onOpenFull(issue.identifier)}
          >
            Open full issue <ArrowUp size={14} />
          </button>
          <button
            className="button button-primary"
            type="button"
            onClick={() => onStartRun(issue.id)}
          >
            <TerminalSquare size={14} /> Run Codex
          </button>
        </div>
      </aside>
    </div>
  );
}
