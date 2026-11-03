import crypto from "node:crypto";
import type { Express, Request, Response } from "express";
import rateLimit from "express-rate-limit";
import type { Logger } from "pino";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { ApiRouteModuleContext } from "./api-router.js";
import { ApiHttpError, sanitizePublic } from "./api-router.js";
import { parseBearerToken } from "./auth.js";

/**
 * Diário: short work notes a teammate's Claude Code session posts on request,
 * readable by the whole internal workspace for a limited time.
 */
export const WORK_LOG_INGEST_PATH = "/internal/work-log";
export const WORK_LOG_TOKEN_PREFIX = "mend_diario_";
export const WORK_LOG_TTL_DAYS = 7;
const MAX_ACTIVE_TOKENS = 5;

export interface WorkLogEntry {
  id: string;
  author_id: string;
  author_name: string;
  title: string;
  body: string;
  project: string | null;
  source: "claude" | "manual";
  created_at: string;
  expires_at: string;
}

export interface WorkLogToken {
  id: string;
  label: string;
  created_at: string;
  last_used_at: string | null;
  revoked_at: string | null;
}

export interface WorkLogPort {
  list(): Promise<WorkLogEntry[]>;
  remove(id: string): Promise<boolean>;
  listTokens(userId: string): Promise<WorkLogToken[]>;
  createToken(input: {
    workspaceId: string;
    userId: string;
    label: string;
    tokenHash: string;
  }): Promise<WorkLogToken>;
  revokeToken(userId: string, id: string): Promise<boolean>;
}

export function hashWorkLogToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

export function generateWorkLogToken(): string {
  return `${WORK_LOG_TOKEN_PREFIX}${crypto.randomBytes(32).toString("base64url")}`;
}

function failed(code: string): never {
  throw new ApiHttpError(
    code === "42501" ? 403 : 503,
    "work_log_failed",
    "Não foi possível acessar o diário.",
  );
}

const entryColumns =
  "id,author_id,author_name,title,body,project,source,created_at,expires_at";
const tokenColumns = "id,label,created_at,last_used_at,revoked_at";

export class SupabaseWorkLogAdapter implements WorkLogPort {
  constructor(private client: SupabaseClient) {}

  async list() {
    const result = await this.client
      .from("work_logs")
      .select(entryColumns)
      .gt("expires_at", new Date().toISOString())
      .order("created_at", { ascending: false })
      .limit(500);
    if (result.error) failed(result.error.code ?? "");
    return (result.data ?? []) as WorkLogEntry[];
  }

  async remove(id: string) {
    const result = await this.client
      .from("work_logs")
      .delete()
      .eq("id", id)
      .select("id");
    if (result.error) failed(result.error.code ?? "");
    return (result.data ?? []).length > 0;
  }

  async listTokens(userId: string) {
    const result = await this.client
      .from("work_log_tokens")
      .select(tokenColumns)
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(50);
    if (result.error) failed(result.error.code ?? "");
    return (result.data ?? []) as WorkLogToken[];
  }

  async createToken(input: {
    workspaceId: string;
    userId: string;
    label: string;
    tokenHash: string;
  }) {
    const result = await this.client
      .from("work_log_tokens")
      .insert({
        workspace_id: input.workspaceId,
        user_id: input.userId,
        label: input.label,
        token_hash: input.tokenHash,
      })
      .select(tokenColumns)
      .single();
    if (result.error) failed(result.error.code ?? "");
    return result.data as WorkLogToken;
  }

  async revokeToken(userId: string, id: string) {
    const result = await this.client
      .from("work_log_tokens")
      .update({ revoked_at: new Date().toISOString() })
      .eq("id", id)
      .eq("user_id", userId)
      .is("revoked_at", null)
      .select("id");
    if (result.error) failed(result.error.code ?? "");
    return (result.data ?? []).length > 0;
  }
}

export function registerWorkLogRoutes(ctx: ApiRouteModuleContext) {
  const {
    router,
    dependencies,
    asyncRoute,
    scoped,
    send,
    noContent,
    parse,
    pathId,
  } = ctx;
  const port = () => {
    if (!dependencies.workLog)
      throw new ApiHttpError(
        503,
        "work_log_unavailable",
        "O diário está indisponível.",
      );
    return dependencies.workLog;
  };

  router.get(
    "/api/work-log",
    asyncRoute(async (req, res) => {
      const scope = await scoped(req, res);
      const manager = scope.role === "owner" || scope.role === "admin";
      res.setHeader("Cache-Control", "no-store");
      send(res, 200, {
        data: (await port().list()).map((entry) => ({
          ...entry,
          // Mirrors the delete policy so the page only offers what RLS allows.
          deletable: manager || entry.author_id === scope.userId,
        })),
      });
    }),
  );
  router.delete(
    "/api/work-log/entries/:id",
    asyncRoute(async (req, res) => {
      await scoped(req, res);
      // RLS restricts deletion to the author or an owner/admin; anything else
      // deletes nothing and reads as not found.
      if (!(await port().remove(pathId(req))))
        throw new ApiHttpError(
          404,
          "work_log_entry_not_found",
          "Registro não encontrado.",
        );
      noContent(res);
    }),
  );
  router.get(
    "/api/work-log/tokens",
    asyncRoute(async (req, res) => {
      const scope = await scoped(req, res);
      res.setHeader("Cache-Control", "no-store");
      send(res, 200, { data: await port().listTokens(scope.userId) });
    }),
  );
  router.post(
    "/api/work-log/tokens",
    asyncRoute(async (req, res) => {
      const scope = await scoped(req, res);
      const body = parse(
        z.object({ label: z.string().trim().min(1).max(120) }).strict(),
        req.body,
      );
      const existing = await port().listTokens(scope.userId);
      if (
        existing.filter((token) => !token.revoked_at).length >=
        MAX_ACTIVE_TOKENS
      )
        throw new ApiHttpError(
          409,
          "work_log_token_limit",
          "Revogue um token antes de criar outro.",
        );
      const token = generateWorkLogToken();
      const record = await port().createToken({
        workspaceId: scope.workspaceId,
        userId: scope.userId,
        label: body.label,
        tokenHash: hashWorkLogToken(token),
      });
      res.setHeader("Cache-Control", "no-store");
      // The plain token leaves the server only in this response. `send`
      // strips token-like keys by design, so this one reply bypasses it.
      res.status(201).json({ secret: token, record: sanitizePublic(record) });
    }),
  );
  router.delete(
    "/api/work-log/tokens/:id",
    asyncRoute(async (req, res) => {
      const scope = await scoped(req, res);
      if (!(await port().revokeToken(scope.userId, pathId(req))))
        throw new ApiHttpError(
          404,
          "work_log_token_not_found",
          "Token não encontrado.",
        );
      noContent(res);
    }),
  );
}

export const workLogIngestBody = z
  .object({
    title: z.string().trim().min(1).max(200),
    body: z.string().trim().min(1).max(8000),
    project: z.string().trim().min(1).max(200).optional(),
  })
  .strict();

export interface WorkLogIngestStore {
  /** Active token owner, only while they remain a member of the workspace. */
  findActiveToken(
    tokenHash: string,
  ): Promise<{ id: string; workspaceId: string; userId: string } | null>;
  authorName(userId: string): Promise<string | null>;
  insert(entry: {
    workspaceId: string;
    authorId: string;
    authorName: string;
    title: string;
    body: string;
    project: string | null;
    expiresAt: string;
  }): Promise<WorkLogEntry>;
  touchToken(id: string): Promise<void>;
  purgeExpired(): Promise<void>;
}

export class SupabaseWorkLogIngestStore implements WorkLogIngestStore {
  constructor(private client: SupabaseClient) {}

  async findActiveToken(tokenHash: string) {
    const token = await this.client
      .from("work_log_tokens")
      .select("id,workspace_id,user_id")
      .eq("token_hash", tokenHash)
      .is("revoked_at", null)
      .maybeSingle();
    if (token.error) throw new Error(`work_log_token:${token.error.message}`);
    if (!token.data) return null;
    const member = await this.client
      .from("workspace_members")
      .select("id")
      .eq("workspace_id", token.data.workspace_id)
      .eq("user_id", token.data.user_id)
      .maybeSingle();
    if (member.error)
      throw new Error(`work_log_member:${member.error.message}`);
    if (!member.data) return null;
    return {
      id: token.data.id as string,
      workspaceId: token.data.workspace_id as string,
      userId: token.data.user_id as string,
    };
  }

  async authorName(userId: string) {
    const result = await this.client.auth.admin.getUserById(userId);
    const user = result.data.user;
    if (!user) return null;
    const metadata = user.user_metadata ?? {};
    return (
      (typeof metadata.name === "string" && metadata.name.trim()) ||
      (typeof metadata.full_name === "string" && metadata.full_name.trim()) ||
      user.email ||
      null
    );
  }

  async insert(entry: Parameters<WorkLogIngestStore["insert"]>[0]) {
    const result = await this.client
      .from("work_logs")
      .insert({
        workspace_id: entry.workspaceId,
        author_id: entry.authorId,
        author_name: entry.authorName,
        title: entry.title,
        body: entry.body,
        project: entry.project,
        source: "claude",
        expires_at: entry.expiresAt,
      })
      .select(entryColumns)
      .single();
    if (result.error)
      throw new Error(`work_log_insert:${result.error.message}`);
    return result.data as WorkLogEntry;
  }

  async touchToken(id: string) {
    await this.client
      .from("work_log_tokens")
      .update({ last_used_at: new Date().toISOString() })
      .eq("id", id);
  }

  async purgeExpired() {
    await this.client
      .from("work_logs")
      .delete()
      .lte("expires_at", new Date().toISOString());
  }
}

const workLogIngestLimiter = rateLimit({
  windowMs: 60_000,
  limit: 30,
  standardHeaders: true,
  legacyHeaders: false,
});

/**
 * Claude Code posts here with a personal token. Mounted outside /api so it
 * never takes a user JWT; fails closed without the service-role store.
 */
export function registerWorkLogIngestRoute(
  app: Express,
  options: {
    store: WorkLogIngestStore | null;
    logger?: Pick<Logger, "error">;
    now?: () => Date;
  },
): void {
  app.post(
    WORK_LOG_INGEST_PATH,
    workLogIngestLimiter,
    async (request: Request, response: Response) => {
      const token = parseBearerToken(request.get("authorization"));
      if (!token?.startsWith(WORK_LOG_TOKEN_PREFIX))
        return response.status(401).json({ error: "work_log_token_required" });
      if (!options.store)
        return response
          .status(503)
          .json({ error: "work_log_store_not_configured" });
      const parsed = workLogIngestBody.safeParse(request.body);
      if (!parsed.success)
        return response.status(400).json({ error: "invalid_body" });
      try {
        const owner = await options.store.findActiveToken(
          hashWorkLogToken(token),
        );
        if (!owner)
          return response.status(401).json({ error: "work_log_token_invalid" });
        const now = options.now?.() ?? new Date();
        const authorName =
          (await options.store.authorName(owner.userId)) ?? "Equipe";
        const entry = await options.store.insert({
          workspaceId: owner.workspaceId,
          authorId: owner.userId,
          authorName,
          title: parsed.data.title,
          body: parsed.data.body,
          project: parsed.data.project ?? null,
          expiresAt: new Date(
            now.getTime() + WORK_LOG_TTL_DAYS * 86_400_000,
          ).toISOString(),
        });
        await options.store.touchToken(owner.id);
        await options.store.purgeExpired();
        return response.status(201).json({ data: entry });
      } catch (error) {
        options.logger?.error({ err: error }, "Work log ingest failed");
        return response.status(503).json({ error: "work_log_unavailable" });
      }
    },
  );
}
