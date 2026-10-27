import type { Database } from "../src/lib/database.types.js";
import {
  InMemoryJobStore,
  JobLeaseLostError,
  jobLeaseMs,
  redactJobError,
  type ClaimOptions,
  type EnqueueJobInput,
  type JobRecord,
  type JobStore,
} from "./jobs.js";
import type { MendServerSupabaseClient } from "./supabase.js";

type Tables = Database["public"]["Tables"];
type JobRow = Tables["jobs"]["Row"] & {
  max_attempts?: number;
  dedupe_key?: string | null;
};

function requireData<T>(data: T | null, error: { message: string } | null): T {
  if (error) throw new Error(error.message);
  if (data === null) throw new Error("Supabase returned no data");
  return data;
}

function toJob<TPayload>(row: JobRow): JobRecord<TPayload> {
  return {
    id: row.id,
    ...(row.workspace_id ? { workspaceId: row.workspace_id } : {}),
    type: row.type,
    payload: row.payload as TPayload,
    status: row.status as JobRecord["status"],
    attempts: row.attempts,
    maxAttempts: row.max_attempts ?? 5,
    availableAt: new Date(row.available_at),
    ...(row.locked_at ? { lockedAt: new Date(row.locked_at) } : {}),
    ...(row.locked_by ? { lockedBy: row.locked_by } : {}),
    ...(row.last_error ? { lastError: row.last_error } : {}),
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
    ...(row.dedupe_key ? { dedupeKey: row.dedupe_key } : {}),
  };
}

/** In-memory fallback is only for local dev/tests; production must be durable. */
export function createMessageJobStore<TPayload = Record<string, unknown>>(
  client: MendServerSupabaseClient | null,
  env: NodeJS.ProcessEnv = process.env,
): SupabaseJobStore<TPayload> | InMemoryJobStore<TPayload> {
  if (client) return new SupabaseJobStore<TPayload>(client);
  if (env.NODE_ENV === "production")
    throw new Error(
      "durable_job_store_required: set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (in-memory jobs would lose messages)",
    );
  return new InMemoryJobStore<TPayload>();
}

export class SupabaseJobStore<TPayload = Record<string, unknown>>
  implements JobStore<TPayload>
{
  constructor(private readonly client: MendServerSupabaseClient) {}

  async enqueue(
    input: EnqueueJobInput<TPayload>,
  ): Promise<JobRecord<TPayload>> {
    const insert = {
      ...(input.workspaceId ? { workspace_id: input.workspaceId } : {}),
      type: input.type,
      payload: input.payload,
      status: "queued",
      attempts: 0,
      max_attempts: Math.max(1, input.maxAttempts ?? 5),
      available_at: (input.availableAt ?? new Date()).toISOString(),
      dedupe_key: input.dedupeKey ?? null,
    } as unknown as Tables["jobs"]["Insert"];
    const { data, error } = await this.client
      .from("jobs")
      .insert(insert)
      .select("*")
      .single();
    if (error && input.dedupeKey) {
      let existingQuery = this.client
        .from("jobs")
        .select("*")
        .eq("dedupe_key" as never, input.dedupeKey)
        .in("status", ["queued", "running"]);
      existingQuery = input.workspaceId
        ? existingQuery.eq("workspace_id" as never, input.workspaceId)
        : existingQuery.is("workspace_id" as never, null);
      const existing = await existingQuery
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle();
      if (!existing.error && existing.data)
        return toJob<TPayload>(existing.data as unknown as JobRow);
    }
    return toJob<TPayload>(
      requireData(data as unknown as JobRow | null, error),
    );
  }

  async claim(
    workerId: string,
    _now?: Date,
    options?: ClaimOptions,
  ): Promise<JobRecord<TPayload> | null> {
    const rpc = this.client.rpc as unknown as (
      name: string,
      args: Record<string, unknown>,
    ) => Promise<{ data: unknown; error: { message: string } | null }>;
    const result = await rpc.call(this.client, "claim_next_job", {
      worker_id: workerId,
      lease_seconds: Math.ceil((options?.leaseMs ?? jobLeaseMs()) / 1_000),
      ...(options?.types ? { include_types: [...options.types] } : {}),
      ...(options?.excludeTypes
        ? { exclude_types: [...options.excludeTypes] }
        : {}),
    });
    if (result.error) throw new Error(result.error.message);
    const rows = Array.isArray(result.data) ? result.data : [];
    return rows[0] ? toJob<TPayload>(rows[0] as JobRow) : null;
  }

  async complete(
    jobId: string,
    workerId?: string,
    now = new Date(),
  ): Promise<void> {
    if (!workerId) throw new JobLeaseLostError(jobId);
    const rpc = this.client.rpc as unknown as (
      name: string,
      args: Record<string, unknown>,
    ) => Promise<{
      data: unknown;
      error: { message: string; code?: string } | null;
    }>;
    const result = await rpc.call(this.client, "complete_job", {
      p_job_id: jobId,
      p_worker_id: workerId,
      p_completed_at: now.toISOString(),
    });
    if (result.error) {
      if (
        result.error.code === "55000" ||
        result.error.message.includes("job_lease_lost")
      )
        throw new JobLeaseLostError(jobId);
      throw new Error(result.error.message);
    }
    if (!result.data) throw new JobLeaseLostError(jobId);
  }

  async fail(
    jobId: string,
    error: unknown,
    now = new Date(),
    workerId?: string,
  ): Promise<JobRecord<TPayload> | null> {
    if (!workerId) throw new JobLeaseLostError(jobId);
    const rpc = this.client.rpc as unknown as (
      name: string,
      args: Record<string, unknown>,
    ) => Promise<{
      data: unknown;
      error: { message: string; code?: string } | null;
    }>;
    const result = await rpc.call(this.client, "fail_job", {
      p_job_id: jobId,
      p_worker_id: workerId,
      p_error: redactJobError(error),
      p_failed_at: now.toISOString(),
    });
    if (result.error) {
      if (
        result.error.code === "55000" ||
        result.error.message.includes("job_lease_lost")
      )
        throw new JobLeaseLostError(jobId);
      throw new Error(result.error.message);
    }
    const row = Array.isArray(result.data) ? result.data[0] : result.data;
    return row ? toJob<TPayload>(row as JobRow) : null;
  }

  async listDeadLetters(): Promise<JobRecord<TPayload>[]> {
    const { data, error } = await this.client
      .from("jobs")
      .select("*")
      .eq("status", "dead")
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return (data as unknown as JobRow[]).map((row) => toJob<TPayload>(row));
  }

  async list(): Promise<JobRecord<TPayload>[]> {
    const { data, error } = await this.client
      .from("jobs")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) throw new Error(error.message);
    return (data as unknown as JobRow[]).map((row) => toJob<TPayload>(row));
  }
}
