import { z } from "zod";
import type { ApiRouteModuleContext } from "../api-router.js";
import {
  agentConnectionCreateSchema,
  agentConnectionParamSchema,
  agentConnectionPatchSchema,
  agentLoginJobParamSchema,
  agentLoginStartSchema,
  agentRoutingPolicySchema,
} from "./schemas.js";

export function registerCodingControlPlaneRoutes(
  context: ApiRouteModuleContext,
): void {
  const { router, dependencies, scoped, parse, asyncRoute, send, noContent } =
    context;
  const controlPlane = dependencies.codingControlPlane;
  if (!controlPlane) return;

  router.get(
    "/api/agent-connections",
    asyncRoute(async (request, response) => {
      send(response, 200, {
        data: await controlPlane.listConnections(
          await scoped(request, response),
        ),
      });
    }),
  );
  router.post(
    "/api/agent-connections",
    asyncRoute(async (request, response) => {
      send(
        response,
        201,
        await controlPlane.createConnection(
          await scoped(request, response),
          parse(agentConnectionCreateSchema, request.body),
        ),
      );
    }),
  );
  router.patch(
    "/api/agent-connections/:id",
    asyncRoute(async (request, response) => {
      const input = parse(agentConnectionParamSchema, request.params);
      send(
        response,
        200,
        await controlPlane.updateConnection(
          await scoped(request, response),
          input.id,
          parse(agentConnectionPatchSchema, request.body),
        ),
      );
    }),
  );
  router.delete(
    "/api/agent-connections/:id",
    asyncRoute(async (request, response) => {
      const input = parse(agentConnectionParamSchema, request.params);
      const removed = await controlPlane.removeConnection(
        await scoped(request, response),
        input.id,
      );
      if (!removed) {
        send(response, 404, {
          error: {
            code: "agent_connection_not_found",
            message: "Connection not found",
          },
        });
        return;
      }
      noContent(response);
    }),
  );
  router.post(
    "/api/agent-connections/:id/verify",
    asyncRoute(async (request, response) => {
      const input = parse(agentConnectionParamSchema, request.params);
      const result = await controlPlane.verifyConnection(
        await scoped(request, response),
        input.id,
      );
      if (!result) {
        send(response, 404, {
          error: {
            code: "agent_connection_not_found",
            message: "Connection not found",
          },
        });
        return;
      }
      send(response, 200, result);
    }),
  );
  router.get(
    "/api/agent-connections/:id/models",
    asyncRoute(async (request, response) => {
      const input = parse(agentConnectionParamSchema, request.params);
      const refresh =
        z.enum(["true", "false"]).safeParse(request.query.refresh).data ===
        "true";
      const result = await controlPlane.listModels(
        await scoped(request, response),
        input.id,
        refresh,
      );
      if (!result) {
        send(response, 404, {
          error: {
            code: "agent_connection_not_found",
            message: "Connection not found",
          },
        });
        return;
      }
      send(response, 200, result);
    }),
  );

  router.post(
    "/api/agent-connections/login",
    asyncRoute(async (request, response) => {
      send(
        response,
        202,
        await controlPlane.startLogin(
          await scoped(request, response),
          parse(agentLoginStartSchema, request.body),
        ),
      );
    }),
  );
  router.get(
    "/api/agent-connections/login/:jobId",
    asyncRoute(async (request, response) => {
      const input = parse(agentLoginJobParamSchema, request.params);
      const result = await controlPlane.pollLogin(
        await scoped(request, response),
        input.jobId,
      );
      if (!result) {
        send(response, 404, {
          error: {
            code: "agent_login_not_found",
            message: "Login job not found",
          },
        });
        return;
      }
      send(response, 200, result);
    }),
  );
  router.post(
    "/api/agent-connections/login/:jobId/cancel",
    asyncRoute(async (request, response) => {
      const input = parse(agentLoginJobParamSchema, request.params);
      const result = await controlPlane.cancelLogin(
        await scoped(request, response),
        input.jobId,
      );
      if (!result) {
        send(response, 404, {
          error: {
            code: "agent_login_not_found",
            message: "Login job not found",
          },
        });
        return;
      }
      send(response, 200, result);
    }),
  );

  router.get(
    "/api/agent-routing-policies",
    asyncRoute(async (request, response) => {
      const repositoryId = z
        .string()
        .uuid()
        .optional()
        .parse(request.query.repositoryId);
      send(response, 200, {
        data: await controlPlane.getPolicies(
          await scoped(request, response),
          repositoryId,
        ),
      });
    }),
  );
  router.put(
    "/api/agent-routing-policies",
    asyncRoute(async (request, response) => {
      send(
        response,
        200,
        await controlPlane.putPolicy(
          await scoped(request, response, "admin"),
          parse(agentRoutingPolicySchema, request.body),
        ),
      );
    }),
  );
}
