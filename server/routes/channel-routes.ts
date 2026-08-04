import type { ApiRouteModuleContext } from "../api-router.js";

export function registerChannelRoutes(context: ApiRouteModuleContext) {
  const {
    router,
    dependencies,
    scoped,
    pathId,
    parse,
    asyncRoute,
    send,
    requireFound,
  } = context;
  const channelListQuerySchema = context.schemas.channelListQuerySchema;
  const channelCreateSchema = context.schemas.channelCreateSchema;
  router.get(
    "/api/channels",
    asyncRoute(async (request, response) => {
      send(response, 200, {
        data: await dependencies.channels.list(
          await scoped(request, response),
          parse(channelListQuerySchema, request.query),
        ),
      });
    }),
  );
  router.post(
    "/api/channels/whatsmiau",
    asyncRoute(async (request, response) => {
      send(
        response,
        201,
        await dependencies.channels.createWhatsmiau(
          await scoped(request, response, "agent"),
          parse(channelCreateSchema, request.body),
        ),
      );
    }),
  );
  router.get(
    "/api/channels/:id",
    asyncRoute(async (request, response) => {
      const context = await scoped(request, response);
      send(
        response,
        200,
        requireFound(
          await dependencies.channels.get(context, pathId(request)),
          "channel",
        ),
      );
    }),
  );
  router.post(
    "/api/channels/:id/connect",
    asyncRoute(async (request, response) => {
      const context = await scoped(request, response, "agent");
      send(
        response,
        200,
        requireFound(
          await dependencies.channels.connect(context, pathId(request)),
          "channel",
        ),
      );
    }),
  );
  router.get(
    "/api/channels/:id/qr",
    asyncRoute(async (request, response) => {
      const context = await scoped(request, response);
      send(
        response,
        200,
        requireFound(
          await dependencies.channels.qr(context, pathId(request)),
          "qr",
        ),
      );
    }),
  );
  router.post(
    "/api/channels/:id/disconnect",
    asyncRoute(async (request, response) => {
      const context = await scoped(request, response, "agent");
      send(
        response,
        200,
        requireFound(
          await dependencies.channels.disconnect(context, pathId(request)),
          "channel",
        ),
      );
    }),
  );
  router.post(
    "/api/channels/:id/refresh",
    asyncRoute(async (request, response) => {
      const context = await scoped(request, response, "agent");
      send(
        response,
        200,
        requireFound(
          await dependencies.channels.refresh(context, pathId(request)),
          "channel",
        ),
      );
    }),
  );
}
