import type { ApiRouteModuleContext } from "../api-router.js";
import {
  knowledgeCreateSchema,
  knowledgeListQuerySchema,
  knowledgePatchSchema,
  type KnowledgeRequestContext,
} from "../knowledge-service.js";

export function registerKnowledgeRoutes(context: ApiRouteModuleContext) {
  const {
    router,
    scoped,
    pathId,
    parse,
    asyncRoute,
    send,
    noContent,
    requireFound,
    knowledgeService,
    ApiHttpError,
  } = context;
  router.get(
    "/api/knowledge",
    asyncRoute(async (request, response) => {
      const context = await scoped(request, response);
      send(response, 200, {
        data: await knowledgeService.list(
          context as KnowledgeRequestContext,
          parse(knowledgeListQuerySchema, request.query),
        ),
      });
    }),
  );
  router.post(
    "/api/knowledge",
    asyncRoute(async (request, response) => {
      const context = await scoped(request, response, "agent");
      send(
        response,
        201,
        await knowledgeService.create(
          context as KnowledgeRequestContext,
          parse(knowledgeCreateSchema, request.body),
        ),
      );
    }),
  );
  router.patch(
    "/api/knowledge/:id",
    asyncRoute(async (request, response) => {
      const context = await scoped(request, response, "agent");
      send(
        response,
        200,
        requireFound(
          await knowledgeService.update(
            context as KnowledgeRequestContext,
            pathId(request),
            parse(knowledgePatchSchema, request.body),
          ),
          "knowledge_article",
        ),
      );
    }),
  );
  router.delete(
    "/api/knowledge/:id",
    asyncRoute(async (request, response) => {
      const context = await scoped(request, response, "admin");
      if (
        !(await knowledgeService.remove(
          context as KnowledgeRequestContext,
          pathId(request),
        ))
      )
        throw new ApiHttpError(
          404,
          "knowledge_article_not_found",
          "knowledge article was not found",
        );
      noContent(response);
    }),
  );
}
