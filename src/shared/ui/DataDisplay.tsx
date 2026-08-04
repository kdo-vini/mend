import { useEffect, useRef, useState, type ReactNode } from "react";
import { ChevronRight, PenLine } from "lucide-react";
import type {
  CodingRun,
  IssueStatus,
  KnowledgeArticle,
  Priority,
} from "../../types";

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
      {showLabel && priority}
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
  const [editing, setEditing] = useState(false);
  const selectRef = useRef<HTMLSelectElement>(null);
  useEffect(() => {
    if (editing) selectRef.current?.focus();
  }, [editing]);
  if (editing)
    return (
      <select
        ref={selectRef}
        className="inline-edit-select"
        aria-label={`Edit ${label}`}
        value={value}
        onChange={(event) => {
          onChange(event.target.value);
          setEditing(false);
        }}
        onBlur={() => setEditing(false)}
        onKeyDown={(event) => {
          if (event.key === "Escape") setEditing(false);
        }}
      >
        {options.map((option) => (
          <option
            key={typeof option === "string" ? option : option.value}
            value={typeof option === "string" ? option : option.value}
          >
            {typeof option === "string" ? option : option.label}
          </option>
        ))}
      </select>
    );
  return (
    <button
      className="inline-edit-trigger"
      type="button"
      aria-label={`Edit ${label}`}
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
        aria-label={`Edit ${label}`}
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
      aria-label={`Edit ${label}`}
      onClick={() => setEditing(true)}
    >
      <span>{value}</span>
      <PenLine size={12} aria-hidden="true" />
    </button>
  );
}

export function StatusPill({ status }: { status: IssueStatus }) {
  return (
    <span
      className={`status-pill status-${status.toLowerCase().replace(" ", "-")}`}
    >
      <span />
      {status}
    </span>
  );
}

export function StatusRun({ status }: { status: CodingRun["status"] }) {
  return (
    <span className={`run-status-text ${status.toLowerCase()}`}>
      <span />
      {status}
    </span>
  );
}

export function StatusArticle({
  status,
}: {
  status: KnowledgeArticle["status"];
}) {
  return (
    <span className={`article-status ${status.toLowerCase()}`}>{status}</span>
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
