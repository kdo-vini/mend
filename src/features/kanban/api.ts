import type { Database } from "../../lib/database.types";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { supabase, type MendSupabaseClient } from "../../lib/supabase";
import {
  apiRequest,
  LiveActionError,
  mendApiBaseUrl,
  requireClient,
  unwrap,
} from "../../api/transport";

type Tables = Database["public"]["Tables"];
type PersonalTaskRow = Tables["personal_tasks"]["Row"];
type PersonalEventRow = Tables["personal_events"]["Row"];

export type PersonalTaskStatus = "todo" | "in_progress" | "done";

export interface PersonalTask {
  id: string;
  workspaceId: string;
  userId: string;
  title: string;
  notes: string | null;
  status: PersonalTaskStatus;
  dueOn: string | null;
  kanbanPosition: number;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PersonalEvent {
  id: string;
  workspaceId: string;
  userId: string;
  title: string;
  startsAt: string;
  endsAt: string | null;
  allDay: boolean;
  location: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface KanbanMoveInput {
  status: string;
  beforeId?: string | null;
  afterId?: string | null;
}

type KanbanRealtimeChange =
  | { table: "issues"; row: Record<string, unknown> }
  | {
      table: "personal_tasks" | "personal_events";
      row: Record<string, unknown>;
    };

export function subscribeToKanban(
  workspaceId: string,
  userId: string,
  onChange: (change: KanbanRealtimeChange) => void,
): () => void {
  const client = supabase;
  if (!client || !workspaceId || !userId) return () => undefined;
  let channel: RealtimeChannel | null = client.channel(
    `kanban:${workspaceId}:${userId}`,
  );
  const accepts = (payload: { new: unknown; old: unknown }) => {
    const row = (
      payload.new && Object.keys(payload.new).length ? payload.new : payload.old
    ) as Record<string, unknown>;
    return row.workspace_id === workspaceId && row.user_id === userId;
  };
  channel
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "issues",
        filter: `workspace_id=eq.${workspaceId}`,
      },
      (payload) =>
        onChange({
          table: "issues",
          row: (payload.new || payload.old) as Record<string, unknown>,
        }),
    )
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "personal_tasks",
        filter: `user_id=eq.${userId}`,
      },
      (payload) => {
        if (accepts(payload))
          onChange({
            table: "personal_tasks",
            row: (payload.new || payload.old) as Record<string, unknown>,
          });
      },
    )
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "personal_events",
        filter: `user_id=eq.${userId}`,
      },
      (payload) => {
        if (accepts(payload))
          onChange({
            table: "personal_events",
            row: (payload.new || payload.old) as Record<string, unknown>,
          });
      },
    )
    .subscribe();
  return () => {
    if (channel) {
      void client.removeChannel(channel);
      channel = null;
    }
  };
}

function taskFromRow(row: PersonalTaskRow): PersonalTask {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    userId: row.user_id,
    title: row.title,
    notes: row.notes,
    status: row.status as PersonalTaskStatus,
    dueOn: row.due_on,
    kanbanPosition: row.kanban_position,
    completedAt: row.completed_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function taskFromApi(value: Record<string, unknown>): PersonalTask {
  return {
    id: String(value.id),
    workspaceId: String(value.workspaceId ?? value.workspace_id),
    userId: String(value.userId ?? value.user_id),
    title: String(value.title),
    notes: (value.notes as string | null | undefined) ?? null,
    status: String(value.status) as PersonalTaskStatus,
    dueOn: (value.dueOn as string | null | undefined) ?? null,
    kanbanPosition: Number(value.kanbanPosition ?? value.kanban_position ?? 0),
    completedAt: (value.completedAt as string | null | undefined) ?? null,
    createdAt: String(value.createdAt ?? value.created_at),
    updatedAt: String(value.updatedAt ?? value.updated_at),
  };
}

function eventFromRow(row: PersonalEventRow): PersonalEvent {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    userId: row.user_id,
    title: row.title,
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    allDay: row.all_day,
    location: row.location,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function eventFromApi(value: Record<string, unknown>): PersonalEvent {
  return {
    id: String(value.id),
    workspaceId: String(value.workspaceId ?? value.workspace_id),
    userId: String(value.userId ?? value.user_id),
    title: String(value.title),
    startsAt: String(value.startsAt ?? value.starts_at),
    endsAt: (value.endsAt as string | null | undefined) ?? null,
    allDay: value.allDay === true || value.all_day === true,
    location: (value.location as string | null | undefined) ?? null,
    createdAt: String(value.createdAt ?? value.created_at),
    updatedAt: String(value.updatedAt ?? value.updated_at),
  };
}

export async function listPersonalTasks(
  workspaceId: string,
  filters: { from?: string; to?: string; status?: PersonalTaskStatus } = {},
  client: MendSupabaseClient | null = supabase,
): Promise<PersonalTask[]> {
  const params = new URLSearchParams();
  if (filters.from) params.set("from", filters.from);
  if (filters.to) params.set("to", filters.to);
  if (filters.status) params.set("status", filters.status);
  const path = `/api/personal-tasks${params.size ? `?${params}` : ""}`;
  if (mendApiBaseUrl) {
    const result = await apiRequest<{ data: Array<Record<string, unknown>> }>(
      path,
      {},
      workspaceId,
    );
    return (result.data ?? []).map(taskFromApi);
  }
  let query = requireClient(client)
    .from("personal_tasks")
    .select("*")
    .eq("workspace_id", workspaceId);
  if (filters.from) query = query.gte("due_on", filters.from);
  if (filters.to) query = query.lte("due_on", filters.to);
  if (filters.status) query = query.eq("status", filters.status);
  return (await unwrap(query.order("kanban_position").limit(100))).map(
    taskFromRow,
  );
}

export async function createPersonalTask(input: {
  workspaceId: string;
  title: string;
  notes?: string | null;
  status?: PersonalTaskStatus;
  dueOn?: string | null;
}): Promise<PersonalTask> {
  if (!input.title.trim()) throw new LiveActionError("Task title is required.");
  const body = {
    title: input.title.trim(),
    notes: input.notes?.trim() || null,
    status: input.status ?? "todo",
    dueOn: input.dueOn ?? null,
  };
  if (mendApiBaseUrl)
    return taskFromApi(
      await apiRequest<Record<string, unknown>>(
        "/api/personal-tasks",
        { method: "POST", body: JSON.stringify(body) },
        input.workspaceId,
      ),
    );
  const user = await requireClient(supabase).auth.getUser();
  if (!user.data.user)
    throw new LiveActionError("A signed-in user is required.");
  return taskFromRow(
    await unwrap(
      requireClient(supabase)
        .from("personal_tasks")
        .insert({
          workspace_id: input.workspaceId,
          user_id: user.data.user.id,
          title: body.title,
          notes: body.notes,
          status: body.status,
          due_on: body.dueOn,
        })
        .select("*")
        .single(),
    ),
  );
}

export async function updatePersonalTask(input: {
  workspaceId: string;
  taskId: string;
  patch: Partial<Pick<PersonalTask, "title" | "notes" | "status" | "dueOn">>;
}): Promise<PersonalTask> {
  const patch = {
    ...(input.patch.title !== undefined
      ? { title: input.patch.title.trim() }
      : {}),
    ...(input.patch.notes !== undefined ? { notes: input.patch.notes } : {}),
    ...(input.patch.status !== undefined ? { status: input.patch.status } : {}),
    ...(input.patch.dueOn !== undefined ? { dueOn: input.patch.dueOn } : {}),
  };
  if (mendApiBaseUrl)
    return taskFromApi(
      await apiRequest<Record<string, unknown>>(
        `/api/personal-tasks/${input.taskId}`,
        { method: "PATCH", body: JSON.stringify(patch) },
        input.workspaceId,
      ),
    );
  const updates: Tables["personal_tasks"]["Update"] = {
    ...(patch.title !== undefined ? { title: patch.title } : {}),
    ...(patch.notes !== undefined ? { notes: patch.notes } : {}),
    ...(patch.status !== undefined ? { status: patch.status } : {}),
    ...(patch.dueOn !== undefined ? { due_on: patch.dueOn } : {}),
  };
  return taskFromRow(
    await unwrap(
      requireClient(supabase)
        .from("personal_tasks")
        .update(updates)
        .eq("workspace_id", input.workspaceId)
        .eq("id", input.taskId)
        .select("*")
        .single(),
    ),
  );
}

export async function movePersonalTask(
  workspaceId: string,
  taskId: string,
  input: KanbanMoveInput,
): Promise<PersonalTask> {
  if (mendApiBaseUrl)
    return taskFromApi(
      await apiRequest<Record<string, unknown>>(
        `/api/personal-tasks/${taskId}/move`,
        { method: "POST", body: JSON.stringify(input) },
        workspaceId,
      ),
    );
  return updatePersonalTask({
    workspaceId,
    taskId,
    patch: { status: input.status as PersonalTaskStatus },
  });
}

export async function deletePersonalTask(workspaceId: string, taskId: string) {
  if (mendApiBaseUrl)
    return apiRequest<void>(
      `/api/personal-tasks/${taskId}`,
      { method: "DELETE" },
      workspaceId,
    );
  await unwrap(
    requireClient(supabase)
      .from("personal_tasks")
      .delete()
      .eq("workspace_id", workspaceId)
      .eq("id", taskId)
      .select("id")
      .single(),
  );
}

export async function listPersonalEvents(
  workspaceId: string,
  from: string,
  to: string,
  client: MendSupabaseClient | null = supabase,
): Promise<PersonalEvent[]> {
  const query = new URLSearchParams({ from, to });
  if (mendApiBaseUrl) {
    const result = await apiRequest<{ data: Array<Record<string, unknown>> }>(
      `/api/personal-events?${query}`,
      {},
      workspaceId,
    );
    return (result.data ?? []).map(eventFromApi);
  }
  return (
    await unwrap(
      requireClient(client)
        .from("personal_events")
        .select("*")
        .eq("workspace_id", workspaceId)
        .gte("starts_at", from)
        .lt("starts_at", to)
        .order("starts_at")
        .limit(100),
    )
  ).map(eventFromRow);
}

export async function createPersonalEvent(input: {
  workspaceId: string;
  title: string;
  startsAt: string;
  endsAt?: string | null;
  allDay?: boolean;
  location?: string | null;
}): Promise<PersonalEvent> {
  if (!input.title.trim())
    throw new LiveActionError("Event title is required.");
  const body = {
    title: input.title.trim(),
    startsAt: input.startsAt,
    endsAt: input.endsAt ?? null,
    allDay: input.allDay ?? false,
    location: input.location?.trim() || null,
  };
  if (mendApiBaseUrl)
    return eventFromApi(
      await apiRequest<Record<string, unknown>>(
        "/api/personal-events",
        { method: "POST", body: JSON.stringify(body) },
        input.workspaceId,
      ),
    );
  const user = await requireClient(supabase).auth.getUser();
  if (!user.data.user)
    throw new LiveActionError("A signed-in user is required.");
  return eventFromRow(
    await unwrap(
      requireClient(supabase)
        .from("personal_events")
        .insert({
          workspace_id: input.workspaceId,
          user_id: user.data.user.id,
          title: body.title,
          starts_at: body.startsAt,
          ends_at: body.endsAt,
          all_day: body.allDay,
          location: body.location,
        })
        .select("*")
        .single(),
    ),
  );
}

export async function updatePersonalEvent(input: {
  workspaceId: string;
  eventId: string;
  patch: Partial<
    Pick<PersonalEvent, "title" | "startsAt" | "endsAt" | "allDay" | "location">
  >;
}): Promise<PersonalEvent> {
  if (mendApiBaseUrl)
    return eventFromApi(
      await apiRequest<Record<string, unknown>>(
        `/api/personal-events/${input.eventId}`,
        { method: "PATCH", body: JSON.stringify(input.patch) },
        input.workspaceId,
      ),
    );
  const updates: Tables["personal_events"]["Update"] = {
    ...(input.patch.title !== undefined
      ? { title: input.patch.title.trim() }
      : {}),
    ...(input.patch.startsAt !== undefined
      ? { starts_at: input.patch.startsAt }
      : {}),
    ...(input.patch.endsAt !== undefined
      ? { ends_at: input.patch.endsAt }
      : {}),
    ...(input.patch.allDay !== undefined
      ? { all_day: input.patch.allDay }
      : {}),
    ...(input.patch.location !== undefined
      ? { location: input.patch.location }
      : {}),
  };
  return eventFromRow(
    await unwrap(
      requireClient(supabase)
        .from("personal_events")
        .update(updates)
        .eq("workspace_id", input.workspaceId)
        .eq("id", input.eventId)
        .select("*")
        .single(),
    ),
  );
}

export async function deletePersonalEvent(
  workspaceId: string,
  eventId: string,
) {
  if (mendApiBaseUrl)
    return apiRequest<void>(
      `/api/personal-events/${eventId}`,
      { method: "DELETE" },
      workspaceId,
    );
  await unwrap(
    requireClient(supabase)
      .from("personal_events")
      .delete()
      .eq("workspace_id", workspaceId)
      .eq("id", eventId)
      .select("id")
      .single(),
  );
}

export async function moveLiveIssue(input: {
  workspaceId: string;
  identifier: string;
  issueId: string;
  status: string;
  beforeId?: string | null;
  afterId?: string | null;
}) {
  if (mendApiBaseUrl)
    return apiRequest<Record<string, unknown>>(
      `/api/issues/${encodeURIComponent(input.identifier)}/move`,
      {
        method: "POST",
        body: JSON.stringify({
          status: input.status,
          beforeId: input.beforeId ?? null,
          afterId: input.afterId ?? null,
        }),
      },
      input.workspaceId,
    );
  return unwrap(
    requireClient(supabase)
      .from("issues")
      .update({
        status: input.status as never,
        completed_at: input.status === "done" ? new Date().toISOString() : null,
      })
      .eq("workspace_id", input.workspaceId)
      .eq("id", input.issueId)
      .select("*")
      .single(),
  );
}
