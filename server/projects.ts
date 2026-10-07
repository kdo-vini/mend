import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { ApiRouteModuleContext } from "./api-router.js";
import { ApiHttpError } from "./api-router.js";

export const projectRecord = z
  .object({
    id: z.string().uuid(),
    // A project's key is a foreign-key-like label already stored in finance rows.
    // Preserve its exact bytes on update; migration seeding retains legacy spacing.
    key: z
      .string()
      .min(1)
      .max(200)
      .refine((key) => key.trim().length > 0),
    name: z.string().trim().min(1).max(200),
    description: z.string().trim().max(2000),
    status: z.enum(["active", "archived"]),
  })
  .strict();
export interface ProjectsPort {
  list(): Promise<unknown[]>;
  save(
    record: z.infer<typeof projectRecord>,
    version: number | null,
  ): Promise<unknown>;
}
export class SupabaseProjectsAdapter implements ProjectsPort {
  constructor(private client: SupabaseClient) {}
  private checked<T>(result: { data: T; error: { code?: string } | null }): T {
    if (result.error) {
      const status =
        result.error.code === "42501"
          ? 403
          : ["23505", "40001"].includes(result.error.code ?? "")
            ? 409
            : 503;
      throw new ApiHttpError(
        status,
        "project_save_failed",
        "Project request failed.",
      );
    }
    return result.data;
  }
  async list() {
    return (
      this.checked(
        await this.client
          .from("projects")
          .select("id,key,name,description,status,version")
          .order("name")
          .limit(1000),
      ) ?? []
    );
  }
  async save(record: z.infer<typeof projectRecord>, version: number | null) {
    return this.checked(
      await this.client.rpc("project_save", {
        p_record: record,
        p_expected_version: version,
      }),
    );
  }
}
export function registerProjectRoutes(ctx: ApiRouteModuleContext) {
  const { router, dependencies, asyncRoute, scoped, send, parse } = ctx;
  router.get(
    "/api/projects",
    asyncRoute(async (req, res) => {
      await scoped(req, res);
      if (!dependencies.projects)
        throw new ApiHttpError(
          503,
          "projects_unavailable",
          "Projects are unavailable.",
        );
      res.setHeader("Cache-Control", "no-store");
      send(res, 200, { data: await dependencies.projects.list() });
    }),
  );
  router.post(
    "/api/projects",
    asyncRoute(async (req, res) => {
      const scope = await scoped(req, res);
      if (
        scope.role !== "owner" &&
        scope.role !== "admin" &&
        !(await dependencies.finance?.allowed(scope.workspaceId))
      )
        throw new ApiHttpError(
          403,
          "projects_forbidden",
          "Project changes are restricted.",
        );
      if (!dependencies.projects)
        throw new ApiHttpError(
          503,
          "projects_unavailable",
          "Projects are unavailable.",
        );
      const body = parse(
        z
          .object({
            record: projectRecord,
            version: z.number().int().positive().nullable(),
          })
          .strict(),
        req.body,
      );
      send(
        res,
        200,
        await dependencies.projects.save(body.record, body.version),
      );
    }),
  );
}
