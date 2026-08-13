import type { ApiRouteModuleContext } from "../api-router.js";
import { CodexServiceError } from "../codex-service.js";
import { codingRunCreateSchema, codingRunListQuerySchema } from "./schemas.js";

function classifyCodexServiceError(error: CodexServiceError): {
  status: number;
  code: string;
  message: string;
  details?: { action: string };
} {
  const raw = error.message;
  if (
    /^Timed out waiting for another worker/i.test(raw) ||
    /^agent_run_runner_not_configured$/i.test(raw) ||
    /^Agent runner unavailable$/i.test(raw)
  )
    return {
      status: 503,
      code: "agent_unavailable",
      message: "The coding agent runner is unavailable. Try again later.",
      details: {
        action: "Check /api/ready and the runner heartbeat.",
      },
    };
  if (/disabled by the workspace .*policy/i.test(raw))
    return {
      status: 403,
      code: "agent_policy_disabled",
      message: "The workspace policy does not allow this coding action.",
    };
  if (
    /^Repository not found:/i.test(raw) ||
    /^Repository no longer exists$/i.test(raw)
  )
    return {
      status: 404,
      code: "repository_not_found",
      message: "The selected repository was not found.",
    };
  if (/belongs to another workspace/i.test(raw))
    return {
      status: 409,
      code: "repository_workspace_conflict",
      message: "The selected repository does not belong to this workspace.",
    };
  if (
    /required|invalid|must be|outside the Agent workspace|not configured|configuration is incomplete|not a directory|no repository configured/i.test(
      raw,
    )
  )
    return {
      status: 422,
      code: "agent_run_invalid",
      message: "The coding run configuration is invalid.",
    };
  return {
    status: 500,
    code: "agent_run_failed",
    message: "The coding agent could not start the run.",
  };
}

export function registerCodingRunRoutes(context: ApiRouteModuleContext) {
  const {
    router,
    dependencies,
    scoped,
    pathId,
    pathIssue,
    parse,
    asyncRoute,
    send,
    requireFound,
  } = context;
  router.get(
    "/api/agent-runs",
    asyncRoute(async (request, response) => {
      send(response, 200, {
        data: await dependencies.codingRuns.list(
          await scoped(request, response),
          parse(codingRunListQuerySchema, request.query),
        ),
      });
    }),
  );
  router.post(
    "/api/issues/:identifier/agent-runs",
    asyncRoute(async (request, response) => {
      try {
        send(
          response,
          202,
          await dependencies.codingRuns.create(
            await scoped(request, response, "agent"),
            pathIssue(request),
            parse(codingRunCreateSchema, request.body),
          ),
        );
      } catch (error) {
        if (error instanceof CodexServiceError) {
          const classified = classifyCodexServiceError(error);
          throw new context.ApiHttpError(
            classified.status,
            classified.code,
            classified.message,
            classified.details,
          );
        }
        throw error;
      }
    }),
  );
  router.get(
    "/api/agent-runs/:id",
    asyncRoute(async (request, response) => {
      send(
        response,
        200,
        requireFound(
          await dependencies.codingRuns.get(
            await scoped(request, response),
            pathId(request),
          ),
          "agent_run",
        ),
      );
    }),
  );
  router.post(
    "/api/agent-runs/:id/cancel",
    asyncRoute(async (request, response) => {
      send(
        response,
        200,
        requireFound(
          await dependencies.codingRuns.cancel(
            await scoped(request, response, "agent"),
            pathId(request),
          ),
          "agent_run",
        ),
      );
    }),
  );
  router.post(
    "/api/agent-runs/:id/approve",
    asyncRoute(async (request, response) => {
      send(
        response,
        200,
        requireFound(
          await dependencies.codingRuns.approve(
            await scoped(request, response, "admin"),
            pathId(request),
          ),
          "agent_run",
        ),
      );
    }),
  );
  router.post(
    "/api/agent-runs/:id/reject",
    asyncRoute(async (request, response) => {
      send(
        response,
        200,
        requireFound(
          await dependencies.codingRuns.reject(
            await scoped(request, response, "agent"),
            pathId(request),
          ),
          "agent_run",
        ),
      );
    }),
  );
  router.post(
    "/api/agent-runs/:id/publish",
    asyncRoute(async (request, response) => {
      send(
        response,
        200,
        requireFound(
          await dependencies.codingRuns.publish(
            await scoped(request, response, "admin"),
            pathId(request),
          ),
          "agent_run",
        ),
      );
    }),
  );
  router.post(
    "/api/agent-runs/:id/deploy",
    asyncRoute(async (request, response) => {
      send(
        response,
        200,
        requireFound(
          await dependencies.codingRuns.deploy(
            await scoped(request, response, "admin"),
            pathId(request),
          ),
          "agent_run",
        ),
      );
    }),
  );
  router.post(
    "/api/agent-runs/:id/merge",
    asyncRoute(async (request, response) => {
      send(
        response,
        200,
        requireFound(
          await dependencies.codingRuns.merge(
            await scoped(request, response, "admin"),
            pathId(request),
          ),
          "agent_run",
        ),
      );
    }),
  );
  router.post(
    "/api/agent-runs/:id/health",
    asyncRoute(async (request, response) => {
      send(
        response,
        200,
        requireFound(
          await dependencies.codingRuns.health(
            await scoped(request, response, "agent"),
            pathId(request),
          ),
          "agent_run",
        ),
      );
    }),
  );
  router.get(
    "/api/agent-runs/:id/patch",
    asyncRoute(async (request, response) => {
      send(
        response,
        200,
        requireFound(
          await dependencies.codingRuns.patch(
            await scoped(request, response),
            pathId(request),
          ),
          "agent_run_patch",
        ),
      );
    }),
  );
}
