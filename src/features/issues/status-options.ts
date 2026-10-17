import type { TFunction } from "i18next";
import type { IssueStatus } from "../../types";

const statusKeys = {
  Triage: "triage",
  Backlog: "backlog",
  Todo: "todo",
  "In Progress": "inProgress",
  Review: "review",
  Done: "done",
  Canceled: "canceled",
} as const satisfies Record<IssueStatus, string>;

/** Issue status choices with translated labels; the value stays the domain status. */
export function issueStatusOptions(t: TFunction) {
  return (Object.keys(statusKeys) as IssueStatus[]).map((status) => ({
    value: status,
    label: t(`data.issueStatus.${statusKeys[status]}`, { ns: "common" }),
  }));
}
