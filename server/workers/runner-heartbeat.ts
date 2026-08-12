import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../../src/lib/database.types.js";

interface HeartbeatQuery {
  upsert(
    values: unknown,
    options?: { onConflict?: string },
  ): Promise<{ error: { message: string } | null }>;
}

/** Service-role writer for the runner's liveness and current-job checkpoint. */
export class SupabaseRunnerHeartbeat {
  constructor(private readonly client: SupabaseClient<Database>) {}

  async beat(input: {
    workerId: string;
    currentJobType?: string;
    currentJobId?: string;
  }): Promise<void> {
    const result = await (
      this.client as unknown as { from(name: string): HeartbeatQuery }
    )
      .from("runner_heartbeats")
      .upsert(
        {
          worker_id: input.workerId,
          last_seen_at: new Date().toISOString(),
          current_job_type: input.currentJobType ?? null,
          current_job_id: input.currentJobId ?? null,
        },
        { onConflict: "worker_id" },
      );
    if (result.error)
      throw new Error(`supabase:runner_heartbeats:${result.error.message}`);
  }
}
