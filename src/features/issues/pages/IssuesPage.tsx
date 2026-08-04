import { useRef, useState, type KeyboardEvent } from "react";
import {
  ChevronDown,
  Filter,
  Keyboard,
  ListFilter,
  MoreHorizontal,
  PenLine,
  Plus,
  Search,
  TerminalSquare,
  Trash2,
} from "lucide-react";
import type { Issue, IssueStatus, IssueType, Priority } from "../../../types";
import { normalizeSearch } from "../../../shared/lib/format";
import { ActionMenu } from "../../../shared/ui/ActionMenu";
import {
  AssigneeOption,
  PriorityDot,
  StatusPill,
} from "../../../shared/ui/DataDisplay";
import { EmptyState } from "../../../shared/ui/ResourceState";
import { PageHeader } from "../../../shared/ui/PageHeader";

const issueStatuses: IssueStatus[] = [
  "Triage",
  "Backlog",
  "Todo",
  "In Progress",
  "Review",
  "Done",
  "Canceled",
];

const issueTypes: IssueType[] = [
  "Production Bug",
  "Bug",
  "Incident",
  "Feature",
  "Task",
  "Billing",
  "Commercial",
  "Question",
  "Other",
];

function FilterSelect({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: Array<string | AssigneeOption>;
  onChange: (value: string) => void;
}) {
  return (
    <div className="select-control">
      <select
        aria-label={label}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      >
        {options.map((option) => {
          const optionValue =
            typeof option === "string" ? option : option.value;
          const optionLabel =
            typeof option === "string" ? option : option.label;
          return (
            <option key={optionValue} value={optionValue}>
              {optionLabel}
            </option>
          );
        })}
      </select>
      <ChevronDown size={14} aria-hidden="true" />
    </div>
  );
}

export function IssuesPage({
  issues,
  assigneeOptions,
  assigneeLabel,
  onOpenIssue,
  onNewIssue,
  onEditIssue,
  onDeleteIssue,
}: {
  issues: Issue[];
  assigneeOptions: AssigneeOption[];
  assigneeLabel: (value: string) => string;
  onOpenIssue: (id: string) => void;
  onNewIssue: () => void;
  onEditIssue: (id: string) => void;
  onDeleteIssue: (id: string) => void;
}) {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<IssueStatus | "All">("All");
  const [priorityFilter, setPriorityFilter] = useState<Priority | "All">("All");
  const [typeFilter, setTypeFilter] = useState<IssueType | "All">("All");
  const [assigneeFilter, setAssigneeFilter] = useState("All");
  const [sourceFilter, setSourceFilter] = useState<Issue["source"] | "All">(
    "All",
  );
  const [labelFilter, setLabelFilter] = useState("All");
  const [codexFilter, setCodexFilter] = useState<
    "All" | "With runs" | "Without runs"
  >("All");
  const searchRef = useRef<HTMLInputElement>(null);
  const labelOptions = [
    ...new Set(issues.flatMap((issue) => issue.labels)),
  ].sort();
  const filtered = issues.filter(
    (issue) =>
      normalizeSearch(
        `${issue.identifier} ${issue.title} ${issue.customer ?? ""} ${issue.assignee} ${issue.labels.join(" ")}`,
      ).includes(normalizeSearch(search)) &&
      (statusFilter === "All" || issue.status === statusFilter) &&
      (priorityFilter === "All" || issue.priority === priorityFilter) &&
      (typeFilter === "All" || issue.type === typeFilter) &&
      (assigneeFilter === "All" || issue.assignee === assigneeFilter) &&
      (sourceFilter === "All" || issue.source === sourceFilter) &&
      (labelFilter === "All" || issue.labels.includes(labelFilter)) &&
      (codexFilter === "All" ||
        (codexFilter === "With runs"
          ? issue.codexRuns > 0
          : issue.codexRuns === 0)),
  );
  const clearFilters = () => {
    setSearch("");
    setStatusFilter("All");
    setPriorityFilter("All");
    setTypeFilter("All");
    setAssigneeFilter("All");
    setSourceFilter("All");
    setLabelFilter("All");
    setCodexFilter("All");
  };
  const openOnKeyboard = (
    event: KeyboardEvent<HTMLTableRowElement>,
    id: string,
  ) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onOpenIssue(id);
    }
  };

  return (
    <div className="page">
      <PageHeader
        eyebrow={`Work tracker · ${issues.length} issues`}
        title="Issues"
        description="The internal work queue built from conversations and engineering follow-up."
        actions={
          <button
            className="button button-primary"
            type="button"
            onClick={onNewIssue}
          >
            <Plus size={15} /> New issue <kbd>C</kbd>
          </button>
        }
      />
      <div className="issue-toolbar">
        <label className="search-field">
          <Search size={15} />
          <input
            ref={searchRef}
            data-global-search
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search issues"
            aria-label="Search issues"
          />
          <kbd>⌘ K</kbd>
        </label>
        <div className="select-control">
          <ListFilter size={14} />
          <select
            aria-label="Filter issues by status"
            value={statusFilter}
            onChange={(event) =>
              setStatusFilter(event.target.value as IssueStatus | "All")
            }
          >
            <option value="All">All statuses</option>
            {issueStatuses.map((status) => (
              <option key={status}>{status}</option>
            ))}
          </select>
          <ChevronDown size={14} />
        </div>
        <FilterSelect
          label="Filter issues by priority"
          value={priorityFilter}
          onChange={(value) => setPriorityFilter(value as Priority | "All")}
          options={["All", "Urgent", "High", "Medium", "Low", "No priority"]}
        />
        <FilterSelect
          label="Filter issues by type"
          value={typeFilter}
          onChange={(value) => setTypeFilter(value as IssueType | "All")}
          options={["All", ...issueTypes]}
        />
        <FilterSelect
          label="Filter issues by assignee"
          value={assigneeFilter}
          onChange={setAssigneeFilter}
          options={[
            { value: "All", label: "All assignees" },
            ...assigneeOptions,
          ]}
        />
        <FilterSelect
          label="Filter issues by source"
          value={sourceFilter}
          onChange={(value) =>
            setSourceFilter(value as Issue["source"] | "All")
          }
          options={["All", "Conversation", "Internal"]}
        />
        <FilterSelect
          label="Filter issues by label"
          value={labelFilter}
          onChange={setLabelFilter}
          options={[{ value: "All", label: "All labels" }, ...labelOptions]}
        />
        <FilterSelect
          label="Filter issues by Codex runs"
          value={codexFilter}
          onChange={(value) => setCodexFilter(value as typeof codexFilter)}
          options={["All", "With runs", "Without runs"]}
        />
        <button
          className="button button-ghost"
          type="button"
          onClick={clearFilters}
        >
          <Filter size={15} /> Clear filters
        </button>
        <button
          className="icon-button"
          type="button"
          aria-label="Focus issue search"
          onClick={() => searchRef.current?.focus()}
        >
          <MoreHorizontal size={17} />
        </button>
      </div>
      <div className="issue-table-wrap">
        {filtered.length ? (
          <table className="issue-table">
            <thead>
              <tr>
                <th>Priority</th>
                <th>Issue</th>
                <th>Status</th>
                <th>Assignee</th>
                <th>Labels</th>
                <th>Customer</th>
                <th>Updated</th>
                <th className="actions-column">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((issue) => (
                <tr
                  key={issue.id}
                  tabIndex={0}
                  role="button"
                  aria-label={`Open ${issue.identifier}: ${issue.title}`}
                  onKeyDown={(event) => openOnKeyboard(event, issue.id)}
                  onClick={() => onOpenIssue(issue.id)}
                >
                  <td>
                    <PriorityDot priority={issue.priority} showLabel />
                  </td>
                  <td>
                    <div className="issue-title-cell">
                      <span className="issue-id">{issue.identifier}</span>
                      <strong>{issue.title}</strong>
                      {issue.codexRuns > 0 && (
                        <span className="codex-mini">
                          <TerminalSquare size={11} /> {issue.codexRuns}
                        </span>
                      )}
                    </div>
                  </td>
                  <td>
                    <StatusPill status={issue.status} />
                  </td>
                  <td>
                    <div className="assignee-cell">
                      <div className="avatar avatar-mini avatar-neutral">
                        {issue.assignee === "Unassigned"
                          ? "?"
                          : assigneeLabel(issue.assignee)
                              .slice(0, 2)
                              .toUpperCase()}
                      </div>
                      {assigneeLabel(issue.assignee)}
                    </div>
                  </td>
                  <td>
                    <div className="labels-cell">
                      {issue.labels.slice(0, 2).map((label) => (
                        <span key={label} className="label-pill">
                          {label}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td className="customer-cell">
                    {issue.customer ?? "Internal"}
                  </td>
                  <td className="updated-cell">{issue.updatedAt}</td>
                  <td className="actions-cell">
                    <ActionMenu label={issue.identifier}>
                      <button
                        type="button"
                        role="menuitem"
                        onClick={() => onEditIssue(issue.id)}
                      >
                        <PenLine size={14} /> Edit issue
                      </button>
                      <button
                        className="danger"
                        type="button"
                        role="menuitem"
                        onClick={() => onDeleteIssue(issue.id)}
                      >
                        <Trash2 size={14} /> Delete issue
                      </button>
                    </ActionMenu>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <EmptyState
            title={issues.length ? "No matching issues" : "No issues yet"}
            description={
              issues.length
                ? "Try a different query or clear the filter."
                : "Create the first internal work item from a conversation or directly."
            }
            action={
              issues.length ? (
                <button
                  className="text-button"
                  type="button"
                  onClick={clearFilters}
                >
                  Clear filters
                </button>
              ) : (
                <button
                  className="button button-ghost button-small"
                  type="button"
                  onClick={onNewIssue}
                >
                  <Plus size={13} /> New issue
                </button>
              )
            }
            search={Boolean(search)}
          />
        )}
      </div>
      <div className="table-footer">
        <span>
          {filtered.length} of {issues.length} issues
        </span>
        <span>
          <Keyboard size={13} /> C create · E edit · A assign · P priority · S
          status
        </span>
      </div>
    </div>
  );
}
