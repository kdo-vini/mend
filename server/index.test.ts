import { describe, expect, it, beforeEach } from "vitest";
import request from "supertest";
import { app } from "./index.js";

beforeEach(() => {
  process.env.WHATSMIAU_WEBHOOK_SECRET = "test-secret";
});

describe("API boundary", () => {
  it("returns health without exposing configuration", async () => {
    const response = await request(app).get("/api/health");
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ ok: true, service: "mend-api" });
  });

  it("reports readiness as booleans without exposing secret values", async () => {
    const response = await request(app).get("/api/ready");
    expect([200, 503]).toContain(response.status);
    expect(response.body).toEqual({
      ready: expect.any(Boolean),
      checks: {
        supabase: expect.any(Boolean),
        whatsMiau: expect.any(Boolean),
        webhook: expect.any(Boolean),
        openai: expect.any(Boolean),
        codexWorkspace: expect.any(Boolean),
      },
    });
    expect(JSON.stringify(response.body)).not.toContain("test-secret");
  });

  it("rejects an invalid Whatsmiau webhook", async () => {
    const response = await request(app)
      .post("/webhooks/whatsmiau")
      .set("Authorization", "Bearer wrong")
      .send({ event: "messages.upsert" });
    expect(response.status).toBe(401);
  });

  it("acknowledges a valid webhook without running AI inline", async () => {
    const response = await request(app)
      .post("/webhooks/whatsmiau")
      .set("Authorization", "Bearer test-secret")
      .send({ event: "messages.upsert", instance: "mend-test", data: {} });
    expect(response.status).toBe(202);
    expect(response.body.accepted).toBe(true);
  });

  it("does not expose paid AI endpoints without a Supabase bearer token", async () => {
    const draft = await request(app)
      .post("/api/ai/draft")
      .send({ conversation: "hello" });
    const triage = await request(app)
      .post("/api/ai/triage")
      .send({ conversation: "hello" });
    expect(draft.status).toBe(401);
    expect(triage.status).toBe(401);
  });
});
