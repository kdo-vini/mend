import { describe, expect, it } from "vitest";
import { SupabaseJobStore } from "./persistence.js";
import type { MendServerSupabaseClient } from "./supabase.js";

type Result = { data: unknown; error: { message: string } | null };

class QueryRecorder implements PromiseLike<Result> {
  readonly filters: Array<[string, unknown]> = [];
  private operation = "select";
  private payload: unknown;

  constructor(private readonly result: Result) {}

  update(payload: unknown) {
    this.operation = "update";
    this.payload = payload;
    return this;
  }
  select(_columns = "*") {
    return this;
  }
  eq(column: string, value: unknown) {
    this.filters.push([column, value]);
    return this;
  }
  maybeSingle() {
    return this;
  }

  then<TResult1 = Result, TResult2 = never>(
    onfulfilled?: ((value: Result) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): PromiseLike<TResult1 | TResult2> {
    void this.operation;
    void this.payload;
    return Promise.resolve(this.result).then(onfulfilled, onrejected);
  }
}

class JobClientFake {
  readonly queries: QueryRecorder[] = [];
  readonly rpcCalls: Array<{ name: string; args: Record<string, unknown> }> =
    [];

  constructor(private readonly results: Result[]) {}

  from(_table: string) {
    const query = new QueryRecorder(
      this.results.shift() ?? { data: null, error: null },
    );
    this.queries.push(query);
    return query;
  }

  rpc(name: string, args: Record<string, unknown>) {
    this.rpcCalls.push({ name, args });
    if (name === "complete_job")
      return Promise.resolve({ data: { id: jobId }, error: null });
    return Promise.resolve({
      data: null,
      error: { message: "job_lease_lost", code: "55000" },
    });
  }
}

const jobId = "11111111-1111-4111-8111-111111111111";

describe("Supabase job lease ownership", () => {
  it("adds the lease owner to complete updates", async () => {
    const client = new JobClientFake([{ data: { id: jobId }, error: null }]);
    const store = new SupabaseJobStore(
      client as unknown as MendServerSupabaseClient,
    );

    await store.complete(
      jobId,
      "worker-a",
      new Date("2026-08-03T20:00:00.000Z"),
    );

    expect(client.rpcCalls[0]).toMatchObject({
      name: "complete_job",
      args: { p_job_id: jobId, p_worker_id: "worker-a" },
    });
  });

  it("checks the lease owner before calculating and applying a failure retry", async () => {
    const client = new JobClientFake([{ data: null, error: null }]);
    const store = new SupabaseJobStore(
      client as unknown as MendServerSupabaseClient,
    );

    await expect(
      store.fail(
        jobId,
        "stale worker",
        new Date("2026-08-03T20:00:00.000Z"),
        "worker-b",
      ),
    ).rejects.toThrow(`job_lease_lost:${jobId}`);

    expect(client.rpcCalls[0]).toMatchObject({
      name: "fail_job",
      args: { p_job_id: jobId, p_worker_id: "worker-b" },
    });
  });
});
