import type { ApiRouteModuleContext } from "../api-router.js";
import {
  repositoryInputSchema,
  repositoryListQuerySchema,
  repositoryPatchSchema,
} from "./schemas.js";

export function registerRepositoryRoutes(context: ApiRouteModuleContext) {
  const {
    router,
    dependencies,
    scoped,
    pathId,
    parse,
    asyncRoute,
    send,
    noContent,
    requireFound,
    ApiHttpError,
  } = context;
  router.get(
    "/api/repositories",
    asyncRoute(async (request, response) => {
      send(response, 200, {
        data: await dependencies.repositories.list(
          await scoped(request, response),
          parse(repositoryListQuerySchema, request.query),
        ),
      });
    }),
  );
  router.post(
    "/api/repositories",
    asyncRoute(async (request, response) => {
      send(
        response,
        201,
        await dependencies.repositories.create(
          await scoped(request, response, "admin"),
          parse(repositoryInputSchema, request.body),
        ),
      );
    }),
  );
  router.patch(
    "/api/repositories/:id",
    asyncRoute(async (request, response) => {
      send(
        response,
        200,
        requireFound(
          await dependencies.repositories.update(
            await scoped(request, response, "admin"),
            pathId(request),
            parse(repositoryPatchSchema, request.body),
          ),
          "repository",
        ),
      );
    }),
  );
  router.delete(
    "/api/repositories/:id",
    asyncRoute(async (request, response) => {
      if (
        !(await dependencies.repositories.remove(
          await scoped(request, response, "admin"),
          pathId(request),
        ))
      )
        throw new ApiHttpError(
          404,
          "repository_not_found",
          "repository was not found",
        );
      noContent(response);
    }),
  );
}
