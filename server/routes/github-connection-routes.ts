import type { ApiRouteModuleContext } from "../api-router.js";
import { GitHubControlPlaneError } from "../github-control-plane.js";
import { githubSetupCallbackSchema } from "./schemas.js";

export function registerGitHubConnectionRoutes(context: ApiRouteModuleContext) {
  const { router, dependencies, scoped, pathId, parse, asyncRoute, send } =
    context;

  router.get(
    "/api/github/connection",
    asyncRoute(async (request, response) => {
      send(
        response,
        200,
        await dependencies.githubConnections.getWorkspaceConnection(
          await scoped(request, response, "admin"),
        ),
      );
    }),
  );

  router.get(
    "/api/github/repositories",
    asyncRoute(async (request, response) => {
      try {
        send(response, 200, {
          data: await dependencies.githubConnections.listWorkspaceRepositories(
            await scoped(request, response, "admin"),
          ),
        });
      } catch (error) {
        if (error instanceof GitHubControlPlaneError)
          throw new context.ApiHttpError(
            error.status,
            error.code,
            error.message,
          );
        throw error;
      }
    }),
  );

  router.post(
    "/api/github/setup",
    asyncRoute(async (request, response) => {
      try {
        send(
          response,
          200,
          await dependencies.githubConnections.startWorkspaceSetup(
            await scoped(request, response, "admin"),
          ),
        );
      } catch (error) {
        if (error instanceof GitHubControlPlaneError)
          throw new context.ApiHttpError(
            error.status,
            error.code,
            error.message,
          );
        throw error;
      }
    }),
  );

  router.delete(
    "/api/github/connection",
    asyncRoute(async (request, response) => {
      send(response, 200, {
        disconnected: await dependencies.githubConnections.disconnectWorkspace(
          await scoped(request, response, "admin"),
        ),
      });
    }),
  );

  router.post(
    "/api/repositories/:id/github/setup",
    asyncRoute(async (request, response) => {
      try {
        send(
          response,
          200,
          await dependencies.githubConnections.startSetup(
            await scoped(request, response, "admin"),
            pathId(request),
          ),
        );
      } catch (error) {
        if (error instanceof GitHubControlPlaneError)
          throw new context.ApiHttpError(
            error.status,
            error.code,
            error.message,
          );
        throw error;
      }
    }),
  );

  router.get(
    "/api/github/setup/callback",
    asyncRoute(async (request, response) => {
      try {
        await dependencies.githubConnections.completeSetup(
          parse(githubSetupCallbackSchema, request.query),
        );
        const base = process.env.APP_BASE_URL?.trim();
        const destination = base
          ? new URL(
              "/settings?tab=repositories&github=connected",
              base,
            ).toString()
          : "/settings?tab=repositories&github=connected";
        return response.redirect(303, destination);
      } catch (error) {
        if (error instanceof GitHubControlPlaneError)
          throw new context.ApiHttpError(
            error.status,
            error.code,
            error.message,
          );
        throw error;
      }
    }),
  );
}
