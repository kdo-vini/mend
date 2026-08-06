import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  ArrowLeft,
  ArrowUp,
  ChevronRight,
  CircleDot,
  FileText,
  Info,
  MessageCircle,
  PenLine,
  Plus,
  RefreshCw,
  Send,
  Tag,
  TerminalSquare,
  Trash2,
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
import type { SupportedLocale } from "../../../i18n/resources";
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
import { ActionMenu } from "../../../shared/ui/ActionMenu";
import { localizedError } from "../../../shared/ui/localizedError";
import {
  addLiveTextEvidence,
  createLiveIssueComment,
  getLiveIssueHistory,
  supabase,
} from "../api";

type Translate = (key: string, options?: Record<string, unknown>) => string;

function issueTypeLabel(type: IssueType, t: Translate) {
  switch (type) {
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
}

function issueStatusOptions(t: Translate) {
  return [
    { value: "Triage", label: t("data.issueStatus.triage", { ns: "common" }) },
    {
      value: "Backlog",
      label: t("data.issueStatus.backlog", { ns: "common" }),
    },
    { value: "Todo", label: t("data.issueStatus.todo", { ns: "common" }) },
    {
      value: "In Progress",
      label: t("data.issueStatus.inProgress", { ns: "common" }),
    },
    { value: "Review", label: t("data.issueStatus.review", { ns: "common" }) },
    { value: "Done", label: t("data.issueStatus.done", { ns: "common" }) },
    {
      value: "Canceled",
      label: t("data.issueStatus.canceled", { ns: "common" }),
    },
  ];
}

function priorityOptions(t: Translate) {
  return [
    { value: "Urgent", label: t("data.priority.urgent", { ns: "common" }) },
    { value: "High", label: t("data.priority.high", { ns: "common" }) },
    { value: "Medium", label: t("data.priority.medium", { ns: "common" }) },
    { value: "Low", label: t("data.priority.low", { ns: "common" }) },
    {
      value: "No priority",
      label: t("data.priority.noPriority", { ns: "common" }),
    },
  ];
}

function issueTypeOptions(t: Translate) {
  return [
    "Production Bug",
    "Bug",
    "Incident",
    "Feature",
    "Task",
    "Billing",
    "Commercial",
    "Question",
    "Other",
  ].map((value) => ({ value, label: issueTypeLabel(value as IssueType, t) }));
}

function issueSourceLabel(source: Issue["source"], t: Translate) {
  return source === "Conversation"
    ? t("detail.sourceConversation", { ns: "issues" })
    : t("detail.sourceInternal", { ns: "issues" });
}

export function IssueDetailPage({
  issues,
  runs,
  workspaceId,
  operationalLanguage,
  liveMode,
  assigneeOptions,
  assigneeLabel,
  onToast,
  onOpenIssue,
  onOpenConversation,
  onStartRun,
  onEditIssue,
  onDeleteIssue,
  onUpdateIssue,
  onResolveAndNotify,
}: {
  issues: Issue[];
  runs: CodingRun[];
  workspaceId: string | null;
  operationalLanguage: SupportedLocale;
  liveMode: boolean;
  assigneeOptions: AssigneeOption[];
  assigneeLabel: (value: string) => string;
  onToast: (message: string) => void;
  onOpenIssue: (id: string) => void;
  onOpenConversation: (id: string) => void;
  onStartRun: (id: string) => void;
  onEditIssue: (id: string) => void;
  onDeleteIssue: (id: string) => void;
  onUpdateIssue: (id: string, patch: Partial<Issue>) => void;
  onResolveAndNotify: (issueId: string, message: string) => Promise<boolean>;
}) {
  const { t } = useTranslation(["common", "issues"]);
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
            localizedError(
              error,
              t("detail.historyLoadError", { ns: "issues" }),
            ),
          );
      })
      .finally(() => {
        if (active) setHistoryLoading(false);
      });
    return () => {
      active = false;
    };
  }, [issue?.identifier, liveMode, onToast, t, workspaceId]);
  if (!issue)
    return (
      <div className="page">
        <EmptyState
          title={t("detail.notFound", { ns: "issues" })}
          description={t("detail.notFoundDescription", { ns: "issues" })}
          action={
            <button
              className="button button-ghost"
              type="button"
              onClick={() => navigate("/issues")}
            >
              <ArrowLeft size={14} />{" "}
              {t("detail.backToIssues", { ns: "issues" })}
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
      onToast(t("detail.commentAdded", { ns: "issues" }));
    } catch (error) {
      onToast(
        localizedError(error, t("detail.commentError", { ns: "issues" })),
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
          label: evidenceLabel.trim() || t("detail.evidence", { ns: "issues" }),
          body: evidenceBody.trim(),
          createdAt: "Just now",
        },
      ]);
      setEvidenceBody("");
      onToast(t("detail.evidenceAdded", { ns: "issues" }));
    } catch (error) {
      onToast(
        localizedError(error, t("detail.evidenceError", { ns: "issues" })),
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
        <ArrowLeft size={14} /> {t("detail.backToIssues", { ns: "issues" })}
      </button>
      <PageHeader
        eyebrow={`${issue.identifier} · ${issueSourceLabel(issue.source, t)}`}
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
                    t("detail.resolutionGreeting", {
                      ns: "issues",
                      identifier: issue.identifier,
                      language: operationalLanguage,
                    }),
                  );
                  setResolutionOpen(true);
                  return;
                }
                onUpdateIssue(issue.id, { status: "Done" });
              }}
            >
              {issue.status === "Done"
                ? t("detail.reopen", { ns: "issues" })
                : issue.conversationId
                  ? t("detail.resolveAndNotify", { ns: "issues" })
                  : t("detail.resolve", { ns: "issues" })}
            </button>
            <button
              className="button button-primary"
              type="button"
              onClick={() => onStartRun(issue.id)}
            >
              <TerminalSquare size={15} />{" "}
              {t("detail.runCodex", { ns: "issues" })}
            </button>
            <ActionMenu label={issue.identifier}>
              <button
                type="button"
                role="menuitem"
                onClick={() => onEditIssue(issue.id)}
              >
                <PenLine size={14} /> {t("ui.edit", { ns: "issues" })}
              </button>
              <button
                className="danger"
                type="button"
                role="menuitem"
                onClick={() => onDeleteIssue(issue.id)}
              >
                <Trash2 size={14} /> {t("ui.delete", { ns: "issues" })}
              </button>
            </ActionMenu>
          </>
        }
      />
      <div className="issue-detail-grid">
        <div className="issue-main-column">
          <div className="detail-properties">
            <Property label={t("detail.status", { ns: "issues" })}>
              <InlineSelect
                label={t("detail.status", { ns: "issues" })}
                value={issue.status}
                options={issueStatusOptions(t)}
                renderValue={(value) => (
                  <StatusPill status={value as IssueStatus} />
                )}
                onChange={(value) =>
                  onUpdateIssue(issue.id, { status: value as IssueStatus })
                }
              />
            </Property>
            <Property label={t("detail.priority", { ns: "issues" })}>
              <InlineSelect
                label={t("detail.priority", { ns: "issues" })}
                value={issue.priority}
                options={priorityOptions(t)}
                renderValue={(value) => (
                  <PriorityDot priority={value as Priority} showLabel />
                )}
                onChange={(value) =>
                  onUpdateIssue(issue.id, { priority: value as Priority })
                }
              />
            </Property>
            <Property label={t("detail.type", { ns: "issues" })}>
              <InlineSelect
                label={t("detail.type", { ns: "issues" })}
                value={issue.type}
                options={issueTypeOptions(t)}
                renderValue={(value) => (
                  <span className="plain-value">
                    <CircleDot size={14} />{" "}
                    {issueTypeLabel(value as IssueType, t)}
                  </span>
                )}
                onChange={(value) =>
                  onUpdateIssue(issue.id, { type: value as IssueType })
                }
              />
            </Property>
            <Property label={t("detail.assignee", { ns: "issues" })}>
              <InlineSelect
                label={t("detail.assignee", { ns: "issues" })}
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
            <Property label={t("detail.customer", { ns: "issues" })}>
              <span className="plain-value">
                <UsersRound size={14} />{" "}
                {issue.customer ?? t("detail.internalIssue", { ns: "issues" })}
              </span>
            </Property>
          </div>
          <section className="detail-section">
            <SectionTitle title={t("detail.summary", { ns: "issues" })} />
            <InlineText
              label={t("detail.issueSummary", { ns: "issues" })}
              value={issue.summary}
              onSave={(value) => onUpdateIssue(issue.id, { summary: value })}
            />
            <div className="impact-note">
              <Info size={15} />
              <span>
                <strong>{t("detail.impact", { ns: "issues" })}</strong>
                <InlineText
                  label={t("detail.issueImpact", { ns: "issues" })}
                  value={issue.impact}
                  onSave={(value) => onUpdateIssue(issue.id, { impact: value })}
                />
              </span>
            </div>
          </section>
          <section className="detail-section">
            <SectionTitle title={t("detail.activity", { ns: "issues" })} />
            <div className="comment-box">
              <div className="avatar avatar-small avatar-violet">
                {t("detail.operatorInitials", { ns: "issues" })}
              </div>
              <div>
                <textarea
                  aria-label={t("detail.internalComment", { ns: "issues" })}
                  value={comment}
                  onChange={(event) => setComment(event.target.value)}
                  placeholder={t("detail.commentPlaceholder", { ns: "issues" })}
                />
                <div className="comment-actions">
                  <span>{t("detail.markdownSupported", { ns: "issues" })}</span>
                  <button
                    className="button button-primary button-small"
                    type="button"
                    disabled={savingActivity || !comment.trim()}
                    onClick={() => void addComment()}
                  >
                    {t("detail.comment", { ns: "issues" })}
                  </button>
                </div>
              </div>
            </div>
            <ActivityItem
              icon={<CircleDot size={14} />}
              title={
                issue.source === "Conversation"
                  ? t("detail.createdFromConversation", { ns: "issues" })
                  : t("detail.createdInWorkspace", { ns: "issues" })
              }
              detail={`${issue.customer ?? "Internal workspace"} · ${issue.createdAt}`}
            />
            {comments.map((item) => (
              <ActivityItem
                key={item.id}
                icon={<MessageCircle size={14} />}
                title={t("detail.internalComment", { ns: "issues" })}
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
            {historyLoading && (
              <LoadingState
                label={t("detail.loadingActivity", { ns: "issues" })}
              />
            )}
          </section>
          <section className="detail-section">
            <SectionTitle title={t("detail.evidenceTitle", { ns: "issues" })} />
            <div className="evidence-form">
              <input
                aria-label={t("detail.evidenceLabel", { ns: "issues" })}
                value={evidenceLabel}
                onChange={(event) => setEvidenceLabel(event.target.value)}
                placeholder={t("detail.evidenceLabel", { ns: "issues" })}
              />
              <textarea
                aria-label={t("detail.evidenceText", { ns: "issues" })}
                value={evidenceBody}
                onChange={(event) => setEvidenceBody(event.target.value)}
                placeholder={t("detail.evidencePlaceholder", { ns: "issues" })}
              />
              <button
                className="button button-ghost button-small"
                type="button"
                disabled={
                  savingActivity || !workspaceId || !evidenceBody.trim()
                }
                onClick={() => void addEvidence()}
              >
                <FileText size={13} />{" "}
                {t("detail.addEvidence", { ns: "issues" })}
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
              title={t("detail.codexRuns", { ns: "issues" })}
              action={
                issueRuns.length
                  ? t("detail.viewAll", { ns: "issues" })
                  : undefined
              }
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
                <span>{t("detail.noRuns", { ns: "issues" })}</span>
                <button
                  className="text-button"
                  type="button"
                  onClick={() => onStartRun(issue.id)}
                >
                  {t("detail.startOne", { ns: "issues" })}
                </button>
              </div>
            )}
          </section>
        </div>
        <aside className="issue-side-column">
          <div className="side-block">
            <div className="side-block-title">
              {t("detail.linkedConversation", { ns: "issues" })}
            </div>
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
                    {t("detail.whatsappState", {
                      ns: "issues",
                      state: issue.conversationId
                        ? t("detail.open", { ns: "issues" })
                        : t("detail.internal", { ns: "issues" }),
                    })}
                  </small>
                </div>
                <ChevronRight size={15} />
              </button>
            )}
          </div>
          <div className="side-block">
            <div className="side-block-title">
              {t("detail.labels", { ns: "issues" })}
            </div>
            <div className="labels-cloud">
              {issue.labels.length ? (
                issue.labels.map((label) => (
                  <span key={label} className="label-pill large">
                    <Tag size={11} /> {label}
                  </span>
                ))
              ) : (
                <span className="muted-copy">
                  {t("detail.noLabels", { ns: "issues" })}
                </span>
              )}
            </div>
            <div className="label-editor">
              <input
                aria-label={t("detail.newLabel", { ns: "issues" })}
                value={labelDraft}
                onChange={(event) => setLabelDraft(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") addLabel();
                }}
                placeholder={t("detail.addLabelPlaceholder", { ns: "issues" })}
              />
              <button
                className="icon-button subtle"
                type="button"
                aria-label={t("detail.addLabel", { ns: "issues" })}
                onClick={addLabel}
              >
                <Plus size={14} />
              </button>
            </div>
          </div>
          <div className="side-block">
            <div className="side-block-title">
              {t("detail.details", { ns: "issues" })}
            </div>
            <div className="detail-list">
              <span>
                {t("detail.created", { ns: "issues" })} <b>{issue.createdAt}</b>
              </span>
              <span>
                {t("detail.updated", { ns: "issues" })} <b>{issue.updatedAt}</b>
              </span>
              <span>
                {t("detail.source", { ns: "issues" })}{" "}
                <b>{issueSourceLabel(issue.source, t)}</b>
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
                <span className="page-kicker">
                  {t("detail.customerUpdate", { ns: "issues" })}
                </span>
                <h2 id="resolution-title">
                  {t("detail.resolveTitle", {
                    ns: "issues",
                    identifier: issue.identifier,
                  })}
                </h2>
              </div>
              <button
                className="icon-button"
                type="button"
                aria-label={t("detail.closeResolution", { ns: "issues" })}
                onClick={() => setResolutionOpen(false)}
              >
                <X size={17} />
              </button>
            </div>
            <div className="modal-body">
              <label>
                {t("detail.resolutionMessage", { ns: "issues" })}
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
                  {t("detail.resolutionDescription", { ns: "issues" })}
                </span>
              </div>
            </div>
            <div className="modal-footer">
              <button
                className="button button-ghost"
                type="button"
                onClick={() => setResolutionOpen(false)}
              >
                {t("actions.cancel", { ns: "common" })}
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
                {resolutionSaving
                  ? t("detail.sending", { ns: "issues" })
                  : t("detail.resolveAndSend", { ns: "issues" })}
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
  const { t } = useTranslation(["common", "issues"]);
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
            <span className="page-kicker">
              {t("detail.inspector", { ns: "issues" })}
            </span>
            <h2 id="issue-inspector-title">{issue.identifier}</h2>
          </div>
          <button
            ref={closeButtonRef}
            className="icon-button"
            type="button"
            onClick={onClose}
            aria-label={t("detail.closeInspector", { ns: "issues" })}
          >
            <X size={17} />
          </button>
        </div>
        <div className="inspector-scroll">
          <h3>{issue.title}</h3>
          <div className="inspector-props">
            <InlineSelect
              label={t("detail.status", { ns: "issues" })}
              value={issue.status}
              options={issueStatusOptions(t)}
              renderValue={(value) => (
                <StatusPill status={value as IssueStatus} />
              )}
              onChange={(value) =>
                onUpdateIssue(issue.id, { status: value as IssueStatus })
              }
            />
            <InlineSelect
              label={t("detail.priority", { ns: "issues" })}
              value={issue.priority}
              options={priorityOptions(t)}
              renderValue={(value) => (
                <PriorityDot priority={value as Priority} showLabel />
              )}
              onChange={(value) =>
                onUpdateIssue(issue.id, { priority: value as Priority })
              }
            />
            <InlineSelect
              label={t("detail.assignee", { ns: "issues" })}
              value={issue.assignee}
              options={assigneeOptions}
              renderValue={(value) => (
                <span className="plain-value">{assigneeLabel(value)}</span>
              )}
              onChange={(value) => onUpdateIssue(issue.id, { assignee: value })}
            />
            <InlineSelect
              label={t("detail.type", { ns: "issues" })}
              value={issue.type}
              options={issueTypeOptions(t)}
              renderValue={(value) => (
                <span className="plain-value">
                  {issueTypeLabel(value as IssueType, t)}
                </span>
              )}
              onChange={(value) =>
                onUpdateIssue(issue.id, { type: value as IssueType })
              }
            />
          </div>
          <section className="inspector-section">
            <SectionTitle title={t("detail.summary", { ns: "issues" })} />
            <InlineText
              label={t("detail.issueSummary", { ns: "issues" })}
              value={issue.summary}
              onSave={(value) => onUpdateIssue(issue.id, { summary: value })}
            />
          </section>
          <section className="inspector-section">
            <SectionTitle title={t("detail.impact", { ns: "issues" })} />
            <InlineText
              label={t("detail.issueImpact", { ns: "issues" })}
              value={issue.impact}
              onSave={(value) => onUpdateIssue(issue.id, { impact: value })}
            />
          </section>
          <section className="inspector-section">
            <SectionTitle title={t("detail.activity", { ns: "issues" })} />
            <ActivityItem
              icon={<CircleDot size={13} />}
              title={t("detail.issueLinked", { ns: "issues" })}
              detail={`${issue.customer ?? t("detail.internal", { ns: "issues" })} · ${issue.updatedAt}`}
            />
          </section>
        </div>
        <div className="inspector-footer">
          <button
            className="button button-ghost"
            type="button"
            onClick={() => onOpenFull(issue.identifier)}
          >
            {t("detail.openFull", { ns: "issues" })} <ArrowUp size={14} />
          </button>
          <button
            className="button button-primary"
            type="button"
            onClick={() => onStartRun(issue.id)}
          >
            <TerminalSquare size={14} />{" "}
            {t("detail.runCodex", { ns: "issues" })}
          </button>
        </div>
      </aside>
    </div>
  );
}
