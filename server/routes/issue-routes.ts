import type { ApiRouteModuleContext } from "../api-router.js";
import {
  issueCommentSchema,
  issueCreateSchema,
  issueEvidenceSchema,
  issueLinkMessageSchema,
  issuePatchSchema,
  resolveAndNotifySchema,
  type IssueRequestContext,
} from "../issue-service.js";
import { issueListApiQuerySchema } from "./schemas.js";

export function registerIssueRoutes(context: ApiRouteModuleContext) {
  const {
    router,
    dependencies,
    scoped,
    pathIssue,
    parse,
    asyncRoute,
    send,
    noContent,
    requireFound,
    issueService,
    ApiHttpError,
  } = context;
  router.get(
    "/api/issues",
    asyncRoute(async (request, response) => {
      const context = await scoped(request, response);
      send(response, 200, {
        data: await dependencies.issues.list(
          context as IssueRequestContext,
          parse(issueListApiQuerySchema, request.query),
        ),
      });
    }),
  );
  router.post(
    "/api/issues",
    asyncRoute(async (request, response) => {
      const context = await scoped(request, response, "agent");
      send(
        response,
        201,
        await issueService.create(
          context as IssueRequestContext,
          parse(issueCreateSchema, request.body),
        ),
      );
    }),
  );
  router.get(
    "/api/issues/:identifier",
    asyncRoute(async (request, response) => {
      const context = await scoped(request, response);
      send(
        response,
        200,
        requireFound(
          await issueService.get(
            context as IssueRequestContext,
            pathIssue(request),
          ),
          "issue",
        ),
      );
    }),
  );
  router.get(
    "/api/issues/:identifier/history",
    asyncRoute(async (request, response) => {
      const context = await scoped(request, response);
      const value = requireFound(
        await issueService.get(
          context as IssueRequestContext,
          pathIssue(request),
        ),
        "issue",
      ) as Record<string, unknown>;
      send(response, 200, {
        issue: value,
        comments: Array.isArray(value.comments) ? value.comments : [],
        evidence: Array.isArray(value.evidence) ? value.evidence : [],
        timeline: Array.isArray(value.timeline) ? value.timeline : [],
      });
    }),
  );
  router.patch(
    "/api/issues/:identifier",
    asyncRoute(async (request, response) => {
      const context = await scoped(request, response, "agent");
      send(
        response,
        200,
        requireFound(
          await issueService.update(
            context as IssueRequestContext,
            pathIssue(request),
            parse(issuePatchSchema, request.body),
          ),
          "issue",
        ),
      );
    }),
  );
  router.delete(
    "/api/issues/:identifier",
    asyncRoute(async (request, response) => {
      const context = await scoped(request, response, "admin");
      if (
        !(await issueService.remove(
          context as IssueRequestContext,
          pathIssue(request),
        ))
      )
        throw new ApiHttpError(404, "issue_not_found", "issue was not found");
      noContent(response);
    }),
  );
  router.post(
    "/api/issues/:identifier/comments",
    asyncRoute(async (request, response) => {
      const context = await scoped(request, response, "agent");
      send(
        response,
        201,
        requireFound(
          await issueService.addComment(
            context as IssueRequestContext,
            pathIssue(request),
            parse(issueCommentSchema, request.body),
          ),
          "issue_comment",
        ),
      );
    }),
  );
  router.post(
    "/api/issues/:identifier/evidence",
    asyncRoute(async (request, response) => {
      const context = await scoped(request, response, "agent");
      send(
        response,
        201,
        requireFound(
          await issueService.addEvidence(
            context as IssueRequestContext,
            pathIssue(request),
            parse(issueEvidenceSchema, request.body),
          ),
          "issue_evidence",
        ),
      );
    }),
  );
  router.post(
    "/api/issues/:identifier/link-message",
    asyncRoute(async (request, response) => {
      const context = await scoped(request, response, "agent");
      send(
        response,
        201,
        requireFound(
          await issueService.linkMessage(
            context as IssueRequestContext,
            pathIssue(request),
            parse(issueLinkMessageSchema, request.body),
          ),
          "issue_message_link",
        ),
      );
    }),
  );
  router.post(
    "/api/issues/:identifier/resolve-and-notify",
    asyncRoute(async (request, response) => {
      const context = await scoped(request, response, "agent");
      send(
        response,
        200,
        requireFound(
          await issueService.resolveAndNotify(
            context as IssueRequestContext,
            pathIssue(request),
            parse(resolveAndNotifySchema, request.body ?? {}),
          ),
          "issue",
        ),
      );
    }),
  );
}
