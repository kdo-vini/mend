import type { ApiRouteModuleContext } from "../api-router.js";
import { GoogleConnectionError } from "../google-calendar.js";
import {
  googleCalendarSelectionSchema,
  googleOAuthCallbackSchema,
} from "./schemas.js";

export function registerGoogleConnectionRoutes(context: ApiRouteModuleContext) {
  const {
    router,
    dependencies,
    scoped,
    pathId,
    parse,
    asyncRoute,
    send,
    requireFound,
    ApiHttpError,
  } = context;
  const rethrowGoogleError = (error: unknown) => {
    if (error instanceof GoogleConnectionError)
      throw new ApiHttpError(error.status, error.code, error.message);
    throw error;
  };

  router.get(
    "/api/google/connections",
    asyncRoute(async (request, response) => {
      send(response, 200, {
        data: await dependencies.googleConnections.list(
          await scoped(request, response),
        ),
      });
    }),
  );
  router.post(
    "/api/google/connections/oauth/start",
    asyncRoute(async (request, response) => {
      try {
        send(
          response,
          200,
          await dependencies.googleConnections.startOAuth(
            await scoped(request, response, "admin"),
          ),
        );
      } catch (error) {
        rethrowGoogleError(error);
      }
    }),
  );
  router.get(
    "/api/google/connections/oauth/callback",
    asyncRoute(async (request, response) => {
      try {
        const { code, state } = parse(googleOAuthCallbackSchema, request.query);
        await dependencies.googleConnections.completeOAuth(code, state);
        const base = process.env.APP_BASE_URL?.trim();
        const destination = base
          ? new URL(
              "/settings?tab=connections&google=connected",
              base,
            ).toString()
          : "/settings?tab=connections&google=connected";
        return response.redirect(303, destination);
      } catch (error) {
        if (error instanceof ApiHttpError) throw error;
        const status =
          error && typeof error === "object" && "status" in error
            ? Number((error as { status?: unknown }).status)
            : 502;
        const code =
          error && typeof error === "object" && "code" in error
            ? String((error as { code?: unknown }).code)
            : "google_oauth_failed";
        const message =
          error instanceof Error
            ? error.message
            : "Google OAuth could not be completed.";
        throw new ApiHttpError(status, code, message);
      }
    }),
  );
  router.patch(
    "/api/google/connections/:id/calendars",
    asyncRoute(async (request, response) => {
      try {
        send(
          response,
          200,
          requireFound(
            await dependencies.googleConnections.updateCalendars(
              await scoped(request, response, "admin"),
              pathId(request),
              parse(googleCalendarSelectionSchema, request.body)
                .selectedCalendarIds,
            ),
            "google_connection",
          ),
        );
      } catch (error) {
        rethrowGoogleError(error);
      }
    }),
  );
  router.delete(
    "/api/google/connections/:id",
    asyncRoute(async (request, response) => {
      try {
        send(
          response,
          200,
          requireFound(
            await dependencies.googleConnections.disconnect(
              await scoped(request, response, "admin"),
              pathId(request),
            ),
            "google_connection",
          ),
        );
      } catch (error) {
        rethrowGoogleError(error);
      }
    }),
  );
}
