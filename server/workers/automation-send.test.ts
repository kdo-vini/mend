import { describe, expect, it, vi } from "vitest";
import { SupabaseLiveWorkerAutomation } from "./automation.js";

interface Call {
  table: string;
  op: string;
  args: unknown[];
}

function fakeClient(failTable?: string) {
  const calls: Call[] = [];
  const client = {
    rpc: vi.fn(async (name: string) =>
      name === "claim_ai_reply_send"
        ? { data: { id: "ledger-1", status: "sending" }, error: null }
        : { data: null, error: null },
    ),
    from(table: string) {
      const chain: Record<string, unknown> = {};
      for (const op of [
        "select",
        "insert",
        "update",
        "upsert",
        "eq",
        "in",
        "maybeSingle",
      ])
        chain[op] = (...args: unknown[]) => {
          calls.push({ table, op, args });
          return chain;
        };
      chain.then = (resolve: (value: unknown) => void) =>
        resolve({
          data: null,
          error: table === failTable ? { message: "db down" } : null,
        });
      return chain;
    },
  };
  return { client, calls };
}

const input = {
  binding: { workspaceId: "ws-1" },
  conversationId: "conv-1",
  sourceMessageId: "msg-1",
  idempotencyKey: "key-1",
  body: "Oi",
  triage: {},
} as never;

function build(
  failTable: string | undefined,
  sendText: (
    ctx: unknown,
    id: string,
    req: {
      idempotencyKey?: string;
      onProviderMessageId?: (id: string) => Promise<void>;
    },
  ) => Promise<unknown>,
) {
  const { client, calls } = fakeClient(failTable);
  const automation = new SupabaseLiveWorkerAutomation(
    client as never,
    undefined,
  );
  (automation as unknown as { whatsapp: unknown }).whatsapp = { sendText };
  return { automation, calls };
}

const statuses = (calls: Call[]) =>
  calls
    .filter((c) => c.table === "ai_outbound_messages" && c.op === "update")
    .map((c) => (c.args[0] as { status: string }).status);

describe("sendAiReply ledger", () => {
  it("passes the ledger id as idempotency key and marks sent", async () => {
    const sendText = vi.fn(async (_c, _i, req) => {
      await req.onProviderMessageId?.("provider-1");
    });
    const { automation, calls } = build(undefined, sendText);
    await automation.sendAiReply(input);
    expect(sendText.mock.calls[0]?.[2].idempotencyKey).toBe("ledger-1");
    expect(statuses(calls)).toEqual(["sent"]);
  });

  it("never downgrades a sent ledger when recording or bookkeeping fails", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const sendText = vi.fn(async (_c, _i, req) => {
      await req.onProviderMessageId?.("provider-1");
      throw new Error("record_failed");
    });
    const { automation, calls } = build("ai_drafts", sendText);
    await expect(automation.sendAiReply(input)).resolves.toBeUndefined();
    expect(statuses(calls)).toEqual(["sent"]);
  });

  it("marks failed only when the provider call fails", async () => {
    const sendText = vi.fn(async () => {
      throw new Error("provider_down");
    });
    const { automation, calls } = build(undefined, sendText);
    await expect(automation.sendAiReply(input)).rejects.toThrow(
      "provider_down",
    );
    expect(statuses(calls)).toEqual(["failed"]);
  });
});

describe("MCP write approval", () => {
  const writeConnection = {
    id: "conn-1",
    writeModes: ["draft", "safe_auto"],
    tools: [{ name: "create_ticket", readOnly: false }],
  };
  const approval = {
    connectionId: "conn-1",
    toolName: "create_ticket",
    argumentsJson: "{}",
    approvalRequestId: "req-1",
  };
  const call = (mode: string) => {
    const { automation } = build(undefined, vi.fn());
    return (
      automation as unknown as {
        approveMcpWrite(...args: unknown[]): Promise<boolean>;
      }
    ).approveMcpWrite(
      { ...(input as object), persisted: { id: "msg-1" } },
      mode,
      [writeConnection],
      approval,
    );
  };

  it("never auto-approves a write tool in draft mode", async () => {
    await expect(call("draft")).resolves.toBe(false);
  });

  it("still approves in safe_auto when the connection allows it", async () => {
    vi.stubEnv("CONNECTION_ENCRYPTION_KEY", "test-encryption-key");
    await expect(call("safe_auto")).resolves.toBe(true);
  });
});
