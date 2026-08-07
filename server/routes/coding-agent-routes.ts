import type { ApiRouteModuleContext } from "../api-router.js";
import { createCodingAgentCli } from "../coding-agent-cli.js";

const cli = createCodingAgentCli();

/** Report installed provider CLIs without exposing credentials or process env. */
export function registerCodingAgentRoutes(context: ApiRouteModuleContext) {
  const { router, scoped, asyncRoute, send } = context;
  router.get(
    "/api/coding-agents/health",
    asyncRoute(async (request, response) => {
      await scoped(request, response);
      send(response, 200, { data: await cli.healthAll() });
    }),
  );
}
