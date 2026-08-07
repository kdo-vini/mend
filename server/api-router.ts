import express, {
  type NextFunction,
  type Request,
  type RequestHandler,
  type Response,
  type Router,
} from "express";
import { z, ZodError, type ZodType } from "zod";
import { IssueService } from "./issue-service.js";
import { KnowledgeService } from "./knowledge-service.js";
import {
  type ApiRouterDependencies,
  type AuthenticatedUser,
  type RequestContext,
  type WorkspaceRole,
} from "./contracts/api-ports.js";
import {
  issueParamSchema,
  uuid,
  workspaceRoleSchema,
} from "./routes/schemas.js";
import { registerChannelRoutes } from "./routes/channel-routes.js";
import { registerCodingRunRoutes } from "./routes/coding-run-routes.js";
import { registerConversationRoutes } from "./routes/conversation-routes.js";
import { registerIssueRoutes } from "./routes/issue-routes.js";
import { registerKnowledgeRoutes } from "./routes/knowledge-routes.js";
import { registerRepositoryRoutes } from "./routes/repository-routes.js";
import { registerWorkspaceRoutes } from "./routes/workspace-routes.js";
import { registerMediaRoutes } from "./routes/media-routes.js";
import { registerKanbanRoutes } from "./routes/kanban-routes.js";
import { registerGoogleConnectionRoutes } from "./routes/google-connection-routes.js";
import { registerMcpConnectionRoutes } from "./routes/mcp-connection-routes.js";
import { registerGitHubConnectionRoutes } from "./routes/github-connection-routes.js";
import { registerAgentCredentialRoutes } from "./routes/agent-credential-routes.js";

const roleRank: Record<WorkspaceRole, number> = {
  viewer: 0,
  agent: 1,
  admin: 2,
  owner: 3,
};

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

function workspaceApiError(error: unknown): ApiHttpError | null {
  if (!(error instanceof Error)) return null;
  const reason = error.message;
  const mappings: Record<string, [number, string, string]> = {
    workspace_invitation_required: [
      409,
      "workspace_invitation_required",
      "Workspace membership must be created by accepting an invitation.",
    ],
    workspace_invitation_exists: [
      409,
      "workspace_invitation_exists",
      "An invitation is already open for this email.",
    ],
    workspace_member_exists: [
      409,
      "workspace_member_exists",
      "This user is already a workspace member.",
    ],
    workspace_invitation_not_found: [
      404,
      "workspace_invitation_not_found",
      "The workspace invitation was not found.",
    ],
    workspace_invitation_closed: [
      409,
      "workspace_invitation_closed",
      "The workspace invitation is already closed.",
    ],
    workspace_invitation_expired: [
      410,
      "workspace_invitation_expired",
      "The workspace invitation has expired.",
    ],
    workspace_invitation_revoked: [
      410,
      "workspace_invitation_revoked",
      "The workspace invitation was revoked.",
    ],
    workspace_invitation_already_accepted: [
      409,
      "workspace_invitation_already_accepted",
      "The workspace invitation was already accepted.",
    ],
    workspace_invitation_email_mismatch: [
      403,
      "workspace_invitation_email_mismatch",
      "This invitation belongs to another email address.",
    ],
    invalid_invitation_email: [
      400,
      "invalid_invitation_email",
      "The invitation email is invalid.",
    ],
    invalid_workspace_role: [
      400,
      "invalid_workspace_role",
      "The workspace role is invalid.",
    ],
    workspace_role_denied: [
      403,
      "forbidden",
      "Insufficient workspace permissions.",
    ],
    supabase_invitation_admin_unavailable: [
      503,
      "invitation_service_unavailable",
      "The invitation service is not configured.",
    ],
    invitation_base_url_missing: [
      503,
      "invitation_service_unavailable",
      "The application URL is not configured for invitation links.",
    ],
    invitation_delivery_failed: [
      502,
      "invitation_delivery_failed",
      "The invitation email could not be sent.",
    ],
  };
  const match = Object.keys(mappings).find(
    (code) => reason === code || reason.includes(code),
  );
  if (!match) return null;
  const [status, code, message] = mappings[match];
  return new ApiHttpError(status, code, message);
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
  "media_pipeline_disabled",
  "media_file_name_required",
  "media_size_invalid",
  "media_checksum_invalid",
  "media_batch_limit_exceeded",
  "media_asset_not_found",
  "media_batch_mismatch",
  "media_asset_processing",
  "media_asset_failed",
  "media_asset_unsupported",
  "media_type_unknown",
  "unsafe_svg_blocked",
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
    reason.startsWith("media_signed_url_failed:") ||
    reason.startsWith("media_upload_url:") ||
    reason.startsWith("media_batch:") ||
    reason.startsWith("media_asset:") ||
    reason.startsWith("media_variants:") ||
    reason.startsWith("media_variant:") ||
    reason.startsWith("media_variant_upload:") ||
    reason.startsWith("media_download:")
  ) {
    return new ApiHttpError(
      502,
      "media_unavailable",
      "Attachment storage is temporarily unavailable.",
    );
  }
  return null;
}

function githubApiError(error: unknown): ApiHttpError | null {
  if (!(error instanceof Error)) return null;
  const reason = error.message;
  if (reason === "github_workspace_not_connected")
    return new ApiHttpError(
      409,
      "github_workspace_not_connected",
      "Connect GitHub to this workspace before attaching a repository.",
    );
  if (reason === "github_owner_mismatch")
    return new ApiHttpError(
      400,
      "github_owner_mismatch",
      "The repository owner must belong to the connected GitHub account.",
    );
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
  const pathId = (request: Request) => parse(uuid, request.params.id);
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
  };

  router.use(
    asyncRoute(async (request, response, next) => {
      // The signed, one-time OAuth state authenticates the Google callback;
      // Google cannot send the Mend bearer token back to this endpoint.
      if (
        request.path === "/api/google/connections/oauth/callback" ||
        request.path === "/api/github/setup/callback" ||
        request.path === "/api/mcp/connections/oauth/callback" ||
        request.path === "/api/mcp/oauth/client-metadata.json"
      ) {
        next();
        return;
      }
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
  registerMediaRoutes(routeContext);
  registerChannelRoutes(routeContext);
  registerConversationRoutes(routeContext);
  registerIssueRoutes(routeContext);
  registerKanbanRoutes(routeContext);
  registerKnowledgeRoutes(routeContext);
  registerRepositoryRoutes(routeContext);
  registerGitHubConnectionRoutes(routeContext);
  registerCodingRunRoutes(routeContext);
  registerAgentCredentialRoutes(routeContext);
  registerGoogleConnectionRoutes(routeContext);
  registerMcpConnectionRoutes(routeContext);

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
      const mediaError = mediaApiError(error);
      if (mediaError)
        return send(response, mediaError.status, {
          error: { code: mediaError.code, message: mediaError.message },
        });
      const githubError = githubApiError(error);
      if (githubError)
        return send(response, githubError.status, {
          error: { code: githubError.code, message: githubError.message },
        });
      const workspaceError = workspaceApiError(error);
      if (workspaceError)
        return send(response, workspaceError.status, {
          error: { code: workspaceError.code, message: workspaceError.message },
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
