import { describe, expect, it, vi } from "vitest";
import { InMemoryJobStore } from "../../jobs.js";
import { SupabaseKnowledgeConfigurationAdapter } from "./knowledge-configuration.js";

class Query implements PromiseLike<{ data: unknown; error: null }> {
  private operation: "select" | "update" = "select";

  constructor(
    private readonly source: Record<string, unknown>,
    private readonly updates: Array<Record<string, unknown>>,
  ) {}

  select() {
    return this;
  }
  eq() {
    return this;
  }
  neq() {
    return this;
  }
  maybeSingle() {
    return this;
  }
  update(value: Record<string, unknown>) {
    this.operation = "update";
    this.updates.push(value);
    return this;
  }
  then<TResult1 = { data: unknown; error: null }, TResult2 = never>(
    onfulfilled?:
      | ((value: {
          data: unknown;
          error: null;
        }) => TResult1 | PromiseLike<TResult1>)
      | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): PromiseLike<TResult1 | TResult2> {
    return Promise.resolve({
      data: this.operation === "select" ? this.source : null,
      error: null,
    }).then(onfulfilled, onrejected);
  }
}

describe("SupabaseKnowledgeConfigurationAdapter", () => {
  it("checks and persists the branch SHA before every manual sync", async () => {
    const workspaceId = "10000000-0000-4000-8000-000000000001";
    const sourceId = "10000000-0000-4000-8000-000000000002";
    const sha = "a".repeat(40);
    const updates: Array<Record<string, unknown>> = [];
    const source = {
      id: sourceId,
      workspace_id: workspaceId,
      repository_id: "10000000-0000-4000-8000-000000000003",
      ref_name: "main",
      sync_mode: "event",
      observed_sha: null,
      active_sha: null,
      repositories: {
        github_owner: "techne",
        github_repo: "zelopdv",
        github_installation_id: 42,
      },
    };
    const client = {
      from: vi.fn(() => new Query(source, updates)),
    };
    const jobs = new InMemoryJobStore<Record<string, unknown>>();
    const github = { getBranchSha: vi.fn(async () => sha) };
    const adapter = new SupabaseKnowledgeConfigurationAdapter(
      client as never,
      jobs,
      github,
    );

    await expect(adapter.requestSync(workspaceId, sourceId)).resolves.toEqual({
      queued: true,
      requestedSha: sha,
    });
    expect(github.getBranchSha).toHaveBeenCalledWith(
      {
        owner: "techne",
        repo: "zelopdv",
        installationId: 42,
      },
      "main",
    );
    expect(updates).toEqual([
      expect.objectContaining({ observed_sha: sha }),
      expect.objectContaining({ sync_state: "queued" }),
    ]);
    expect((await jobs.list())[0]).toMatchObject({
      type: "mend.knowledge.repository_sync",
      payload: expect.objectContaining({ requestedSha: sha }),
    });
  });

  it("does not enqueue a duplicate refresh when the branch is already indexed", async () => {
    const workspaceId = "10000000-0000-4000-8000-000000000001";
    const sourceId = "10000000-0000-4000-8000-000000000002";
    const sha = "a".repeat(40);
    const updates: Array<Record<string, unknown>> = [];
    const source = {
      id: sourceId,
      workspace_id: workspaceId,
      repository_id: "10000000-0000-4000-8000-000000000003",
      ref_name: "main",
      sync_mode: "event",
      observed_sha: sha,
      indexed_sha: sha,
      active_sha: sha,
      sync_state: "running",
      repositories: {
        github_owner: "techne",
        github_repo: "zelopdv",
        github_installation_id: 42,
      },
    };
    const client = {
      from: vi.fn(() => new Query(source, updates)),
    };
    const jobs = new InMemoryJobStore<Record<string, unknown>>();
    const github = { getBranchSha: vi.fn(async () => sha) };
    const adapter = new SupabaseKnowledgeConfigurationAdapter(
      client as never,
      jobs,
      github,
    );

    await expect(adapter.requestSync(workspaceId, sourceId)).resolves.toEqual({
      queued: false,
      requestedSha: sha,
    });
    expect(github.getBranchSha).toHaveBeenCalledOnce();
    expect(await jobs.list()).toHaveLength(0);
    expect(updates).toContainEqual(
      expect.objectContaining({ sync_state: "ready", last_error_code: null }),
    );
  });
});
