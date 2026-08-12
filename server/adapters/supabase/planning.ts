import { type RequestContext } from "../../contracts/api-ports.js";
import {
  type KanbanIssuePort,
  type KanbanMoveInput,
  type PersonalEventCreateInput,
  type PersonalEventListQuery,
  type PersonalEventPatchInput,
  type PersonalPlanningPort,
  type PersonalTaskCreateInput,
  type PersonalTaskListQuery,
  type PersonalTaskPatchInput,
} from "../../kanban-service.js";
import type { AnySupabaseClient } from "./types.js";
import { checked, row, rows, str, type Row } from "../supabase-mappers.js";
import { SupabaseIssueAdapter } from "./issues.js";
type KanbanTable = "issues" | "personal_tasks";
function personalTaskRecord(value: Row) {
  return {
    id: str(value.id),
    workspaceId: str(value.workspace_id),
    userId: str(value.user_id),
    title: str(value.title),
    notes: value.notes == null ? null : str(value.notes),
    status: str(value.status),
    dueOn: value.due_on == null ? null : str(value.due_on),
    kanbanPosition: Number(value.kanban_position ?? 0),
    completedAt: value.completed_at == null ? null : str(value.completed_at),
    createdAt: str(value.created_at),
    updatedAt: str(value.updated_at),
  };
}

function personalEventRecord(value: Row) {
  return {
    id: str(value.id),
    workspaceId: str(value.workspace_id),
    userId: str(value.user_id),
    title: str(value.title),
    startsAt: str(value.starts_at),
    endsAt: value.ends_at == null ? null : str(value.ends_at),
    allDay: value.all_day === true,
    location: value.location == null ? null : str(value.location),
    createdAt: str(value.created_at),
    updatedAt: str(value.updated_at),
  };
}

async function rebalanceBoard(
  client: AnySupabaseClient,
  table: KanbanTable,
  workspaceId: string,
  status: string,
  userId?: string,
) {
  let query = client
    .from(table as never)
    .select("id")
    .eq("workspace_id", workspaceId)
    .eq("status", status)
    .order("kanban_position", { ascending: true });
  if (userId) query = query.eq("user_id", userId);
  const records = rows(checked(`kanban.${table}.rebalance.list`, await query));
  for (const [index, record] of records.entries()) {
    const recordId = str((record as Record<string, unknown>).id);
    let update = client
      .from(table as never)
      .update({ kanban_position: (index + 1) * 1024 })
      .eq("id", recordId)
      .eq("workspace_id", workspaceId);
    if (userId) update = update.eq("user_id", userId);
    checked(`kanban.${table}.rebalance.update`, await update);
  }
}

async function boardPosition(
  client: AnySupabaseClient,
  table: KanbanTable,
  workspaceId: string,
  status: string,
  beforeId: string | null | undefined,
  afterId: string | null | undefined,
  currentId: string,
  userId?: string,
): Promise<number> {
  const neighborIds = [beforeId, afterId].filter((value): value is string =>
    Boolean(value),
  );
  let neighborsQuery = client
    .from(table as never)
    .select("id,kanban_position,status")
    .eq("workspace_id", workspaceId)
    .in("id", neighborIds);
  if (userId) neighborsQuery = neighborsQuery.eq("user_id", userId);
  const neighborRows = rows(
    checked(`kanban.${table}.neighbors`, await neighborsQuery),
  );
  if (neighborRows.length !== neighborIds.length)
    throw new Error("kanban_order_conflict");
  const byId = new Map(neighborRows.map((value) => [str(value.id), value]));
  const before = beforeId ? byId.get(beforeId) : undefined;
  const after = afterId ? byId.get(afterId) : undefined;
  if (
    (before && str(before.status) !== status) ||
    (after && str(after.status) !== status) ||
    beforeId === currentId ||
    afterId === currentId ||
    (before &&
      after &&
      Number(before.kanban_position) >= Number(after.kanban_position))
  )
    throw new Error("kanban_order_conflict");

  if (before && after) {
    const beforePosition = Number(before.kanban_position);
    const afterPosition = Number(after.kanban_position);
    if (afterPosition - beforePosition < 0.000001) {
      await rebalanceBoard(client, table, workspaceId, status, userId);
      return boardPosition(
        client,
        table,
        workspaceId,
        status,
        beforeId,
        afterId,
        currentId,
        userId,
      );
    }
    return (beforePosition + afterPosition) / 2;
  }
  if (before) return Number(before.kanban_position) + 1024;
  if (after) return Number(after.kanban_position) - 1024;

  let lastQuery = client
    .from(table as never)
    .select("kanban_position")
    .eq("workspace_id", workspaceId)
    .eq("status", status)
    .neq("id", currentId)
    .order("kanban_position", { ascending: false })
    .limit(1);
  if (userId) lastQuery = lastQuery.eq("user_id", userId);
  const last = rows(checked(`kanban.${table}.last`, await lastQuery))[0];
  return last ? Number(last.kanban_position) + 1024 : 1024;
}

export class SupabaseKanbanAdapter implements KanbanIssuePort {
  constructor(
    private readonly client: AnySupabaseClient,
    private readonly issues: SupabaseIssueAdapter,
  ) {}

  async move(
    context: RequestContext,
    identifier: string,
    input: KanbanMoveInput,
  ) {
    const currentResult = await this.client
      .from("issues")
      .select("id, status")
      .eq("workspace_id", context.workspaceId)
      .eq("identifier", identifier)
      .maybeSingle();
    const current = checked("issues.kanban.get", currentResult);
    if (!current) return null;
    const position = await boardPosition(
      this.client,
      "issues",
      context.workspaceId,
      input.status,
      input.beforeId,
      input.afterId,
      str((current as Record<string, unknown>).id),
    );
    checked(
      "issues.kanban.move",
      await this.client
        .from("issues")
        .update({
          status: input.status,
          kanban_position: position,
          completed_at:
            input.status === "done" ? new Date().toISOString() : null,
          updated_at: new Date().toISOString(),
        })
        .eq("workspace_id", context.workspaceId)
        .eq("id", (current as Record<string, unknown>).id),
    );
    return this.issues.get(context, identifier);
  }
}

export class SupabasePersonalPlanningAdapter implements PersonalPlanningPort {
  constructor(private readonly client: AnySupabaseClient) {}

  async listTasks(context: RequestContext, query: PersonalTaskListQuery) {
    let request = this.client
      .from("personal_tasks")
      .select("*")
      .eq("workspace_id", context.workspaceId)
      .eq("user_id", context.userId);
    if (query.status) request = request.eq("status", query.status);
    if (query.from) request = request.gte("due_on", query.from);
    if (query.to) request = request.lte("due_on", query.to);
    if (query.cursor) request = request.gt("id", query.cursor);
    const result = await request
      .order("kanban_position", { ascending: true })
      .limit(query.limit);
    return rows(checked("personal_tasks.list", result)).map(personalTaskRecord);
  }

  async createTask(context: RequestContext, input: PersonalTaskCreateInput) {
    const last = await this.client
      .from("personal_tasks")
      .select("kanban_position")
      .eq("workspace_id", context.workspaceId)
      .eq("user_id", context.userId)
      .eq("status", input.status)
      .order("kanban_position", { ascending: false })
      .limit(1);
    const lastRow = rows(checked("personal_tasks.last", last))[0];
    const now = new Date().toISOString();
    const result = await this.client
      .from("personal_tasks")
      .insert({
        workspace_id: context.workspaceId,
        user_id: context.userId,
        title: input.title,
        notes: input.notes ?? null,
        status: input.status,
        due_on: input.dueOn ?? null,
        kanban_position: lastRow
          ? Number(lastRow.kanban_position) + 1024
          : 1024,
        completed_at: input.status === "done" ? now : null,
        created_at: now,
        updated_at: now,
      })
      .select("*")
      .single();
    return personalTaskRecord(row(checked("personal_tasks.create", result)));
  }

  async updateTask(
    context: RequestContext,
    taskId: string,
    input: PersonalTaskPatchInput,
  ) {
    const updates: Row = {};
    if (input.title !== undefined) updates.title = input.title;
    if (input.notes !== undefined) updates.notes = input.notes;
    if (input.status !== undefined) {
      updates.status = input.status;
      updates.completed_at =
        input.status === "done" ? new Date().toISOString() : null;
    }
    if (input.dueOn !== undefined) updates.due_on = input.dueOn;
    updates.updated_at = new Date().toISOString();
    const result = await this.client
      .from("personal_tasks")
      .update(updates)
      .eq("workspace_id", context.workspaceId)
      .eq("user_id", context.userId)
      .eq("id", taskId)
      .select("*")
      .maybeSingle();
    const value = checked("personal_tasks.update", result);
    return value ? personalTaskRecord(row(value)) : null;
  }

  async moveTask(
    context: RequestContext,
    taskId: string,
    input: KanbanMoveInput,
  ) {
    const currentResult = await this.client
      .from("personal_tasks")
      .select("id")
      .eq("workspace_id", context.workspaceId)
      .eq("user_id", context.userId)
      .eq("id", taskId)
      .maybeSingle();
    const current = checked("personal_tasks.kanban.get", currentResult);
    if (!current) return null;
    const position = await boardPosition(
      this.client,
      "personal_tasks",
      context.workspaceId,
      input.status,
      input.beforeId,
      input.afterId,
      taskId,
      context.userId,
    );
    const result = await this.client
      .from("personal_tasks")
      .update({
        status: input.status,
        kanban_position: position,
        completed_at: input.status === "done" ? new Date().toISOString() : null,
        updated_at: new Date().toISOString(),
      })
      .eq("workspace_id", context.workspaceId)
      .eq("user_id", context.userId)
      .eq("id", taskId)
      .select("*")
      .maybeSingle();
    const value = checked("personal_tasks.move", result);
    return value ? personalTaskRecord(row(value)) : null;
  }

  async removeTask(context: RequestContext, taskId: string) {
    const result = await this.client
      .from("personal_tasks")
      .delete()
      .eq("workspace_id", context.workspaceId)
      .eq("user_id", context.userId)
      .eq("id", taskId)
      .select("id");
    return rows(checked("personal_tasks.delete", result)).length > 0;
  }

  async listEvents(context: RequestContext, query: PersonalEventListQuery) {
    const result = await this.client
      .from("personal_events")
      .select("*")
      .eq("workspace_id", context.workspaceId)
      .eq("user_id", context.userId)
      .gte("starts_at", query.from)
      .lt("starts_at", query.to)
      .order("starts_at", { ascending: true })
      .limit(query.limit);
    return rows(checked("personal_events.list", result)).map(
      personalEventRecord,
    );
  }

  async createEvent(context: RequestContext, input: PersonalEventCreateInput) {
    const now = new Date().toISOString();
    const result = await this.client
      .from("personal_events")
      .insert({
        workspace_id: context.workspaceId,
        user_id: context.userId,
        title: input.title,
        starts_at: input.startsAt,
        ends_at: input.endsAt ?? null,
        all_day: input.allDay,
        location: input.location ?? null,
        created_at: now,
        updated_at: now,
      })
      .select("*")
      .single();
    return personalEventRecord(row(checked("personal_events.create", result)));
  }

  async updateEvent(
    context: RequestContext,
    eventId: string,
    input: PersonalEventPatchInput,
  ) {
    const updates: Row = {};
    if (input.title !== undefined) updates.title = input.title;
    if (input.startsAt !== undefined) updates.starts_at = input.startsAt;
    if (input.endsAt !== undefined) updates.ends_at = input.endsAt;
    if (input.allDay !== undefined) updates.all_day = input.allDay;
    if (input.location !== undefined) updates.location = input.location;
    updates.updated_at = new Date().toISOString();
    const result = await this.client
      .from("personal_events")
      .update(updates)
      .eq("workspace_id", context.workspaceId)
      .eq("user_id", context.userId)
      .eq("id", eventId)
      .select("*")
      .maybeSingle();
    const value = checked("personal_events.update", result);
    return value ? personalEventRecord(row(value)) : null;
  }

  async removeEvent(context: RequestContext, eventId: string) {
    const result = await this.client
      .from("personal_events")
      .delete()
      .eq("workspace_id", context.workspaceId)
      .eq("user_id", context.userId)
      .eq("id", eventId)
      .select("id");
    return rows(checked("personal_events.delete", result)).length > 0;
  }
}
