import type { ApiRouteModuleContext } from "../api-router.js";
import { CodexServiceError } from "../codex-service.js";
import { codingRunCreateSchema, codingRunListQuerySchema } from "./schemas.js";

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
        if (error instanceof CodexServiceError)
          throw new context.ApiHttpError(
            503,
            "agent_unavailable",
            `Agent run could not start: ${error.message}`,
            {
              action: "Check /api/ready and the workspace repository settings.",
            },
          );
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
