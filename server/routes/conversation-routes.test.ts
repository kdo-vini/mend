import express from "express";
import request from "supertest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";
import { SupabaseConversationAdapter } from "../adapters/supabase/messaging.js";
import { createApiRouter } from "../api-router.js";
import type {
  ApiRouterDependencies,
  AuthenticatedUser,
} from "../contracts/api-ports.js";
import type { WhatsAppProvider } from "../whatsapp-service.js";

type Row = Record<string, unknown>;

const userId = "11111111-1111-4111-8111-111111111111";
const workspaceId = "22222222-2222-4222-8222-222222222222";
const otherWorkspaceId = "33333333-3333-4333-8333-333333333333";
const channelId = "44444444-4444-4444-8444-444444444444";
const contactId = "55555555-5555-4555-8555-555555555555";
const existingConversationId = "66666666-6666-4666-8666-666666666666";
const foreignConversationId = "77777777-7777-4777-8777-777777777777";
const createdConversationId = "88888888-8888-4888-8888-888888888888";

const user: AuthenticatedUser = {
  id: userId,
  email: "founder@mend.test",
  name: "Founder",
};

/** Minimal PostgREST double covering the reads this route performs. */
class FakeTable implements PromiseLike<{ data: unknown; error: null }> {
  private readonly filters: Array<[string, unknown]> = [];
  private single = false;
  private limitValue?: number;

  constructor(private readonly rows: Row[]) {}

  select() {
    return this;
  }
  eq(column: string, value: unknown) {
    this.filters.push([column, value]);
    return this;
  }
  order() {
    return this;
  }
  limit(value: number) {
    this.limitValue = value;
    return this;
  }
  maybeSingle() {
    this.single = true;
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
    const matched = this.rows
      .filter((row) =>
        this.filters.every(([column, value]) => row[column] === value),
      )
      .slice(0, this.limitValue ?? undefined);
    return Promise.resolve({
      data: this.single ? (matched[0] ?? null) : matched,
      error: null,
    }).then(onfulfilled, onrejected);
  }
}

class FakeSupabase {
  readonly rpcCalls: Array<{ name: string; args: Row }> = [];

  constructor(private readonly tables: Record<string, Row[]>) {}

  from(table: string) {
    return new FakeTable(this.tables[table] ?? []);
  }

  rpc(name: string, args: Row) {
    this.rpcCalls.push({ name, args });
    return Promise.resolve({
      data: {
        message_id: "99999999-9999-4999-8999-999999999999",
        conversation_id: createdConversationId,
        contact_id: contactId,
        unread_count: 0,
        inserted: true,
      },
      error: null,
    });
  }
}

function fakeProvider() {
  return {
    sendText: vi.fn(async () => ({ key: { id: "provider-message-1" } })),
    sendMedia: vi.fn(async () => ({ key: { id: "provider-message-2" } })),
    sendAudio: vi.fn(async () => ({ key: { id: "provider-message-3" } })),
    markAsRead: vi.fn(async () => undefined),
  } satisfies WhatsAppProvider;
}

function createHarness(
  options: {
    channelStatus?: string;
    contacts?: Row[];
    conversations?: Row[];
  } = {},
) {
  const client = new FakeSupabase({
    channel_connections: [
      {
        id: channelId,
        workspace_id: workspaceId,
        provider_instance_name: "techne-support",
        status: options.channelStatus ?? "open",
      },
    ],
    contacts: options.contacts ?? [],
    conversations: options.conversations ?? [],
    ai_outbound_messages: [],
  });
  const provider = fakeProvider();
  const conversations = new SupabaseConversationAdapter(
    client as unknown as SupabaseClient,
    provider,
    undefined,
  );
  const app = express();
  app.use(express.json());
  app.use(
    createApiRouter({
      auth: { authenticate: async () => user },
      membership: {
        getMembership: async (_userId: string, requested: string) =>
          requested === workspaceId
            ? { workspaceId, role: "owner" as const }
            : null,
      },
      conversations,
    } as unknown as ApiRouterDependencies),
  );
  return { app, client, provider };
}

function startConversation(
  app: express.Express,
  body: Record<string, unknown>,
  headerWorkspaceId = workspaceId,
) {
  return request(app)
    .post("/api/conversations")
    .set("x-mend-workspace-id", headerWorkspaceId)
    .send(body);
}

describe("POST /api/conversations", () => {
  it("rejects a phone number with fewer digits than a dial code, area code and subscriber number", async () => {
    const { app, client, provider } = createHarness();

    const response = await startConversation(app, {
      channelId,
      phoneNumber: "+55 11",
      message: "Hello",
    });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe("invalid_phone_number");
    expect(provider.sendText).not.toHaveBeenCalled();
    expect(client.rpcCalls).toEqual([]);
  });

  it("returns the existing conversation and sends nothing when the phone already has one", async () => {
    const { app, client, provider } = createHarness({
      contacts: [
        {
          id: contactId,
          workspace_id: workspaceId,
          phone_number: "5511988887777",
        },
      ],
      conversations: [
        {
          id: existingConversationId,
          workspace_id: workspaceId,
          contact_id: contactId,
        },
      ],
    });

    const response = await startConversation(app, {
      channelId,
      phoneNumber: "+55 (11) 98888-7777",
      message: "Following up on your order",
    });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      conversationId: existingConversationId,
      created: false,
    });
    expect(provider.sendText).not.toHaveBeenCalled();
    expect(client.rpcCalls).toEqual([]);
  });

  it("sends through the provider and records the first message as outbound", async () => {
    const { app, client, provider } = createHarness();

    const response = await startConversation(app, {
      channelId,
      phoneNumber: "+55 (11) 99999-9999",
      message: "  Hi, this is Téchne support.  ",
    });

    expect(response.status).toBe(201);
    expect(response.body).toEqual({
      conversationId: createdConversationId,
      created: true,
    });
    expect(provider.sendText).toHaveBeenCalledWith({
      instanceName: "techne-support",
      number: "5511999999999",
      text: "Hi, this is Téchne support.",
    });
    expect(client.rpcCalls).toHaveLength(1);
    expect(client.rpcCalls[0].name).toBe("inbox_ingest_message");
    expect(client.rpcCalls[0].args).toMatchObject({
      p_workspace_id: workspaceId,
      p_channel_connection_id: channelId,
      p_phone_number: "5511999999999",
      p_direction: "outbound",
      p_message_type: "text",
      p_text: "Hi, this is Téchne support.",
    });
  });

  it("reports a disconnected channel instead of sending", async () => {
    const { app, client, provider } = createHarness({
      channelStatus: "closed",
    });

    const response = await startConversation(app, {
      channelId,
      phoneNumber: "5511999999999",
      message: "Hello",
    });

    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe("channel_not_connected");
    expect(provider.sendText).not.toHaveBeenCalled();
    expect(client.rpcCalls).toEqual([]);
  });

  it("never resolves a conversation that belongs to another workspace", async () => {
    const { app, provider } = createHarness({
      contacts: [
        {
          id: contactId,
          workspace_id: otherWorkspaceId,
          phone_number: "5511999999999",
        },
      ],
      conversations: [
        {
          id: foreignConversationId,
          workspace_id: otherWorkspaceId,
          contact_id: contactId,
        },
      ],
    });

    const response = await startConversation(app, {
      channelId,
      phoneNumber: "5511999999999",
      message: "Hello",
    });

    expect(response.status).toBe(201);
    expect(response.body.conversationId).toBe(createdConversationId);
    expect(provider.sendText).toHaveBeenCalledTimes(1);
  });

  it("refuses a workspace the caller does not belong to before reaching the send path", async () => {
    const { app, client, provider } = createHarness();

    const response = await startConversation(
      app,
      { channelId, phoneNumber: "5511999999999", message: "Hello" },
      otherWorkspaceId,
    );

    expect(response.status).toBe(404);
    expect(provider.sendText).not.toHaveBeenCalled();
    expect(client.rpcCalls).toEqual([]);
  });
});
