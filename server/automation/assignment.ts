import type { LiveWorkerSupabaseClient } from "../live-worker.js";

export type ConversationAssignmentOutcome = {
  status:
    | "assigned"
    | "already_assigned"
    | "no_active_member"
    | "conversation_not_found";
  assigneeUserId?: string;
};

export async function assignConversationToActiveMember(
  client: LiveWorkerSupabaseClient,
  workspaceId: string,
  conversationId: string,
): Promise<ConversationAssignmentOutcome> {
  const result = await client.rpc("assign_unassigned_conversation", {
    p_workspace_id: workspaceId,
    p_conversation_id: conversationId,
  });
  if (result.error) throw new Error(result.error.message);

  const value = result.data;
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("workspace_assignment_invalid_result");
  const status = value.status;
  if (
    status !== "assigned" &&
    status !== "already_assigned" &&
    status !== "no_active_member" &&
    status !== "conversation_not_found"
  )
    throw new Error("workspace_assignment_invalid_status");
  const assigneeUserId = value.assignee_user_id;
  return {
    status,
    ...(typeof assigneeUserId === "string" ? { assigneeUserId } : {}),
  };
}
