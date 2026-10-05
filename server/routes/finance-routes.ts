import { z } from "zod";
import type { ApiRouteModuleContext } from "../api-router.js";
import {
  financePeriod,
  financeRecords,
  type FinanceEntity,
} from "../finance-service.js";

export function registerFinanceRoutes(ctx: ApiRouteModuleContext) {
  const {
    router,
    dependencies,
    asyncRoute,
    scoped,
    send,
    parse,
    ApiHttpError,
  } = ctx;
  const port = dependencies.finance;
  router.get(
    "/api/finance/access",
    asyncRoute(async (req, res) => {
      const scope = await scoped(req, res);
      send(res, 200, {
        allowed: port ? await port.allowed(scope.workspaceId) : false,
      });
    }),
  );
  router.use(
    "/api/finance",
    asyncRoute(async (req, res, next) => {
      const scope = await scoped(req, res);
      if (!port || !(await port.allowed(scope.workspaceId)))
        throw new ApiHttpError(
          403,
          "finance_forbidden",
          "Financial access is restricted.",
        );
      next();
    }),
  );
  router.get(
    "/api/finance/summary",
    asyncRoute(async (req, res) =>
      send(
        res,
        200,
        await port!.summary(parse(financePeriod, req.query.period)),
      ),
    ),
  );
  router.post(
    "/api/finance/generate",
    asyncRoute(async (req, res) => {
      const { period } = parse(
        z.object({ period: financePeriod }).strict(),
        req.body,
      );
      send(res, 200, { generated: await port!.generate(period) });
    }),
  );
  router.get(
    "/api/finance/history/:id",
    asyncRoute(async (req, res) =>
      send(res, 200, {
        data: await port!.history(parse(z.string().uuid(), req.params.id)),
      }),
    ),
  );
  const entitySchema = z.enum([
    "entries",
    "settlements",
    "templates",
    "references",
    "reviews",
  ]);
  router.get(
    "/api/finance/:entity/:id",
    asyncRoute(async (req, res) => {
      const entity = parse(entitySchema, req.params.entity);
      const record = await port!.get(
        entity,
        parse(z.string().uuid(), req.params.id),
      );
      if (!record)
        throw new ApiHttpError(
          404,
          "finance_not_found",
          "Financial record not found.",
        );
      send(res, 200, record);
    }),
  );
  router.get(
    "/api/finance/:entity",
    asyncRoute(async (req, res) => {
      const entity = parse(entitySchema, req.params.entity) as FinanceEntity;
      const { period, offset } = parse(
        z
          .object({
            period: financePeriod.optional(),
            offset: z.coerce.number().int().min(0).max(100000).default(0),
          })
          .strict(),
        req.query,
      );
      if ((entity === "entries" || entity === "settlements") && !period)
        throw new ApiHttpError(400, "invalid_input", "Period is required.");
      const data = await port!.list(entity, period, offset);
      send(res, 200, {
        data,
        nextOffset: data.length === 50 ? offset + 50 : null,
      });
    }),
  );
  router.post(
    "/api/finance/:entity",
    asyncRoute(async (req, res) => {
      const entity = parse(entitySchema, req.params.entity) as FinanceEntity;
      const body = parse(
        z
          .object({
            record: z.record(z.unknown()),
            version: z.number().int().min(1).nullable(),
          })
          .strict(),
        req.body,
      );
      const record = financeRecords[entity].parse(body.record);
      send(res, 200, await port!.save(entity, record, body.version));
    }),
  );
}
