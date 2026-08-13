import { randomUUID } from "node:crypto";
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
interface Workspaces {
  workspaceId: string;
  otherWorkspaceId: string;
}

const userId = "11111111-1111-4111-8111-111111111111";
const channelId = "44444444-4444-4444-8444-444444444444";
const disconnectedChannelId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const unknownChannelId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
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

function fakeProvider(sendTextResponse?: Row) {
  return {
    sendText: vi.fn(
      async () => sendTextResponse ?? { key: { id: "provider-message-1" } },
    ),
    sendMedia: vi.fn(async () => ({ key: { id: "provider-message-2" } })),
    sendAudio: vi.fn(async () => ({ key: { id: "provider-message-3" } })),
    markAsRead: vi.fn(async () => undefined),
  } satisfies WhatsAppProvider;
}

/**
 * Each harness owns a fresh workspace id because the route's cold-send window
 * lives at module scope, exactly as it does in the running server.
 */
function createHarness(
  options: {
    channelStatus?: string;
    contacts?: (ids: Workspaces) => Row[];
    conversations?: (ids: Workspaces) => Row[];
    sendTextResponse?: Row;
  } = {},
) {
  const workspaceId = randomUUID();
  const otherWorkspaceId = randomUUID();
  const ids: Workspaces = { workspaceId, otherWorkspaceId };
  const client = new FakeSupabase({
    channel_connections: [
      {
        id: channelId,
        workspace_id: workspaceId,
        provider_instance_name: "techne-support",
        status: options.channelStatus ?? "open",
      },
      {
        id: disconnectedChannelId,
        workspace_id: workspaceId,
        provider_instance_name: "techne-support-spare",
        status: "closed",
      },
    ],
    contacts: options.contacts?.(ids) ?? [],
    conversations: options.conversations?.(ids) ?? [],
    ai_outbound_messages: [],
  });
  const provider = fakeProvider(options.sendTextResponse);
  const app = express();
  app.use(express.json());
  // server/index.ts builds the router and its adapters inside a per-request
  // middleware. Mounting once here would let per-router state survive in a way
  // production never does, so the harness rebuilds both on every request.
  app.use((request, response, next) => {
    const conversations = new SupabaseConversationAdapter(
      client as unknown as SupabaseClient,
      provider,
      undefined,
    );
    createApiRouter({
      auth: { authenticate: async () => user },
      membership: {
        getMembership: async (_userId: string, requested: string) =>
          requested === workspaceId
            ? { workspaceId, role: "owner" as const }
            : null,
      },
      conversations,
    } as unknown as ApiRouterDependencies)(request, response, next);
  });
  return { app, client, provider, workspaceId, otherWorkspaceId };
}

function startConversation(
  app: express.Express,
  workspaceId: string,
  body: Record<string, unknown>,
) {
  return request(app)
    .post("/api/conversations")
    .set("x-mend-workspace-id", workspaceId)
    .send(body);
}

const existingThread = {
  contacts: ({ workspaceId }: Workspaces, phoneNumber: string) => [
    { id: contactId, workspace_id: workspaceId, phone_number: phoneNumber },
  ],
  conversations: ({ workspaceId }: Workspaces) => [
    {
      id: existingConversationId,
      workspace_id: workspaceId,
      contact_id: contactId,
    },
  ],
};

describe("POST /api/conversations", () => {
  it("rejects a phone number with fewer digits than a dial code, area code and subscriber number", async () => {
    const { app, client, provider, workspaceId } = createHarness();

    const response = await startConversation(app, workspaceId, {
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
    const { app, client, provider, workspaceId } = createHarness({
      contacts: (ids) => existingThread.contacts(ids, "5511988887777"),
      conversations: existingThread.conversations,
    });

    const response = await startConversation(app, workspaceId, {
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

  it("matches a Brazilian contact stored without the ninth digit", async () => {
    const { app, client, provider, workspaceId } = createHarness({
      contacts: (ids) => existingThread.contacts(ids, "551188887777"),
      conversations: existingThread.conversations,
    });

    const response = await startConversation(app, workspaceId, {
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

  it("matches a Brazilian contact stored with the ninth digit when the founder omits it", async () => {
    const { app, client, provider, workspaceId } = createHarness({
      contacts: (ids) => existingThread.contacts(ids, "5511988887777"),
      conversations: existingThread.conversations,
    });

    const response = await startConversation(app, workspaceId, {
      channelId,
      phoneNumber: "+55 (11) 8888-7777",
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

  it("stops cold first contacts once the workspace hourly limit is reached", async () => {
    const { app, provider, workspaceId } = createHarness();

    for (let index = 0; index < 20; index += 1) {
      const allowed = await startConversation(app, workspaceId, {
        channelId,
        phoneNumber: `5511${900000000 + index}`,
        message: "Hello",
      });
      expect(allowed.status).toBe(201);
    }

    const blocked = await startConversation(app, workspaceId, {
      channelId,
      phoneNumber: "5511900000099",
      message: "Hello",
    });

    expect(blocked.status).toBe(429);
    expect(blocked.body.error.code).toBe("outbound_first_limit_exceeded");
    expect(provider.sendText).toHaveBeenCalledTimes(20);
  });

  it("does not spend cold-send quota on a number that already has a conversation", async () => {
    const { app, provider, workspaceId } = createHarness({
      contacts: (ids) => existingThread.contacts(ids, "5511988887777"),
      conversations: existingThread.conversations,
    });

    for (let index = 0; index < 20; index += 1) {
      const existing = await startConversation(app, workspaceId, {
        channelId,
        phoneNumber: "5511988887777",
        message: "Hello again",
      });
      expect(existing.status).toBe(200);
    }

    const response = await startConversation(app, workspaceId, {
      channelId,
      phoneNumber: "5521977776666",
      message: "Hello",
    });

    expect(response.status).toBe(201);
    expect(provider.sendText).toHaveBeenCalledTimes(1);
  });

  it("returns the reserved slot when the channel fails before the provider", async () => {
    const { app, provider, workspaceId } = createHarness();

    for (let index = 0; index < 10; index += 1) {
      const missing = await startConversation(app, workspaceId, {
        channelId: unknownChannelId,
        phoneNumber: `5511${900000000 + index}`,
        message: "Hello",
      });
      expect(missing.status).toBe(404);
    }
    for (let index = 0; index < 10; index += 1) {
      const disconnected = await startConversation(app, workspaceId, {
        channelId: disconnectedChannelId,
        phoneNumber: `5511${910000000 + index}`,
        message: "Hello",
      });
      expect(disconnected.status).toBe(409);
    }
    expect(provider.sendText).not.toHaveBeenCalled();

    const response = await startConversation(app, workspaceId, {
      channelId,
      phoneNumber: "5511999999999",
      message: "Hello",
    });

    expect(response.status).toBe(201);
    expect(provider.sendText).toHaveBeenCalledTimes(1);
  });

  it("sends through the provider and records the first message as outbound", async () => {
    const { app, client, provider, workspaceId } = createHarness();

    const response = await startConversation(app, workspaceId, {
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

  it("records the number WhatsApp resolved rather than the digits typed", async () => {
    const { app, client, provider, workspaceId } = createHarness({
      sendTextResponse: {
        key: {
          id: "provider-message-1",
          remoteJid: "551188887777@s.whatsapp.net",
        },
      },
    });

    const response = await startConversation(app, workspaceId, {
      channelId,
      phoneNumber: "+55 (11) 98888-7777",
      message: "Hello",
    });

    expect(response.status).toBe(201);
    // The provider is still dialled with what the founder typed.
    expect(provider.sendText).toHaveBeenCalledWith({
      instanceName: "techne-support",
      number: "5511988887777",
      text: "Hello",
    });
    // The contact is stored under the resolved number, so the customer's reply
    // arriving under that JID joins this conversation instead of opening a
    // second one.
    expect(client.rpcCalls[0].args).toMatchObject({
      p_phone_number: "551188887777",
      p_direction: "outbound",
    });
  });

  it("falls back to the typed digits when the provider reports no resolved number", async () => {
    const { app, client, workspaceId } = createHarness();

    const response = await startConversation(app, workspaceId, {
      channelId,
      phoneNumber: "+55 (11) 98888-7777",
      message: "Hello",
    });

    expect(response.status).toBe(201);
    expect(client.rpcCalls[0].args).toMatchObject({
      p_phone_number: "5511988887777",
    });
  });

  it("reports a disconnected channel instead of sending", async () => {
    const { app, client, provider, workspaceId } = createHarness({
      channelStatus: "closed",
    });

    const response = await startConversation(app, workspaceId, {
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
    const { app, provider, workspaceId } = createHarness({
      contacts: ({ otherWorkspaceId }) => [
        {
          id: contactId,
          workspace_id: otherWorkspaceId,
          phone_number: "5511999999999",
        },
      ],
      conversations: ({ otherWorkspaceId }) => [
        {
          id: foreignConversationId,
          workspace_id: otherWorkspaceId,
          contact_id: contactId,
        },
      ],
    });

    const response = await startConversation(app, workspaceId, {
      channelId,
      phoneNumber: "5511999999999",
      message: "Hello",
    });

    expect(response.status).toBe(201);
    expect(response.body.conversationId).toBe(createdConversationId);
    expect(provider.sendText).toHaveBeenCalledTimes(1);
  });

  it("refuses a workspace the caller does not belong to before reaching the send path", async () => {
    const { app, client, provider, otherWorkspaceId } = createHarness();

    const response = await startConversation(app, otherWorkspaceId, {
      channelId,
      phoneNumber: "5511999999999",
      message: "Hello",
    });

    expect(response.status).toBe(404);
    expect(provider.sendText).not.toHaveBeenCalled();
    expect(client.rpcCalls).toEqual([]);
  });
});
