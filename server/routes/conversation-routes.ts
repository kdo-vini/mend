import type { ApiRouteModuleContext } from "../api-router.js";
import {
  aiDraftSchema,
  conversationAiPauseSchema,
  conversationListQuerySchema,
  conversationPatchSchema,
  conversationSnoozeSchema,
  sendMessageSchema,
} from "./schemas.js";

export function registerConversationRoutes(context: ApiRouteModuleContext) {
  const {
    router,
    dependencies,
    scoped,
    pathId,
    parse,
    asyncRoute,
    send,
    requireFound,
    mediaApiError,
  } = context;
  router.get(
    "/api/conversations",
    asyncRoute(async (request, response) => {
      send(response, 200, {
        data: await dependencies.conversations.list(
          await scoped(request, response),
          parse(conversationListQuerySchema, request.query),
        ),
      });
    }),
  );
  router.get(
    "/api/conversations/:id",
    asyncRoute(async (request, response) => {
      const context = await scoped(request, response);
      send(
        response,
        200,
        requireFound(
          await dependencies.conversations.get(context, pathId(request)),
          "conversation",
        ),
      );
    }),
  );
  router.patch(
    "/api/conversations/:id",
    asyncRoute(async (request, response) => {
      const context = await scoped(request, response, "agent");
      send(
        response,
        200,
        requireFound(
          await dependencies.conversations.update(
            context,
            pathId(request),
            parse(conversationPatchSchema, request.body),
          ),
          "conversation",
        ),
      );
    }),
  );
  router.post(
    "/api/conversations/:id/read",
    asyncRoute(async (request, response) => {
      const context = await scoped(request, response, "agent");
      send(
        response,
        200,
        requireFound(
          await dependencies.conversations.markRead(context, pathId(request)),
          "conversation",
        ),
      );
    }),
  );
  router.post(
    "/api/conversations/:id/snooze",
    asyncRoute(async (request, response) => {
      const context = await scoped(request, response, "agent");
      send(
        response,
        200,
        requireFound(
          await dependencies.conversations.snooze(
            context,
            pathId(request),
            parse(conversationSnoozeSchema, request.body),
          ),
          "conversation",
        ),
      );
    }),
  );
  router.post(
    "/api/conversations/:id/resolve",
    asyncRoute(async (request, response) => {
      const context = await scoped(request, response, "agent");
      send(
        response,
        200,
        requireFound(
          await dependencies.conversations.resolve(context, pathId(request)),
          "conversation",
        ),
      );
    }),
  );
  router.post(
    "/api/conversations/:id/ai/pause",
    asyncRoute(async (request, response) => {
      const context = await scoped(request, response, "agent");
      send(
        response,
        200,
        requireFound(
          await dependencies.conversations.pauseAi(
            context,
            pathId(request),
            parse(conversationAiPauseSchema, request.body ?? {}).reason,
          ),
          "conversation",
        ),
      );
    }),
  );
  router.post(
    "/api/conversations/:id/ai/resume",
    asyncRoute(async (request, response) => {
      const context = await scoped(request, response, "agent");
      send(
        response,
        200,
        requireFound(
          await dependencies.conversations.resumeAi(context, pathId(request)),
          "conversation",
        ),
      );
    }),
  );
  router.post(
    "/api/conversations/:id/messages",
    asyncRoute(async (request, response) => {
      const context = await scoped(request, response, "agent");
      const input = parse(sendMessageSchema, request.body);
      try {
        send(
          response,
          201,
          requireFound(
            await dependencies.conversations.sendMessage(
              context,
              pathId(request),
              input,
            ),
            "message",
          ),
        );
      } catch (error) {
        throw mediaApiError(error) ?? error;
      }
    }),
  );
  router.post(
    "/api/conversations/:id/ai-draft",
    asyncRoute(async (request, response) => {
      const context = await scoped(request, response, "agent");
      send(
        response,
        200,
        requireFound(
          await dependencies.conversations.aiDraft(
            context,
            pathId(request),
            parse(aiDraftSchema, request.body ?? {}),
          ),
          "ai_draft",
        ),
      );
    }),
  );
}
