import {
  issueKanbanMoveSchema,
  personalTaskMoveSchema,
  personalEventCreateSchema,
  personalEventListSchema,
  personalEventPatchSchema,
  personalTaskCreateSchema,
  personalTaskListSchema,
  personalTaskPatchSchema,
} from "../kanban-service.js";
import type { ApiRouteModuleContext } from "../api-router.js";

async function preserveKanbanErrors<T>(
  operation: () => Promise<T>,
  ApiHttpError: ApiRouteModuleContext["ApiHttpError"],
): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    if (error instanceof Error && error.message === "kanban_order_conflict")
      throw new ApiHttpError(
        409,
        "kanban_order_conflict",
        "The board changed while this card was moving. Refresh and try again.",
      );
    throw error;
  }
}

export function registerKanbanRoutes(context: ApiRouteModuleContext) {
  const {
    router,
    dependencies,
    scoped,
    pathId,
    pathIssue,
    parse,
    asyncRoute,
    send,
    noContent,
    requireFound,
    ApiHttpError,
  } = context;

  router.post(
    "/api/issues/:identifier/move",
    asyncRoute(async (request, response) => {
      const requestContext = await scoped(request, response, "agent");
      send(
        response,
        200,
        requireFound(
          await preserveKanbanErrors(
            () =>
              dependencies.kanban.move(
                requestContext,
                pathIssue(request),
                parse(issueKanbanMoveSchema, request.body),
              ),
            ApiHttpError,
          ),
          "issue",
        ),
      );
    }),
  );

  router.get(
    "/api/personal-tasks",
    asyncRoute(async (request, response) => {
      const requestContext = await scoped(request, response);
      send(response, 200, {
        data: await dependencies.personalPlanning.listTasks(
          requestContext,
          parse(personalTaskListSchema, request.query),
        ),
      });
    }),
  );

  router.post(
    "/api/personal-tasks",
    asyncRoute(async (request, response) => {
      const requestContext = await scoped(request, response, "agent");
      send(
        response,
        201,
        await dependencies.personalPlanning.createTask(
          requestContext,
          parse(personalTaskCreateSchema, request.body),
        ),
      );
    }),
  );

  router.patch(
    "/api/personal-tasks/:id",
    asyncRoute(async (request, response) => {
      const requestContext = await scoped(request, response, "agent");
      send(
        response,
        200,
        requireFound(
          await dependencies.personalPlanning.updateTask(
            requestContext,
            pathId(request),
            parse(personalTaskPatchSchema, request.body),
          ),
          "personal_task",
        ),
      );
    }),
  );

  router.post(
    "/api/personal-tasks/:id/move",
    asyncRoute(async (request, response) => {
      const requestContext = await scoped(request, response, "agent");
      send(
        response,
        200,
        requireFound(
          await preserveKanbanErrors(
            () =>
              dependencies.personalPlanning.moveTask(
                requestContext,
                pathId(request),
                parse(personalTaskMoveSchema, request.body),
              ),
            ApiHttpError,
          ),
          "personal_task",
        ),
      );
    }),
  );

  router.delete(
    "/api/personal-tasks/:id",
    asyncRoute(async (request, response) => {
      const requestContext = await scoped(request, response, "agent");
      if (
        !(await dependencies.personalPlanning.removeTask(
          requestContext,
          pathId(request),
        ))
      )
        throw new ApiHttpError(
          404,
          "personal_task_not_found",
          "Personal task was not found",
        );
      noContent(response);
    }),
  );

  router.get(
    "/api/personal-events",
    asyncRoute(async (request, response) => {
      const requestContext = await scoped(request, response);
      send(response, 200, {
        data: await dependencies.personalPlanning.listEvents(
          requestContext,
          parse(personalEventListSchema, request.query),
        ),
      });
    }),
  );

  router.post(
    "/api/personal-events",
    asyncRoute(async (request, response) => {
      const requestContext = await scoped(request, response, "agent");
      send(
        response,
        201,
        await dependencies.personalPlanning.createEvent(
          requestContext,
          parse(personalEventCreateSchema, request.body),
        ),
      );
    }),
  );

  router.patch(
    "/api/personal-events/:id",
    asyncRoute(async (request, response) => {
      const requestContext = await scoped(request, response, "agent");
      send(
        response,
        200,
        requireFound(
          await dependencies.personalPlanning.updateEvent(
            requestContext,
            pathId(request),
            parse(personalEventPatchSchema, request.body),
          ),
          "personal_event",
        ),
      );
    }),
  );

  router.delete(
    "/api/personal-events/:id",
    asyncRoute(async (request, response) => {
      const requestContext = await scoped(request, response, "agent");
      if (
        !(await dependencies.personalPlanning.removeEvent(
          requestContext,
          pathId(request),
        ))
      )
        throw new ApiHttpError(
          404,
          "personal_event_not_found",
          "Personal event was not found",
        );
      noContent(response);
    }),
  );
}
