import express from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import {
  hashAgentKey,
  type AgentKeyLookup,
  type AgentPrincipal,
  type AgentScope,
} from "./agent-keys.js";
import {
  MCP_SERVER_PATH,
  registerMcpServerRoute,
  type McpServerDependencies,
} from "./mcp-server.js";
import type { IssueService } from "./issue-service.js";
import type { KnowledgeService } from "./knowledge-service.js";
import type { SupportConversationPort } from "./support-conversation.js";
import type { SupportEventStore } from "./support-events.js";
import type { SupportSendPort } from "./support-send.js";
import type { WorkLogIngestStore } from "./work-log.js";

const KEY = `mend_agent_${"a".repeat(43)}`;
const WORKSPACE = "11111111-1111-4111-8111-111111111111";
const CREATOR = "22222222-2222-4222-8222-222222222222";
const CONVERSATION = "33333333-3333-4333-8333-333333333333";

function principal(scopes: AgentScope[]): AgentPrincipal {
  return {
    keyId: "key-1",
    workspaceId: WORKSPACE,
    label: "Rafa",
    scopes,
    createdBy: CREATOR,
  };
}

function fakeKeys(scopes: AgentScope[]): AgentKeyLookup {
  return {
    findActive: vi.fn(async (hash: string) =>
      hash === hashAgentKey(KEY) ? principal(scopes) : null,
    ),
    touch: vi.fn(async () => undefined),
  };
}

function fakeSend(aiMode = "on"): SupportSendPort {
  return {
    findConversation: vi.fn(async () => ({ workspaceId: WORKSPACE, aiMode })),
    sendText: vi.fn(async () => ({
      messageId: "message-1",
      providerMessageId: "provider-1",
    })),
  };
}

function fakeEvents(): SupportEventStore {
  return {
    record: vi.fn(),
    list: vi.fn(async () => ({ events: [], nextCursor: null, hasMore: false })),
    hydrate: vi.fn(),
  } as unknown as SupportEventStore;
}

function fakeWorkLog(): WorkLogIngestStore {
  return {
    findActiveToken: vi.fn(),
    authorName: vi.fn(),
    insert: vi.fn(async (entry) => ({
      id: "entry-1",
      author_id: entry.authorId,
      author_name: entry.authorName,
      title: entry.title,
      body: entry.body,
      project: entry.project,
      source: "claude" as const,
      created_at: "2026-11-04T12:00:00.000Z",
      expires_at: entry.expiresAt,
    })),
    touchToken: vi.fn(),
    purgeExpired: vi.fn(async () => undefined),
  };
}

function fakeConversations(): SupportConversationPort {
  return {
    view: vi.fn(async ({ conversationId }) => ({
      conversationId,
      contact: { name: "Cantinho do Pastel", phone: "5514999999999" },
      aiMode: "safe_auto",
      status: "open",
      attentionState: "ai_handling",
      automationState: "ai_active",
      humanTookOver: false,
      humanTakeoverAt: null,
      humanTakeoverReason: null,
      pausedUntil: null,
      replyAllowed: true,
      messages: [
        {
          id: "m1",
          direction: "inbound",
          senderType: "contact",
          messageType: "text",
          text: "Não está indo",
          createdAt: "2026-11-04T08:28:00.000Z",
          deleted: false,
        },
      ],
      hasOlderMessages: false,
    })),
    pause: vi.fn(async () => undefined),
    resume: vi.fn(async () => undefined),
  };
}

function fakeKnowledge() {
  return {
    list: vi.fn(async () => [
      {
        id: "article-1",
        title: "Como gerar o Pix da assinatura",
        category: "Assinatura",
        body: "x".repeat(5_000),
      },
    ]),
  } as unknown as Pick<KnowledgeService, "list">;
}

function fakeIssues() {
  return {
    list: vi.fn(async () => ({ data: [], nextCursor: null })),
    get: vi.fn(async (_context, identifier) =>
      identifier === "ZEL-1" ? { identifier: "ZEL-1" } : null,
    ),
    create: vi.fn(async () => ({ identifier: "ZEL-2" })),
    addComment: vi.fn(async () => ({ id: "comment-1" })),
  } as unknown as Pick<IssueService, "list" | "get" | "create" | "addComment">;
}

const ALL_SCOPES: AgentScope[] = [
  "suporte:ler",
  "suporte:responder",
  "suporte:pausar",
  "conhecimento:ler",
  "chamados:ler",
  "chamados:escrever",
  "diario:escrever",
];

function buildApp(overrides: Partial<McpServerDependencies> = {}) {
  const deps: McpServerDependencies = {
    keys: fakeKeys(["suporte:ler", "suporte:responder", "diario:escrever"]),
    internalWorkspace: { resolve: async () => WORKSPACE },
    supportEvents: fakeEvents(),
    supportSend: fakeSend(),
    conversations: fakeConversations(),
    knowledge: fakeKnowledge(),
    issues: fakeIssues(),
    workLog: fakeWorkLog(),
    now: () => new Date("2026-11-04T12:00:00.000Z"),
    ...overrides,
  };
  const app = express();
  app.use(express.json());
  registerMcpServerRoute(app, deps);
  return { app, deps };
}

function rpc(
  app: express.Express,
  method: string,
  params: Record<string, unknown> = {},
  auth: Record<string, string> = { authorization: `Bearer ${KEY}` },
) {
  return request(app)
    .post(MCP_SERVER_PATH)
    .set("accept", "application/json, text/event-stream")
    .set(auth)
    .send({ jsonrpc: "2.0", id: 1, method, params });
}

function toolPayload(response: request.Response) {
  const result = response.body.result as {
    isError?: boolean;
    content: { text: string }[];
  };
  return {
    isError: result.isError === true,
    data: JSON.parse(result.content[0]!.text) as Record<string, unknown>,
  };
}

describe("POST /mcp", () => {
  it("refuses calls without an agent key before looking anything up", async () => {
    const { app, deps } = buildApp();
    expect((await rpc(app, "tools/list", {}, {})).status).toBe(401);
    expect(
      (
        await rpc(
          app,
          "tools/list",
          {},
          { authorization: "Bearer mend_diario_x" },
        )
      ).status,
    ).toBe(401);
    expect(deps.keys!.findActive).not.toHaveBeenCalled();
  });

  it("refuses an unknown or revoked key", async () => {
    const { app } = buildApp();
    const response = await rpc(
      app,
      "tools/list",
      {},
      {
        authorization: `Bearer mend_agent_${"b".repeat(43)}`,
      },
    );
    expect(response.status).toBe(401);
  });

  it("fails closed when the key lookup is not configured", async () => {
    const { app } = buildApp({ keys: null });
    expect((await rpc(app, "tools/list")).status).toBe(503);
  });

  it("lists only the tools the key's scopes allow", async () => {
    const { app } = buildApp({ keys: fakeKeys(["diario:escrever"]) });
    const response = await rpc(app, "tools/list");
    expect(response.status).toBe(200);
    const names = (response.body.result.tools as { name: string }[]).map(
      (tool) => tool.name,
    );
    expect(names).toEqual(["diario_registrar"]);
  });

  it("accepts the key in the x-api-key header", async () => {
    const { app } = buildApp();
    const response = await rpc(app, "tools/list", {}, { "x-api-key": KEY });
    expect(response.status).toBe(200);
    expect(response.body.result.tools).toHaveLength(4);
  });

  it("does not run a tool outside the key's scopes", async () => {
    const send = fakeSend();
    const { app } = buildApp({
      keys: fakeKeys(["suporte:ler"]),
      supportSend: send,
    });
    const response = await rpc(app, "tools/call", {
      name: "suporte_enviar_resposta",
      arguments: { conversationId: CONVERSATION, text: "Oi" },
    });
    expect(response.body.error ?? response.body.result.isError).toBeTruthy();
    expect(send.sendText).not.toHaveBeenCalled();
  });

  it("sends a Support reply scoped to the key's workspace", async () => {
    const send = fakeSend();
    const { app } = buildApp({ supportSend: send });
    const response = await rpc(app, "tools/call", {
      name: "suporte_enviar_resposta",
      arguments: { conversationId: CONVERSATION, text: "Já resolvi." },
    });
    const payload = toolPayload(response);
    expect(payload.isError).toBe(false);
    expect(payload.data).toMatchObject({
      workspaceId: WORKSPACE,
      conversationId: CONVERSATION,
      messageId: "message-1",
    });
    expect(send.findConversation).toHaveBeenCalledWith({
      conversationId: CONVERSATION,
      workspaceId: WORKSPACE,
    });
    expect(send.sendText).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: WORKSPACE,
        text: "Já resolvi.",
        idempotencyKey: expect.stringMatching(/^support-send:/),
      }),
    );
  });

  it("keeps the Support contract: no reply when the AI is off", async () => {
    const send = fakeSend("off");
    const { app } = buildApp({ supportSend: send });
    const payload = toolPayload(
      await rpc(app, "tools/call", {
        name: "suporte_enviar_resposta",
        arguments: { conversationId: CONVERSATION, text: "Oi" },
      }),
    );
    expect(payload).toEqual({
      isError: true,
      data: { error: "reply_not_allowed", status: 409 },
    });
    expect(send.sendText).not.toHaveBeenCalled();
  });

  it("lists Support events of the internal workspace", async () => {
    const events = fakeEvents();
    const { app } = buildApp({ supportEvents: events });
    const payload = toolPayload(
      await rpc(app, "tools/call", {
        name: "suporte_listar_eventos",
        arguments: { cursor: "10", limit: 5 },
      }),
    );
    expect(payload.data).toEqual({
      events: [],
      nextCursor: null,
      hasMore: false,
    });
    expect(events.list).toHaveBeenCalledWith({
      cursor: "10",
      limit: 5,
      workspaceId: WORKSPACE,
    });
  });

  it("writes to the Diário as the agent, owned by the key's creator", async () => {
    const workLog = fakeWorkLog();
    const { app } = buildApp({ workLog });
    const payload = toolPayload(
      await rpc(app, "tools/call", {
        name: "diario_registrar",
        arguments: {
          title: "Teste",
          body: "Conectado ao Mend.",
          project: "Zelo",
        },
      }),
    );
    expect(payload.isError).toBe(false);
    expect(workLog.insert).toHaveBeenCalledWith({
      workspaceId: WORKSPACE,
      authorId: CREATOR,
      authorName: "Rafa",
      title: "Teste",
      body: "Conectado ao Mend.",
      project: "Zelo",
      expiresAt: "2026-11-11T12:00:00.000Z",
    });
  });

  it("has no SSE stream or session to open", async () => {
    const { app } = buildApp();
    expect(
      (
        await request(app)
          .get(MCP_SERVER_PATH)
          .set("authorization", `Bearer ${KEY}`)
      ).status,
    ).toBe(405);
  });
});

describe("MCP client handshake", () => {
  it("works with the official SDK client over Streamable HTTP", async () => {
    const { Client } = await import(
      "@modelcontextprotocol/sdk/client/index.js"
    );
    const { StreamableHTTPClientTransport } = await import(
      "@modelcontextprotocol/sdk/client/streamableHttp.js"
    );
    const workLog = fakeWorkLog();
    const { app } = buildApp({ workLog });
    const server = app.listen(0);
    try {
      const address = server.address() as { port: number };
      const client = new Client({ name: "agentes-test", version: "1.0.0" });
      await client.connect(
        new StreamableHTTPClientTransport(
          new URL(`http://127.0.0.1:${address.port}${MCP_SERVER_PATH}`),
          { requestInit: { headers: { authorization: `Bearer ${KEY}` } } },
        ),
      );
      const tools = await client.listTools();
      expect(tools.tools.map((tool) => tool.name).sort()).toEqual([
        "diario_registrar",
        "suporte_enviar_resposta",
        "suporte_listar_eventos",
        "suporte_ver_conversa",
      ]);
      const called = await client.callTool({
        name: "diario_registrar",
        arguments: { title: "Teste", body: "Pelo cliente MCP." },
      });
      expect(called.isError).toBeFalsy();
      expect(workLog.insert).toHaveBeenCalledTimes(1);
      await client.close();
    } finally {
      server.close();
    }
  });
});

describe("support, knowledge and issue tools", () => {
  const call = (
    app: express.Express,
    name: string,
    args: Record<string, unknown>,
  ) => rpc(app, "tools/call", { name, arguments: args });

  it("lists every tool when the key has every scope", async () => {
    const { app } = buildApp({ keys: fakeKeys(ALL_SCOPES) });
    const names = (
      (await rpc(app, "tools/list")).body.result.tools as { name: string }[]
    )
      .map((tool) => tool.name)
      .sort();
    expect(names).toEqual([
      "chamados_comentar",
      "chamados_criar",
      "chamados_listar",
      "chamados_ver",
      "conhecimento_buscar",
      "diario_registrar",
      "suporte_enviar_resposta",
      "suporte_listar_eventos",
      "suporte_pausar_ia",
      "suporte_retomar_ia",
      "suporte_ver_conversa",
    ]);
  });

  it("shows one conversation's history and state in the key's workspace", async () => {
    const conversations = fakeConversations();
    const { app } = buildApp({ conversations });
    const payload = toolPayload(
      await call(app, "suporte_ver_conversa", {
        conversationId: CONVERSATION,
        limite: 20,
      }),
    );
    expect(payload.data).toMatchObject({
      humanTookOver: false,
      replyAllowed: true,
      messages: [{ senderType: "contact", text: "Não está indo" }],
    });
    expect(conversations.view).toHaveBeenCalledWith({
      workspaceId: WORKSPACE,
      conversationId: CONVERSATION,
      limit: 20,
    });
  });

  it("pauses and resumes the AI only with the pause scope", async () => {
    const conversations = fakeConversations();
    const reader = buildApp({ conversations });
    expect(
      (
        await call(reader.app, "suporte_pausar_ia", {
          conversationId: CONVERSATION,
        })
      ).body.result?.isError ?? true,
    ).toBe(true);
    expect(conversations.pause).not.toHaveBeenCalled();

    const { app } = buildApp({
      keys: fakeKeys(["suporte:pausar"]),
      conversations,
    });
    await call(app, "suporte_pausar_ia", { conversationId: CONVERSATION });
    expect(conversations.pause).toHaveBeenCalledWith({
      workspaceId: WORKSPACE,
      conversationId: CONVERSATION,
      reason: "manual_pause",
    });
    await call(app, "suporte_retomar_ia", { conversationId: CONVERSATION });
    expect(conversations.resume).toHaveBeenCalledWith({
      workspaceId: WORKSPACE,
      conversationId: CONVERSATION,
    });
  });

  it("searches only published knowledge and trims long articles", async () => {
    const knowledge = fakeKnowledge();
    const { app } = buildApp({
      keys: fakeKeys(["conhecimento:ler"]),
      knowledge,
    });
    const payload = toolPayload(
      await call(app, "conhecimento_buscar", { busca: "Pix" }),
    );
    const [article] = payload.data as unknown as { body: string }[];
    expect(article!.body).toHaveLength(4_000);
    expect(knowledge.list).toHaveBeenCalledWith(
      { userId: CREATOR, workspaceId: WORKSPACE, role: "agent" },
      { search: "Pix", status: "published", limit: 5 },
    );
  });

  it("opens and comments on issues signed with the agent's name", async () => {
    const issues = fakeIssues();
    const { app } = buildApp({
      keys: fakeKeys(["chamados:ler", "chamados:escrever"]),
      issues,
    });
    await call(app, "chamados_criar", {
      title: "Pix não baixa o valor",
      type: "bug",
      description: "Cliente desmarcou o ZeloMenu e o valor seguiu R$ 99.",
      conversationId: CONVERSATION,
    });
    expect(issues.create).toHaveBeenCalledWith(
      { userId: CREATOR, workspaceId: WORKSPACE, role: "agent" },
      expect.objectContaining({
        title: "Pix não baixa o valor",
        source: "ai",
        conversationId: CONVERSATION,
        description:
          "Aberto por Rafa (agente) pelo MCP do Mend.\n\nCliente desmarcou o ZeloMenu e o valor seguiu R$ 99.",
      }),
    );
    await call(app, "chamados_comentar", {
      identificador: "ZEL-1",
      texto: "Cliente confirmou que funcionou.",
    });
    expect(issues.addComment).toHaveBeenCalledWith(expect.anything(), "ZEL-1", {
      body: "**Rafa (agente):** Cliente confirmou que funcionou.",
    });
    expect(
      toolPayload(await call(app, "chamados_ver", { identificador: "ZEL-9" })),
    ).toEqual({
      isError: true,
      data: { error: "issue_not_found", status: 404 },
    });
  });
});
