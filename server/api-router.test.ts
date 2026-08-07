import express from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import {
  createApiRouter,
  type ApiRouterDependencies,
  type AuthenticatedUser,
  type RequestContext,
} from "./api-router.js";
import type { IssuePort } from "./issue-service.js";
import type { KnowledgePort } from "./knowledge-service.js";
import { CodexServiceError } from "./codex-service.js";

const userId = "11111111-1111-4111-8111-111111111111";
const workspaceId = "22222222-2222-4222-8222-222222222222";
const otherWorkspaceId = "33333333-3333-4333-8333-333333333333";
const issueId = "44444444-4444-4444-8444-444444444444";
const conversationId = "55555555-5555-4555-8555-555555555555";
const channelId = "66666666-6666-4666-8666-666666666666";
const repositoryId = "77777777-7777-4777-8777-777777777777";
const runId = "88888888-8888-4888-8888-888888888888";
const articleId = "99999999-9999-4999-8999-999999999999";
const messageId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

const context = (role: RequestContext["role"] = "owner"): RequestContext => ({
  userId,
  workspaceId,
  role,
});
const user: AuthenticatedUser = {
  id: userId,
  email: "operator@mend.test",
  name: "Operator",
};

function createFakeDependencies(
  options: { user?: AuthenticatedUser | null } = {},
): ApiRouterDependencies {
  const issuePort: IssuePort = {
    list: vi.fn(async (_context, query) => ({
      items: [{ id: issueId, workspaceId, title: "Cash closing" }],
      query,
    })),
    create: vi.fn(async (_context, input) => ({
      id: issueId,
      identifier: "TEC-1",
      ...input,
    })),
    get: vi.fn(async (_context, identifier) =>
      identifier === "TEC-1" ? { id: issueId, identifier, workspaceId } : null,
    ),
    update: vi.fn(async (_context, identifier, input) => ({
      id: issueId,
      identifier,
      workspaceId,
      ...input,
    })),
    remove: vi.fn(async () => true),
    addComment: vi.fn(async (_context, identifier, input) => ({
      id: "comment-1",
      identifier,
      ...input,
    })),
    addEvidence: vi.fn(async (_context, identifier, input) => ({
      id: "evidence-1",
      identifier,
      ...input,
    })),
    linkMessage: vi.fn(async (_context, identifier, input) => ({
      id: "link-1",
      identifier,
      ...input,
    })),
    resolveAndNotify: vi.fn(async (_context, identifier, input) => ({
      id: issueId,
      identifier,
      status: "done",
      ...input,
    })),
  };

  const knowledgePort: KnowledgePort = {
    list: vi.fn(async (_context, query) => ({
      items: [{ id: articleId, title: "Refund policy" }],
      query,
    })),
    create: vi.fn(async (_context, input) => ({ id: articleId, ...input })),
    update: vi.fn(async (_context, id, input) => ({ id, ...input })),
    remove: vi.fn(async () => true),
  };

  return {
    auth: {
      authenticate: vi.fn(async () =>
        options.user === undefined ? user : options.user,
      ),
    },
    membership: {
      getMembership: vi.fn(
        async (_userId: string, requestedWorkspaceId: string) =>
          requestedWorkspaceId === workspaceId
            ? { workspaceId, role: "owner" as const }
            : null,
      ),
    },
    workspaces: {
      list: vi.fn(async () => [
        { id: workspaceId, name: "Techne", providerApiKey: "must-not-leak" },
      ]),
      create: vi.fn(async (_userId, input) => ({ id: workspaceId, ...input })),
      get: vi.fn(async (_context, id) =>
        id === workspaceId ? { id, name: "Techne" } : null,
      ),
      update: vi.fn(async (_context, id, input) => ({ id, ...input })),
      listMembers: vi.fn(async (_context, query) => ({
        items: [{ id: "member-1", workspaceId, userId, role: "owner" }],
        query,
      })),
      listInvitations: vi.fn(async () => [
        {
          id: repositoryId,
          workspaceId,
          email: "invitee@example.com",
          role: "agent",
          status: "sent",
        },
      ]),
      createInvitation: vi.fn(async (_context, input) => ({
        id: repositoryId,
        workspaceId,
        ...input,
        status: "sent",
      })),
      updateInvitationRole: vi.fn(async (_context, invitationId, input) => ({
        id: invitationId,
        workspaceId,
        ...input,
        status: "sent",
      })),
      removeInvitation: vi.fn(async () => true),
      resendInvitation: vi.fn(async (_context, invitationId) => ({
        id: invitationId,
        workspaceId,
        email: "invitee@example.com",
        role: "agent",
        status: "sent",
      })),
      addMember: vi.fn(async (_context, input) => ({
        id: "member-2",
        workspaceId,
        ...input,
      })),
      updateMemberRole: vi.fn(async (_context, memberUserId, input) => ({
        id: "member-2",
        workspaceId,
        userId: memberUserId,
        ...input,
      })),
      removeMember: vi.fn(async () => true),
      listAuditLog: vi.fn(async (_context, query) => ({
        items: [{ id: "audit-1", workspaceId, action: "issue.created" }],
        query,
      })),
    },
    channels: {
      list: vi.fn(async () => [
        { id: channelId, name: "Support", webhookSecret: "must-not-leak" },
      ]),
      createWhatsmiau: vi.fn(async (_context, input) => ({
        id: channelId,
        ...input,
      })),
      get: vi.fn(async (_context, id) =>
        id === channelId ? { id, name: "Support" } : null,
      ),
      connect: vi.fn(async (_context, id) => ({ id, status: "connecting" })),
      qr: vi.fn(async (_context, id) =>
        id === channelId ? { data: "base64-qr", mimeType: "image/png" } : null,
      ),
      disconnect: vi.fn(async (_context, id) => ({ id, status: "closed" })),
      refresh: vi.fn(async (_context, id) => ({ id, status: "open" })),
    },
    conversations: {
      list: vi.fn(async () => [{ id: conversationId, workspaceId }]),
      get: vi.fn(async (_context, id) =>
        id === conversationId ? { id, workspaceId } : null,
      ),
      reactToMessage: vi.fn(
        async (_context, id, targetMessageId, reaction) => ({
          id: targetMessageId,
          conversationId: id,
          reaction,
        }),
      ),
      update: vi.fn(async (_context, id, input) => ({ id, ...input })),
      markRead: vi.fn(async (_context, id) => ({ id, unreadCount: 0 })),
      snooze: vi.fn(async (_context, id, input) => ({
        id,
        status: "snoozed",
        ...input,
      })),
      resolve: vi.fn(async (_context, id) => ({ id, status: "resolved" })),
      pauseAi: vi.fn(async (_context, id) => ({
        id,
        automationState: "human_paused",
      })),
      resumeAi: vi.fn(async (_context, id) => ({
        id,
        automationState: "ai_active",
      })),
      sendMessage: vi.fn(async (_context, id, input) => ({
        id: messageId,
        conversationId: id,
        ...input,
      })),
      aiDraft: vi.fn(async (_context, id) => ({
        conversationId: id,
        draft: "We are checking this.",
      })),
    },
    issues: issuePort,
    kanban: {
      move: vi.fn(async (_context, identifier, input) => ({
        id: issueId,
        identifier,
        workspaceId,
        ...input,
      })),
    },
    personalPlanning: {
      listTasks: vi.fn(async (_context, query) => ({ data: [], query })),
      createTask: vi.fn(async (_context, input) => ({
        id: "personal-task-1",
        workspaceId,
        userId,
        ...input,
      })),
      updateTask: vi.fn(async (_context, id, input) => ({ id, ...input })),
      moveTask: vi.fn(async (_context, id, input) => ({ id, ...input })),
      removeTask: vi.fn(async () => true),
      listEvents: vi.fn(async (_context, query) => ({ data: [], query })),
      createEvent: vi.fn(async (_context, input) => ({
        id: "personal-event-1",
        workspaceId,
        userId,
        ...input,
      })),
      updateEvent: vi.fn(async (_context, id, input) => ({ id, ...input })),
      removeEvent: vi.fn(async () => true),
    },
    knowledge: knowledgePort,
    repositories: {
      list: vi.fn(async () => [{ id: repositoryId, name: "Mend" }]),
      create: vi.fn(async (_context, input) => ({
        id: repositoryId,
        ...input,
      })),
      update: vi.fn(async (_context, id, input) => ({ id, ...input })),
      remove: vi.fn(async () => true),
    },
    githubConnections: {
      getWorkspaceConnection: vi.fn(async () => ({
        connected: true,
        owner: "kdo-vini",
      })),
      listWorkspaceRepositories: vi.fn(async () => [
        { owner: "kdo-vini", repo: "mend", defaultBranch: "main" },
      ]),
      startWorkspaceSetup: vi.fn(async () => ({
        installationUrl: "https://github.com/apps/mend/installations/new",
      })),
      disconnectWorkspace: vi.fn(async () => true),
      startSetup: vi.fn(async () => ({
        installationUrl: "https://github.com/apps/mend/installations/new",
      })),
      completeSetup: vi.fn(async () => ({ id: repositoryId })),
    },
    codingRuns: {
      list: vi.fn(async () => [{ id: runId, status: "queued" }]),
      create: vi.fn(async (_context, identifier, input) => ({
        id: runId,
        identifier,
        ...input,
      })),
      get: vi.fn(async (_context, id) =>
        id === runId ? { id, status: "running" } : null,
      ),
      cancel: vi.fn(async (_context, id) => ({ id, status: "canceled" })),
      approve: vi.fn(async (_context, id) => ({ id, status: "approved" })),
      publish: vi.fn(async (_context, id) => ({ id, status: "approved" })),
      merge: vi.fn(async (_context, id) => ({ id, status: "approved" })),
      deploy: vi.fn(async (_context, id) => ({ id, status: "approved" })),
      health: vi.fn(async (_context, id) => ({ id, status: "approved" })),
      reject: vi.fn(async (_context, id) => ({ id, status: "rejected" })),
      patch: vi.fn(async (_context, id) =>
        id === runId ? { patch: "diff --git a/a b/a" } : null,
      ),
    },
    googleConnections: {
      list: vi.fn(async () => []),
      startOAuth: vi.fn(async () => ({
        oauthUrl: "https://accounts.google.com",
      })),
      completeOAuth: vi.fn(async () => ({ id: "google-connection-1" })),
      updateCalendars: vi.fn(async (_context, id, selectedCalendarIds) => ({
        id,
        selectedCalendarIds,
      })),
      disconnect: vi.fn(async (_context, id) => ({
        id,
        status: "disconnected",
      })),
    },
    media: {
      createUpload: vi.fn(async (_context, input) => ({
        assetId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        batchId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
        input,
      })),
      complete: vi.fn(async () => ({ id: "asset-1", status: "processing" })),
      findAsset: vi.fn(async () => null),
      listAssets: vi.fn(async () => []),
      signedUrl: vi.fn(async () => ({ url: "https://media.example/signed" })),
    },
  };
}

function makeApp(dependencies = createFakeDependencies()) {
  const app = express();
  app.use(express.json());
  app.use(createApiRouter(dependencies));
  return app;
}

const scoped = (agent = false) => ({
  "x-mend-workspace-id": workspaceId,
  ...(agent ? { "x-role": "agent" } : {}),
});

describe("Mend API router", () => {
  it("returns actionable readiness details when Codex preflight cannot start", async () => {
    const dependencies = createFakeDependencies();
    dependencies.codingRuns.create = vi.fn(async () => {
      throw new CodexServiceError("CODEX_WORKSPACE_ROOT must be a directory");
    });

    const response = await request(makeApp(dependencies))
      .post("/api/issues/TEC-1/coding-runs")
      .set(scoped(true))
      .send({ mode: "investigate", repositoryId });

    expect(response.status).toBe(503);
    expect(response.body).toEqual({
      error: {
        code: "codex_unavailable",
        message:
          "Codex run could not start: CODEX_WORKSPACE_ROOT must be a directory",
        details: {
          action: "Check /api/ready and the workspace repository settings.",
        },
      },
    });
  });

  it("routes workspace-scoped Google connection actions through the API port", async () => {
    const dependencies = createFakeDependencies();
    const app = makeApp(dependencies);
    const headers = scoped(true);

    expect(
      (await request(app).get("/api/google/connections").set(headers)).status,
    ).toBe(200);
    expect(
      (
        await request(app)
          .post("/api/google/connections/oauth/start")
          .set(headers)
          .send({})
      ).body,
    ).toEqual({ oauthUrl: "https://accounts.google.com" });
    expect(
      (
        await request(app)
          .patch(`/api/google/connections/${repositoryId}/calendars`)
          .set(headers)
          .send({ selectedCalendarIds: ["primary"] })
      ).status,
    ).toBe(200);
    expect(
      (
        await request(app)
          .delete(`/api/google/connections/${repositoryId}`)
          .set(headers)
      ).status,
    ).toBe(200);
  });

  it("accepts standard Google OAuth callback metadata", async () => {
    const dependencies = createFakeDependencies();
    const response = await request(makeApp(dependencies))
      .get("/api/google/connections/oauth/callback")
      .query({
        code: "authorization-code",
        state: "signed-state",
        iss: "https://accounts.google.com",
        scope: "openid email profile",
        authuser: "0",
        prompt: "consent",
      });

    expect(response.status).toBe(303);
    expect(dependencies.googleConnections.completeOAuth).toHaveBeenCalledWith(
      "authorization-code",
      "signed-state",
    );
  });

  it("requires authentication and returns a stable error envelope", async () => {
    const response = await request(
      makeApp(createFakeDependencies({ user: null })),
    ).get("/api/me");
    expect(response.status).toBe(401);
    expect(response.body).toEqual({
      error: { code: "unauthenticated", message: "Authentication is required" },
    });
  });

  it("accepts conversation routes with a messageId path parameter", async () => {
    const app = makeApp();
    const response = await request(app)
      .post(
        `/api/conversations/${conversationId}/messages/${messageId}/reaction`,
      )
      .set(scoped(true))
      .send({ reaction: "👍" });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      id: messageId,
      conversationId,
      reaction: "👍",
    });
  });

  it("scopes media upload and completion endpoints through the workspace", async () => {
    const app = makeApp();
    const upload = await request(app)
      .post("/api/media/uploads")
      .set(scoped(true))
      .send({
        conversationId,
        fileName: "proof.png",
        declaredMimeType: "image/png",
        sizeBytes: 1_024,
      });
    expect(upload.status).toBe(201);
    expect(upload.body.assetId).toBe("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa");

    const complete = await request(app)
      .post(`/api/media/assets/${upload.body.assetId}/complete`)
      .set(scoped(true))
      .send({});
    expect(complete.status).toBe(202);
  });

  it("returns the authenticated user and never exposes sensitive provider fields", async () => {
    const response = await request(makeApp()).get("/api/me");
    expect(response.status).toBe(200);
    expect(response.body.user).toEqual(user);

    const workspaces = await request(makeApp()).get("/api/workspaces");
    expect(workspaces.status).toBe(200);
    expect(workspaces.body.data[0]).toEqual({
      id: workspaceId,
      name: "Techne",
    });
    expect(JSON.stringify(workspaces.body)).not.toContain("must-not-leak");
  });

  it("rejects a workspace the membership adapter does not authorize", async () => {
    const dependencies = createFakeDependencies();
    const response = await request(makeApp(dependencies))
      .get("/api/issues/TEC-1")
      .set("x-mend-workspace-id", otherWorkspaceId);
    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe("workspace_not_found");
    expect(dependencies.issues.get).not.toHaveBeenCalled();
  });

  it("exposes workspace members and audit log with role-gated mutations", async () => {
    const dependencies = createFakeDependencies();
    const app = makeApp(dependencies);
    const headers = scoped(true);

    expect(
      (
        await request(app)
          .get(`/api/workspaces/${workspaceId}/members`)
          .set(headers)
      ).status,
    ).toBe(200);
    expect(
      (
        await request(app)
          .post(`/api/workspaces/${workspaceId}/members`)
          .set(headers)
          .send({ userId, role: "agent" })
      ).status,
    ).toBe(201);
    expect(
      (
        await request(app)
          .patch(`/api/workspaces/${workspaceId}/members/${userId}`)
          .set(headers)
          .send({ role: "viewer" })
      ).status,
    ).toBe(200);
    expect(
      (
        await request(app)
          .delete(`/api/workspaces/${workspaceId}/members/${userId}`)
          .set(headers)
      ).status,
    ).toBe(204);
    expect(
      (
        await request(app)
          .get(`/api/workspaces/${workspaceId}/audit-log`)
          .set(headers)
      ).status,
    ).toBe(200);

    const viewerDependencies = createFakeDependencies();
    viewerDependencies.membership.getMembership = vi.fn(async () => ({
      workspaceId,
      role: "viewer" as const,
    }));
    const viewerApp = makeApp(viewerDependencies);
    expect(
      (
        await request(viewerApp)
          .get(`/api/workspaces/${workspaceId}/members`)
          .set(headers)
      ).status,
    ).toBe(200);
    expect(
      (
        await request(viewerApp)
          .get(`/api/workspaces/${workspaceId}/audit-log`)
          .set(headers)
      ).status,
    ).toBe(403);
    expect(
      (
        await request(viewerApp)
          .post(`/api/workspaces/${workspaceId}/members`)
          .set(headers)
          .send({ userId, role: "agent" })
      ).status,
    ).toBe(403);
  });

  it("routes workspace invitations through the admin-only workspace port", async () => {
    const dependencies = createFakeDependencies();
    const app = makeApp(dependencies);
    const headers = scoped(true);

    expect(
      (
        await request(app)
          .get(`/api/workspaces/${workspaceId}/invitations`)
          .set(headers)
      ).status,
    ).toBe(200);
    expect(
      (
        await request(app)
          .post(`/api/workspaces/${workspaceId}/invitations`)
          .set(headers)
          .send({ email: "invitee@example.com", role: "agent" })
      ).status,
    ).toBe(201);
    expect(
      (
        await request(app)
          .patch(`/api/workspaces/${workspaceId}/invitations/${repositoryId}`)
          .set(headers)
          .send({ role: "viewer" })
      ).status,
    ).toBe(200);
    expect(
      (
        await request(app)
          .post(
            `/api/workspaces/${workspaceId}/invitations/${repositoryId}/resend`,
          )
          .set(headers)
      ).status,
    ).toBe(200);
    expect(
      (
        await request(app)
          .delete(`/api/workspaces/${workspaceId}/invitations/${repositoryId}`)
          .set(headers)
      ).status,
    ).toBe(204);

    const viewerDependencies = createFakeDependencies();
    viewerDependencies.membership.getMembership = vi.fn(async () => ({
      workspaceId,
      role: "viewer" as const,
    }));
    expect(
      (
        await request(makeApp(viewerDependencies))
          .get(`/api/workspaces/${workspaceId}/invitations`)
          .set(headers)
      ).status,
    ).toBe(403);
    expect(dependencies.workspaces.createInvitation).toHaveBeenCalledWith(
      expect.objectContaining({ role: "owner" }),
      { email: "invitee@example.com", role: "agent" },
    );
  });

  it("validates issue inputs and never trusts workspace_id from the body", async () => {
    const dependencies = createFakeDependencies();
    const response = await request(makeApp(dependencies))
      .post("/api/issues")
      .set(scoped(true))
      .send({
        workspace_id: otherWorkspaceId,
        title: "Bad request",
        type: "bug",
      });
    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe("invalid_input");
    expect(dependencies.issues.create).not.toHaveBeenCalled();
  });

  it("handles issue lifecycle routes with validated workspace context", async () => {
    const dependencies = createFakeDependencies();
    const app = makeApp(dependencies);
    const headers = scoped(true);

    expect(
      (
        await request(app)
          .post("/api/issues")
          .set(headers)
          .send({ title: "Cash closing", type: "bug" })
      ).status,
    ).toBe(201);
    expect(
      (
        await request(app)
          .post("/api/issues/TEC-1/comments")
          .set(headers)
          .send({ body: "Investigating." })
      ).status,
    ).toBe(201);
    expect(
      (
        await request(app)
          .post("/api/issues/TEC-1/evidence")
          .set(headers)
          .send({ kind: "message", label: "Customer message", messageId })
      ).status,
    ).toBe(201);
    expect(
      (
        await request(app)
          .post("/api/issues/TEC-1/link-message")
          .set(headers)
          .send({ messageId })
      ).status,
    ).toBe(201);
    expect(
      (
        await request(app)
          .post("/api/issues/TEC-1/resolve-and-notify")
          .set(headers)
          .send({ notifyCustomer: true })
      ).status,
    ).toBe(200);

    const calls = (dependencies.issues.addComment as ReturnType<typeof vi.fn>)
      .mock.calls;
    expect(calls[0]?.[0]).toEqual(context());
  });

  it("passes issue relation filters and exposes a stable history resource", async () => {
    const dependencies = createFakeDependencies();
    const app = makeApp(dependencies);
    const response = await request(app).get("/api/issues").set(scoped()).query({
      type: "bug",
      source: "conversation",
      label: "checkout",
      contactId: userId,
      conversationId,
      hasCodex: "true",
    });
    expect(response.status).toBe(200);
    expect(response.body.data.query).toMatchObject({
      type: "bug",
      source: "conversation",
      label: "checkout",
      contactId: userId,
      conversationId,
      hasCodex: true,
    });

    const history = await request(app)
      .get("/api/issues/TEC-1/history")
      .set(scoped());
    expect(history.status).toBe(200);
    expect(history.body).toMatchObject({
      issue: { identifier: "TEC-1" },
      comments: [],
      evidence: [],
      timeline: [],
    });
  });

  it("covers channels, inbox, knowledge, repositories and coding-run action status codes", async () => {
    const app = makeApp();
    const headers = scoped(true);
    const now = new Date(Date.now() + 60_000).toISOString();

    expect(
      (
        await request(app)
          .post("/api/channels/whatsmiau")
          .set(headers)
          .send({ name: "WhatsApp", providerInstanceName: "mend-main" })
      ).status,
    ).toBe(201);
    expect(
      (await request(app).get(`/api/channels/${channelId}/qr`).set(headers))
        .status,
    ).toBe(200);
    expect(
      (
        await request(app)
          .post(`/api/conversations/${conversationId}/snooze`)
          .set(headers)
          .send({ until: now })
      ).status,
    ).toBe(200);
    expect(
      (
        await request(app)
          .post(`/api/conversations/${conversationId}/messages`)
          .set(headers)
          .send({ text: "Hello" })
      ).status,
    ).toBe(201);
    const attachment = await request(app)
      .post(`/api/conversations/${conversationId}/messages`)
      .set(headers)
      .send({
        messageType: "image",
        mediaDataUrl: "data:image/png;base64,aGVsbG8=",
        fileName: "hello.png",
      });
    expect(attachment.status).toBe(201);
    const mediaFailureDependencies = createFakeDependencies();
    mediaFailureDependencies.conversations.sendMessage = vi.fn(async () => {
      throw new Error("media_size_limit_exceeded");
    });
    const mediaFailure = await request(makeApp(mediaFailureDependencies))
      .post(`/api/conversations/${conversationId}/messages`)
      .set(headers)
      .send({
        messageType: "image",
        mediaDataUrl: "data:image/png;base64,aGVsbG8=",
      });
    expect(mediaFailure.status).toBe(400);
    expect(mediaFailure.body.error).toEqual({
      code: "invalid_media",
      message:
        "Attachment is invalid or exceeds the allowed type or size limits.",
    });
    const unsafeMedia = await request(app)
      .post(`/api/conversations/${conversationId}/messages`)
      .set(headers)
      .send({ messageType: "image", mediaUrl: "http://localhost/private.png" });
    expect(unsafeMedia.status).toBe(400);
    expect(unsafeMedia.body.error.code).toBe("invalid_input");
    expect(
      (
        await request(app)
          .post(`/api/conversations/${conversationId}/ai-draft`)
          .set(headers)
          .send({})
      ).status,
    ).toBe(200);
    expect(
      (
        await request(app)
          .post(`/api/conversations/${conversationId}/ai/pause`)
          .set(headers)
          .send({ reason: "manual_pause" })
      ).status,
    ).toBe(200);
    expect(
      (
        await request(app)
          .post(`/api/conversations/${conversationId}/ai/resume`)
          .set(headers)
          .send({})
      ).status,
    ).toBe(200);
    expect(
      (
        await request(app)
          .post("/api/knowledge")
          .set(headers)
          .send({ title: "Refunds", body: "Policy" })
      ).status,
    ).toBe(201);
    expect(
      (
        await request(app)
          .post("/api/repositories")
          .set(headers)
          .send({ name: "Mend", localPath: "C:\\work\\mend" })
      ).status,
    ).toBe(201);
    expect(
      (
        await request(app)
          .post("/api/issues/TEC-1/coding-runs")
          .set(headers)
          .send({ mode: "investigate" })
      ).status,
    ).toBe(201);
    expect(
      (await request(app).post(`/api/coding-runs/${runId}/cancel`).set(headers))
        .status,
    ).toBe(200);
    expect(
      (
        await request(app)
          .post(`/api/coding-runs/${runId}/approve`)
          .set(headers)
      ).status,
    ).toBe(200);
    for (const action of ["publish", "merge", "deploy", "health"] as const) {
      expect(
        (
          await request(app)
            .post(`/api/coding-runs/${runId}/${action}`)
            .set(headers)
        ).status,
      ).toBe(200);
    }
    expect(
      (await request(app).post(`/api/coding-runs/${runId}/reject`).set(headers))
        .status,
    ).toBe(200);
    expect(
      (await request(app).get(`/api/coding-runs/${runId}/patch`).set(headers))
        .status,
    ).toBe(200);
  });

  it("rejects secrets and unsafe repository paths at the input boundary", async () => {
    const app = makeApp();
    const headers = scoped(true);
    const channel = await request(app)
      .post("/api/channels/whatsmiau")
      .set(headers)
      .send({
        name: "WhatsApp",
        providerInstanceName: "mend-main",
        webhookSecret: "do-not-accept",
      });
    expect(channel.status).toBe(400);

    const repository = await request(app)
      .post("/api/repositories")
      .set(headers)
      .send({ name: "Mend", localPath: "C:\\work\\..\\secrets" });
    expect(repository.status).toBe(400);

    const run = await request(app)
      .post("/api/issues/TEC-1/coding-runs")
      .set(headers)
      .send({ mode: "investigate", shell: "rm -rf /" });
    expect(run.status).toBe(400);
  });

  it("starts GitHub App setup with workspace auth and accepts the signed callback without a bearer token", async () => {
    const dependencies = createFakeDependencies();
    const app = makeApp(dependencies);
    const started = await request(app)
      .post(`/api/repositories/${repositoryId}/github/setup`)
      .set(scoped(true));
    expect(started.status).toBe(200);
    expect(started.body.installationUrl).toContain("github.com/apps/mend");

    const callbackDependencies = createFakeDependencies({ user: null });
    const callback = await request(makeApp(callbackDependencies))
      .get("/api/github/setup/callback")
      .query({
        installation_id: "42",
        setup_action: "install",
        state: "signed",
      });
    expect(callback.status).toBe(303);
    expect(callback.headers.location).toContain("github=connected");
    expect(
      callbackDependencies.githubConnections.completeSetup,
    ).toHaveBeenCalledOnce();
  });

  it("exposes workspace GitHub connection and repository selection routes", async () => {
    const dependencies = createFakeDependencies();
    const app = makeApp(dependencies);
    const headers = scoped();

    const connection = await request(app)
      .get("/api/github/connection")
      .set(headers);
    expect(connection.status).toBe(200);
    expect(connection.body).toEqual({
      connected: true,
      owner: "kdo-vini",
    });

    const available = await request(app)
      .get("/api/github/repositories")
      .set(headers);
    expect(available.status).toBe(200);
    expect(available.body.data).toEqual([
      { owner: "kdo-vini", repo: "mend", defaultBranch: "main" },
    ]);

    const started = await request(app)
      .post("/api/github/setup")
      .set(headers)
      .send({});
    expect(started.status).toBe(200);
    expect(
      dependencies.githubConnections.startWorkspaceSetup,
    ).toHaveBeenCalledOnce();

    const disconnected = await request(app)
      .delete("/api/github/connection")
      .set(headers);
    expect(disconnected.status).toBe(200);
    expect(disconnected.body).toEqual({ disconnected: true });
  });

  it("scopes personal planning routes and validates move statuses", async () => {
    const dependencies = createFakeDependencies();
    const app = makeApp(dependencies);
    const headers = scoped(true);

    const list = await request(app)
      .get("/api/personal-tasks?from=2026-08-05&to=2026-08-12")
      .set(headers);
    expect(list.status).toBe(200);
    expect(dependencies.personalPlanning.listTasks).toHaveBeenCalledWith(
      context(),
      expect.objectContaining({ from: "2026-08-05", to: "2026-08-12" }),
    );

    const created = await request(app)
      .post("/api/personal-tasks")
      .set(headers)
      .send({ title: "Plan the sprint", dueOn: "2026-08-05" });
    expect(created.status).toBe(201);
    expect(created.body.title).toBe("Plan the sprint");

    const invalidMove = await request(app)
      .post(`/api/personal-tasks/${issueId}/move`)
      .set(headers)
      .send({ status: "review" });
    expect(invalidMove.status).toBe(400);
  });

  it("turns stale Kanban neighbors into a conflict response", async () => {
    const dependencies = createFakeDependencies();
    dependencies.kanban.move = vi.fn(async () => {
      throw new Error("kanban_order_conflict");
    });
    const response = await request(makeApp(dependencies))
      .post("/api/issues/TEC-1/move")
      .set(scoped(true))
      .send({ status: "in_progress", beforeId: issueId });
    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe("kanban_order_conflict");
  });
});
