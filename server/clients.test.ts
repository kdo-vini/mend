import express from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { z, ZodError } from "zod";
import { ApiHttpError, type ApiRouteModuleContext } from "./api-router.js";
import {
  registerClientRoutes,
  stageEntryTitle,
  type Client,
  type ClientEntry,
  type ClientsPort,
} from "./clients.js";

const WORKSPACE = "22222222-2222-4222-8222-222222222222";
const USER = "11111111-1111-4111-8111-111111111111";
const CLIENT_ID = "33333333-3333-4333-8333-333333333333";
const ENTRY_ID = "44444444-4444-4444-8444-444444444444";
const ISSUE_ID = "55555555-5555-4555-8555-555555555555";

const client: Client = {
  id: CLIENT_ID,
  workspace_id: WORKSPACE,
  name: "Clínica Helena",
  contact: "Helena",
  email: null,
  phone: "(11) 98765-4321",
  site: null,
  stage: "lead",
  products: [],
  notes: null,
  body: "## Resumo\n- x",
  source: "manual",
  area: null,
  specialty: null,
  registration: null,
  referral: null,
  utm: {},
  external_id: null,
  archived_at: null,
  created_by: USER,
  created_at: "2026-11-04T12:00:00.000Z",
  updated_at: "2026-11-04T12:00:00.000Z",
};

function fakePort(overrides: Partial<ClientsPort> = {}): ClientsPort {
  return {
    list: vi.fn(async () => {
      const summary: Record<string, unknown> = { ...client };
      delete summary.body;
      return [summary] as never;
    }),
    get: vi.fn(async (_workspace, id) => (id === CLIENT_ID ? client : null)),
    entries: vi.fn(async () => []),
    issues: vi.fn(async () => [
      { id: ISSUE_ID, identifier: "MEND-1", title: "Erro", status: "todo" },
    ]),
    create: vi.fn(async (_workspace, _user, input) => ({
      ...client,
      ...input,
    })),
    update: vi.fn(async (_workspace, _id, fields) => ({
      ...client,
      ...fields,
    })),
    remove: vi.fn(async () => true),
    addEntry: vi.fn(
      async (input) =>
        ({
          id: ENTRY_ID,
          client_id: input.clientId,
          kind: input.kind,
          title: input.title,
          body: input.body,
          author_id: input.authorId,
          author_name: input.authorName,
          external_id: null,
          occurred_at: "2026-11-04T12:00:00.000Z",
          created_at: "2026-11-04T12:00:00.000Z",
        }) satisfies ClientEntry,
    ),
    removeEntry: vi.fn(async () => true),
    linkIssue: vi.fn(async (_w, _c, identifier) =>
      identifier === "MEND-1"
        ? { id: ISSUE_ID, identifier, title: "Erro", status: "todo" }
        : null,
    ),
    unlinkIssue: vi.fn(async () => true),
    ...overrides,
  };
}

function buildApp(
  role: "owner" | "admin" | "agent" | "viewer",
  port: ClientsPort | null = fakePort(),
) {
  const router = express.Router();
  const parse = <T>(
    schema: z.ZodType<T, z.ZodTypeDef, unknown>,
    value: unknown,
  ) => {
    const parsed = schema.safeParse(value);
    if (!parsed.success)
      throw new ApiHttpError(400, "invalid_input", "Request input is invalid");
    return parsed.data;
  };
  const uuid = z.string().uuid();
  const asyncRoute =
    (handler: (req: express.Request, res: express.Response) => Promise<void>) =>
    (req: express.Request, res: express.Response, next: express.NextFunction) =>
      handler(req, res).catch(next);
  const send = (res: express.Response, status: number, data: unknown) =>
    void res.status(status).json(data);
  const ctx = {
    router,
    dependencies: { clients: port ?? undefined },
    asyncRoute,
    scoped: async () => ({ userId: USER, workspaceId: WORKSPACE, role }),
    send,
    noContent: (res: express.Response) => void res.status(204).send(),
    parse,
    pathId: (req: express.Request) => parse(uuid, req.params.id),
    userFrom: () => ({ id: USER, name: "Lucas", email: "lucas@diagium.com" }),
    uuid,
  } as unknown as ApiRouteModuleContext;
  registerClientRoutes(ctx);
  const app = express();
  app.use(express.json());
  app.use(router);
  app.use(
    (
      error: unknown,
      _req: express.Request,
      res: express.Response,
      _next: express.NextFunction,
    ) => {
      if (error instanceof ApiHttpError)
        return void res
          .status(error.status)
          .json({ error: { code: error.code, message: error.message } });
      if (error instanceof ZodError) return void res.status(400).json({});
      return void res.status(500).json({});
    },
  );
  return { app, port };
}

describe("client routes", () => {
  it("lists clients without the body and reports the caller's permissions", async () => {
    const { app, port } = buildApp("agent");
    const response = await request(app).get("/api/clients?archived=1");
    expect(response.status).toBe(200);
    expect(port!.list).toHaveBeenCalledWith(WORKSPACE, { archived: true });
    expect(response.body.data[0].body).toBeUndefined();
    expect(response.body.permissions).toEqual({
      canEdit: true,
      canArchive: false,
    });
    expect(
      (await request(buildApp("admin").app).get("/api/clients")).body
        .permissions,
    ).toEqual({ canEdit: true, canArchive: true });
    expect(
      (await request(buildApp("viewer").app).get("/api/clients")).body
        .permissions,
    ).toEqual({ canEdit: false, canArchive: false });
  });

  it("returns a client with its timeline and linked issues, or 404", async () => {
    const { app } = buildApp("viewer");
    const found = await request(app).get(`/api/clients/${CLIENT_ID}`);
    expect(found.status).toBe(200);
    expect(found.body.data).toMatchObject({
      id: CLIENT_ID,
      entries: [],
      issues: [{ identifier: "MEND-1" }],
    });
    const missing = await request(app).get(
      "/api/clients/66666666-6666-4666-8666-666666666666",
    );
    expect(missing.status).toBe(404);
    expect(missing.body.error.code).toBe("client_not_found");
  });

  it("keeps writes to agent and above before touching the port", async () => {
    const { app, port } = buildApp("viewer");
    for (const call of [
      request(app).post("/api/clients").send({ name: "X" }),
      request(app).patch(`/api/clients/${CLIENT_ID}`).send({ name: "Y" }),
      request(app)
        .post(`/api/clients/${CLIENT_ID}/entries`)
        .send({ kind: "nota", body: "oi" }),
      request(app)
        .post(`/api/clients/${CLIENT_ID}/issues`)
        .send({ identifier: "MEND-1" }),
      request(app).delete(`/api/clients/${CLIENT_ID}`),
    ])
      expect((await call).status).toBe(403);
    expect(port!.create).not.toHaveBeenCalled();
    expect(port!.update).not.toHaveBeenCalled();
    expect(port!.addEntry).not.toHaveBeenCalled();
  });

  it("creates a client with empty text stored as null", async () => {
    const { app, port } = buildApp("agent");
    const response = await request(app)
      .post("/api/clients")
      .send({
        name: "  Clínica Nova ",
        email: "",
        products: ["site", "site", "sistema"],
      });
    expect(response.status).toBe(201);
    expect(port!.create).toHaveBeenCalledWith(WORKSPACE, USER, {
      name: "Clínica Nova",
      email: null,
      products: ["site", "sistema"],
    });
  });

  it("rejects invalid input", async () => {
    const { app, port } = buildApp("agent");
    for (const body of [
      {},
      { name: "" },
      { name: "X", stage: "perdido" },
      { name: "X", products: ["app"] },
      { name: "X", notes: "x".repeat(2001) },
      { name: "X", source: "agente" },
    ])
      expect((await request(app).post("/api/clients").send(body)).status).toBe(
        400,
      );
    expect(
      (await request(app).patch(`/api/clients/${CLIENT_ID}`).send({})).status,
    ).toBe(400);
    expect(port!.create).not.toHaveBeenCalled();
  });

  it("records a timeline entry when the stage changes, and only then", async () => {
    const { app, port } = buildApp("agent");
    const same = await request(app)
      .patch(`/api/clients/${CLIENT_ID}`)
      .send({ stage: "lead", notes: "ok" });
    expect(same.status).toBe(200);
    expect(port!.addEntry).not.toHaveBeenCalled();

    const changed = await request(app)
      .patch(`/api/clients/${CLIENT_ID}`)
      .send({ stage: "proposta" });
    expect(changed.status).toBe(200);
    expect(port!.addEntry).toHaveBeenCalledWith({
      workspaceId: WORKSPACE,
      clientId: CLIENT_ID,
      kind: "estagio",
      title: "Estágio: Proposta",
      body: "",
      authorId: USER,
      authorName: "Lucas",
    });
    expect(stageEntryTitle("churn")).toBe("Estágio: Churn");
  });

  it("lets only owner or admin archive, mapping archived to archived_at", async () => {
    const agent = buildApp("agent");
    expect(
      (
        await request(agent.app)
          .patch(`/api/clients/${CLIENT_ID}`)
          .send({ archived: true })
      ).status,
    ).toBe(403);
    expect(agent.port!.update).not.toHaveBeenCalled();

    const admin = buildApp("admin");
    await request(admin.app)
      .patch(`/api/clients/${CLIENT_ID}`)
      .send({ archived: true });
    expect(admin.port!.update).toHaveBeenCalledWith(
      WORKSPACE,
      CLIENT_ID,
      expect.objectContaining({ archived_at: expect.any(String) }),
    );
    await request(admin.app)
      .patch(`/api/clients/${CLIENT_ID}`)
      .send({ archived: false });
    expect(admin.port!.update).toHaveBeenLastCalledWith(WORKSPACE, CLIENT_ID, {
      archived_at: null,
    });
  });

  it("deletes for owner/admin only and reports a missing client as 404", async () => {
    expect(
      (await request(buildApp("agent").app).delete(`/api/clients/${CLIENT_ID}`))
        .status,
    ).toBe(403);
    expect(
      (await request(buildApp("owner").app).delete(`/api/clients/${CLIENT_ID}`))
        .status,
    ).toBe(204);
    const { app } = buildApp(
      "admin",
      fakePort({ remove: vi.fn(async () => false) }),
    );
    expect(
      (await request(app).delete(`/api/clients/${CLIENT_ID}`)).status,
    ).toBe(404);
  });

  it("adds notes and meetings as the signed-in user", async () => {
    const { app, port } = buildApp("agent");
    const response = await request(app)
      .post(`/api/clients/${CLIENT_ID}/entries`)
      .send({ kind: "reuniao", title: "Kickoff", body: "Definimos o escopo." });
    expect(response.status).toBe(201);
    expect(port!.addEntry).toHaveBeenCalledWith({
      workspaceId: WORKSPACE,
      clientId: CLIENT_ID,
      kind: "reuniao",
      title: "Kickoff",
      body: "Definimos o escopo.",
      authorId: USER,
      authorName: "Lucas",
    });
    for (const kind of ["diagnostico", "estagio"])
      expect(
        (
          await request(app)
            .post(`/api/clients/${CLIENT_ID}/entries`)
            .send({ kind, body: "x" })
        ).status,
      ).toBe(400);
  });

  it("deletes an entry, or 404 when RLS hides it", async () => {
    expect(
      (
        await request(buildApp("agent").app).delete(
          `/api/clients/${CLIENT_ID}/entries/${ENTRY_ID}`,
        )
      ).status,
    ).toBe(204);
    const { app } = buildApp(
      "agent",
      fakePort({ removeEntry: vi.fn(async () => false) }),
    );
    expect(
      (
        await request(app).delete(
          `/api/clients/${CLIENT_ID}/entries/${ENTRY_ID}`,
        )
      ).status,
    ).toBe(404);
  });

  it("links a chamado by identifier and answers 404 when it does not exist", async () => {
    const { app, port } = buildApp("agent");
    const linked = await request(app)
      .post(`/api/clients/${CLIENT_ID}/issues`)
      .send({ identifier: "mend-1" });
    expect(linked.status).toBe(200);
    expect(linked.body.data.identifier).toBe("MEND-1");
    expect(port!.linkIssue).toHaveBeenCalledWith(
      WORKSPACE,
      CLIENT_ID,
      "MEND-1",
    );

    const missing = await request(app)
      .post(`/api/clients/${CLIENT_ID}/issues`)
      .send({ identifier: "MEND-999" });
    expect(missing.status).toBe(404);
    expect(missing.body.error.code).toBe("issue_not_found");
  });

  it("unlinks a chamado", async () => {
    const { app, port } = buildApp("agent");
    expect(
      (
        await request(app).delete(
          `/api/clients/${CLIENT_ID}/issues/${ISSUE_ID}`,
        )
      ).status,
    ).toBe(204);
    expect(port!.unlinkIssue).toHaveBeenCalledWith(
      WORKSPACE,
      CLIENT_ID,
      ISSUE_ID,
    );
  });

  it("answers 503 when the clients port is not wired", async () => {
    const { app } = buildApp("agent", null);
    expect((await request(app).get("/api/clients")).status).toBe(503);
  });
});
