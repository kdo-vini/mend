import type { ApiRouteModuleContext } from "../api-router.js";

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
  const codingRunListQuerySchema = context.schemas.codingRunListQuerySchema;
  const codingRunCreateSchema = context.schemas.codingRunCreateSchema;
  router.get(
    "/api/coding-runs",
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
    "/api/issues/:identifier/coding-runs",
    asyncRoute(async (request, response) => {
      send(
        response,
        201,
        await dependencies.codingRuns.create(
          await scoped(request, response, "agent"),
          pathIssue(request),
          parse(codingRunCreateSchema, request.body),
        ),
      );
    }),
  );
  router.get(
    "/api/coding-runs/:id",
    asyncRoute(async (request, response) => {
      send(
        response,
        200,
        requireFound(
          await dependencies.codingRuns.get(
            await scoped(request, response),
            pathId(request),
          ),
          "coding_run",
        ),
      );
    }),
  );
  router.post(
    "/api/coding-runs/:id/cancel",
    asyncRoute(async (request, response) => {
      send(
        response,
        200,
        requireFound(
          await dependencies.codingRuns.cancel(
            await scoped(request, response, "agent"),
            pathId(request),
          ),
          "coding_run",
        ),
      );
    }),
  );
  router.post(
    "/api/coding-runs/:id/approve",
    asyncRoute(async (request, response) => {
      send(
        response,
        200,
        requireFound(
          await dependencies.codingRuns.approve(
            await scoped(request, response, "agent"),
            pathId(request),
          ),
          "coding_run",
        ),
      );
    }),
  );
  router.post(
    "/api/coding-runs/:id/reject",
    asyncRoute(async (request, response) => {
      send(
        response,
        200,
        requireFound(
          await dependencies.codingRuns.reject(
            await scoped(request, response, "agent"),
            pathId(request),
          ),
          "coding_run",
        ),
      );
    }),
  );
  router.get(
    "/api/coding-runs/:id/patch",
    asyncRoute(async (request, response) => {
      send(
        response,
        200,
        requireFound(
          await dependencies.codingRuns.patch(
            await scoped(request, response),
            pathId(request),
          ),
          "coding_run_patch",
        ),
      );
    }),
  );
}
