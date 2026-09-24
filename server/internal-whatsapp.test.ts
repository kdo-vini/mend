import express from "express";
import request from "supertest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { registerInternalWhatsAppRoutes } from "./internal-whatsapp.js";
import {
  OUTBOUND_WHATSAPP_API_KEY_ENV,
  OUTBOUND_WHATSAPP_KEY_HEADER,
  OUTBOUND_WHATSAPP_PATH,
  ZELOCHAT_BASE_URL_ENV,
  ZELOCHAT_INTERNAL_API_KEY_ENV,
  ZELOCHAT_INTERNAL_KEY_HEADER,
} from "./zelochat-internal-send.js";

function buildApp(options: {
  env: NodeJS.ProcessEnv;
  fetchImpl?: typeof fetch;
}) {
  const app = express();
  app.use(express.json());
  registerInternalWhatsAppRoutes(app, {
    env: options.env,
    fetchImpl: options.fetchImpl,
  });
  return app;
}

const configuredEnv = {
  [OUTBOUND_WHATSAPP_API_KEY_ENV]: "mend-outbound-test-key",
  [ZELOCHAT_BASE_URL_ENV]: "https://chat.zelopdv.com.br",
  [ZELOCHAT_INTERNAL_API_KEY_ENV]: "existing-chat-key",
};

describe("POST /internal/whatsapp/send-text", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("fails closed when the Mend outbound key is not configured", async () => {
    const fetchImpl = vi.fn();
    const response = await request(
      buildApp({ env: {}, fetchImpl: fetchImpl as unknown as typeof fetch }),
    )
      .post(OUTBOUND_WHATSAPP_PATH)
      .send({ to: "14991537503", message: "hello" });
    expect(response.status).toBe(503);
    expect(response.body).toEqual({ error: "outbound_key_not_configured" });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("rejects a wrong Mend key without forwarding to Chat", async () => {
    const fetchImpl = vi.fn();
    const response = await request(
      buildApp({
        env: configuredEnv,
        fetchImpl: fetchImpl as unknown as typeof fetch,
      }),
    )
      .post(OUTBOUND_WHATSAPP_PATH)
      .set(OUTBOUND_WHATSAPP_KEY_HEADER, "wrong-key")
      .send({ to: "14991537503", message: "hello" });
    expect(response.status).toBe(401);
    expect(response.body).toEqual({ error: "unauthorized" });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("does not forward when Chat env is missing", async () => {
    const fetchImpl = vi.fn();
    const response = await request(
      buildApp({
        env: { [OUTBOUND_WHATSAPP_API_KEY_ENV]: "mend-outbound-test-key" },
        fetchImpl: fetchImpl as unknown as typeof fetch,
      }),
    )
      .post(OUTBOUND_WHATSAPP_PATH)
      .set(OUTBOUND_WHATSAPP_KEY_HEADER, "mend-outbound-test-key")
      .send({ to: "14991537503", message: "hello" });
    expect(response.status).toBe(503);
    expect(response.body).toEqual({
      error: "zelochat_forward_not_configured",
    });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("rejects an invalid body without calling Chat", async () => {
    const fetchImpl = vi.fn();
    const response = await request(
      buildApp({
        env: configuredEnv,
        fetchImpl: fetchImpl as unknown as typeof fetch,
      }),
    )
      .post(OUTBOUND_WHATSAPP_PATH)
      .set(OUTBOUND_WHATSAPP_KEY_HEADER, "mend-outbound-test-key")
      .send({ to: "nope", message: "" });
    expect(response.status).toBe(400);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("forwards a valid send to ZeloChat and returns the sanitized result", async () => {
    const fetchImpl = vi.fn(async (url: string, init?: RequestInit) => {
      expect(url).toBe(
        "https://chat.zelopdv.com.br/internal/whatsapp/send-text",
      );
      const headers = new Headers(init?.headers);
      expect(headers.get(ZELOCHAT_INTERNAL_KEY_HEADER)).toBe(
        "existing-chat-key",
      );
      expect(headers.get("idempotency-key")).toBe("bot-1");
      return new Response(
        JSON.stringify({
          ok: true,
          empresaId: "techne-empresa",
          to: "5514991537503@s.whatsapp.net",
          messageId: "mid-9",
          jobId: "job-9",
          status: "queued",
          providerBody: { leak: "no" },
        }),
        { status: 200 },
      );
    });

    const response = await request(
      buildApp({
        env: configuredEnv,
        fetchImpl: fetchImpl as unknown as typeof fetch,
      }),
    )
      .post(OUTBOUND_WHATSAPP_PATH)
      .set(OUTBOUND_WHATSAPP_KEY_HEADER, "mend-outbound-test-key")
      .set("Idempotency-Key", "bot-1")
      .send({ to: "14991537503", message: "hello from outbound" });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      ok: true,
      to: "5514991537503@s.whatsapp.net",
      messageId: "mid-9",
      jobId: "job-9",
      status: "queued",
    });
    expect(JSON.stringify(response.body)).not.toContain("existing-chat-key");
    expect(JSON.stringify(response.body)).not.toContain(
      "mend-outbound-test-key",
    );
    expect(JSON.stringify(response.body)).not.toContain("leak");
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("surfaces Chat 409 without translating it to unauthorized", async () => {
    const fetchImpl = vi.fn(
      async () =>
        new Response(
          JSON.stringify({ error: "TECHNE_WHATSAPP_NOT_CONNECTED" }),
          { status: 409 },
        ),
    );
    const response = await request(
      buildApp({
        env: configuredEnv,
        fetchImpl: fetchImpl as unknown as typeof fetch,
      }),
    )
      .post(OUTBOUND_WHATSAPP_PATH)
      .set(OUTBOUND_WHATSAPP_KEY_HEADER, "mend-outbound-test-key")
      .send({ to: "14991537503", message: "hello" });
    expect(response.status).toBe(409);
    expect(response.body).toEqual({
      error: "TECHNE_WHATSAPP_NOT_CONNECTED",
    });
  });
});
