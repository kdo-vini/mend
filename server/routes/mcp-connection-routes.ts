import type { ApiRouteModuleContext } from "../api-router.js";
import { McpConnectionError } from "../mcp.js";
import {
  mcpConnectionCreateSchema,
  mcpConnectionPatchSchema,
} from "./schemas.js";

export function registerMcpConnectionRoutes(context: ApiRouteModuleContext) {
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
  const rethrowMcpError = (error: unknown) => {
    if (error instanceof McpConnectionError)
      throw new ApiHttpError(error.status, error.code, error.message);
    throw error;
  };

  router.get("/api/mcp/oauth/client-metadata.json", (_request, response) => {
    const base =
      process.env.APP_BASE_URL?.trim() || process.env.PUBLIC_APP_URL?.trim();
    const redirectUri = base
      ? new URL("/api/mcp/connections/oauth/callback", base).toString()
      : "/api/mcp/connections/oauth/callback";
    response.json({
      client_id: base
        ? new URL("/api/mcp/oauth/client-metadata.json", base).toString()
        : "mend-mcp-client",
      client_name: "Mend workspace MCP connector",
      redirect_uris: [redirectUri],
      grant_types: ["authorization_code"],
      response_types: ["code"],
      token_endpoint_auth_method: "none",
    });
  });

  router.get(
    "/api/mcp/connections",
    asyncRoute(async (request, response) => {
      send(response, 200, {
        data: await dependencies.mcpConnections.list(
          await scoped(request, response),
        ),
      });
    }),
  );

  router.post(
    "/api/mcp/connections",
    asyncRoute(async (request, response) => {
      try {
        send(
          response,
          201,
          await dependencies.mcpConnections.create(
            await scoped(request, response, "admin"),
            parse(mcpConnectionCreateSchema, request.body),
          ),
        );
      } catch (error) {
        rethrowMcpError(error);
      }
    }),
  );

  router.patch(
    "/api/mcp/connections/:id",
    asyncRoute(async (request, response) => {
      try {
        send(
          response,
          200,
          requireFound(
            await dependencies.mcpConnections.update(
              await scoped(request, response, "admin"),
              pathId(request),
              parse(mcpConnectionPatchSchema, request.body),
            ),
            "mcp_connection",
          ),
        );
      } catch (error) {
        rethrowMcpError(error);
      }
    }),
  );

  router.post(
    "/api/mcp/connections/:id/test",
    asyncRoute(async (request, response) => {
      try {
        send(
          response,
          200,
          requireFound(
            await dependencies.mcpConnections.test(
              await scoped(request, response, "admin"),
              pathId(request),
            ),
            "mcp_connection",
          ),
        );
      } catch (error) {
        rethrowMcpError(error);
      }
    }),
  );

  router.post(
    "/api/mcp/connections/:id/oauth/start",
    asyncRoute(async (request, response) => {
      try {
        send(
          response,
          200,
          await dependencies.mcpConnections.startOAuth(
            await scoped(request, response, "admin"),
            pathId(request),
          ),
        );
      } catch (error) {
        rethrowMcpError(error);
      }
    }),
  );

  router.get(
    "/api/mcp/connections/oauth/callback",
    asyncRoute(async (request, response) => {
      try {
        const code = String(request.query.code ?? "");
        const state = String(request.query.state ?? "");
        if (!code || !state)
          throw new ApiHttpError(
            400,
            "mcp_oauth_invalid",
            "MCP OAuth callback is invalid.",
          );
        await dependencies.mcpConnections.completeOAuth(code, state);
        const base = process.env.APP_BASE_URL?.trim();
        const destination = base
          ? new URL("/settings?tab=connections&mcp=connected", base).toString()
          : "/settings?tab=connections&mcp=connected";
        return response.redirect(303, destination);
      } catch (error) {
        rethrowMcpError(error);
      }
    }),
  );

  router.delete(
    "/api/mcp/connections/:id",
    asyncRoute(async (request, response) => {
      try {
        send(
          response,
          200,
          requireFound(
            await dependencies.mcpConnections.disconnect(
              await scoped(request, response, "admin"),
              pathId(request),
            ),
            "mcp_connection",
          ),
        );
      } catch (error) {
        rethrowMcpError(error);
      }
    }),
  );
}
