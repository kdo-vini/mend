import express from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import {
  hashWorkLogToken,
  registerWorkLogIngestRoute,
  WORK_LOG_INGEST_PATH,
  type WorkLogIngestStore,
} from "./work-log.js";

const TOKEN = `mend_diario_${"a".repeat(43)}`;
const owner = {
  id: "token-1",
  workspaceId: "11111111-1111-4111-8111-111111111111",
  userId: "22222222-2222-4222-8222-222222222222",
};

function fakeStore(): WorkLogIngestStore {
  return {
    findActiveToken: vi.fn(async (hash: string) =>
      hash === hashWorkLogToken(TOKEN) ? owner : null,
    ),
    authorName: vi.fn(async () => "Lucas"),
    insert: vi.fn(async (entry) => ({
      id: "entry-1",
      author_id: entry.authorId,
      author_name: entry.authorName,
      title: entry.title,
      body: entry.body,
      project: entry.project,
      source: "claude" as const,
      created_at: "2026-11-03T12:00:00.000Z",
      expires_at: entry.expiresAt,
    })),
    touchToken: vi.fn(async () => undefined),
    purgeExpired: vi.fn(async () => undefined),
  };
}

function buildApp(store: WorkLogIngestStore | null) {
  const app = express();
  app.use(express.json());
  registerWorkLogIngestRoute(app, {
    store,
    now: () => new Date("2026-11-03T12:00:00.000Z"),
  });
  return app;
}

const entry = { title: "Correção no PDV", body: "Corrigi o arredondamento." };

describe("POST /internal/work-log", () => {
  it("rejects requests without a Diário token before touching the store", async () => {
    const store = fakeStore();
    const app = buildApp(store);
    expect(
      (await request(app).post(WORK_LOG_INGEST_PATH).send(entry)).status,
    ).toBe(401);
    expect(
      (
        await request(app)
          .post(WORK_LOG_INGEST_PATH)
          .set("authorization", "Bearer eyJhbGciOi.jwt.token")
          .send(entry)
      ).status,
    ).toBe(401);
    expect(store.findActiveToken).not.toHaveBeenCalled();
  });

  it("rejects unknown, revoked or ex-member tokens", async () => {
    const store = fakeStore();
    const response = await request(buildApp(store))
      .post(WORK_LOG_INGEST_PATH)
      .set("authorization", `Bearer mend_diario_${"b".repeat(43)}`)
      .send(entry);
    expect(response.status).toBe(401);
    expect(store.insert).not.toHaveBeenCalled();
  });

  it("fails closed without the service-role store", async () => {
    const response = await request(buildApp(null))
      .post(WORK_LOG_INGEST_PATH)
      .set("authorization", `Bearer ${TOKEN}`)
      .send(entry);
    expect(response.status).toBe(503);
  });

  it("stores the entry as the token owner with a seven-day expiry", async () => {
    const store = fakeStore();
    const response = await request(buildApp(store))
      .post(WORK_LOG_INGEST_PATH)
      .set("authorization", `Bearer ${TOKEN}`)
      .send({ ...entry, project: "PDV" });
    expect(response.status).toBe(201);
    expect(store.insert).toHaveBeenCalledWith({
      workspaceId: owner.workspaceId,
      authorId: owner.userId,
      authorName: "Lucas",
      title: entry.title,
      body: entry.body,
      project: "PDV",
      expiresAt: "2026-11-10T12:00:00.000Z",
    });
    expect(store.touchToken).toHaveBeenCalledWith("token-1");
    expect(store.purgeExpired).toHaveBeenCalled();
  });

  it("rejects caller-chosen authors or expiry", async () => {
    const store = fakeStore();
    const response = await request(buildApp(store))
      .post(WORK_LOG_INGEST_PATH)
      .set("authorization", `Bearer ${TOKEN}`)
      .send({ ...entry, author_id: owner.userId, expires_at: "2099-01-01" });
    expect(response.status).toBe(400);
    expect(store.insert).not.toHaveBeenCalled();
  });
});
