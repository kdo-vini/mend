import crypto from "node:crypto";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { ApiRouteModuleContext } from "./api-router.js";
import { ApiHttpError, sanitizePublic } from "./api-router.js";

/**
 * Agent keys: machine credentials for external AI agents that call Mend
 * through the MCP server. Each scope unlocks a group of MCP tools; a key only
 * sees the tools its scopes allow.
 */
export const AGENT_KEY_PREFIX = "mend_agent_";
const MAX_ACTIVE_KEYS = 20;

export const agentScopes = [
  "suporte:ler",
  "suporte:responder",
  "suporte:pausar",
  "conhecimento:ler",
  "chamados:ler",
  "chamados:escrever",
  "diario:escrever",
] as const;
export type AgentScope = (typeof agentScopes)[number];

export interface AgentKey {
  id: string;
  label: string;
  scopes: AgentScope[];
  created_by: string;
  created_at: string;
  last_used_at: string | null;
  revoked_at: string | null;
}

/** The identity an MCP call runs as, resolved from a valid key. */
export interface AgentPrincipal {
  keyId: string;
  workspaceId: string;
  label: string;
  scopes: AgentScope[];
  createdBy: string;
}

export function hashAgentKey(key: string): string {
  return crypto.createHash("sha256").update(key).digest("hex");
}

export function generateAgentKey(): string {
  return `${AGENT_KEY_PREFIX}${crypto.randomBytes(32).toString("base64url")}`;
}

/** Unknown scopes in storage are dropped, never granted. */
export function knownScopes(values: unknown): AgentScope[] {
  if (!Array.isArray(values)) return [];
  return values.filter((value): value is AgentScope =>
    (agentScopes as readonly string[]).includes(value as string),
  );
}

export interface AgentKeyPort {
  list(workspaceId: string): Promise<AgentKey[]>;
  create(input: {
    workspaceId: string;
    label: string;
    scopes: AgentScope[];
    createdBy: string;
    tokenHash: string;
  }): Promise<AgentKey>;
  revoke(workspaceId: string, id: string): Promise<boolean>;
}

function failed(code: string): never {
  throw new ApiHttpError(
    code === "42501" ? 403 : 503,
    "agent_keys_failed",
    "Não foi possível acessar as chaves de agente.",
  );
}

const keyColumns =
  "id,label,scopes,created_by,created_at,last_used_at,revoked_at";

function toKey(row: Record<string, unknown>): AgentKey {
  return { ...(row as unknown as AgentKey), scopes: knownScopes(row.scopes) };
}

/** Runs with the caller's JWT, so RLS limits it to workspace owners/admins. */
export class SupabaseAgentKeyAdapter implements AgentKeyPort {
  constructor(private client: SupabaseClient) {}

  async list(workspaceId: string) {
    const result = await this.client
      .from("agent_api_keys")
      .select(keyColumns)
      .eq("workspace_id", workspaceId)
      .order("created_at", { ascending: false })
      .limit(100);
    if (result.error) failed(result.error.code ?? "");
    return (result.data ?? []).map((row) =>
      toKey(row as Record<string, unknown>),
    );
  }

  async create(input: Parameters<AgentKeyPort["create"]>[0]) {
    const result = await this.client
      .from("agent_api_keys")
      .insert({
        workspace_id: input.workspaceId,
        label: input.label,
        scopes: input.scopes,
        created_by: input.createdBy,
        token_hash: input.tokenHash,
      })
      .select(keyColumns)
      .single();
    if (result.error) failed(result.error.code ?? "");
    return toKey(result.data as Record<string, unknown>);
  }

  async revoke(workspaceId: string, id: string) {
    const result = await this.client
      .from("agent_api_keys")
      .update({ revoked_at: new Date().toISOString() })
      .eq("id", id)
      .eq("workspace_id", workspaceId)
      .is("revoked_at", null)
      .select("id");
    if (result.error) failed(result.error.code ?? "");
    return (result.data ?? []).length > 0;
  }
}

/** Service-role lookup used by the MCP endpoint; never trusts the request body. */
export interface AgentKeyLookup {
  findActive(tokenHash: string): Promise<AgentPrincipal | null>;
  touch(id: string): Promise<void>;
}

export class SupabaseAgentKeyLookup implements AgentKeyLookup {
  constructor(private client: SupabaseClient) {}

  async findActive(tokenHash: string) {
    const result = await this.client
      .from("agent_api_keys")
      .select("id,workspace_id,label,scopes,created_by")
      .eq("token_hash", tokenHash)
      .is("revoked_at", null)
      .maybeSingle();
    if (result.error) throw new Error(`agent_key:${result.error.message}`);
    if (!result.data) return null;
    // The key acts on behalf of its creator; it dies with their membership.
    const member = await this.client
      .from("workspace_members")
      .select("role")
      .eq("workspace_id", result.data.workspace_id)
      .eq("user_id", result.data.created_by)
      .maybeSingle();
    if (member.error)
      throw new Error(`agent_key_member:${member.error.message}`);
    if (!member.data || !["owner", "admin"].includes(String(member.data.role)))
      return null;
    return {
      keyId: result.data.id as string,
      workspaceId: result.data.workspace_id as string,
      label: result.data.label as string,
      scopes: knownScopes(result.data.scopes),
      createdBy: result.data.created_by as string,
    };
  }

  async touch(id: string) {
    await this.client
      .from("agent_api_keys")
      .update({ last_used_at: new Date().toISOString() })
      .eq("id", id);
  }
}

const createKeyBody = z
  .object({
    label: z.string().trim().min(1).max(120),
    scopes: z.array(z.enum(agentScopes)).min(1).max(agentScopes.length),
  })
  .strict();

export function registerAgentKeyRoutes(ctx: ApiRouteModuleContext) {
  const { router, dependencies, asyncRoute, scoped, send, noContent, parse } =
    ctx;
  const port = () => {
    if (!dependencies.agentKeys)
      throw new ApiHttpError(
        503,
        "agent_keys_unavailable",
        "As chaves de agente estão indisponíveis.",
      );
    return dependencies.agentKeys;
  };

  router.get(
    "/api/agent-keys",
    asyncRoute(async (req, res) => {
      const scope = await scoped(req, res, "admin");
      res.setHeader("Cache-Control", "no-store");
      send(res, 200, {
        data: await port().list(scope.workspaceId),
        scopes: agentScopes,
      });
    }),
  );
  router.post(
    "/api/agent-keys",
    asyncRoute(async (req, res) => {
      const scope = await scoped(req, res, "admin");
      const body = parse(createKeyBody, req.body);
      const existing = await port().list(scope.workspaceId);
      if (existing.filter((key) => !key.revoked_at).length >= MAX_ACTIVE_KEYS)
        throw new ApiHttpError(
          409,
          "agent_key_limit",
          "Revogue uma chave antes de criar outra.",
        );
      const key = generateAgentKey();
      const record = await port().create({
        workspaceId: scope.workspaceId,
        label: body.label,
        scopes: [...new Set(body.scopes)],
        createdBy: scope.userId,
        tokenHash: hashAgentKey(key),
      });
      res.setHeader("Cache-Control", "no-store");
      // The plain key leaves the server only in this response. `send` strips
      // token-like keys by design, so this one reply bypasses it.
      res.status(201).json({ secret: key, record: sanitizePublic(record) });
    }),
  );
  router.delete(
    "/api/agent-keys/:id",
    asyncRoute(async (req, res) => {
      const scope = await scoped(req, res, "admin");
      if (!(await port().revoke(scope.workspaceId, ctx.pathId(req))))
        throw new ApiHttpError(
          404,
          "agent_key_not_found",
          "Chave não encontrada.",
        );
      noContent(res);
    }),
  );
}
