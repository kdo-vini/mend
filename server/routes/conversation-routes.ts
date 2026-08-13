import type { ApiRouteModuleContext } from "../api-router.js";
import { normalizePhoneNumber } from "../whatsmiau.js";
import {
  aiDraftSchema,
  conversationAiPauseSchema,
  conversationListQuerySchema,
  conversationPatchSchema,
  conversationSnoozeSchema,
  conversationStartSchema,
  messageReactionSchema,
  messagePresenceSchema,
  sendMessageSchema,
} from "./schemas.js";

/** Dial code, area code and subscriber number, within the E.164 maximum. */
const phoneNumberDigits = { minimum: 10, maximum: 15 };

/**
 * Cold first contacts are the WhatsApp account risk this endpoint warns the
 * user about, so they are capped per workspace rather than per IP. The app-wide
 * limiter is shared with every other route and cannot express that. Replying
 * inside threads a customer opened is unaffected.
 */
const outboundFirstSends = { limit: 20, windowMs: 3_600_000 };

export function registerConversationRoutes(context: ApiRouteModuleContext) {
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
    mediaApiError,
    uuid,
    ApiHttpError,
  } = context;

  const outboundFirstSendsByWorkspace = new Map<string, number[]>();
  /** Reserves one cold-send slot, or throws once the workspace window is full. */
  const reserveOutboundFirstSend = (workspaceId: string) => {
    const now = Date.now();
    const recent = (
      outboundFirstSendsByWorkspace.get(workspaceId) ?? []
    ).filter((sentAt) => now - sentAt < outboundFirstSends.windowMs);
    if (recent.length >= outboundFirstSends.limit) {
      outboundFirstSendsByWorkspace.set(workspaceId, recent);
      throw new ApiHttpError(
        429,
        "outbound_first_limit_exceeded",
        "This workspace has started too many new conversations in the last hour.",
      );
    }
    outboundFirstSendsByWorkspace.set(workspaceId, [...recent, now]);
  };

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
  router.post(
    "/api/conversations",
    asyncRoute(async (request, response) => {
      const context = await scoped(request, response, "agent");
      const input = parse(conversationStartSchema, request.body);
      const phoneNumber = normalizePhoneNumber(input.phoneNumber);
      if (
        phoneNumber.length < phoneNumberDigits.minimum ||
        phoneNumber.length > phoneNumberDigits.maximum
      )
        throw new ApiHttpError(
          400,
          "invalid_phone_number",
          "The phone number must include the dial code, area code and subscriber number.",
        );
      // An existing thread already belongs to the customer. Return it instead
      // of sending, so New chat can never open a second conversation or push
      // an unexpected message into a live one.
      const existing = await dependencies.conversations.findByPhone(
        context,
        phoneNumber,
      );
      if (existing) {
        send(response, 200, { conversationId: existing.id, created: false });
        return;
      }
      // Only the creating path is cold outreach, so only it consumes quota.
      // The slot is taken before the send, so every request that can reach the
      // provider is counted.
      reserveOutboundFirstSend(context.workspaceId);
      try {
        const started = requireFound(
          await dependencies.conversations.start(context, {
            channelId: input.channelId,
            phoneNumber,
            message: input.message,
          }),
          "channel",
        );
        send(response, 201, {
          conversationId: started.conversationId,
          created: true,
        });
      } catch (error) {
        if (error instanceof Error && error.message === "channel_not_connected")
          throw new ApiHttpError(
            409,
            "channel_not_connected",
            "Connect the WhatsApp channel before starting a conversation.",
          );
        throw error;
      }
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
  router.delete(
    "/api/conversations/:id",
    asyncRoute(async (request, response) => {
      const context = await scoped(request, response, "agent");
      const deleted = await dependencies.conversations.delete(
        context,
        pathId(request),
      );
      requireFound(deleted ? deleted : null, "conversation");
      noContent(response);
    }),
  );
  router.post(
    "/api/conversations/:id/messages/:messageId/reaction",
    asyncRoute(async (request, response) => {
      const context = await scoped(request, response, "agent");
      const messageId = parse(uuid, request.params.messageId);
      send(
        response,
        200,
        requireFound(
          await dependencies.conversations.reactToMessage(
            context,
            pathId(request),
            messageId,
            parse(messageReactionSchema, request.body).reaction,
          ),
          "message",
        ),
      );
    }),
  );
  router.post(
    "/api/conversations/:id/presence",
    asyncRoute(async (request, response) => {
      const context = await scoped(request, response, "agent");
      await dependencies.conversations.sendPresence(
        context,
        pathId(request),
        parse(messagePresenceSchema, request.body).presence,
      );
      noContent(response);
    }),
  );
  router.delete(
    "/api/conversations/:id/messages/:messageId",
    asyncRoute(async (request, response) => {
      const context = await scoped(request, response, "agent");
      const messageId = parse(uuid, request.params.messageId);
      await requireFound(
        await dependencies.conversations.deleteMessage(
          context,
          pathId(request),
          messageId,
        ),
        "message",
      );
      noContent(response);
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
