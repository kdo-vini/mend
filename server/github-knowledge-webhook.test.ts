import { createHmac } from "node:crypto";
import express from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { InMemoryJobStore } from "./jobs.js";
import { createGitHubKnowledgeWebhook } from "./github-knowledge-webhook.js";

function query(data: unknown = null) {
  const chain: Record<string, unknown> = Promise.resolve({ data, error: null });
  for (const method of ["select", "ilike", "eq", "update"])
    chain[method] = vi.fn(() => chain);
  return chain;
}

const signed = (body: string, secret: string) =>
  `sha256=${createHmac("sha256", secret).update(body).digest("hex")}`;

describe("GitHub knowledge webhook", () => {
  it("rejects invalid signatures before parsing JSON", async () => {
    const app = express();
    app.post(
      "/webhooks/github/knowledge",
      express.raw({ type: "application/json" }),
      createGitHubKnowledgeWebhook({
        client: { from: vi.fn() } as never,
        jobs: new InMemoryJobStore(),
        secret: "secret",
      }),
    );
    await request(app)
      .post("/webhooks/github/knowledge")
      .set("content-type", "application/json")
      .set("x-github-event", "push")
      .set("x-hub-signature-256", "sha256=bad")
      .send("{")
      .expect(401);
  });

  it("queues one exact-SHA job for a configured event source", async () => {
    const secret = "secret";
    const body = JSON.stringify({
      ref: "refs/heads/main",
      after: "a".repeat(40),
      installation: { id: 12 },
      repository: { name: "zelo", owner: { login: "techne" } },
    });
    const sources = [
      {
        id: "10000000-0000-4000-8000-000000000002",
        ref_name: "main",
        sync_mode: "event",
      },
    ];
    const client = {
      from: vi.fn((table: string) =>
        table === "repositories"
          ? query([
              {
                id: "10000000-0000-4000-8000-000000000003",
                workspace_id: "10000000-0000-4000-8000-000000000001",
                knowledge_sources: sources,
              },
            ])
          : query([]),
      ),
    };
    const jobs = new InMemoryJobStore<Record<string, unknown>>();
    const app = express();
    app.post(
      "/webhooks/github/knowledge",
      express.raw({ type: "application/json" }),
      createGitHubKnowledgeWebhook({
        client: client as never,
        jobs,
        secret,
      }),
    );
    await request(app)
      .post("/webhooks/github/knowledge")
      .set("content-type", "application/json")
      .set("x-github-event", "push")
      .set("x-github-delivery", "delivery-1")
      .set("x-hub-signature-256", signed(body, secret))
      .send(body)
      .expect(202, { queued: 1 });
    expect((await jobs.list())[0]).toMatchObject({
      type: "mend.knowledge.repository_sync",
      workspaceId: "10000000-0000-4000-8000-000000000001",
      payload: expect.objectContaining({ requestedSha: "a".repeat(40) }),
    });
  });
});
