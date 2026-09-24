import { afterEach, describe, expect, it, vi } from "vitest";
import {
  OUTBOUND_WHATSAPP_API_KEY_ENV,
  OUTBOUND_WHATSAPP_PATH,
  ZELOCHAT_BASE_URL_ENV,
  ZELOCHAT_INTERNAL_API_KEY_ENV,
  ZELOCHAT_INTERNAL_API_KEY_LEGACY_ENV,
  ZELOCHAT_INTERNAL_KEY_HEADER,
  authorizeOutboundWhatsAppRequest,
  forwardZeloChatSendText,
  isValidOutboundWhatsAppRecipient,
  parseOutboundWhatsAppBody,
  readZeloChatForwardConfig,
  sanitizeZeloChatResponse,
  timingSafeSecretEquals,
} from "./zelochat-internal-send.js";

const outboundEnv = {
  [OUTBOUND_WHATSAPP_API_KEY_ENV]: "mend-outbound-test-key",
};

describe("timingSafeSecretEquals", () => {
  it("accepts equal secrets and rejects mismatches of any length", () => {
    expect(timingSafeSecretEquals("same-secret", "same-secret")).toBe(true);
    expect(timingSafeSecretEquals("short", "much-longer-secret")).toBe(false);
    expect(timingSafeSecretEquals("abc", "abd")).toBe(false);
    expect(timingSafeSecretEquals("", "secret")).toBe(false);
    expect(timingSafeSecretEquals("secret", undefined)).toBe(false);
    expect(timingSafeSecretEquals(undefined, undefined)).toBe(false);
  });
});

describe("authorizeOutboundWhatsAppRequest", () => {
  it("fails closed with 503 when the Mend outbound key is unset", () => {
    expect(authorizeOutboundWhatsAppRequest("any", {})).toEqual({
      ok: false,
      status: 503,
      error: "outbound_key_not_configured",
    });
  });

  it("rejects a missing or wrong key with 401", () => {
    expect(authorizeOutboundWhatsAppRequest(undefined, outboundEnv)).toEqual({
      ok: false,
      status: 401,
      error: "unauthorized",
    });
    expect(authorizeOutboundWhatsAppRequest("wrong", outboundEnv)).toEqual({
      ok: false,
      status: 401,
      error: "unauthorized",
    });
  });

  it("accepts the configured key after trim", () => {
    expect(
      authorizeOutboundWhatsAppRequest(
        "  mend-outbound-test-key  ",
        outboundEnv,
      ),
    ).toEqual({ ok: true, status: 200 });
  });
});

describe("outbound body and recipient", () => {
  it("accepts phone digits and a user JID, rejects junk", () => {
    expect(isValidOutboundWhatsAppRecipient("14991537503")).toBe(true);
    expect(isValidOutboundWhatsAppRecipient("+55 14 99153-7503")).toBe(true);
    expect(
      isValidOutboundWhatsAppRecipient("5514991537503@s.whatsapp.net"),
    ).toBe(true);
    expect(isValidOutboundWhatsAppRecipient("not-a-phone")).toBe(false);
    expect(isValidOutboundWhatsAppRecipient("123")).toBe(false);
  });

  it("requires to and a non-empty trimmed message", () => {
    expect(parseOutboundWhatsAppBody({})).toEqual({
      ok: false,
      error: "invalid_input",
    });
    expect(
      parseOutboundWhatsAppBody({ to: "14991537503", message: "   " }),
    ).toEqual({ ok: false, error: "invalid_input" });
    expect(parseOutboundWhatsAppBody({ to: "abc", message: "hello" })).toEqual({
      ok: false,
      error: "invalid_to",
    });
    expect(
      parseOutboundWhatsAppBody({
        to: "14991537503",
        message: "hello",
        extra: true,
      }),
    ).toEqual({ ok: false, error: "invalid_input" });
    expect(
      parseOutboundWhatsAppBody({ to: "14991537503", message: "  hi  " }),
    ).toEqual({
      ok: true,
      data: { to: "14991537503", message: "hi" },
    });
  });
});

describe("readZeloChatForwardConfig", () => {
  it("requires both base URL and an existing Chat key", () => {
    expect(readZeloChatForwardConfig({})).toBeNull();
    expect(
      readZeloChatForwardConfig({
        [ZELOCHAT_BASE_URL_ENV]: "https://chat.zelopdv.com.br",
      }),
    ).toBeNull();
    expect(
      readZeloChatForwardConfig({
        [ZELOCHAT_INTERNAL_API_KEY_ENV]: "chat-key",
      }),
    ).toBeNull();
  });

  it("accepts the Chat key under the ZeloChat or Techne env name", () => {
    expect(
      readZeloChatForwardConfig({
        [ZELOCHAT_BASE_URL_ENV]: "https://chat.zelopdv.com.br/",
        [ZELOCHAT_INTERNAL_API_KEY_ENV]: "chat-key",
      }),
    ).toEqual({
      baseUrl: "https://chat.zelopdv.com.br",
      apiKey: "chat-key",
    });
    expect(
      readZeloChatForwardConfig({
        [ZELOCHAT_BASE_URL_ENV]: "https://chat.zelopdv.com.br",
        [ZELOCHAT_INTERNAL_API_KEY_LEGACY_ENV]: "legacy-chat-key",
      }),
    ).toEqual({
      baseUrl: "https://chat.zelopdv.com.br",
      apiKey: "legacy-chat-key",
    });
  });
});

describe("sanitizeZeloChatResponse", () => {
  it("maps Chat 401 to 503 so Outbound does not confuse keys", () => {
    expect(sanitizeZeloChatResponse(401, { error: "UNAUTHORIZED" })).toEqual({
      status: 503,
      body: { error: "zelochat_forward_unauthorized" },
    });
  });

  it("keeps the ZeloChat success fields and drops providerBody", () => {
    expect(
      sanitizeZeloChatResponse(200, {
        ok: true,
        empresaId: "should-not-need-to-leak-but-ok",
        to: "5514991537503@s.whatsapp.net",
        messageId: "mid-1",
        jobId: "job-1",
        status: "queued",
        providerBody: { raw: "secret-ish" },
      }),
    ).toEqual({
      status: 200,
      body: {
        ok: true,
        to: "5514991537503@s.whatsapp.net",
        messageId: "mid-1",
        jobId: "job-1",
        status: "queued",
      },
    });
  });
});

describe("forwardZeloChatSendText", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("POSTs to the Chat send-text path with the existing internal key", async () => {
    const fetchImpl = vi.fn(async (url: string, init?: RequestInit) => {
      expect(url).toBe(`https://chat.zelopdv.com.br${OUTBOUND_WHATSAPP_PATH}`);
      expect(init?.method).toBe("POST");
      const headers = new Headers(init?.headers);
      expect(headers.get(ZELOCHAT_INTERNAL_KEY_HEADER)).toBe("chat-key");
      expect(headers.get("idempotency-key")).toBe("idem-1");
      expect(JSON.parse(String(init?.body))).toEqual({
        to: "14991537503",
        message: "hello from mend",
      });
      return new Response(
        JSON.stringify({
          ok: true,
          to: "5514991537503@s.whatsapp.net",
          messageId: "mid-1",
          jobId: "job-1",
          status: "queued",
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    });

    const result = await forwardZeloChatSendText(
      {
        to: "14991537503",
        message: "hello from mend",
        idempotencyKey: "idem-1",
      },
      {
        baseUrl: "https://chat.zelopdv.com.br",
        apiKey: "chat-key",
      },
      { fetchImpl: fetchImpl as unknown as typeof fetch },
    );

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(result).toEqual({
      status: 200,
      body: {
        ok: true,
        to: "5514991537503@s.whatsapp.net",
        messageId: "mid-1",
        jobId: "job-1",
        status: "queued",
      },
    });
  });

  it("does not throw on network failure and never retries", async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error("network down");
    });
    const result = await forwardZeloChatSendText(
      { to: "14991537503", message: "hello" },
      { baseUrl: "https://chat.zelopdv.com.br", apiKey: "chat-key" },
      { fetchImpl: fetchImpl as unknown as typeof fetch },
    );
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(result).toEqual({
      status: 502,
      body: { error: "zelochat_unavailable" },
    });
  });
});
