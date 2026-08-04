import express, {
  type NextFunction,
  type Request,
  type RequestHandler,
  type Response,
  type Router,
} from "express";
import { z, ZodError, type ZodType } from "zod";
import {
  IssueService,
  issueListQuerySchema,
  issueSourceSchema,
  issueTypeSchema,
  issueIdentifierSchema,
  type IssuePort,
} from "./issue-service.js";
import { KnowledgeService, type KnowledgePort } from "./knowledge-service.js";
import { validateRemoteMediaUrl } from "./media.js";
import { registerChannelRoutes } from "./routes/channel-routes.js";
import { registerCodingRunRoutes } from "./routes/coding-run-routes.js";
import { registerConversationRoutes } from "./routes/conversation-routes.js";
import { registerIssueRoutes } from "./routes/issue-routes.js";
import { registerKnowledgeRoutes } from "./routes/knowledge-routes.js";
import { registerRepositoryRoutes } from "./routes/repository-routes.js";
import { registerWorkspaceRoutes } from "./routes/workspace-routes.js";

export type WorkspaceRole = "owner" | "admin" | "agent" | "viewer";

export interface AuthenticatedUser {
  id: string;
  email?: string | null;
  name?: string | null;
}

export interface AuthAdapter {
  authenticate(request: Request): Promise<AuthenticatedUser | null>;
}

export interface WorkspaceMembership {
  workspaceId: string;
  role: WorkspaceRole;
}

export interface MembershipAdapter {
  getMembership(
    userId: string,
    workspaceId: string,
  ): Promise<WorkspaceMembership | null>;
}

export interface RequestContext {
  userId: string;
  workspaceId: string;
  role: WorkspaceRole;
}

export interface WorkspacePort {
  list(userId: string): Promise<unknown>;
  create(userId: string, input: WorkspaceCreateInput): Promise<unknown>;
  get(context: RequestContext, workspaceId: string): Promise<unknown | null>;
  update(
    context: RequestContext,
    workspaceId: string,
    input: WorkspacePatchInput,
  ): Promise<unknown | null>;
  listMembers(
    context: RequestContext,
    query: WorkspaceMemberListQuery,
  ): Promise<unknown>;
  addMember(
    context: RequestContext,
    input: WorkspaceMemberCreateInput,
  ): Promise<unknown>;
  updateMemberRole(
    context: RequestContext,
    userId: string,
    input: WorkspaceMemberRolePatchInput,
  ): Promise<unknown | null>;
  removeMember(context: RequestContext, userId: string): Promise<boolean>;
  listAuditLog(
    context: RequestContext,
    query: AuditLogListQuery,
  ): Promise<unknown>;
}

export interface ChannelPort {
  list(context: RequestContext, query: ChannelListQuery): Promise<unknown>;
  createWhatsmiau(
    context: RequestContext,
    input: ChannelCreateInput,
  ): Promise<unknown>;
  get(context: RequestContext, channelId: string): Promise<unknown | null>;
  connect(context: RequestContext, channelId: string): Promise<unknown | null>;
  qr(
    context: RequestContext,
    channelId: string,
  ): Promise<{ data: string; mimeType?: string } | null>;
  disconnect(
    context: RequestContext,
    channelId: string,
  ): Promise<unknown | null>;
  refresh(context: RequestContext, channelId: string): Promise<unknown | null>;
}

export interface ConversationPort {
  list(context: RequestContext, query: ConversationListQuery): Promise<unknown>;
  get(context: RequestContext, conversationId: string): Promise<unknown | null>;
  update(
    context: RequestContext,
    conversationId: string,
    input: ConversationPatchInput,
  ): Promise<unknown | null>;
  markRead(
    context: RequestContext,
    conversationId: string,
  ): Promise<unknown | null>;
  snooze(
    context: RequestContext,
    conversationId: string,
    input: ConversationSnoozeInput,
  ): Promise<unknown | null>;
  resolve(
    context: RequestContext,
    conversationId: string,
  ): Promise<unknown | null>;
  pauseAi(
    context: RequestContext,
    conversationId: string,
    reason: string,
  ): Promise<unknown | null>;
  resumeAi(
    context: RequestContext,
    conversationId: string,
  ): Promise<unknown | null>;
  sendMessage(
    context: RequestContext,
    conversationId: string,
    input: SendMessageInput,
  ): Promise<unknown | null>;
  aiDraft(
    context: RequestContext,
    conversationId: string,
    input: AiDraftInput,
  ): Promise<unknown | null>;
}

export interface RepositoryPort {
  list(context: RequestContext, query: RepositoryListQuery): Promise<unknown>;
  create(context: RequestContext, input: RepositoryInput): Promise<unknown>;
  update(
    context: RequestContext,
    repositoryId: string,
    input: RepositoryPatchInput,
  ): Promise<unknown | null>;
  remove(context: RequestContext, repositoryId: string): Promise<boolean>;
}

export interface CodingRunPort {
  list(context: RequestContext, query: CodingRunListQuery): Promise<unknown>;
  create(
    context: RequestContext,
    issueIdentifier: string,
    input: CodingRunCreateInput,
  ): Promise<unknown>;
  get(context: RequestContext, runId: string): Promise<unknown | null>;
  cancel(context: RequestContext, runId: string): Promise<unknown | null>;
  approve(context: RequestContext, runId: string): Promise<unknown | null>;
  reject(context: RequestContext, runId: string): Promise<unknown | null>;
  patch(
    context: RequestContext,
    runId: string,
  ): Promise<{ patch: string; truncated?: boolean } | null>;
}

export interface ApiRouterDependencies {
  auth: AuthAdapter;
  membership: MembershipAdapter;
  workspaces: WorkspacePort;
  channels: ChannelPort;
  conversations: ConversationPort;
  issues: IssuePort;
  knowledge: KnowledgePort;
  repositories: RepositoryPort;
  codingRuns: CodingRunPort;
}

const roleRank: Record<WorkspaceRole, number> = {
  viewer: 0,
  agent: 1,
  admin: 2,
  owner: 3,
};
const workspaceRoleSchema = z.enum(["owner", "admin", "agent", "viewer"]);
const allowedCommands = ["install", "lint", "test", "build"] as const;
const uuid = z.string().uuid();
const idParamSchema = z.object({ id: uuid }).strict();
const issueParamSchema = z
  .object({ identifier: issueIdentifierSchema })
  .strict();
const workspaceParamSchema = z.object({ id: uuid }).strict();

const workspaceCreateSchema = z
  .object({
    name: z.string().trim().min(1).max(160),
    slug: z
      .string()
      .trim()
      .min(1)
      .max(80)
      .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
    issuePrefix: z
      .string()
      .trim()
      .regex(/^[A-Z][A-Z0-9]{1,7}$/)
      .default("TEC"),
    timezone: z.string().trim().min(1).max(80).default("UTC"),
    defaultLanguage: z.string().trim().min(2).max(12).default("en"),
  })
  .strict();
const workspacePatchSchema = workspaceCreateSchema.partial().strict();
type WorkspaceCreateInput = z.infer<typeof workspaceCreateSchema>;
type WorkspacePatchInput = z.infer<typeof workspacePatchSchema>;

const workspaceMemberRoleSchema = workspaceRoleSchema;
const workspaceMemberListQuerySchema = z
  .object({
    role: workspaceMemberRoleSchema.optional(),
    limit: z.coerce.number().int().min(1).max(200).default(100),
    cursor: z.string().trim().max(200).optional(),
  })
  .strict();
const workspaceMemberCreateSchema = z
  .object({ userId: uuid, role: workspaceMemberRoleSchema.default("agent") })
  .strict();
const workspaceMemberRolePatchSchema = z
  .object({ role: workspaceMemberRoleSchema })
  .strict();
const auditLogListQuerySchema = z
  .object({
    action: z.string().trim().min(1).max(160).optional(),
    entityType: z.string().trim().min(1).max(120).optional(),
    limit: z.coerce.number().int().min(1).max(200).default(100),
    cursor: z.string().trim().max(80).optional(),
  })
  .strict();
type WorkspaceMemberListQuery = z.infer<typeof workspaceMemberListQuerySchema>;
type WorkspaceMemberCreateInput = z.infer<typeof workspaceMemberCreateSchema>;
type WorkspaceMemberRolePatchInput = z.infer<
  typeof workspaceMemberRolePatchSchema
>;
type AuditLogListQuery = z.infer<typeof auditLogListQuerySchema>;

const channelListQuerySchema = z
  .object({
    status: z.enum(["open", "closed", "connecting", "qr-code"]).optional(),
    limit: z.coerce.number().int().min(1).max(100).default(50),
    cursor: z.string().trim().max(200).optional(),
  })
  .strict();
const channelCreateSchema = z
  .object({
    name: z.string().trim().min(1).max(160),
    providerInstanceName: z
      .string()
      .trim()
      .min(1)
      .max(160)
      .regex(/^[A-Za-z0-9._-]+$/),
    phoneNumber: z.string().trim().max(40).optional(),
    profileName: z.string().trim().max(160).optional(),
  })
  .strict();
type ChannelListQuery = z.infer<typeof channelListQuerySchema>;
type ChannelCreateInput = z.infer<typeof channelCreateSchema>;

const conversationListQuerySchema = z
  .object({
    status: z.enum(["open", "snoozed", "resolved"]).optional(),
    attentionState: z
      .enum(["needs_attention", "ai_handling", "waiting_customer", "none"])
      .optional(),
    aiMode: z.enum(["off", "draft", "safe_auto"]).optional(),
    assignedUserId: uuid.optional(),
    limit: z.coerce.number().int().min(1).max(200).default(100),
    cursor: z.string().trim().max(200).optional(),
  })
  .strict();
const conversationPatchSchema = z
  .object({
    status: z.enum(["open", "snoozed", "resolved"]).optional(),
    attentionState: z
      .enum(["needs_attention", "ai_handling", "waiting_customer", "none"])
      .optional(),
    aiMode: z.enum(["off", "draft", "safe_auto"]).optional(),
    assignedUserId: uuid.nullable().optional(),
    snoozedUntil: z.string().datetime({ offset: true }).nullable().optional(),
  })
  .strict()
  .refine(
    (value) => Object.keys(value).length > 0,
    "At least one field is required",
  );
const conversationSnoozeSchema = z
  .object({ until: z.string().datetime({ offset: true }) })
  .strict();
const conversationAiPauseSchema = z
  .object({
    reason: z
      .enum([
        "human_message",
        "customer_requested_human",
        "unsafe_intent",
        "low_confidence",
        "manual_pause",
      ])
      .default("manual_pause"),
  })
  .strict();
const sendMessageSchema = z
  .object({
    messageType: z
      .enum(["text", "image", "video", "audio", "document"])
      .default("text"),
    text: z.string().trim().max(20_000).optional(),
    caption: z.string().trim().max(4_000).optional(),
    mediaUrl: z
      .string()
      .url()
      .max(4_000)
      .superRefine((value, context) => {
        try {
          validateRemoteMediaUrl(value);
        } catch {
          context.addIssue({
            code: z.ZodIssueCode.custom,
            message: "mediaUrl must be a public HTTPS URL",
          });
        }
      })
      .optional(),
    // Browser attachments use a bounded base64 data URL. The adapter sends it
    // through the existing media normalizer and private Storage path; it is
    // never persisted as a message URL.
    mediaDataUrl: z
      .string()
      .trim()
      .max(12 * 1024 * 1024)
      .optional(),
    fileName: z.string().trim().max(240).optional(),
    mimeType: z.string().trim().max(160).optional(),
    idempotencyKey: z.string().trim().min(8).max(200).optional(),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.messageType === "text" && !value.text)
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["text"],
        message: "text is required for text messages",
      });
    if (value.messageType !== "text" && !value.mediaUrl && !value.mediaDataUrl)
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["mediaUrl"],
        message: "mediaUrl or mediaDataUrl is required for media messages",
      });
    if (value.mediaDataUrl && !value.mediaDataUrl.startsWith("data:"))
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["mediaDataUrl"],
        message: "mediaDataUrl must be a data URL",
      });
  });
const aiDraftSchema = z
  .object({ instruction: z.string().trim().max(4_000).optional() })
  .strict();
type ConversationListQuery = z.infer<typeof conversationListQuerySchema>;
type ConversationPatchInput = z.infer<typeof conversationPatchSchema>;
type ConversationSnoozeInput = z.infer<typeof conversationSnoozeSchema>;
type SendMessageInput = z.infer<typeof sendMessageSchema>;
type AiDraftInput = z.infer<typeof aiDraftSchema>;

const issueListApiQuerySchema = issueListQuerySchema
  .extend({
    type: issueTypeSchema.optional(),
    source: issueSourceSchema.optional(),
    label: z.string().trim().min(1).max(64).optional(),
    contactId: uuid.optional(),
    conversationId: uuid.optional(),
    hasCodex: z
      .enum(["true", "false"])
      .transform((value) => value === "true")
      .optional(),
  })
  .strict();

const repositoryListQuerySchema = z
  .object({
    limit: z.coerce.number().int().min(1).max(100).default(50),
    cursor: z.string().trim().max(200).optional(),
  })
  .strict();
const repositoryPath = z
  .string()
  .trim()
  .min(1)
  .max(500)
  .refine(
    (value) => !value.includes("\0"),
    "Path contains an invalid character",
  )
  .refine(
    (value) => !/(^|[\\/])\.\.([\\/]|$)/.test(value),
    "Path traversal is not allowed",
  );
const repositoryInputSchema = z
  .object({
    name: z.string().trim().min(1).max(160),
    localPath: repositoryPath,
    defaultBranch: z.string().trim().min(1).max(160).default("main"),
    allowedCommands: z
      .array(z.enum(allowedCommands))
      .min(1)
      .max(allowedCommands.length)
      .default([...allowedCommands]),
  })
  .strict();
const repositoryPatchSchema = repositoryInputSchema.partial().strict();
type RepositoryListQuery = z.infer<typeof repositoryListQuerySchema>;
type RepositoryInput = z.infer<typeof repositoryInputSchema>;
type RepositoryPatchInput = z.infer<typeof repositoryPatchSchema>;

const codingRunListQuerySchema = z
  .object({
    issueId: uuid.optional(),
    status: z
      .enum([
        "queued",
        "running",
        "completed",
        "failed",
        "canceled",
        "approved",
        "rejected",
      ])
      .optional(),
    limit: z.coerce.number().int().min(1).max(100).default(50),
    cursor: z.string().trim().max(200).optional(),
  })
  .strict();
const codingRunCreateSchema = z
  .object({
    repositoryId: uuid.optional(),
    mode: z.enum(["investigate", "propose_fix", "implement_fix"]),
    branchBase: z.string().trim().min(1).max(160).default("main"),
    instructions: z.string().trim().max(20_000).optional(),
    allowChanges: z.boolean().default(false),
    commands: z
      .array(z.enum(allowedCommands))
      .max(allowedCommands.length)
      .default([]),
  })
  .strict();
type CodingRunListQuery = z.infer<typeof codingRunListQuerySchema>;
type CodingRunCreateInput = z.infer<typeof codingRunCreateSchema>;

export class ApiHttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = "ApiHttpError";
  }
}

function parse<T>(
  schema: ZodType<T, z.ZodTypeDef, unknown>,
  value: unknown,
): T {
  const result = schema.safeParse(value);
  if (!result.success)
    throw new ApiHttpError(
      400,
      "invalid_input",
      "Request input is invalid",
      result.error.issues.map((issue) => ({
        path: issue.path,
        message: issue.message,
      })),
    );
  return result.data;
}

function asyncRoute(
  handler: (
    request: Request,
    response: Response,
    next: NextFunction,
  ) => Promise<void>,
): RequestHandler {
  return (request, response, next) => {
    void handler(request, response, next).catch(next);
  };
}

function sensitiveKey(key: string): boolean {
  return /(?:secret|token|password|api[_-]?key|private[_-]?key|credential|authorization)/i.test(
    key,
  );
}

/** Responses are allowlisted at the boundary so a provider payload cannot leak credentials. */
export function sanitizePublic<T>(value: T): T {
  if (value === null || value === undefined || typeof value !== "object")
    return value;
  if (value instanceof Date) return value.toISOString() as T;
  if (Array.isArray(value))
    return value.map((item) => sanitizePublic(item)) as T;
  const output: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    if (!sensitiveKey(key)) output[key] = sanitizePublic(item);
  }
  return output as T;
}

function send(response: Response, status: number, data: unknown): void {
  response.status(status).json(sanitizePublic(data));
}

function noContent(response: Response): void {
  response.status(204).send();
}

function userFrom(response: Response): AuthenticatedUser {
  const user = response.locals.mendUser as AuthenticatedUser | undefined;
  if (!user)
    throw new ApiHttpError(
      401,
      "unauthenticated",
      "Authentication is required",
    );
  return user;
}

function workspaceIdFromRequest(request: Request): string {
  const header = request.get("x-mend-workspace-id");
  if (!header)
    throw new ApiHttpError(
      400,
      "workspace_required",
      "x-mend-workspace-id is required",
    );
  return parse(uuid, header);
}

function requireFound<T>(value: T | null, resource: string): T {
  if (value === null || value === undefined)
    throw new ApiHttpError(
      404,
      `${resource}_not_found`,
      `${resource} was not found`,
    );
  return value;
}

const mediaInputErrorPrefixes = [
  "invalid_media_data_url",
  "media_data_url_must_be_base64",
  "invalid_media_base64",
  "unsupported_media_type:",
  "executable_media_blocked",
  "media_size_limit_exceeded",
  "media_mime_type_required",
  "unsupported_media_input",
  "media_storage_not_configured",
];

function mediaApiError(error: unknown): ApiHttpError | null {
  if (!(error instanceof Error)) return null;
  const reason = error.message;
  if (
    mediaInputErrorPrefixes.some(
      (prefix) => reason === prefix || reason.startsWith(prefix),
    )
  ) {
    return new ApiHttpError(
      400,
      "invalid_media",
      "Attachment is invalid or exceeds the allowed type or size limits.",
    );
  }
  if (
    reason.startsWith("media_upload_failed:") ||
    reason.startsWith("media_signed_url_failed:")
  ) {
    return new ApiHttpError(
      502,
      "media_unavailable",
      "Attachment storage is temporarily unavailable.",
    );
  }
  return null;
}

export interface ApiRouteModuleContext {
  router: Router;
  dependencies: ApiRouterDependencies;
  access(
    response: Response,
    workspaceId: string,
    minimumRole?: WorkspaceRole,
  ): Promise<RequestContext>;
  scoped(
    request: Request,
    response: Response,
    minimumRole?: WorkspaceRole,
  ): Promise<RequestContext>;
  pathId(request: Request): string;
  pathIssue(request: Request): string;
  parse<T>(schema: ZodType<T, z.ZodTypeDef, unknown>, value: unknown): T;
  asyncRoute: typeof asyncRoute;
  send: typeof send;
  noContent: typeof noContent;
  requireFound: typeof requireFound;
  mediaApiError: typeof mediaApiError;
  issueService: IssueService;
  knowledgeService: KnowledgeService;
  userFrom: typeof userFrom;
  ApiHttpError: typeof ApiHttpError;
  uuid: typeof uuid;
  schemas: {
    workspaceParamSchema: typeof workspaceParamSchema;
    workspaceCreateSchema: typeof workspaceCreateSchema;
    workspacePatchSchema: typeof workspacePatchSchema;
    workspaceMemberListQuerySchema: typeof workspaceMemberListQuerySchema;
    workspaceMemberCreateSchema: typeof workspaceMemberCreateSchema;
    workspaceMemberRolePatchSchema: typeof workspaceMemberRolePatchSchema;
    auditLogListQuerySchema: typeof auditLogListQuerySchema;
    channelListQuerySchema: typeof channelListQuerySchema;
    channelCreateSchema: typeof channelCreateSchema;
    conversationListQuerySchema: typeof conversationListQuerySchema;
    conversationPatchSchema: typeof conversationPatchSchema;
    conversationSnoozeSchema: typeof conversationSnoozeSchema;
    conversationAiPauseSchema: typeof conversationAiPauseSchema;
    sendMessageSchema: typeof sendMessageSchema;
    aiDraftSchema: typeof aiDraftSchema;
    issueListApiQuerySchema: typeof issueListApiQuerySchema;
    repositoryListQuerySchema: typeof repositoryListQuerySchema;
    repositoryInputSchema: typeof repositoryInputSchema;
    repositoryPatchSchema: typeof repositoryPatchSchema;
    codingRunListQuerySchema: typeof codingRunListQuerySchema;
    codingRunCreateSchema: typeof codingRunCreateSchema;
  };
}

export function createApiRouter(dependencies: ApiRouterDependencies): Router {
  const router = express.Router();
  const issueService = new IssueService(dependencies.issues);
  const knowledgeService = new KnowledgeService(dependencies.knowledge);

  const access = async (
    response: Response,
    workspaceId: string,
    minimumRole: WorkspaceRole = "viewer",
  ): Promise<RequestContext> => {
    const user = userFrom(response);
    const membership = await dependencies.membership.getMembership(
      user.id,
      workspaceId,
    );
    if (!membership || membership.workspaceId !== workspaceId)
      throw new ApiHttpError(
        404,
        "workspace_not_found",
        "Workspace was not found",
      );
    const role = workspaceRoleSchema.safeParse(membership.role);
    if (!role.success)
      throw new ApiHttpError(
        404,
        "workspace_not_found",
        "Workspace was not found",
      );
    if (roleRank[role.data] < roleRank[minimumRole])
      throw new ApiHttpError(
        403,
        "forbidden",
        "Insufficient workspace permissions",
      );
    return { userId: user.id, workspaceId, role: role.data };
  };

  const scoped = async (
    request: Request,
    response: Response,
    minimumRole: WorkspaceRole = "viewer",
  ): Promise<RequestContext> =>
    access(response, workspaceIdFromRequest(request), minimumRole);
  const pathId = (request: Request) => parse(idParamSchema, request.params).id;
  const pathIssue = (request: Request) =>
    parse(issueParamSchema, request.params).identifier;

  const routeContext: ApiRouteModuleContext = {
    router,
    dependencies,
    access,
    scoped,
    pathId,
    pathIssue,
    parse,
    asyncRoute,
    send,
    noContent,
    requireFound,
    mediaApiError,
    issueService,
    knowledgeService,
    userFrom,
    ApiHttpError,
    uuid,
    schemas: {
      workspaceParamSchema,
      workspaceCreateSchema,
      workspacePatchSchema,
      workspaceMemberListQuerySchema,
      workspaceMemberCreateSchema,
      workspaceMemberRolePatchSchema,
      auditLogListQuerySchema,
      channelListQuerySchema,
      channelCreateSchema,
      conversationListQuerySchema,
      conversationPatchSchema,
      conversationSnoozeSchema,
      conversationAiPauseSchema,
      sendMessageSchema,
      aiDraftSchema,
      issueListApiQuerySchema,
      repositoryListQuerySchema,
      repositoryInputSchema,
      repositoryPatchSchema,
      codingRunListQuerySchema,
      codingRunCreateSchema,
    },
  };

  router.use(
    asyncRoute(async (request, response, next) => {
      const user = await dependencies.auth.authenticate(request);
      if (!user || !uuid.safeParse(user.id).success)
        throw new ApiHttpError(
          401,
          "unauthenticated",
          "Authentication is required",
        );
      response.locals.mendUser = {
        id: user.id,
        email: user.email ?? null,
        name: user.name ?? null,
      } satisfies AuthenticatedUser;
      next();
    }),
  );

  router.get(
    "/api/me",
    asyncRoute(async (_request, response) => {
      const user = userFrom(response);
      send(response, 200, { user });
    }),
  );
  registerWorkspaceRoutes(routeContext);
  registerChannelRoutes(routeContext);
  registerConversationRoutes(routeContext);
  registerIssueRoutes(routeContext);
  registerKnowledgeRoutes(routeContext);
  registerRepositoryRoutes(routeContext);
  registerCodingRunRoutes(routeContext);

  router.use(
    (
      error: unknown,
      _request: Request,
      response: Response,
      _next: NextFunction,
    ) => {
      if (response.headersSent) return;
      if (error instanceof ApiHttpError)
        return send(response, error.status, {
          error: {
            code: error.code,
            message: error.message,
            ...(error.details ? { details: error.details } : {}),
          },
        });
      if (error instanceof ZodError)
        return send(response, 400, {
          error: {
            code: "invalid_input",
            message: "Request input is invalid",
            details: error.issues.map((issue) => ({
              path: issue.path,
              message: issue.message,
            })),
          },
        });
      // Do not reflect provider, database or authentication errors to clients.
      console.error("[mend-api] unhandled request error", error);
      return send(response, 500, {
        error: {
          code: "internal_error",
          message: "An internal error occurred",
        },
      });
    },
  );

  return router;
}

export {
  aiDraftSchema,
  channelCreateSchema,
  channelListQuerySchema,
  codingRunCreateSchema,
  codingRunListQuerySchema,
  conversationListQuerySchema,
  conversationPatchSchema,
  conversationSnoozeSchema,
  conversationAiPauseSchema,
  repositoryInputSchema,
  repositoryListQuerySchema,
  repositoryPatchSchema,
  issueListApiQuerySchema,
  sendMessageSchema,
  workspaceCreateSchema,
  workspaceMemberCreateSchema,
  workspaceMemberListQuerySchema,
  workspaceMemberRolePatchSchema,
  auditLogListQuerySchema,
  workspacePatchSchema,
};
