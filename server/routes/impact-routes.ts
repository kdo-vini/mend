import { z } from "zod";
import type { ApiRouteModuleContext } from "../api-router.js";

const impactPeriodSchema = z
  .object({
    from: z.string().datetime({ offset: true }),
    to: z.string().datetime({ offset: true }),
  })
  .strict()
  .refine((period) => Date.parse(period.from) <= Date.parse(period.to), {
    message: "from must be earlier than or equal to to",
    path: ["from"],
  });

export function registerImpactRoutes(context: ApiRouteModuleContext): void {
  const { router, dependencies, scoped, parse, asyncRoute, send } = context;
  router.get(
    "/api/impact",
    asyncRoute(async (request, response) => {
      const period = parse(impactPeriodSchema, request.query);
      send(
        response,
        200,
        await dependencies.impact.summary(
          await scoped(request, response),
          period,
        ),
      );
    }),
  );
}
