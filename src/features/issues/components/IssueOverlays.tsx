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
  operationalLanguage,
  liveMode,
  assigneeOptions,
  assigneeLabel,
  onToast,
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
  onOpenConversation: (id: string) => void;
  onStartRun: (id: string) => void;
  onEditIssue: (id: string) => void;
  onDeleteIssue: (id: string) => void;
  onUpdateIssue: (id: string, patch: Partial<Issue>) => void;
  onResolveAndNotify: (issueId: string, message: string) => Promise<boolean>;
}) {
  const navigate = useNavigate();
  const location = useLocation();
  const { t } = useTranslation("issues");
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
              : t("detail.historyLoadError"),
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
          title={t("detail.notFound")}
          description={t("detail.notFoundDescription")}
          action={
            <button
              className="button button-ghost"
              type="button"
              onClick={() => navigate("/issues")}
            >
              <ArrowLeft size={14} /> {t("detail.backToIssues")}
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
          createdAt: t("common:states.justNow"),
        },
      ]);
      setComment("");
      onToast(t("detail.commentAdded"));
    } catch (error) {
      onToast(
        error instanceof Error ? error.message : t("detail.commentError"),
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
          label: evidenceLabel.trim() || t("detail.evidence"),
          body: evidenceBody.trim(),
          createdAt: t("common:states.justNow"),
        },
      ]);
      setEvidenceBody("");
      onToast(t("detail.evidenceAdded"));
    } catch (error) {
      onToast(
        error instanceof Error ? error.message : t("detail.evidenceError"),
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
        <ArrowLeft size={14} /> {t("detail.backToIssues")}
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
                    operationalLanguage === "pt-BR"
                      ? `Olá! O chamado ${issue.identifier} foi resolvido. Se o problema continuar, responda por aqui e reabrimos o atendimento.`
                      : `Hello! Issue ${issue.identifier} has been resolved. If the problem continues, reply here and we will reopen the conversation.`,
                  );
                  setResolutionOpen(true);
                  return;
                }
                onUpdateIssue(issue.id, { status: "Done" });
              }}
            >
              {issue.status === "Done"
                ? t("detail.reopen")
                : issue.conversationId
                  ? t("detail.resolveAndNotify")
                  : t("detail.resolve")}
            </button>
            <button
              className="button button-primary"
              type="button"
              onClick={() => onStartRun(issue.id)}
            >
              <TerminalSquare size={15} /> {t("detail.runAgent")}
            </button>
            <ActionMenu label={issue.identifier}>
              <button
                type="button"
                role="menuitem"
                onClick={() => onEditIssue(issue.id)}
              >
                <PenLine size={14} /> {t("ui.edit")}
              </button>
              <button
                className="danger"
                type="button"
                role="menuitem"
                onClick={() => onDeleteIssue(issue.id)}
              >
                <Trash2 size={14} /> {t("ui.delete")}
              </button>
            </ActionMenu>
          </>
        }
      />
      <div className="issue-detail-grid">
        <div className="issue-main-column">
          <div className="detail-properties">
            <Property label={t("detail.status")}>
              <InlineSelect
                label={t("detail.status")}
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
            <Property label={t("detail.priority")}>
              <InlineSelect
                label={t("detail.priority")}
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
            <Property label={t("detail.type")}>
              <InlineSelect
                label={t("detail.type")}
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
            <Property label={t("detail.assignee")}>
              <InlineSelect
                label={t("detail.assignee")}
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
            <Property label={t("detail.customer")}>
              <span className="plain-value">
                <UsersRound size={14} />{" "}
                {issue.customer ?? t("detail.internalIssue")}
              </span>
            </Property>
          </div>
          <section className="detail-section">
            <SectionTitle title={t("detail.summary")} />
            <InlineText
              label={t("detail.issueSummary")}
              value={issue.summary}
              onSave={(value) => onUpdateIssue(issue.id, { summary: value })}
            />
            <div className="impact-note">
              <Info size={15} />
              <span>
                <strong>{t("detail.impact")}</strong>
                <InlineText
                  label={t("detail.issueImpact")}
                  value={issue.impact}
                  onSave={(value) => onUpdateIssue(issue.id, { impact: value })}
                />
              </span>
            </div>
          </section>
          <section className="detail-section">
            <SectionTitle title={t("detail.activity")} />
            <div className="comment-box">
              <div className="avatar avatar-small avatar-violet">
                {t("detail.operatorInitials")}
              </div>
              <div>
                <textarea
                  aria-label={t("detail.internalComment")}
                  value={comment}
                  onChange={(event) => setComment(event.target.value)}
                  placeholder={t("detail.commentPlaceholder")}
                />
                <div className="comment-actions">
                  <span>{t("detail.markdownSupported")}</span>
                  <button
                    className="button button-primary button-small"
                    type="button"
                    disabled={savingActivity || !comment.trim()}
                    onClick={() => void addComment()}
                  >
                    {t("detail.comment")}
                  </button>
                </div>
              </div>
            </div>
            <ActivityItem
              icon={<CircleDot size={14} />}
              title={
                issue.source === "Conversation"
                  ? t("detail.createdFromConversation")
                  : t("detail.createdInWorkspace")
              }
              detail={`${issue.customer ?? t("detail.internalIssue")} · ${issue.createdAt}`}
            />
            {comments.map((item) => (
              <ActivityItem
                key={item.id}
                icon={<MessageCircle size={14} />}
                title={t("detail.internalComment")}
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
              <LoadingState label={t("detail.loadingActivity")} />
            )}
          </section>
          <section className="detail-section">
            <SectionTitle title={t("detail.evidenceTitle")} />
            <div className="evidence-form">
              <input
                aria-label={t("detail.evidenceLabel")}
                value={evidenceLabel}
                onChange={(event) => setEvidenceLabel(event.target.value)}
                placeholder={t("detail.evidenceLabel")}
              />
              <textarea
                aria-label={t("detail.evidenceText")}
                value={evidenceBody}
                onChange={(event) => setEvidenceBody(event.target.value)}
                placeholder={t("detail.evidencePlaceholder")}
              />
              <button
                className="button button-ghost button-small"
                type="button"
                disabled={
                  savingActivity || !workspaceId || !evidenceBody.trim()
                }
                onClick={() => void addEvidence()}
              >
                <FileText size={13} /> {t("detail.addEvidence")}
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
              title={t("detail.agentRuns")}
              action={issueRuns.length ? t("detail.viewAll") : undefined}
            />
            {issueRuns.length ? (
              issueRuns.map((run) => (
                <RunRow
                  key={run.id}
                  run={run}
                  onClick={() =>
                    navigate(`/agent-runs?run=${encodeURIComponent(run.id)}`)
                  }
                />
              ))
            ) : (
              <div className="inline-empty">
                <TerminalSquare size={18} />
                <span>{t("detail.noRuns")}</span>
                <button
                  className="text-button"
                  type="button"
                  onClick={() => onStartRun(issue.id)}
                >
                  {t("detail.startOne")}
                </button>
              </div>
            )}
          </section>
        </div>
        <aside className="issue-side-column">
          <div className="side-block">
            <div className="side-block-title">
              {t("detail.linkedConversation")}
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
                      state: issue.conversationId
                        ? t("detail.open")
                        : t("detail.internal"),
                    })}
                  </small>
                </div>
                <ChevronRight size={15} />
              </button>
            )}
          </div>
          <div className="side-block">
            <div className="side-block-title">{t("detail.labels")}</div>
            <div className="labels-cloud">
              {issue.labels.length ? (
                issue.labels.map((label) => (
                  <span key={label} className="label-pill large">
                    <Tag size={11} /> {label}
                  </span>
                ))
              ) : (
                <span className="muted-copy">{t("detail.noLabels")}</span>
              )}
            </div>
            <div className="label-editor">
              <input
                aria-label={t("detail.newLabel")}
                value={labelDraft}
                onChange={(event) => setLabelDraft(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") addLabel();
                }}
                placeholder={t("detail.addLabelPlaceholder")}
              />
              <button
                className="icon-button subtle"
                type="button"
                aria-label={t("detail.addLabel")}
                onClick={addLabel}
              >
                <Plus size={14} />
              </button>
            </div>
          </div>
          <div className="side-block">
            <div className="side-block-title">{t("detail.details")}</div>
            <div className="detail-list">
              <span>
                {t("detail.created")} <b>{issue.createdAt}</b>
              </span>
              <span>
                {t("detail.updated")} <b>{issue.updatedAt}</b>
              </span>
              <span>
                {t("detail.source")} <b>{issue.source}</b>
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
                  {t("detail.customerUpdate")}
                </span>
                <h2 id="resolution-title">
                  {t("detail.resolveTitle", { identifier: issue.identifier })}
                </h2>
              </div>
              <button
                className="icon-button"
                type="button"
                aria-label={t("detail.closeResolution")}
                onClick={() => setResolutionOpen(false)}
              >
                <X size={17} />
              </button>
            </div>
            <div className="modal-body">
              <label>
                {t("detail.resolutionMessage")}
                <textarea
                  autoFocus
                  value={resolutionMessage}
                  maxLength={4000}
                  onChange={(event) => setResolutionMessage(event.target.value)}
                />
              </label>
              <div className="modal-note">
                <Send size={14} />
                <span>{t("detail.resolutionDescription")}</span>
              </div>
            </div>
            <div className="modal-footer">
              <button
                className="button button-ghost"
                type="button"
                onClick={() => setResolutionOpen(false)}
              >
                {t("common:actions.cancel")}
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
                  ? t("detail.sending")
                  : t("detail.resolveAndSend")}
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
  const { t } = useTranslation("issues");
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
            <span className="page-kicker">{t("detail.inspector")}</span>
            <h2 id="issue-inspector-title">{issue.identifier}</h2>
          </div>
          <button
            ref={closeButtonRef}
            className="icon-button"
            type="button"
            onClick={onClose}
            aria-label={t("detail.closeInspector")}
          >
            <X size={17} />
          </button>
        </div>
        <div className="inspector-scroll">
          <h3>{issue.title}</h3>
          <div className="inspector-props">
            <InlineSelect
              label={t("detail.status")}
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
              label={t("detail.priority")}
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
              label={t("detail.type")}
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
            <SectionTitle title={t("detail.summary")} />
            <InlineText
              label={t("detail.issueSummary")}
              value={issue.summary}
              onSave={(value) => onUpdateIssue(issue.id, { summary: value })}
            />
          </section>
          <section className="inspector-section">
            <SectionTitle title={t("detail.impact")} />
            <InlineText
              label={t("detail.issueImpact")}
              value={issue.impact}
              onSave={(value) => onUpdateIssue(issue.id, { impact: value })}
            />
          </section>
          <section className="inspector-section">
            <SectionTitle title={t("detail.activity")} />
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
            {t("detail.openFull")} <ArrowUp size={14} />
          </button>
          <button
            className="button button-primary"
            type="button"
            onClick={() => onStartRun(issue.id)}
          >
            <TerminalSquare size={14} /> {t("detail.runAgent")}
          </button>
        </div>
      </aside>
    </div>
  );
}
