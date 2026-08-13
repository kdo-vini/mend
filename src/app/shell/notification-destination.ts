import type { WorkspaceNotification } from "../../api/notifications";
import type { Issue } from "../../types";

// i18n-exempt: route destinations only; no user-facing copy.

export function notificationDestination(
  notification: WorkspaceNotification,
  issues: Issue[],
): string {
  const entityId = notification.entity_id;
  if (notification.entity_type === "conversation" && entityId)
    return `/inbox?conversation=${encodeURIComponent(entityId)}`;
  if (notification.entity_type === "issue" && entityId) {
    const issue = issues.find(
      (candidate) =>
        candidate.id === entityId || candidate.identifier === entityId,
    );
    return issue
      ? `/issues/${encodeURIComponent(issue.identifier)}`
      : "/issues";
  }
  if (
    (notification.entity_type === "agent_run" ||
      notification.entity_type === "run") &&
    entityId
  )
    return `/agent-runs?run=${encodeURIComponent(entityId)}`;
  return "/inbox";
}
