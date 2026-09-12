import { z } from "zod";
import type { ApiRouteModuleContext } from "../api-router.js";

const productInput = z
  .object({
    key: z
      .string()
      .trim()
      .regex(/^[a-z0-9][a-z0-9-]{1,62}$/),
    name: z.string().trim().min(1).max(120),
    description: z.string().trim().max(2000).default(""),
    aliases: z.array(z.string().trim().min(1).max(120)).max(40).default([]),
    status: z.enum(["active", "archived"]).optional(),
  })
  .strict();
const sourceInput = z
  .object({
    repositoryId: z.string().uuid(),
    productIds: z.array(z.string().uuid()).min(1).max(20),
    refName: z.string().trim().min(1).max(255),
    syncMode: z.enum(["event", "manual", "paused"]).default("event"),
    includePatterns: z
      .array(z.string().trim().min(1).max(500))
      .max(100)
      .optional(),
    excludePatterns: z
      .array(z.string().trim().min(1).max(500))
      .max(100)
      .optional(),
  })
  .strict();
const revisionInput = z
  .object({ sha: z.string().regex(/^[a-f0-9]{40,64}$/) })
  .strict();

export function registerKnowledgeSourceRoutes(context: ApiRouteModuleContext) {
  const port = context.dependencies.knowledgeConfiguration;
  if (!port) return;
  const { router, scoped, pathId, parse, asyncRoute, send, requireFound } =
    context;
  router.get(
    "/api/knowledge/products",
    asyncRoute(async (request, response) => {
      const access = await scoped(request, response);
      send(response, 200, {
        data: await port.listProducts(access.workspaceId),
      });
    }),
  );
  router.post(
    "/api/knowledge/products",
    asyncRoute(async (request, response) => {
      const access = await scoped(request, response, "admin");
      send(
        response,
        201,
        await port.createProduct(
          access.workspaceId,
          parse(productInput, request.body),
        ),
      );
    }),
  );
  router.patch(
    "/api/knowledge/products/:id",
    asyncRoute(async (request, response) => {
      const access = await scoped(request, response, "admin");
      send(
        response,
        200,
        requireFound(
          await port.updateProduct(
            access.workspaceId,
            pathId(request),
            parse(productInput.partial(), request.body),
          ),
          "support_product",
        ),
      );
    }),
  );
  router.get(
    "/api/knowledge/sources",
    asyncRoute(async (request, response) => {
      const access = await scoped(request, response);
      send(response, 200, { data: await port.listSources(access.workspaceId) });
    }),
  );
  router.post(
    "/api/knowledge/sources",
    asyncRoute(async (request, response) => {
      const access = await scoped(request, response, "admin");
      send(
        response,
        201,
        await port.createSource(
          access.workspaceId,
          parse(sourceInput, request.body),
        ),
      );
    }),
  );
  router.patch(
    "/api/knowledge/sources/:id",
    asyncRoute(async (request, response) => {
      const access = await scoped(request, response, "admin");
      send(
        response,
        200,
        requireFound(
          await port.updateSource(
            access.workspaceId,
            pathId(request),
            parse(sourceInput.partial(), request.body),
          ),
          "knowledge_source",
        ),
      );
    }),
  );
  router.post(
    "/api/knowledge/sources/:id/sync",
    asyncRoute(async (request, response) => {
      const access = await scoped(request, response, "admin");
      send(
        response,
        202,
        requireFound(
          await port.requestSync(access.workspaceId, pathId(request)),
          "knowledge_source",
        ),
      );
    }),
  );
  router.post(
    "/api/knowledge/sources/:id/activate",
    asyncRoute(async (request, response) => {
      const access = await scoped(request, response, "admin");
      const input = parse(revisionInput, request.body);
      send(
        response,
        200,
        requireFound(
          await port.activateRevision(
            access.workspaceId,
            pathId(request),
            input.sha,
          ),
          "knowledge_source",
        ),
      );
    }),
  );
}
