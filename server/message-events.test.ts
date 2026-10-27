import { describe, expect, it } from "vitest";
import { InMemoryJobStore } from "./jobs.js";
import { LiveWorker } from "./live-worker.js";
import {
  applyDeferredMessageEvent,
  blockedStatusesFor,
  canAdvanceStatus,
  MESSAGE_EVENT_JOB_TYPE,
  type MessageEventJobPayload,
} from "./message-events.js";
import { MESSAGE_LANE_JOB_TYPES } from "./workers/live-worker-shared.js";
import {
  applyProviderMessageEvent,
  buildMessageEventJob,
  canAdvanceStatus as edgeCanAdvance,
  extractProviderMessageEvents,
  MESSAGE_EVENT_JOB_TYPE as EDGE_JOB_TYPE,
} from "../supabase/functions/whats-mend-webhook/message-events.js";

type Row = Record<string, unknown>;

/** Just enough of the PostgREST builder for the messages table. */
function fakeClient(rows: Row[]) {
  const from = () => {
    const filters: ((row: Row) => boolean)[] = [];
    let patch: Row | null = null;
    const matching = () => rows.filter((r) => filters.every((f) => f(r)));
    const builder: Record<string, unknown> = {
      select: () => {
        if (patch) {
          const changed = matching();
          for (const row of changed) Object.assign(row, patch);
          return Promise.resolve({ data: changed, error: null });
        }
        return builder;
      },
      update: (value: Row) => {
        patch = value;
        return builder;
      },
      eq: (column: string, value: unknown) => {
        filters.push((r) => r[column] === value);
        return builder;
      },
      or: (expression: string) => {
        const blocked = /not\.in\.\(([^)]*)\)/.exec(expression)![1]!.split(",");
        filters.push(
          (r) =>
            r.provider_status == null ||
            !blocked.includes(r.provider_status as string),
        );
        return builder;
      },
      maybeSingle: () =>
        Promise.resolve({ data: matching()[0] ?? null, error: null }),
      // An update awaited without select() (worker side) writes on await.
      then: (resolve: (value: unknown) => unknown) => {
        if (patch) for (const row of matching()) Object.assign(row, patch);
        return Promise.resolve({ data: null, error: null }).then(resolve);
      },
    };
    return builder;
  };
  return { from } as never;
}

const row = (extra: Row = {}): Row => ({
  id: "m1",
  workspace_id: "w1",
  channel_connection_id: "c1",
  provider_message_id: "p1",
  message_type: "text",
  provider_status: null,
  is_deleted: false,
  text: "old",
  ...extra,
});
const binding = { id: "c1", workspace_id: "w1" };

describe("monotonic provider status", () => {
  it("only moves forward pending < sent < delivered < read", () => {
    expect(canAdvanceStatus(null, "sent")).toBe(true);
    expect(canAdvanceStatus("pending", "sent")).toBe(true);
    expect(canAdvanceStatus("sent", "delivered")).toBe(true);
    expect(canAdvanceStatus("delivered", "read")).toBe(true);
    expect(canAdvanceStatus("read", "delivered")).toBe(false);
    expect(canAdvanceStatus("delivered", "sent")).toBe(false);
    expect(canAdvanceStatus("delivered", "delivered")).toBe(false);
    expect(canAdvanceStatus("deleted", "read")).toBe(false);
    // failed never overwrites a delivery, but replaces sent/pending.
    expect(canAdvanceStatus("read", "failed")).toBe(false);
    expect(canAdvanceStatus("delivered", "failed")).toBe(false);
    expect(canAdvanceStatus("sent", "failed")).toBe(true);
    expect(blockedStatusesFor("read")).toEqual(["read", "deleted"]);
    expect(edgeCanAdvance("read", "delivered")).toBe(false);
  });

  it("a late delivered does not overwrite read (edge)", async () => {
    const rows = [row({ provider_status: "read" })];
    const result = await applyProviderMessageEvent(fakeClient(rows), binding, {
      kind: "status",
      providerMessageId: "p1",
      status: "delivered",
    });
    expect(result).toEqual({ found: true, updated: false });
    expect(rows[0]!.provider_status).toBe("read");
  });

  it("advances a lower status (edge)", async () => {
    const rows = [row({ provider_status: "sent" })];
    const result = await applyProviderMessageEvent(fakeClient(rows), binding, {
      kind: "status",
      providerMessageId: "p1",
      status: "read",
    });
    expect(result).toEqual({ found: true, updated: true });
    expect(rows[0]!.provider_status).toBe("read");
  });
});

describe("events for a message that is not stored yet", () => {
  it("reports found:false so the caller enqueues a retry job", async () => {
    const result = await applyProviderMessageEvent(fakeClient([]), binding, {
      kind: "edit",
      providerMessageId: "p1",
      text: "new",
    });
    expect(result).toEqual({ found: false, updated: false });
  });

  it("builds a retryable job for the messages lane", async () => {
    const job = await buildMessageEventJob(
      binding,
      { kind: "status", providerMessageId: "p1", status: "read" },
      async () => "digest",
    );
    expect(job).toMatchObject({
      workspace_id: "w1",
      type: EDGE_JOB_TYPE,
      status: "queued",
      attempts: 0,
      max_attempts: 8,
      payload: {
        channelConnectionId: "c1",
        event: { kind: "status", providerMessageId: "p1", status: "read" },
      },
    });
    expect(EDGE_JOB_TYPE).toBe(MESSAGE_EVENT_JOB_TYPE);
    expect(MESSAGE_LANE_JOB_TYPES).toContain(MESSAGE_EVENT_JOB_TYPE);
  });

  it("worker retries while the row is missing, then applies the status", async () => {
    const rows: Row[] = [];
    const client = fakeClient(rows);
    const store = new InMemoryJobStore<MessageEventJobPayload>();
    const worker = new LiveWorker({
      jobStore: store as never,
      channelResolver: { resolve: async () => null },
      inbox: {} as never,
      messageEvents: {
        apply: (workspaceId, payload) =>
          applyDeferredMessageEvent(client, workspaceId, payload),
      },
    });
    await store.enqueue({
      workspaceId: "w1",
      type: MESSAGE_EVENT_JOB_TYPE,
      payload: {
        channelConnectionId: "c1",
        event: { kind: "status", providerMessageId: "p1", status: "read" },
      },
      maxAttempts: 8,
    });

    await worker.poll();
    const [pending] = await store.list();
    expect(pending?.status).toBe("queued");
    expect(pending?.attempts).toBe(1);

    rows.push(row({ provider_status: "sent" }));
    // Skip the retry backoff and let the worker claim the job again.
    const claim = await store.claim("t", new Date(Date.now() + 120_000));
    expect(claim?.type).toBe(MESSAGE_EVENT_JOB_TYPE);
    await applyDeferredMessageEvent(
      client,
      "w1",
      claim!.payload as MessageEventJobPayload,
    );
    expect(rows[0]!.provider_status).toBe("read");
  });

  it("worker does not regress a status when the row has a later one", async () => {
    const rows = [row({ provider_status: "read" })];
    await applyDeferredMessageEvent(fakeClient(rows), "w1", {
      channelConnectionId: "c1",
      event: { kind: "status", providerMessageId: "p1", status: "delivered" },
    });
    expect(rows[0]!.provider_status).toBe("read");
  });

  it("worker applies a deferred edit", async () => {
    const rows = [row()];
    await applyDeferredMessageEvent(fakeClient(rows), "w1", {
      channelConnectionId: "c1",
      event: { kind: "edit", providerMessageId: "p1", text: "fixed" },
    });
    expect(rows[0]).toMatchObject({ text: "fixed" });
    expect(rows[0]!.edited_at).toBeTruthy();
  });
});

describe("array payloads", () => {
  it("extracts one event per record", () => {
    const events = extractProviderMessageEvents("messages.update", {
      event: "messages.update",
      data: [
        { messageId: "a", status: "DELIVERY_ACK" },
        { key: { id: "b" }, status: "read" },
        { messageId: "c" },
      ],
    });
    expect(events).toEqual([
      { kind: "status", providerMessageId: "a", status: "delivered" },
      { kind: "status", providerMessageId: "b", status: "read" },
    ]);
    expect(
      extractProviderMessageEvents("messages.delete", {
        data: [{ id: "x" }, { key: { id: "y" } }],
      }),
    ).toHaveLength(2);
  });
});
