import express from "express";
import request from "supertest";
import { describe, expect, it } from "vitest";
import {
  InMemorySupportEventStore,
  registerInternalSupportRoutes,
  SUPPORT_EVENTS_API_KEY_ENV,
  SUPPORT_EVENTS_KEY_HEADER,
  SUPPORT_EVENTS_PATH,
  SupabaseSupportEventStore,
  supportReplyAllowed,
  type SupportEventStore,
  type SupportEventsSupabaseClient,
} from "./support-events.js";

const KEY = "support-test-key";
const env = { [SUPPORT_EVENTS_API_KEY_ENV]: KEY };

function buildApp(
  store: SupportEventStore | null,
  routeEnv: NodeJS.ProcessEnv = env,
) {
  const app = express();
  registerInternalSupportRoutes(app, { store, env: routeEnv });
  return app;
}

async function seededStore() {
  const store = new InMemorySupportEventStore();
  for (const [index, conversationId] of [
    "conversation-active",
    "conversation-paused",
    "conversation-off",
  ].entries()) {
    const messageId = `message-${index + 1}`;
    await store.record({
      workspaceId: "11111111-1111-4111-8111-111111111111",
      conversationId,
      messageId,
      remoteJid: "5511999999999@s.whatsapp.net",
      phoneNumber: "5511999999999",
      chatType: "direct",
    });
    store.messages.set(messageId, {
      id: messageId,
      providerMessageId: `provider-${index + 1}`,
      messageType: "text",
      text: `Olá ${index + 1}`,
    });
  }
  store.conversations.set("conversation-active", {
    aiMode: "safe_auto",
    automationState: "ai_active",
  });
  store.conversations.set("conversation-paused", {
    aiMode: "safe_auto",
    automationState: "human_paused",
    pausedUntil: "2026-10-01T12:00:00.000Z",
  });
  store.conversations.set("conversation-off", {
    aiMode: "off",
    automationState: "ai_active",
  });
  return store;
}

describe("GET /internal/support/events", () => {
  it("fails closed with 503 when the machine key is not configured", async () => {
    const response = await request(
      buildApp(new InMemorySupportEventStore(), {}),
    )
      .get(SUPPORT_EVENTS_PATH)
      .set(SUPPORT_EVENTS_KEY_HEADER, "anything");
    expect(response.status).toBe(503);
    expect(response.body).toEqual({
      error: "support_events_key_not_configured",
    });
  });

  it("rejects a missing or wrong key", async () => {
    const app = buildApp(await seededStore());
    const missing = await request(app).get(SUPPORT_EVENTS_PATH);
    const wrong = await request(app)
      .get(SUPPORT_EVENTS_PATH)
      .set(SUPPORT_EVENTS_KEY_HEADER, "wrong");
    expect(missing.status).toBe(401);
    expect(wrong.status).toBe(401);
    expect(wrong.body).toEqual({ error: "unauthorized" });
  });

  it("rejects malformed cursors and limits", async () => {
    const app = buildApp(await seededStore());
    for (const query of [
      "cursor=abc",
      "limit=0",
      "limit=500",
      "workspaceId=x",
    ]) {
      const response = await request(app)
        .get(`${SUPPORT_EVENTS_PATH}?${query}`)
        .set(SUPPORT_EVENTS_KEY_HEADER, KEY);
      expect(response.status).toBe(400);
    }
  });

  it("returns 503 when no service-role store is available", async () => {
    const response = await request(buildApp(null))
      .get(SUPPORT_EVENTS_PATH)
      .set(SUPPORT_EVENTS_KEY_HEADER, KEY);
    expect(response.status).toBe(503);
  });

  it("returns inbound events with live reply flags", async () => {
    const response = await request(buildApp(await seededStore()))
      .get(SUPPORT_EVENTS_PATH)
      .set(SUPPORT_EVENTS_KEY_HEADER, KEY);
    expect(response.status).toBe(200);
    expect(response.body.hasMore).toBe(false);
    expect(response.body.nextCursor).toBe("3");
    expect(response.body.events).toEqual([
      expect.objectContaining({
        cursor: "1",
        workspaceId: "11111111-1111-4111-8111-111111111111",
        conversationId: "conversation-active",
        messageId: "message-1",
        providerMessageId: "provider-1",
        remoteJid: "5511999999999@s.whatsapp.net",
        phoneNumber: "5511999999999",
        isGroup: false,
        text: "Olá 1",
        aiMode: "safe_auto",
        automationState: "ai_active",
        replyAllowed: true,
        createdAt: expect.any(String),
      }),
      expect.objectContaining({
        conversationId: "conversation-paused",
        automationState: "human_paused",
        pausedUntil: "2026-10-01T12:00:00.000Z",
        replyAllowed: true,
      }),
      expect.objectContaining({
        conversationId: "conversation-off",
        aiMode: "off",
        replyAllowed: false,
      }),
    ]);
  });

  it("paginates with an opaque cursor", async () => {
    const app = buildApp(await seededStore());
    const first = await request(app)
      .get(`${SUPPORT_EVENTS_PATH}?limit=2`)
      .set(SUPPORT_EVENTS_KEY_HEADER, KEY);
    expect(first.body.events.map((e: { cursor: string }) => e.cursor)).toEqual([
      "1",
      "2",
    ]);
    expect(first.body.hasMore).toBe(true);
    const second = await request(app)
      .get(`${SUPPORT_EVENTS_PATH}?limit=2&cursor=${first.body.nextCursor}`)
      .set(SUPPORT_EVENTS_KEY_HEADER, KEY);
    expect(second.body.events.map((e: { cursor: string }) => e.cursor)).toEqual(
      ["3"],
    );
    expect(second.body.hasMore).toBe(false);
    const drained = await request(app)
      .get(`${SUPPORT_EVENTS_PATH}?cursor=3`)
      .set(SUPPORT_EVENTS_KEY_HEADER, KEY);
    expect(drained.body).toEqual({
      events: [],
      nextCursor: "3",
      hasMore: false,
    });
  });

  it("fails closed when the conversation is missing", async () => {
    const store = new InMemorySupportEventStore();
    await store.record({
      workspaceId: "w",
      conversationId: "gone",
      messageId: "m",
      remoteJid: "120363@g.us",
    });
    const page = await store.list({ limit: 10 });
    expect(page.events[0]).toMatchObject({
      aiMode: "off",
      replyAllowed: false,
      isGroup: true,
    });
  });

  it("records each message once", async () => {
    const store = new InMemorySupportEventStore();
    const input = {
      workspaceId: "w",
      conversationId: "c",
      messageId: "m",
      remoteJid: "r",
    };
    await store.record(input);
    await store.record(input);
    expect(store.rows).toHaveLength(1);
  });
});

type Call = { table: string; op: string; args: unknown[] };

function fakeClient(tables: Record<string, Record<string, unknown>[]>) {
  const calls: Call[] = [];
  const client: SupportEventsSupabaseClient = {
    from(table: string) {
      const query = {
        select: (...args: unknown[]) => {
          calls.push({ table, op: "select", args });
          return query;
        },
        upsert: (...args: unknown[]) => {
          calls.push({ table, op: "upsert", args });
          return query;
        },
        eq: (...args: unknown[]) => {
          calls.push({ table, op: "eq", args });
          return query;
        },
        gt: (...args: unknown[]) => {
          calls.push({ table, op: "gt", args });
          return query;
        },
        in: (...args: unknown[]) => {
          calls.push({ table, op: "in", args });
          return query;
        },
        order: () => query,
        limit: (...args: unknown[]) => {
          calls.push({ table, op: "limit", args });
          return query;
        },
        then: (
          resolve: (value: { data: unknown; error: null }) => unknown,
          reject?: (reason: unknown) => unknown,
        ) =>
          Promise.resolve({ data: tables[table] ?? [], error: null }).then(
            resolve,
            reject,
          ),
      };
      return query;
    },
  };
  return { client, calls };
}

describe("supportReplyAllowed", () => {
  it("blocks only ai_mode=off; human_paused does not block Support", () => {
    expect(supportReplyAllowed({ aiMode: "off" })).toBe(false);
    expect(supportReplyAllowed({ aiMode: "draft" })).toBe(true);
    expect(supportReplyAllowed({ aiMode: "safe_auto" })).toBe(true);
  });
});

describe("SupabaseSupportEventStore", () => {
  it("upserts idempotently on message_id", async () => {
    const { client, calls } = fakeClient({});
    await new SupabaseSupportEventStore(client).record({
      workspaceId: "w",
      conversationId: "c",
      messageId: "m",
      remoteJid: "r",
      phoneNumber: "55",
      chatType: "direct",
    });
    expect(calls).toContainEqual({
      table: "support_inbound_events",
      op: "upsert",
      args: [
        {
          workspace_id: "w",
          conversation_id: "c",
          message_id: "m",
          remote_jid: "r",
          phone_number: "55",
          chat_type: "direct",
        },
        { onConflict: "message_id", ignoreDuplicates: true },
      ],
    });
  });

  it("joins live message, transcription and pause state into events", async () => {
    const { client, calls } = fakeClient({
      support_inbound_events: [
        {
          id: 7,
          workspace_id: "w",
          conversation_id: "c",
          message_id: "m",
          remote_jid: "5511@s.whatsapp.net",
          phone_number: "5511",
          chat_type: "direct",
          created_at: "2026-10-01T10:00:00Z",
        },
      ],
      messages: [
        {
          id: "m",
          provider_message_id: "p",
          message_type: "audio",
          text: "transcrição do áudio",
          media_storage_path: "w/c/a.ogg",
          mime_type: "audio/ogg",
          duration_seconds: 4,
          transcription_status: "ready",
        },
      ],
      conversations: [{ id: "c", ai_mode: "safe_auto" }],
      conversation_ai_state: [
        { conversation_id: "c", automation_state: "human_paused" },
      ],
    });
    const page = await new SupabaseSupportEventStore(client).list({
      cursor: "6",
      limit: 10,
      workspaceId: "w",
    });
    expect(calls).toContainEqual({
      table: "support_inbound_events",
      op: "gt",
      args: ["id", 6],
    });
    expect(calls).toContainEqual({
      table: "support_inbound_events",
      op: "eq",
      args: ["workspace_id", "w"],
    });
    expect(page).toEqual({
      nextCursor: "7",
      hasMore: false,
      events: [
        {
          cursor: "7",
          workspaceId: "w",
          conversationId: "c",
          messageId: "m",
          providerMessageId: "p",
          remoteJid: "5511@s.whatsapp.net",
          phoneNumber: "5511",
          isGroup: false,
          messageType: "audio",
          text: "transcrição do áudio",
          media: {
            type: "audio",
            mimeType: "audio/ogg",
            durationSeconds: 4,
            storagePath: "w/c/a.ogg",
          },
          transcription: { status: "ready", text: "transcrição do áudio" },
          aiMode: "safe_auto",
          automationState: "human_paused",
          replyAllowed: true,
          createdAt: "2026-10-01T10:00:00Z",
        },
      ],
    });
  });
});
