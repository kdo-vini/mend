import {
  describe,
  expect,
  it,
  beforeEach,
  afterEach,
  beforeAll,
  afterAll,
  vi,
} from "vitest";
import request from "supertest";
import type { Express } from "express";
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

  it("allows Supabase media and local blob previews through CSP", async () => {
    const response = await request(app).get("/api/health");
    const csp = response.headers["content-security-policy"];
    const supabaseUrl =
      process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
    expect(supabaseUrl).toBeTruthy();
    const supabaseOrigin = new URL(supabaseUrl as string).origin;

    expect(csp).toContain(`img-src 'self' data: blob: ${supabaseOrigin}`);
    expect(csp).toContain(`media-src 'self' blob: ${supabaseOrigin}`);
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
        agentWorkspace: expect.any(Boolean),
        runner: expect.any(Boolean),
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

interface HeartbeatResponse {
  data: Record<string, unknown> | null;
  error: { message: string } | null;
}

const readinessEnvKeys = [
  "SUPABASE_URL",
  "SUPABASE_PUBLISHABLE_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "WHATSMIAU_API_KEY",
  "WHATSMIAU_WEBHOOK_SECRET",
  "MEND_PROCESS_ROLE",
  "MEND_AGENT_WORKSPACE_ROOT",
] as const;

type ReadinessEnv = Partial<Record<(typeof readinessEnvKeys)[number], string>>;

async function loadServer(options: {
  env: ReadinessEnv;
  heartbeat?: () => Promise<HeartbeatResponse>;
}): Promise<Express> {
  for (const key of readinessEnvKeys) delete process.env[key];
  Object.assign(process.env, options.env);
  vi.resetModules();
  const heartbeat = options.heartbeat;
  if (heartbeat) {
    vi.doMock("./supabase.js", () => ({
      createServerSupabaseClient: () => ({
        from: () => ({
          select: () => ({
            order: () => ({ limit: () => ({ maybeSingle: heartbeat }) }),
          }),
        }),
      }),
      hasServerSupabaseConfig: () => Boolean(process.env.SUPABASE_URL),
    }));
  }
  const loaded = (await import("./index.js")) as { app: Express };
  return loaded.app;
}

const controlPlaneEnv: ReadinessEnv = {
  SUPABASE_URL: "https://readiness.test.supabase.co",
  SUPABASE_SERVICE_ROLE_KEY: "service-role-test-key",
  WHATSMIAU_API_KEY: "whatsmiau-test-key",
  WHATSMIAU_WEBHOOK_SECRET: "test-secret",
};

describe("readiness gating", () => {
  let originalEnv: NodeJS.ProcessEnv;

  beforeAll(() => {
    originalEnv = { ...process.env };
  });

  afterEach(() => {
    vi.doUnmock("./supabase.js");
    vi.resetModules();
    for (const key of readinessEnvKeys) delete process.env[key];
    for (const key of readinessEnvKeys)
      if (originalEnv[key] !== undefined) process.env[key] = originalEnv[key];
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it("keeps the control plane ready when the runner is not heartbeating", async () => {
    const server = await loadServer({
      env: controlPlaneEnv,
      heartbeat: async () => ({ data: null, error: null }),
    });
    const response = await request(server).get("/api/ready");
    expect(response.status).toBe(200);
    expect(response.body.ready).toBe(true);
    expect(response.body.checks.runner).toBe(false);
  });

  it("reports the runner as ready on the control plane when it is heartbeating", async () => {
    const server = await loadServer({
      env: controlPlaneEnv,
      heartbeat: async () => ({
        data: {
          worker_id: "runner-1",
          last_seen_at: new Date().toISOString(),
          current_job_type: null,
          current_job_id: null,
        },
        error: null,
      }),
    });
    const response = await request(server).get("/api/ready");
    expect(response.status).toBe(200);
    expect(response.body.ready).toBe(true);
    expect(response.body.checks.runner).toBe(true);
  });

  it("keeps the control plane ready when the heartbeat lookup rejects", async () => {
    const rejections: unknown[] = [];
    const onUnhandled = (reason: unknown) => rejections.push(reason);
    process.on("unhandledRejection", onUnhandled);
    try {
      const server = await loadServer({
        env: controlPlaneEnv,
        heartbeat: () => Promise.reject(new Error("heartbeat lookup failed")),
      });
      const response = await request(server).get("/api/ready");
      expect(response.status).toBe(200);
      expect(response.body.ready).toBe(true);
      expect(response.body.checks.runner).toBe(false);
      await new Promise((resolve) => setTimeout(resolve, 50));
      expect(rejections).toEqual([]);
    } finally {
      process.off("unhandledRejection", onUnhandled);
    }
  });

  it("keeps the control plane ready when the heartbeat lookup never settles", async () => {
    const server = await loadServer({
      env: controlPlaneEnv,
      heartbeat: () => new Promise<HeartbeatResponse>(() => {}),
    });
    const startedAt = Date.now();
    const response = await request(server).get("/api/ready");
    const elapsedMs = Date.now() - startedAt;
    expect(response.status).toBe(200);
    expect(response.body.ready).toBe(true);
    expect(response.body.checks.runner).toBe(false);
    expect(elapsedMs).toBeLessThan(3_000);
  }, 20_000);

  it("keeps the runner process unready without a usable agent workspace", async () => {
    const server = await loadServer({
      env: {
        SUPABASE_URL: "https://readiness.test.supabase.co",
        SUPABASE_PUBLISHABLE_KEY: "publishable-test-key",
        WHATSMIAU_API_KEY: "whatsmiau-test-key",
        WHATSMIAU_WEBHOOK_SECRET: "test-secret",
        MEND_PROCESS_ROLE: "runner",
      },
    });
    const response = await request(server).get("/api/ready");
    expect(response.status).toBe(503);
    expect(response.body.ready).toBe(false);
    expect(response.body.checks.runner).toBe(false);
    expect(response.body.checks.supabase).toBe(true);
  });

  it("still fails control plane readiness when infrastructure is unconfigured", async () => {
    const server = await loadServer({
      env: {
        WHATSMIAU_API_KEY: "whatsmiau-test-key",
        WHATSMIAU_WEBHOOK_SECRET: "test-secret",
      },
    });
    const response = await request(server).get("/api/ready");
    expect(response.status).toBe(503);
    expect(response.body.ready).toBe(false);
    expect(response.body.checks.supabase).toBe(false);
  });
});
