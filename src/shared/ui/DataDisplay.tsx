import { useEffect, useRef, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { ChevronRight, PenLine } from "lucide-react";
import type {
  CodingRun,
  IssueStatus,
  KnowledgeArticle,
  Priority,
} from "../../types";
import { Select } from "./Select";

export interface AssigneeOption {
  value: string;
  label: string;
}

export function PriorityDot({
  priority,
  showLabel = false,
}: {
  priority: Priority;
  showLabel?: boolean;
}) {
  const { t } = useTranslation("common");
  const tone =
    priority === "Urgent"
      ? "urgent"
      : priority === "High"
        ? "high"
        : priority === "Medium"
          ? "medium"
          : priority === "Low"
            ? "low"
            : "none";
  const label =
    priority === "Urgent"
      ? t("data.priority.urgent")
      : priority === "High"
        ? t("data.priority.high")
        : priority === "Medium"
          ? t("data.priority.medium")
          : priority === "Low"
            ? t("data.priority.low")
            : t("data.priority.noPriority");
  return (
    <span className={`priority ${tone}`}>
      <span className="priority-glyph">
        {priority === "Urgent"
          ? "↑"
          : priority === "High"
            ? "↑"
            : priority === "Medium"
              ? "→"
              : priority === "Low"
                ? "↓"
                : "–"}
      </span>
      {showLabel && label}
    </span>
  );
}

export function InlineSelect({
  label,
  value,
  options,
  renderValue,
  onChange,
}: {
  label: string;
  value: string;
  options: Array<string | AssigneeOption>;
  renderValue: (value: string) => ReactNode;
  onChange: (value: string) => void;
}) {
  const { t } = useTranslation("common");
  const [editing, setEditing] = useState(false);
  if (editing)
    return (
      <Select
        className="inline-edit-select"
        value={value}
        ariaLabel={t("actions.editValue", { label })}
        options={options.map((option) => ({
          value: typeof option === "string" ? option : option.value,
          label: typeof option === "string" ? option : option.label,
        }))}
        onChange={(nextValue) => {
          onChange(nextValue);
          setEditing(false);
        }}
      />
    );
  return (
    <button
      className="inline-edit-trigger"
      type="button"
      aria-label={t("actions.editValue", { label })}
      onClick={() => setEditing(true)}
    >
      {renderValue(value)}
      <PenLine size={11} aria-hidden="true" />
    </button>
  );
}

export function InlineText({
  label,
  value,
  onSave,
}: {
  label: string;
  value: string;
  onSave: (value: string) => void;
}) {
  const { t } = useTranslation("common");
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    if (editing) {
      setDraft(value);
      inputRef.current?.focus();
    }
  }, [editing, value]);
  const save = () => {
    const cleanValue = draft.trim();
    if (cleanValue && cleanValue !== value) onSave(cleanValue);
    setEditing(false);
  };
  if (editing)
    return (
      <textarea
        ref={inputRef}
        className="inline-edit-textarea"
        aria-label={t("actions.editValue", { label })}
        value={draft}
        maxLength={1000}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={save}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            setDraft(value);
            setEditing(false);
          }
          if ((event.metaKey || event.ctrlKey) && event.key === "Enter") save();
        }}
      />
    );
  return (
    <button
      className="inline-edit-text"
      type="button"
      aria-label={t("actions.editValue", { label })}
      onClick={() => setEditing(true)}
    >
      <span>{value}</span>
      <PenLine size={12} aria-hidden="true" />
    </button>
  );
}

export function StatusPill({ status }: { status: IssueStatus }) {
  const { t } = useTranslation("common");
  const label =
    status === "Triage"
      ? t("data.issueStatus.triage")
      : status === "Backlog"
        ? t("data.issueStatus.backlog")
        : status === "Todo"
          ? t("data.issueStatus.todo")
          : status === "In Progress"
            ? t("data.issueStatus.inProgress")
            : status === "Review"
              ? t("data.issueStatus.review")
              : status === "Done"
                ? t("data.issueStatus.done")
                : t("data.issueStatus.canceled");
  return (
    <span
      className={`status-pill status-${status.toLowerCase().replace(" ", "-")}`}
    >
      <span />
      {label}
    </span>
  );
}

export function StatusRun({ status }: { status: CodingRun["status"] }) {
  const { t } = useTranslation("common");
  const label =
    status === "Completed"
      ? t("data.runStatus.completed")
      : status === "Running"
        ? t("data.runStatus.running")
        : status === "Failed"
          ? t("data.runStatus.failed")
          : status === "Canceled"
            ? t("data.runStatus.canceled")
            : status === "Approved"
              ? t("data.runStatus.approved")
              : t("data.runStatus.rejected");
  return (
    <span className={`run-status-text ${status.toLowerCase()}`}>
      <span />
      {label}
    </span>
  );
}

export function StatusArticle({
  status,
}: {
  status: KnowledgeArticle["status"];
}) {
  const { t } = useTranslation("common");
  const label =
    status === "Published"
      ? t("data.articleStatus.published")
      : t("data.articleStatus.draft");
  return (
    <span className={`article-status ${status.toLowerCase()}`}>{label}</span>
  );
}

export function Property({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="property">
      <span>{label}</span>
      {children}
    </div>
  );
}

export function SectionTitle({
  title,
  action,
}: {
  title: string;
  action?: ReactNode;
}) {
  return (
    <div className="section-title">
      <h3>{title}</h3>
      {action && <span className="section-action">{action}</span>}
    </div>
  );
}

export function ActivityItem({
  icon,
  title,
  detail,
}: {
  icon: ReactNode;
  title: string;
  detail: string;
}) {
  return (
    <div className="activity-item">
      <span className="activity-icon">{icon}</span>
      <div>
        <strong>{title}</strong>
        <span>{detail}</span>
      </div>
    </div>
  );
}

export function RunRow({
  run,
  onClick,
}: {
  run: CodingRun;
  onClick: () => void;
}) {
  return (
    <button className="run-row" type="button" onClick={onClick}>
      <div className={`run-status-dot ${run.status.toLowerCase()}`} />
      <div>
        <div>
          <strong>{run.mode}</strong>
          <span>{run.startedAt}</span>
        </div>
        <p>{run.summary}</p>
      </div>
      <ChevronRight size={15} />
    </button>
  );
}
