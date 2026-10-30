import express from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import {
  SUPPORT_EVENTS_API_KEY_ENV,
  SUPPORT_EVENTS_KEY_HEADER,
  type SupportEventsSupabaseClient,
} from "./support-events.js";
import {
  registerInternalSupportSendRoute,
  SUPPORT_SEND_PATH,
  SupabaseSupportSendPort,
  type SupportSendConversation,
  type SupportSendPort,
} from "./support-send.js";
import { OutboundSendError } from "./whatsapp-service.js";
import { WhatsmiauApiError } from "./whatsmiau.js";

const KEY = "support-test-key";
const env = { [SUPPORT_EVENTS_API_KEY_ENV]: KEY };
const WORKSPACE = "11111111-1111-4111-8111-111111111111";
const CONVERSATION = "22222222-2222-4222-8222-222222222222";

function fakePort(conversation: SupportSendConversation | null) {
  return {
    findConversation: vi.fn(async () => conversation),
    sendText: vi.fn(async () => ({
      messageId: "message-1",
      providerMessageId: "provider-1",
    })),
  } satisfies SupportSendPort;
}

function buildApp(
  port: SupportSendPort | null,
  routeEnv: NodeJS.ProcessEnv = env,
) {
  const app = express();
  app.use(express.json());
  registerInternalSupportSendRoute(app, {
    port,
    env: routeEnv,
    internalWorkspace: { resolve: async () => WORKSPACE },
  });
  return app;
}

function post(app: express.Express, body: unknown, key: string | null = KEY) {
  const call = request(app).post(SUPPORT_SEND_PATH);
  return (key === null ? call : call.set(SUPPORT_EVENTS_KEY_HEADER, key)).send(
    body as object,
  );
}

describe("POST /internal/support/send", () => {
  it("fails closed without a configured key", async () => {
    const port = fakePort({ workspaceId: WORKSPACE, aiMode: "safe_auto" });
    const response = await post(
      buildApp(port, {}),
      { conversationId: CONVERSATION, text: "Oi" },
      KEY,
    );
    expect(response.status).toBe(503);
    expect(response.body).toEqual({
      error: "support_events_key_not_configured",
    });
    expect(port.sendText).not.toHaveBeenCalled();
  });

  it("rejects a missing or wrong key", async () => {
    const port = fakePort({ workspaceId: WORKSPACE, aiMode: "safe_auto" });
    const app = buildApp(port);
    const body = { conversationId: CONVERSATION, text: "Oi" };
    expect((await post(app, body, null)).status).toBe(401);
    expect((await post(app, body, "wrong")).status).toBe(401);
    expect(port.sendText).not.toHaveBeenCalled();
  });

  it("validates the body", async () => {
    const app = buildApp(fakePort(null));
    expect((await post(app, { conversationId: "x", text: "Oi" })).status).toBe(
      400,
    );
    expect(
      (await post(app, { conversationId: CONVERSATION, text: "   " })).status,
    ).toBe(400);
    expect(
      (
        await post(app, {
          conversationId: CONVERSATION,
          text: "a".repeat(4_097),
        })
      ).status,
    ).toBe(400);
  });

  it("returns 503 when the sender is not configured", async () => {
    const response = await post(buildApp(null), {
      conversationId: CONVERSATION,
      text: "Oi",
    });
    expect(response.status).toBe(503);
    expect(response.body).toEqual({ error: "support_send_not_configured" });
  });

  it("returns 404 for an unknown conversation", async () => {
    const port = fakePort(null);
    const response = await post(buildApp(port), {
      conversationId: CONVERSATION,
      workspaceId: WORKSPACE,
      text: "Oi",
    });
    expect(response.status).toBe(404);
    expect(port.findConversation).toHaveBeenCalledWith({
      conversationId: CONVERSATION,
      workspaceId: WORKSPACE,
    });
    expect(port.sendText).not.toHaveBeenCalled();
  });

  it("refuses with 409 when ai_mode is off", async () => {
    const port = fakePort({ workspaceId: WORKSPACE, aiMode: "off" });
    const response = await post(buildApp(port), {
      conversationId: CONVERSATION,
      text: "Oi",
    });
    expect(response.status).toBe(409);
    expect(response.body).toEqual({ error: "reply_not_allowed" });
    expect(port.sendText).not.toHaveBeenCalled();
  });

  it("sends while a human has taken over, as long as the AI is on", async () => {
    // human_paused lives in conversation_ai_state; the port no longer reads it.
    const port = fakePort({ workspaceId: WORKSPACE, aiMode: "safe_auto" });
    const response = await post(buildApp(port), {
      conversationId: CONVERSATION,
      text: "Oi",
    });
    expect(response.status).toBe(201);
    expect(port.sendText).toHaveBeenCalledOnce();
  });

  it("sends through the conversation's workspace with the retry key", async () => {
    const port = fakePort({ workspaceId: WORKSPACE, aiMode: "safe_auto" });
    const response = await post(buildApp(port), {
      conversationId: CONVERSATION,
      text: "  Olá, posso ajudar?  ",
    }).set("idempotency-key", "support-reply-1");
    expect(response.status).toBe(201);
    expect(response.body).toEqual({
      workspaceId: WORKSPACE,
      conversationId: CONVERSATION,
      messageId: "message-1",
      providerMessageId: "provider-1",
    });
    expect(port.sendText).toHaveBeenCalledWith({
      workspaceId: WORKSPACE,
      conversationId: CONVERSATION,
      text: "Olá, posso ajudar?",
      idempotencyKey: "support-reply-1",
    });
  });

  it("maps provider faults to actionable statuses", async () => {
    const port = fakePort({ workspaceId: WORKSPACE, aiMode: "draft" });
    port.sendText.mockRejectedValueOnce(
      new OutboundSendError("channel_disconnected"),
    );
    const response = await post(buildApp(port), {
      conversationId: CONVERSATION,
      text: "Oi",
    });
    expect(response.status).toBe(503);
    expect(response.body).toEqual({ error: "channel_disconnected" });
  });

  it("logs the provider's answer when a send fails", async () => {
    const port = fakePort({ workspaceId: WORKSPACE, aiMode: "safe_auto" });
    port.sendText.mockRejectedValueOnce(
      new OutboundSendError(
        "provider_unavailable",
        new WhatsmiauApiError(
          "Whatsmiau request failed: 500",
          500,
          '{"message":"no sessions"}',
        ),
      ),
    );
    const logger = { error: vi.fn() };
    const app = express();
    app.use(express.json());
    registerInternalSupportSendRoute(app, {
      port,
      env,
      internalWorkspace: { resolve: async () => WORKSPACE },
      logger,
    });
    const response = await post(app, {
      conversationId: CONVERSATION,
      text: "Oi",
    });
    expect(response.status).toBe(502);
    expect(response.body).toEqual({ error: "provider_unavailable" });
    expect(logger.error).toHaveBeenCalledWith(
      expect.objectContaining({
        conversationId: CONVERSATION,
        reason: "provider_unavailable",
        providerStatus: 500,
        providerBody: '{"message":"no sessions"}',
      }),
      "Support send provider failure",
    );
  });

  it("hides unexpected failures", async () => {
    const port = fakePort({ workspaceId: WORKSPACE, aiMode: "safe_auto" });
    port.sendText.mockRejectedValueOnce(new Error("supabase:secret detail"));
    const response = await post(buildApp(port), {
      conversationId: CONVERSATION,
      text: "Oi",
    });
    expect(response.status).toBe(500);
    expect(response.body).toEqual({ error: "support_send_failed" });
  });
});

describe("SupabaseSupportSendPort", () => {
  function client(data: unknown[], state: unknown[] = []) {
    const calls: Array<{ op: string; args: unknown[] }> = [];
    const query: Record<string, unknown> = {};
    for (const op of ["select", "eq", "limit"])
      query[op] = (...args: unknown[]) => {
        calls.push({ op, args });
        return query;
      };
    let table = "";
    query.then = (resolve: (value: unknown) => void) =>
      resolve({
        data: table === "conversation_ai_state" ? state : data,
        error: null,
      });
    return {
      calls,
      client: {
        from: (name: string) => {
          table = name;
          return query;
        },
      } as unknown as SupportEventsSupabaseClient,
    };
  }

  it("scopes the lookup and fails closed on a missing mode", async () => {
    const fake = client([{ id: CONVERSATION, workspace_id: WORKSPACE }]);
    const port = new SupabaseSupportSendPort(fake.client, {
      sendText: vi.fn(),
    });
    await expect(
      port.findConversation({
        conversationId: CONVERSATION,
        workspaceId: WORKSPACE,
      }),
    ).resolves.toEqual({
      workspaceId: WORKSPACE,
      isGroup: false,
      aiMode: "off",
    });
    expect(fake.calls).toContainEqual({
      op: "eq",
      args: ["workspace_id", WORKSPACE],
    });
  });

  it("does not let human_paused block a conversation with the AI on", async () => {
    const fake = client(
      [{ id: CONVERSATION, workspace_id: WORKSPACE, ai_mode: "safe_auto" }],
      [{ automation_state: "human_paused", paused_until: null }],
    );
    const port = new SupabaseSupportSendPort(fake.client, {
      sendText: vi.fn(),
    });
    await expect(
      port.findConversation({ conversationId: CONVERSATION }),
    ).resolves.toEqual({
      workspaceId: WORKSPACE,
      isGroup: false,
      aiMode: "safe_auto",
    });
  });

  it("sends as an AI outbound so the human pause is not triggered", async () => {
    const sendText = vi.fn(async () => ({
      message: { id: "message-1" },
      providerMessageId: "provider-1",
    }));
    const port = new SupabaseSupportSendPort(client([]).client, {
      sendText,
    } as never);
    await expect(
      port.sendText({
        workspaceId: WORKSPACE,
        conversationId: CONVERSATION,
        text: "Oi",
        idempotencyKey: "k",
      }),
    ).resolves.toEqual({
      messageId: "message-1",
      providerMessageId: "provider-1",
    });
    expect(sendText).toHaveBeenCalledWith(
      { workspaceId: WORKSPACE, actorType: "ai" },
      CONVERSATION,
      {
        text: "Oi",
        aiGenerated: true,
        idempotencyKey: "k",
        onProviderMessageId: expect.any(Function),
      },
    );
  });

  it("registers the automation mark before the provider call", async () => {
    const order: string[] = [];
    const sendText = vi.fn(
      async (
        _ctx: unknown,
        _id: string,
        req: {
          text: string;
          beforeProviderSend?: (t: string) => Promise<void>;
          onProviderMessageId?: (id: string) => void;
        },
      ) => {
        await req.beforeProviderSend?.(req.text);
        order.push("provider");
        req.onProviderMessageId?.("provider-1");
        return {
          message: { id: "m1", aiGenerated: true },
          providerMessageId: "provider-1",
        };
      },
    );
    const mark = vi.fn(async (t: string) => {
      order.push(`mark:${t}`);
    });
    const port = new SupabaseSupportSendPort(
      client([]).client,
      { sendText } as never,
      mark,
    );
    await port.sendText({
      workspaceId: WORKSPACE,
      conversationId: CONVERSATION,
      text: "Oi",
    });
    expect(order).toEqual(["mark:Oi", "provider"]);
  });

  it("does not send when the mark keeps failing", async () => {
    const sendText = vi.fn(
      async (
        _c: unknown,
        _i: string,
        req: { beforeProviderSend?: (t: string) => Promise<void> },
      ) => {
        await req.beforeProviderSend?.("Oi");
      },
    );
    const mark = vi.fn(async () => {
      throw new Error("db");
    });
    const port = new SupabaseSupportSendPort(
      client([]).client,
      { sendText } as never,
      mark,
    );
    await expect(
      port.sendText({
        workspaceId: WORKSPACE,
        conversationId: CONVERSATION,
        text: "Oi",
      }),
    ).rejects.toThrow("automation_mark_failed");
    expect(mark).toHaveBeenCalledTimes(2);
  });

  it("reports recorded:false when recording fails after a provider send", async () => {
    const sendText = vi.fn(
      async (
        _c: unknown,
        _i: string,
        req: { onProviderMessageId?: (id: string) => void },
      ) => {
        req.onProviderMessageId?.("provider-9");
        throw new Error("supabase:record failed");
      },
    );
    const port = new SupabaseSupportSendPort(client([]).client, {
      sendText,
    } as never);
    await expect(
      port.sendText({
        workspaceId: WORKSPACE,
        conversationId: CONVERSATION,
        text: "Oi",
      }),
    ).resolves.toEqual({
      messageId: null,
      providerMessageId: "provider-9",
      recorded: false,
    });
  });

  it("detects a group conversation from the contact jid", async () => {
    const fake = client([
      {
        id: CONVERSATION,
        workspace_id: WORKSPACE,
        ai_mode: "safe_auto",
        contact_id: "c1",
        provider_contact_id: "1203@g.us",
      },
    ]);
    const port = new SupabaseSupportSendPort(fake.client, {
      sendText: vi.fn(),
    });
    await expect(
      port.findConversation({ conversationId: CONVERSATION }),
    ).resolves.toMatchObject({ isGroup: true });
  });
});

describe("single workspace support bridge", () => {
  const scopedApp = (
    port: SupportSendPort,
    canonical: string | null = WORKSPACE,
  ) => {
    const app = express();
    app.use(express.json());
    registerInternalSupportSendRoute(app, {
      port,
      env,
      internalWorkspace: { resolve: async () => canonical },
    });
    return app;
  };
  it("scopes an omitted workspace without changing reply or idempotency contracts", async () => {
    const port = fakePort({ workspaceId: WORKSPACE, aiMode: "draft" });
    const response = await post(scopedApp(port), {
      conversationId: CONVERSATION,
      text: "Oi",
    }).set("idempotency-key", "existing-key");
    expect(response.status).toBe(201);
    expect(port.findConversation).toHaveBeenCalledWith({
      conversationId: CONVERSATION,
      workspaceId: WORKSPACE,
    });
    expect(port.sendText).toHaveBeenCalledWith({
      conversationId: CONVERSATION,
      workspaceId: WORKSPACE,
      text: "Oi",
      idempotencyKey: "existing-key",
    });
  });
  it("rejects another workspace before querying the conversation", async () => {
    const port = fakePort({ workspaceId: WORKSPACE, aiMode: "safe_auto" });
    const response = await post(scopedApp(port), {
      conversationId: CONVERSATION,
      workspaceId: CONVERSATION,
      text: "Oi",
    });
    expect(response.status).toBe(404);
    expect(port.findConversation).not.toHaveBeenCalled();
    expect(port.sendText).not.toHaveBeenCalled();
  });
  it("blocks a foreign conversation even if a port returns it", async () => {
    const port = fakePort({ workspaceId: CONVERSATION, aiMode: "safe_auto" });
    expect(
      (
        await post(scopedApp(port), {
          conversationId: CONVERSATION,
          text: "Oi",
        })
      ).status,
    ).toBe(404);
    expect(port.sendText).not.toHaveBeenCalled();
  });
  it("never sends when the canonical workspace has not been configured", async () => {
    const port = fakePort({ workspaceId: WORKSPACE, aiMode: "safe_auto" });
    expect(
      (
        await post(scopedApp(port, null), {
          conversationId: CONVERSATION,
          text: "Oi",
        })
      ).status,
    ).toBe(503);
    expect(port.findConversation).not.toHaveBeenCalled();
  });
});
