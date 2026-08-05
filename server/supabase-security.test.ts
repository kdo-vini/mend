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
});
