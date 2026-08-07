import { useRef, useState, type KeyboardEvent } from "react";
import { useTranslation } from "react-i18next";
import {
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
import { Select } from "../../../shared/ui/Select";

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
      <Select
        ariaLabel={label}
        value={value}
        options={options.map((option) => ({
          value: typeof option === "string" ? option : option.value,
          label: typeof option === "string" ? option : option.label,
        }))}
        onChange={onChange}
      />
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
  const { t } = useTranslation(["issues", "common"]);
  const statusLabel = (status: IssueStatus) =>
    status === "Triage"
      ? t("data.issueStatus.triage", { ns: "common" })
      : status === "Backlog"
        ? t("data.issueStatus.backlog", { ns: "common" })
        : status === "Todo"
          ? t("data.issueStatus.todo", { ns: "common" })
          : status === "In Progress"
            ? t("data.issueStatus.inProgress", { ns: "common" })
            : status === "Review"
              ? t("data.issueStatus.review", { ns: "common" })
              : status === "Done"
                ? t("data.issueStatus.done", { ns: "common" })
                : t("data.issueStatus.canceled", { ns: "common" });
  const priorityLabel = (priority: Priority) =>
    priority === "Urgent"
      ? t("data.priority.urgent", { ns: "common" })
      : priority === "High"
        ? t("data.priority.high", { ns: "common" })
        : priority === "Medium"
          ? t("data.priority.medium", { ns: "common" })
          : priority === "Low"
            ? t("data.priority.low", { ns: "common" })
            : t("data.priority.noPriority", { ns: "common" });
  const typeLabel = (type: IssueType) => {
    switch (type) {
      case "Production Bug":
        return t("ui.types.productionBug");
      case "Bug":
        return t("ui.types.bug");
      case "Incident":
        return t("ui.types.incident");
      case "Feature":
        return t("ui.types.feature");
      case "Task":
        return t("ui.types.task");
      case "Billing":
        return t("ui.types.billing");
      case "Commercial":
        return t("ui.types.commercial");
      case "Question":
        return t("ui.types.question");
      default:
        return t("ui.types.other");
    }
  };
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<IssueStatus | "All">("All");
  const [priorityFilter, setPriorityFilter] = useState<Priority | "All">("All");
  const [typeFilter, setTypeFilter] = useState<IssueType | "All">("All");
  const [assigneeFilter, setAssigneeFilter] = useState("All");
  const [sourceFilter, setSourceFilter] = useState<Issue["source"] | "All">(
    "All",
  );
  const [labelFilter, setLabelFilter] = useState("All");
  const [agentFilter, setAgentFilter] = useState<
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
      (agentFilter === "All" ||
        (agentFilter === "With runs"
          ? issue.agentRuns > 0
          : issue.agentRuns === 0)),
  );
  const clearFilters = () => {
    setSearch("");
    setStatusFilter("All");
    setPriorityFilter("All");
    setTypeFilter("All");
    setAssigneeFilter("All");
    setSourceFilter("All");
    setLabelFilter("All");
    setAgentFilter("All");
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
        eyebrow={`${t("ui.eyebrow")} · ${issues.length}`}
        title={t("title")}
        description={t("ui.description")}
        actions={
          <button
            className="button button-primary"
            type="button"
            onClick={onNewIssue}
          >
            <Plus size={15} /> {t("create")} <kbd>C</kbd>
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
            placeholder={t("ui.search")}
            aria-label={t("ui.search")}
          />
          <kbd>{t("ui.shortcutCommand")}</kbd>
        </label>
        <div className="select-control">
          <ListFilter size={14} />
          <Select
            ariaLabel={t("ui.filterStatus")}
            value={statusFilter}
            options={[
              { value: "All", label: t("ui.allStatuses") },
              ...issueStatuses.map((status) => ({
                value: status,
                label: statusLabel(status),
              })),
            ]}
            onChange={(value) => setStatusFilter(value as IssueStatus | "All")}
          />
        </div>
        <FilterSelect
          label={t("ui.filterPriority")}
          value={priorityFilter}
          onChange={(value) => setPriorityFilter(value as Priority | "All")}
          options={[
            { value: "All", label: t("ui.all") },
            ...(
              ["Urgent", "High", "Medium", "Low", "No priority"] as Priority[]
            ).map((priority) => ({
              value: priority,
              label: priorityLabel(priority),
            })),
          ]}
        />
        <FilterSelect
          label={t("ui.filterType")}
          value={typeFilter}
          onChange={(value) => setTypeFilter(value as IssueType | "All")}
          options={[
            { value: "All", label: t("ui.all") },
            ...issueTypes.map((type) => ({
              value: type,
              label: typeLabel(type),
            })),
          ]}
        />
        <FilterSelect
          label={t("ui.filterAssignee")}
          value={assigneeFilter}
          onChange={setAssigneeFilter}
          options={[
            { value: "All", label: t("ui.allAssignees") },
            ...assigneeOptions,
          ]}
        />
        <FilterSelect
          label={t("ui.filterSource")}
          value={sourceFilter}
          onChange={(value) =>
            setSourceFilter(value as Issue["source"] | "All")
          }
          options={[
            { value: "All", label: t("ui.all") },
            { value: "Conversation", label: t("ui.conversation") },
            { value: "Internal", label: t("ui.internal") },
          ]}
        />
        <FilterSelect
          label={t("ui.filterLabel")}
          value={labelFilter}
          onChange={setLabelFilter}
          options={[
            { value: "All", label: t("ui.allLabels") },
            ...labelOptions,
          ]}
        />
        <FilterSelect
          label={t("ui.filterRuns")}
          value={agentFilter}
          onChange={(value) => setAgentFilter(value as typeof agentFilter)}
          options={[
            { value: "All", label: t("ui.all") },
            { value: "With runs", label: t("ui.withRuns") },
            { value: "Without runs", label: t("ui.withoutRuns") },
          ]}
        />
        <button
          className="button button-ghost"
          type="button"
          onClick={clearFilters}
        >
          <Filter size={15} /> {t("ui.clearFilters")}
        </button>
        <button
          className="icon-button"
          type="button"
          aria-label={t("ui.focusSearch")}
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
                <th>{t("ui.priority")}</th>
                <th>{t("ui.issue")}</th>
                <th>{t("ui.status")}</th>
                <th>{t("ui.assignee")}</th>
                <th>{t("ui.labels")}</th>
                <th>{t("ui.customer")}</th>
                <th>{t("ui.updated")}</th>
                <th className="actions-column">{t("ui.actions")}</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((issue) => (
                <tr
                  key={issue.id}
                  tabIndex={0}
                  role="button"
                  aria-label={t("ui.openIssue", {
                    identifier: issue.identifier,
                    title: issue.title,
                  })}
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
                      {issue.agentRuns > 0 && (
                        <span className="agent-mini">
                          <TerminalSquare size={11} /> {issue.agentRuns}
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
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <EmptyState
            title={issues.length ? t("ui.noMatching") : t("empty")}
            description={
              issues.length ? t("ui.tryDifferent") : t("ui.firstIssue")
            }
            action={
              issues.length ? (
                <button
                  className="text-button"
                  type="button"
                  onClick={clearFilters}
                >
                  {t("ui.clearFilters")}
                </button>
              ) : (
                <button
                  className="button button-ghost button-small"
                  type="button"
                  onClick={onNewIssue}
                >
                  <Plus size={13} /> {t("create")}
                </button>
              )
            }
            search={Boolean(search)}
          />
        )}
      </div>
      <div className="table-footer">
        <span>
          {t("ui.footerCount", {
            filtered: filtered.length,
            total: issues.length,
          })}
        </span>
        <span>
          <Keyboard size={13} /> {t("ui.shortcuts")}
        </span>
      </div>
    </div>
  );
}
