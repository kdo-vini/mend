import { describe, expect, it, vi } from "vitest";
import {
  DebouncedJobQueue,
  InMemoryJobStore,
  JobLeaseLostError,
  jobLeaseMs,
} from "./jobs.js";

describe("job queue", () => {
  it("keeps the lease longer than the configured Agent runtime", () => {
    expect(
      jobLeaseMs({
        MEND_AGENT_MAX_RUNTIME_SECONDS: "1200",
      } as NodeJS.ProcessEnv),
    ).toBe(1_260_000);
  });

  it("deduplicates queued work and moves failures to dead letters", async () => {
    const store = new InMemoryJobStore();
    const first = await store.enqueue({
      type: "test",
      payload: { value: 1 },
      dedupeKey: "same",
      maxAttempts: 2,
    });
    expect(
      (
        await store.enqueue({
          type: "test",
          payload: { value: 2 },
          dedupeKey: "same",
        })
      ).id,
    ).toBe(first.id);
    const claimed = await store.claim("worker");
    expect(claimed?.attempts).toBe(1);
    await store.fail(first.id, new Error("temporary"));
    const retry = await store.claim("worker", new Date(Date.now() + 2_000));
    expect(retry?.attempts).toBe(2);
    await store.fail(first.id, "permanent");
    expect((await store.listDeadLetters()).map((job) => job.id)).toContain(
      first.id,
    );
  });

  it("debounces repeated schedules into one enqueue", async () => {
    vi.useFakeTimers();
    const store = new InMemoryJobStore();
    const queue = new DebouncedJobQueue(store, 50);
    const first = queue.schedule({
      type: "triage",
      payload: { conversationId: "c1" },
      dedupeKey: "conversation:c1",
    });
    queue.schedule({
      type: "triage",
      payload: { conversationId: "c1" },
      dedupeKey: "conversation:c1",
    });
    await vi.advanceTimersByTimeAsync(50);
    await first;
    expect((await store.list()).length).toBe(1);
    vi.useRealTimers();
  });

  it("does not deduplicate the same key across workspaces", async () => {
    const store = new InMemoryJobStore();
    const first = await store.enqueue({
      workspaceId: "workspace-a",
      type: "triage",
      payload: {},
      dedupeKey: "conversation:c1",
    });
    const second = await store.enqueue({
      workspaceId: "workspace-b",
      type: "triage",
      payload: {},
      dedupeKey: "conversation:c1",
    });
    expect(second.id).not.toBe(first.id);
  });

  it("rejects stale workers and dead-letters a crashed final attempt after restart", async () => {
    const store = new InMemoryJobStore(100);
    const now = new Date();
    const job = await store.enqueue({
      type: "handoff",
      payload: {},
      maxAttempts: 1,
      availableAt: now,
    });
    const claimed = await store.claim("worker-a", now);
    expect(claimed?.id).toBe(job.id);
    await expect(
      store.claim("worker-b", new Date(now.getTime() + 101)),
    ).resolves.toBeNull();
    expect((await store.listDeadLetters()).map((item) => item.id)).toContain(
      job.id,
    );
    await expect(
      store.complete(job.id, "worker-a", new Date(now.getTime() + 102)),
    ).rejects.toBeInstanceOf(JobLeaseLostError);
  });

  it("does not let a different worker complete or fail an active lease", async () => {
    const store = new InMemoryJobStore();
    const job = await store.enqueue({
      type: "handoff",
      payload: {},
      maxAttempts: 2,
    });
    const now = new Date();
    await store.claim("worker-a", now);

    await expect(
      store.complete(job.id, "worker-b", new Date(now.getTime() + 1)),
    ).rejects.toBeInstanceOf(JobLeaseLostError);
    await expect(
      store.fail(
        job.id,
        "wrong worker",
        new Date(now.getTime() + 2),
        "worker-b",
      ),
    ).rejects.toBeInstanceOf(JobLeaseLostError);
    await expect(
      store.complete(job.id, "worker-a", new Date(now.getTime() + 3)),
    ).resolves.toBeUndefined();
  });

  it("does not leave the debounce promise pending when enqueue fails", async () => {
    vi.useFakeTimers();
    const store = {
      enqueue: vi.fn(async () => {
        throw new Error("queue unavailable");
      }),
    } as never;
    const queue = new DebouncedJobQueue(store, 10);
    const pending = queue.schedule({ type: "triage", payload: {} });
    const assertion = expect(pending).rejects.toThrow("queue unavailable");
    await vi.advanceTimersByTimeAsync(10);
    await assertion;
    vi.useRealTimers();
  });
});
