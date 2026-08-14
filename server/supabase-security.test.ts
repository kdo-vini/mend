import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const migrationPath = fileURLToPath(
  new URL(
    "../supabase/migrations/20260803212748_security_jobs_rls_grants_realtime_hardening.sql",
    import.meta.url,
  ),
);
const kanbanMigrationPath = fileURLToPath(
  new URL(
    "../supabase/migrations/20260805173459_kanban_personal_planning.sql",
    import.meta.url,
  ),
);
const aiTakeoverMigrationPath = fileURLToPath(
  new URL(
    "../supabase/migrations/20260807122927_expire_ai_context_after_human_reply.sql",
    import.meta.url,
  ),
);
const codingRunDedupeMigrationPath = fileURLToPath(
  new URL(
    "../supabase/migrations/20260807170000_dedupe_active_coding_runs.sql",
    import.meta.url,
  ),
);
const codingControlPlaneMigrationPath = fileURLToPath(
  new URL(
    "../supabase/migrations/20260809155022_coding_control_plane_v2.sql",
    import.meta.url,
  ),
);
const codingLoginHardeningMigrationPath = fileURLToPath(
  new URL(
    "../supabase/migrations/20260809180000_harden_coding_subscription_login.sql",
    import.meta.url,
  ),
);
const architectureHardeningMigrationPath = fileURLToPath(
  new URL(
    "../supabase/migrations/20260812130000_architecture_hardening.sql",
    import.meta.url,
  ),
);

describe("Supabase security migration contract", () => {
  it("keeps privileged implementations private and public RPCs invoker-only", async () => {
    const sql = await readFile(migrationPath, "utf8");

    for (const name of [
      "create_workspace",
      "add_workspace_member",
      "update_workspace_member_role",
      "remove_workspace_member",
      "claim_next_job",
    ]) {
      expect(sql).toContain(`alter function public.${name}`);
      expect(sql).toContain(`create function public.${name}`);
    }
    expect(sql).toContain("security invoker");
    expect(sql).toContain(
      "revoke all on function public.claim_next_job(text, integer) from public, anon, authenticated;",
    );
    expect(sql).toContain(
      "grant execute on function public.claim_next_job(text, integer) to service_role;",
    );
  });

  it("keeps jobs backend-only and enforces worker ownership in SQL", async () => {
    const sql = await readFile(migrationPath, "utf8");

    expect(sql).toContain('create policy "service role manages jobs"');
    expect(sql).toContain(
      "revoke all on table public.jobs from public, anon, authenticated;",
    );
    expect(sql).toContain("and locked_by = p_worker_id");
    expect(sql).toContain("raise exception 'job_lease_lost'");
  });

  it("keeps private media authenticated, path-scoped, and in the realtime publication", async () => {
    const sql = await readFile(migrationPath, "utf8");

    expect(sql).toContain(
      "revoke all on table storage.objects from public, anon;",
    );
    expect(sql).toContain("bucket_id = 'private-media'");
    expect(sql).toContain(
      "name ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/'",
    );
    for (const table of [
      "channel_connections",
      "messages",
      "issues",
      "issue_comments",
      "coding_run_events",
      "notifications",
      "labels",
      "issue_labels",
    ]) {
      expect(sql).toContain(`'${table}'`);
    }
  });

  it("keeps personal Kanban data private and realtime-enabled", async () => {
    const sql = await readFile(kanbanMigrationPath, "utf8");
    for (const table of ["personal_tasks", "personal_events"]) {
      expect(sql).toContain(
        `alter table public.${table} enable row level security`,
      );
      expect(sql).toContain(`user_id = (select auth.uid())`);
      expect(sql).toContain(
        `alter publication supabase_realtime add table public.${table}`,
      );
    }
    expect(sql).toContain("workspace agents can update own personal tasks");
    expect(sql).toContain("workspace agents can update own personal events");
  });

  it("expires active drafts and stale AI copy after a human reply", async () => {
    const sql = await readFile(aiTakeoverMigrationPath, "utf8");

    expect(sql).toContain(
      "create or replace function private.pause_conversation_for_human",
    );
    expect(sql).toContain("status in ('pending_review', 'auto_eligible')");
    expect(sql).toContain("latest_intent = null");
    expect(sql).toContain("current_summary = null");
  });

  it("prevents two workers from running the same coding mode concurrently", async () => {
    const sql = await readFile(codingRunDedupeMigrationPath, "utf8");
    expect(sql).toContain("coding_runs_active_issue_mode_idx");
    expect(sql).toContain("where status in ('queued', 'running')");
    expect(sql).toContain("duplicate_active_coding_run_reconciled");
  });

  it("keeps Coding Control Plane secrets private and legacy model data honest", async () => {
    const sql = await readFile(codingControlPlaneMigrationPath, "utf8");
    for (const table of [
      "agent_connections",
      "agent_connection_secrets",
      "agent_connection_auth_jobs",
      "agent_routing_policies",
      "agent_research_artifacts",
      "agent_run_attempts",
    ]) {
      expect(sql).toContain(`create table public.${table}`);
      expect(sql).toContain(
        `alter table public.${table} enable row level security`,
      );
    }
    expect(sql).toContain(
      "revoke all on public.agent_connection_secrets from public, anon, authenticated;",
    );
    expect(sql).toContain("default 'unknown_legacy'");
    expect(sql).toContain("coding_routing_v2");
    expect(sql).toContain("coding_subscription_auth");
  });

  it("makes subscription login idempotent and completion race-safe", async () => {
    const sql = await readFile(codingLoginHardeningMigrationPath, "utf8");
    expect(sql).toContain("agent_connection_auth_jobs_active_idx");
    expect(sql).toContain("where status in ('pending', 'awaiting_user')");
    expect(sql).toContain("duplicate_active_login_reconciled");
    expect(sql).toContain("complete_agent_subscription_login");
    expect(sql).toContain("security definer");
    expect(sql).toContain("and connection_id = p_connection_id");
    expect(sql).toContain("and status = 'pending';");
    expect(sql).toContain(
      "revoke execute on function public.complete_agent_subscription_login",
    );
    expect(sql).toContain(
      "grant execute on function public.complete_agent_subscription_login(uuid, uuid, text)\n  to service_role;",
    );
  });

  it("keeps architecture hardening hashes independent of the extension search path", async () => {
    const sql = await readFile(architectureHardeningMigrationPath, "utf8");

    expect(sql).toContain(
      "encode(sha256(convert_to(article.id::text || E'\\n' || article.title || E'\\n' || article.body || E'\\n' || article.updated_at::text, 'UTF8')), 'hex')",
    );
    expect(sql).toContain(
      "encode(sha256(convert_to(substr(article.body, ((part.index - 1) * 6000) + 1, 6000), 'UTF8')), 'hex')",
    );
    expect(sql).not.toMatch(/(?<![A-Za-z0-9_.])digest\s*\(/);
  });
});
