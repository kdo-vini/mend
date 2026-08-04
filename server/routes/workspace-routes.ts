import type { ApiRouteModuleContext } from "../api-router.js";
import { z } from "zod";
import {
  auditLogListQuerySchema,
  workspaceCreateSchema,
  workspaceMemberCreateSchema,
  workspaceMemberListQuerySchema,
  workspaceMemberRolePatchSchema,
  workspaceParamSchema,
  workspacePatchSchema,
} from "./schemas.js";

export function registerWorkspaceRoutes(context: ApiRouteModuleContext) {
  const {
    router,
    dependencies,
    access,
    parse,
    asyncRoute,
    send,
    noContent,
    requireFound,
    userFrom,
    ApiHttpError,
    uuid,
  } = context;
  router.get(
    "/api/workspaces",
    asyncRoute(async (_request, response) => {
      const user = userFrom(response);
      send(response, 200, {
        data: await dependencies.workspaces.list(user.id),
      });
    }),
  );
  router.post(
    "/api/workspaces",
    asyncRoute(async (request, response) => {
      const user = userFrom(response);
      send(
        response,
        201,
        await dependencies.workspaces.create(
          user.id,
          parse(workspaceCreateSchema, request.body),
        ),
      );
    }),
  );
  router.get(
    "/api/workspaces/:id",
    asyncRoute(async (request, response) => {
      const workspaceId = parse(workspaceParamSchema, request.params).id;
      const context = await access(response, workspaceId);
      send(
        response,
        200,
        requireFound(
          await dependencies.workspaces.get(context, workspaceId),
          "workspace",
        ),
      );
    }),
  );
  router.patch(
    "/api/workspaces/:id",
    asyncRoute(async (request, response) => {
      const workspaceId = parse(workspaceParamSchema, request.params).id;
      const context = await access(response, workspaceId, "admin");
      send(
        response,
        200,
        requireFound(
          await dependencies.workspaces.update(
            context,
            workspaceId,
            parse(workspacePatchSchema, request.body),
          ),
          "workspace",
        ),
      );
    }),
  );
  router.get(
    "/api/workspaces/:id/members",
    asyncRoute(async (request, response) => {
      const workspaceId = parse(workspaceParamSchema, request.params).id;
      const context = await access(response, workspaceId);
      send(response, 200, {
        data: await dependencies.workspaces.listMembers(
          context,
          parse(workspaceMemberListQuerySchema, request.query),
        ),
      });
    }),
  );
  router.post(
    "/api/workspaces/:id/members",
    asyncRoute(async (request, response) => {
      const workspaceId = parse(workspaceParamSchema, request.params).id;
      const context = await access(response, workspaceId, "admin");
      send(
        response,
        201,
        await dependencies.workspaces.addMember(
          context,
          parse(workspaceMemberCreateSchema, request.body),
        ),
      );
    }),
  );
  router.patch(
    "/api/workspaces/:id/members/:userId",
    asyncRoute(async (request, response) => {
      const params = parse(
        z.object({ id: uuid, userId: uuid }).strict(),
        request.params,
      );
      const context = await access(response, params.id, "admin");
      send(
        response,
        200,
        requireFound(
          await dependencies.workspaces.updateMemberRole(
            context,
            params.userId,
            parse(workspaceMemberRolePatchSchema, request.body),
          ),
          "workspace_member",
        ),
      );
    }),
  );
  router.delete(
    "/api/workspaces/:id/members/:userId",
    asyncRoute(async (request, response) => {
      const params = parse(
        z.object({ id: uuid, userId: uuid }).strict(),
        request.params,
      );
      const context = await access(response, params.id, "admin");
      if (!(await dependencies.workspaces.removeMember(context, params.userId)))
        throw new ApiHttpError(
          404,
          "workspace_member_not_found",
          "workspace member was not found",
        );
      noContent(response);
    }),
  );
  router.get(
    "/api/workspaces/:id/audit-log",
    asyncRoute(async (request, response) => {
      const workspaceId = parse(workspaceParamSchema, request.params).id;
      const context = await access(response, workspaceId, "admin");
      send(response, 200, {
        data: await dependencies.workspaces.listAuditLog(
          context,
          parse(auditLogListQuerySchema, request.query),
        ),
      });
    }),
  );
}
