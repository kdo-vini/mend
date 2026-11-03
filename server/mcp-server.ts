import type { Express, Request, Response } from "express";
import rateLimit from "express-rate-limit";
import type { Logger } from "pino";
import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import {
  AGENT_KEY_PREFIX,
  hashAgentKey,
  type AgentKeyLookup,
  type AgentPrincipal,
  type AgentScope,
} from "./agent-keys.js";
import { parseBearerToken } from "./auth.js";
import {
  InternalWorkspaceError,
  resolveInternalWorkspace,
  type InternalWorkspacePort,
} from "./internal-workspace.js";
import {
  issueCreateSchema,
  issueIdentifierSchema,
  issueListQuerySchema,
  type IssueRequestContext,
  type IssueService,
} from "./issue-service.js";
import type { KnowledgeService } from "./knowledge-service.js";
import {
  supportPauseReasons,
  type SupportConversationPort,
} from "./support-conversation.js";
import type { SupportEventStore } from "./support-events.js";
import {
  executeSupportSend,
  supportSendBodySchema,
  type SupportSendPort,
} from "./support-send.js";
import {
  WORK_LOG_TTL_DAYS,
  workLogIngestBody,
  type WorkLogIngestStore,
} from "./work-log.js";

/**
 * Mend's own MCP server: external AI agents (agentes.chat bots) call Mend's
 * tools with an agent key. The key's scopes decide which tools the agent even
 * sees; every tool reuses the same contract as the matching /internal route.
 */
export const MCP_SERVER_PATH = "/mcp";
const MCP_API_KEY_HEADER = "x-api-key";

export interface McpServerDependencies {
  keys: AgentKeyLookup | null;
  internalWorkspace: InternalWorkspacePort;
  supportEvents: SupportEventStore | null;
  supportSend: SupportSendPort | null;
  conversations: SupportConversationPort | null;
  knowledge: Pick<KnowledgeService, "list"> | null;
  issues: Pick<IssueService, "list" | "get" | "create" | "addComment"> | null;
  workLog: WorkLogIngestStore | null;
  logger?: Pick<Logger, "error">;
  now?: () => Date;
}

/** Every tool runs in the internal workspace the key belongs to, nowhere else. */
function workspaceFor(deps: McpServerDependencies, principal: AgentPrincipal) {
  return resolveInternalWorkspace(
    deps.internalWorkspace,
    principal.workspaceId,
  );
}

/**
 * Issues are written as the key's creator (the tables reference real users);
 * the agent's name goes into the text so the team sees who actually wrote it.
 */
function issueContext(
  principal: AgentPrincipal,
  workspaceId: string,
): IssueRequestContext {
  return { userId: principal.createdBy, workspaceId, role: "agent" };
}

const MAX_KNOWLEDGE_BODY = 4_000;

function result(data: unknown): CallToolResult {
  return { content: [{ type: "text", text: JSON.stringify(data) }] };
}

function refusal(error: string, status?: number): CallToolResult {
  return {
    isError: true,
    content: [
      {
        type: "text",
        text: JSON.stringify({ error, ...(status ? { status } : {}) }),
      },
    ],
  };
}

function unavailable(
  error: unknown,
  deps: McpServerDependencies,
  tool: string,
) {
  if (error instanceof InternalWorkspaceError) return refusal(error.code);
  deps.logger?.error({ err: error, tool }, "MCP tool failed");
  return refusal("tool_unavailable");
}

interface ToolDefinition {
  scope: AgentScope;
  register(
    server: McpServer,
    principal: AgentPrincipal,
    deps: McpServerDependencies,
  ): void;
}

const supportReplyShape = supportSendBodySchema.omit({
  workspaceId: true,
}).shape;
const workLogShape = workLogIngestBody.shape;

/** Every tool Mend exposes; the key's scopes filter this list per request. */
export const mcpTools: ToolDefinition[] = [
  {
    scope: "suporte:ler",
    register(server, principal, deps) {
      server.registerTool(
        "suporte_listar_eventos",
        {
          title: "Listar eventos do suporte",
          description:
            "Lista as mensagens recebidas e enviadas no WhatsApp do suporte, em ordem, a partir de um cursor. Cada evento traz conversationId, messageId, texto, mídia, aiMode e replyAllowed. Use nextCursor para continuar de onde parou.",
          inputSchema: {
            cursor: z
              .string()
              .trim()
              .regex(/^\d{1,15}$/)
              .optional()
              .describe(
                "nextCursor da página anterior; vazio começa do início",
              ),
            limit: z.number().int().min(1).max(200).optional(),
          },
          annotations: { readOnlyHint: true, openWorldHint: false },
        },
        async ({ cursor, limit }) => {
          if (!deps.supportEvents) return refusal("support_events_unavailable");
          try {
            const workspaceId = await resolveInternalWorkspace(
              deps.internalWorkspace,
              principal.workspaceId,
            );
            return result(
              await deps.supportEvents.list({
                ...(cursor ? { cursor } : {}),
                limit: limit ?? 50,
                workspaceId,
              }),
            );
          } catch (error) {
            return unavailable(error, deps, "suporte_listar_eventos");
          }
        },
      );
    },
  },
  {
    scope: "suporte:responder",
    register(server, principal, deps) {
      server.registerTool(
        "suporte_enviar_resposta",
        {
          title: "Responder cliente no WhatsApp",
          description:
            "Envia uma resposta curta para a conversa do cliente pelo WhatsApp do suporte. Recusa (reply_not_allowed, group_conversation, superseded) quando a IA está desligada na conversa, quando é grupo ou quando chegou mensagem mais nova depois de sourceMessageId. Repetir a mesma resposta para a mesma mensagem não envia duas vezes.",
          inputSchema: supportReplyShape,
          annotations: {
            readOnlyHint: false,
            destructiveHint: false,
            idempotentHint: true,
            openWorldHint: true,
          },
        },
        async (input) => {
          if (!deps.supportSend) return refusal("support_send_unavailable");
          const outcome = await executeSupportSend(
            {
              internalWorkspace: deps.internalWorkspace,
              port: deps.supportSend,
              ...(deps.logger ? { logger: deps.logger } : {}),
            },
            {
              conversationId: input.conversationId,
              text: input.text,
              workspaceId: principal.workspaceId,
              ...(input.sourceMessageId
                ? { sourceMessageId: input.sourceMessageId }
                : {}),
            },
          );
          return outcome.ok
            ? result(outcome.body)
            : refusal(outcome.error, outcome.status);
        },
      );
    },
  },
  {
    scope: "suporte:ler",
    register(server, principal, deps) {
      server.registerTool(
        "suporte_ver_conversa",
        {
          title: "Ver conversa com o cliente",
          description:
            "Mostra o histórico de uma conversa do suporte (mais antigas primeiro) e o estado dela: aiMode, se um humano assumiu (humanTookOver), motivo e horário da pausa e se a IA pode responder (replyAllowed). senderType diz quem escreveu: contact (cliente), user (pessoa da equipe), ai ou system. Leia antes de responder quando a conversa voltou para a IA depois de um humano.",
          inputSchema: {
            conversationId: z.string().uuid(),
            limite: z
              .number()
              .int()
              .min(1)
              .max(200)
              .optional()
              .describe("Quantas mensagens recentes trazer (padrão 50)"),
          },
          annotations: { readOnlyHint: true, openWorldHint: false },
        },
        async ({ conversationId, limite }) => {
          if (!deps.conversations)
            return refusal("support_conversations_unavailable");
          try {
            const view = await deps.conversations.view({
              workspaceId: await workspaceFor(deps, principal),
              conversationId,
              limit: limite ?? 50,
            });
            return view ? result(view) : refusal("conversation_not_found", 404);
          } catch (error) {
            return unavailable(error, deps, "suporte_ver_conversa");
          }
        },
      );
    },
  },
  {
    scope: "suporte:pausar",
    register(server, principal, deps) {
      server.registerTool(
        "suporte_pausar_ia",
        {
          title: "Pausar a IA numa conversa",
          description:
            "Pausa a IA nesta conversa, como o botão Pausar do Mend. Use quando alguém da equipe mandar não responder um cliente, quando o cliente pedir uma pessoa ou quando não for seguro responder. Enquanto pausada, suporte_enviar_resposta continua recusando se a IA estiver desligada, e você não deve responder.",
          inputSchema: {
            conversationId: z.string().uuid(),
            motivo: z
              .enum(supportPauseReasons)
              .optional()
              .describe(
                "manual_pause (padrão: a equipe pediu), customer_requested_human, unsafe_intent ou low_confidence",
              ),
          },
          annotations: {
            readOnlyHint: false,
            destructiveHint: false,
            idempotentHint: true,
            openWorldHint: false,
          },
        },
        async ({ conversationId, motivo }) => {
          if (!deps.conversations)
            return refusal("support_conversations_unavailable");
          try {
            await deps.conversations.pause({
              workspaceId: await workspaceFor(deps, principal),
              conversationId,
              reason: motivo ?? "manual_pause",
            });
            return result({ conversationId, paused: true });
          } catch (error) {
            return unavailable(error, deps, "suporte_pausar_ia");
          }
        },
      );
      server.registerTool(
        "suporte_retomar_ia",
        {
          title: "Retomar a IA numa conversa",
          description:
            "Devolve a conversa para a IA, como o botão Retomar do Mend. Só use quando alguém da equipe pedir. Depois de retomar, leia a conversa com suporte_ver_conversa para entender o que o humano já falou.",
          inputSchema: { conversationId: z.string().uuid() },
          annotations: {
            readOnlyHint: false,
            destructiveHint: false,
            idempotentHint: true,
            openWorldHint: false,
          },
        },
        async ({ conversationId }) => {
          if (!deps.conversations)
            return refusal("support_conversations_unavailable");
          try {
            await deps.conversations.resume({
              workspaceId: await workspaceFor(deps, principal),
              conversationId,
            });
            return result({ conversationId, resumed: true });
          } catch (error) {
            return unavailable(error, deps, "suporte_retomar_ia");
          }
        },
      );
    },
  },
  {
    scope: "conhecimento:ler",
    register(server, principal, deps) {
      server.registerTool(
        "conhecimento_buscar",
        {
          title: "Buscar na base de conhecimento",
          description:
            "Busca artigos publicados na base de conhecimento do Mend pelo título. Traz título, categoria e o texto do artigo (cortado em 4.000 caracteres).",
          inputSchema: {
            busca: z.string().trim().min(1).max(240),
            limite: z.number().int().min(1).max(20).optional(),
          },
          annotations: { readOnlyHint: true, openWorldHint: false },
        },
        async ({ busca, limite }) => {
          if (!deps.knowledge) return refusal("knowledge_unavailable");
          try {
            const workspaceId = await workspaceFor(deps, principal);
            const page = (await deps.knowledge.list(
              { userId: principal.createdBy, workspaceId, role: "agent" },
              { search: busca, status: "published", limit: limite ?? 5 },
            )) as
              | { data?: Record<string, unknown>[] }
              | Record<string, unknown>[];
            const articles = Array.isArray(page) ? page : (page.data ?? []);
            return result(
              articles.map((article) => ({
                id: article.id,
                title: article.title,
                category: article.category ?? null,
                body:
                  typeof article.body === "string"
                    ? article.body.slice(0, MAX_KNOWLEDGE_BODY)
                    : null,
              })),
            );
          } catch (error) {
            return unavailable(error, deps, "conhecimento_buscar");
          }
        },
      );
    },
  },
  {
    scope: "chamados:ler",
    register(server, principal, deps) {
      server.registerTool(
        "chamados_listar",
        {
          title: "Listar chamados",
          description:
            "Lista os chamados do Mend, com filtro por status, prioridade ou busca no título.",
          inputSchema: issueListQuerySchema.omit({ assignedUserId: true })
            .shape,
          annotations: { readOnlyHint: true, openWorldHint: false },
        },
        async (query) => {
          if (!deps.issues) return refusal("issues_unavailable");
          try {
            const workspaceId = await workspaceFor(deps, principal);
            return result(
              await deps.issues.list(
                issueContext(principal, workspaceId),
                query,
              ),
            );
          } catch (error) {
            return unavailable(error, deps, "chamados_listar");
          }
        },
      );
      server.registerTool(
        "chamados_ver",
        {
          title: "Ver chamado",
          description:
            "Mostra um chamado pelo identificador (ex.: ZEL-42), com descrição, status e histórico.",
          inputSchema: { identificador: issueIdentifierSchema },
          annotations: { readOnlyHint: true, openWorldHint: false },
        },
        async ({ identificador }) => {
          if (!deps.issues) return refusal("issues_unavailable");
          try {
            const workspaceId = await workspaceFor(deps, principal);
            const issue = await deps.issues.get(
              issueContext(principal, workspaceId),
              identificador,
            );
            return issue ? result(issue) : refusal("issue_not_found", 404);
          } catch (error) {
            return unavailable(error, deps, "chamados_ver");
          }
        },
      );
    },
  },
  {
    scope: "chamados:escrever",
    register(server, principal, deps) {
      server.registerTool(
        "chamados_criar",
        {
          title: "Abrir chamado",
          description:
            "Abre um chamado no Mend (bug, dúvida, pedido). Ligue à conversa do cliente com conversationId quando vier do suporte. O chamado registra o nome deste agente.",
          inputSchema: issueCreateSchema.pick({
            title: true,
            type: true,
            priority: true,
            description: true,
            reproductionSteps: true,
            expectedBehavior: true,
            actualBehavior: true,
            affectedProduct: true,
            conversationId: true,
          }).shape,
          annotations: {
            readOnlyHint: false,
            destructiveHint: false,
            idempotentHint: false,
            openWorldHint: false,
          },
        },
        async (input) => {
          if (!deps.issues) return refusal("issues_unavailable");
          try {
            const workspaceId = await workspaceFor(deps, principal);
            return result(
              await deps.issues.create(issueContext(principal, workspaceId), {
                ...input,
                source: "ai",
                description: [
                  `Aberto por ${principal.label} (agente) pelo MCP do Mend.`,
                  input.description,
                ]
                  .filter(Boolean)
                  .join("\n\n"),
              }),
            );
          } catch (error) {
            return unavailable(error, deps, "chamados_criar");
          }
        },
      );
      server.registerTool(
        "chamados_comentar",
        {
          title: "Comentar em chamado",
          description:
            "Acrescenta um comentário num chamado. O comentário mostra o nome deste agente.",
          inputSchema: {
            identificador: issueIdentifierSchema,
            texto: z.string().trim().min(1).max(19_000),
          },
          annotations: {
            readOnlyHint: false,
            destructiveHint: false,
            idempotentHint: false,
            openWorldHint: false,
          },
        },
        async ({ identificador, texto }) => {
          if (!deps.issues) return refusal("issues_unavailable");
          try {
            const workspaceId = await workspaceFor(deps, principal);
            const comment = await deps.issues.addComment(
              issueContext(principal, workspaceId),
              identificador,
              { body: `**${principal.label} (agente):** ${texto}` },
            );
            return comment ? result(comment) : refusal("issue_not_found", 404);
          } catch (error) {
            return unavailable(error, deps, "chamados_comentar");
          }
        },
      );
    },
  },
  {
    scope: "diario:escrever",
    register(server, principal, deps) {
      server.registerTool(
        "diario_registrar",
        {
          title: "Registrar no Diário",
          description:
            "Publica um registro curto no Diário do Mend, visível para toda a equipe por 7 dias. O autor é o agente dono desta chave. Mostre o rascunho a quem pediu antes de publicar.",
          inputSchema: workLogShape,
          annotations: {
            readOnlyHint: false,
            destructiveHint: false,
            idempotentHint: false,
            openWorldHint: false,
          },
        },
        async ({ title, body, project }) => {
          if (!deps.workLog) return refusal("work_log_unavailable");
          try {
            const now = deps.now?.() ?? new Date();
            const entry = await deps.workLog.insert({
              workspaceId: principal.workspaceId,
              authorId: principal.createdBy,
              authorName: principal.label,
              title,
              body,
              project: project ?? null,
              expiresAt: new Date(
                now.getTime() + WORK_LOG_TTL_DAYS * 86_400_000,
              ).toISOString(),
            });
            await deps.workLog.purgeExpired();
            return result({
              id: entry.id,
              createdAt: entry.created_at,
              expiresAt: entry.expires_at,
            });
          } catch (error) {
            return unavailable(error, deps, "diario_registrar");
          }
        },
      );
    },
  },
];

export function buildMcpServer(
  principal: AgentPrincipal,
  deps: McpServerDependencies,
): McpServer {
  const server = new McpServer({ name: "mend", version: "1.0.0" });
  for (const tool of mcpTools)
    if (principal.scopes.includes(tool.scope))
      tool.register(server, principal, deps);
  return server;
}

/** Accepts `Authorization: Bearer mend_agent_…` or `x-api-key: mend_agent_…`. */
export function agentKeyFrom(request: Request): string | undefined {
  const bearer = parseBearerToken(request.get("authorization"));
  const key = bearer ?? request.get(MCP_API_KEY_HEADER)?.trim();
  return key?.startsWith(AGENT_KEY_PREFIX) ? key : undefined;
}

const mcpLimiter = rateLimit({
  windowMs: 60_000,
  limit: 120,
  standardHeaders: true,
  legacyHeaders: false,
});

function jsonRpcError(response: Response, status: number, message: string) {
  return response.status(status).json({
    jsonrpc: "2.0",
    error: { code: -32_000, message },
    id: null,
  });
}

/**
 * Stateless Streamable HTTP endpoint. Mounted outside /api so it never takes
 * a user JWT; fails closed without the service-role key lookup.
 */
export function registerMcpServerRoute(
  app: Express,
  deps: McpServerDependencies,
): void {
  app.post(
    MCP_SERVER_PATH,
    mcpLimiter,
    async (request: Request, response: Response) => {
      const key = agentKeyFrom(request);
      if (!key) return jsonRpcError(response, 401, "agent_key_required");
      if (!deps.keys) return jsonRpcError(response, 503, "mcp_not_configured");
      let principal: AgentPrincipal | null;
      try {
        principal = await deps.keys.findActive(hashAgentKey(key));
      } catch (error) {
        deps.logger?.error({ err: error }, "MCP key lookup failed");
        return jsonRpcError(response, 503, "mcp_unavailable");
      }
      if (!principal) return jsonRpcError(response, 401, "agent_key_invalid");
      await deps.keys.touch(principal.keyId).catch(() => undefined);

      const server = buildMcpServer(principal, deps);
      const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: undefined,
        enableJsonResponse: true,
      });
      response.on("close", () => {
        void transport.close();
        void server.close();
      });
      try {
        await server.connect(transport);
        await transport.handleRequest(request, response, request.body);
      } catch (error) {
        deps.logger?.error({ err: error }, "MCP request failed");
        if (!response.headersSent)
          jsonRpcError(response, 500, "mcp_request_failed");
      }
    },
  );
  // Stateless server: no SSE stream to resume and no session to delete.
  for (const method of ["get", "delete"] as const)
    app[method](MCP_SERVER_PATH, (_request, response) =>
      jsonRpcError(response, 405, "method_not_allowed"),
    );
}
