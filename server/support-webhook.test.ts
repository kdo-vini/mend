import { describe, expect, it, vi } from "vitest";
import {
  InMemorySupportEventStore,
  type StoredSupportEvent,
} from "./support-events.js";
import {
  createSupportWebhookNotifier,
  normalizeSupportWebhookAuthorization,
  resolveSupportWebhookConfig,
  withSupportWebhook,
} from "./support-webhook.js";

const env = {
  MEND_SUPPORT_WEBHOOK_URL: "https://hooks.example.test/support",
  MEND_SUPPORT_WEBHOOK_AUTHORIZATION: "test-token",
};

async function recordedStore(): Promise<{
  store: InMemorySupportEventStore;
  row: StoredSupportEvent;
}> {
  const store = new InMemorySupportEventStore();
  store.messages.set("m1", {
    id: "m1",
    providerMessageId: "p1",
    messageType: "text",
    text: "Meu pedido não chegou",
  });
  store.conversations.set("c1", {
    aiMode: "safe_auto",
    automationState: "ai_active",
  });
  const row = await store.record({
    workspaceId: "w1",
    conversationId: "c1",
    messageId: "m1",
    direction: "inbound",
    remoteJid: "5511999999999@s.whatsapp.net",
    phoneNumber: "5511999999999",
    chatType: "direct",
  });
  if (!row) throw new Error("expected a new row");
  return { store, row };
}

function okFetch() {
  return vi.fn(
    async (_url: string | URL | Request, _init?: RequestInit) =>
      new Response(null, { status: 202 }),
  );
}

describe("resolveSupportWebhookConfig", () => {
  it("disables push when the URL is unset, blank or invalid", () => {
    expect(resolveSupportWebhookConfig({})).toBeNull();
    expect(
      resolveSupportWebhookConfig({ MEND_SUPPORT_WEBHOOK_URL: "  " }),
    ).toBeNull();
    expect(
      resolveSupportWebhookConfig({ MEND_SUPPORT_WEBHOOK_URL: "not a url" }),
    ).toBeNull();
    expect(
      resolveSupportWebhookConfig({
        MEND_SUPPORT_WEBHOOK_URL: "ftp://hooks.example.test",
      }),
    ).toBeNull();
  });

  it("normalizes a bare token or full header value to Bearer", () => {
    expect(normalizeSupportWebhookAuthorization("tok")).toBe("Bearer tok");
    expect(normalizeSupportWebhookAuthorization(" Bearer tok ")).toBe(
      "Bearer tok",
    );
    expect(normalizeSupportWebhookAuthorization("bearer tok")).toBe(
      "Bearer tok",
    );
    expect(normalizeSupportWebhookAuthorization("")).toBeUndefined();
    expect(resolveSupportWebhookConfig(env)).toEqual({
      url: env.MEND_SUPPORT_WEBHOOK_URL,
      authorization: "Bearer test-token",
    });
  });
});

describe("createSupportWebhookNotifier", () => {
  it("returns null when the webhook URL is unset", async () => {
    const { store } = await recordedStore();
    expect(createSupportWebhookNotifier({ store, env: {} })).toBeNull();
  });

  it("POSTs the hydrated SupportEvent with JSON and Authorization headers", async () => {
    const { store, row } = await recordedStore();
    const fetch = okFetch();
    await createSupportWebhookNotifier({ store, env, fetch })?.notify(row);

    expect(fetch).toHaveBeenCalledTimes(1);
    const [url, init] = fetch.mock.calls[0]!;
    expect(url).toBe(env.MEND_SUPPORT_WEBHOOK_URL);
    expect(init?.method).toBe("POST");
    expect(init?.headers).toEqual({
      "Content-Type": "application/json; charset=utf-8",
      Authorization: "Bearer test-token",
    });
    const [polled] = (await store.list({ limit: 10 })).events;
    expect(JSON.parse(String(init?.body))).toEqual(polled);
    expect(polled).toMatchObject({
      cursor: "1",
      workspaceId: "w1",
      conversationId: "c1",
      messageId: "m1",
      providerMessageId: "p1",
      direction: "inbound",
      remoteJid: "5511999999999@s.whatsapp.net",
      phoneNumber: "5511999999999",
      isGroup: false,
      messageType: "text",
      text: "Meu pedido não chegou",
      aiMode: "safe_auto",
      automationState: "ai_active",
      replyAllowed: true,
      createdAt: row.createdAt,
    });
  });

  it("omits Authorization when no token is configured", async () => {
    const { store, row } = await recordedStore();
    const fetch = okFetch();
    await createSupportWebhookNotifier({
      store,
      env: { MEND_SUPPORT_WEBHOOK_URL: env.MEND_SUPPORT_WEBHOOK_URL },
      fetch,
    })?.notify(row);
    expect(fetch.mock.calls[0]?.[1]?.headers).toEqual({
      "Content-Type": "application/json; charset=utf-8",
    });
  });

  it("logs and resolves on 5xx without leaking the URL or token", async () => {
    const { store, row } = await recordedStore();
    const warn = vi.fn();
    const fetch = vi.fn(async () => new Response("down", { status: 503 }));
    await expect(
      createSupportWebhookNotifier({
        store,
        env,
        fetch,
        logger: { warn },
      })!.notify(row),
    ).resolves.toBeUndefined();
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledWith(
      {
        err: "support_webhook_status_503",
        messageId: "m1",
        conversationId: "c1",
      },
      "Support webhook push failed",
    );
    const logged = JSON.stringify(warn.mock.calls);
    expect(logged).not.toContain("test-token");
    expect(logged).not.toContain("hooks.example.test");
  });

  it("aborts on timeout and resolves without retrying", async () => {
    const { store, row } = await recordedStore();
    const warn = vi.fn();
    const fetch = vi.fn(
      (_url: string | URL | Request, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () =>
            reject(init.signal?.reason),
          );
        }),
    );
    await createSupportWebhookNotifier({
      store,
      env,
      fetch,
      timeoutMs: 10,
      logger: { warn },
    })!.notify(row);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it("swallows hydration failures", async () => {
    const { row } = await recordedStore();
    const warn = vi.fn();
    const fetch = okFetch();
    await createSupportWebhookNotifier({
      store: {
        hydrate: async () => {
          throw new Error("supabase:messages:down");
        },
      },
      env,
      fetch,
      logger: { warn },
    })!.notify(row);
    expect(fetch).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledTimes(1);
  });
});

describe("withSupportWebhook", () => {
  const input = {
    workspaceId: "w1",
    conversationId: "c1",
    messageId: "m1",
    remoteJid: "r",
  };

  it("returns the store untouched when the URL is unset", () => {
    const store = new InMemorySupportEventStore();
    expect(withSupportWebhook(store, { env: {} })).toBe(store);
  });

  it("pushes new records only, never duplicates", async () => {
    const store = new InMemorySupportEventStore();
    const fetch = okFetch();
    const wrapped = withSupportWebhook(store, { env, fetch });
    expect(await wrapped.record(input)).toMatchObject({ messageId: "m1" });
    expect(await wrapped.record(input)).toBeNull();
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("does not push when the record write fails", async () => {
    const fetch = okFetch();
    const wrapped = withSupportWebhook(
      {
        record: async () => {
          throw new Error("supabase:support_inbound_events:down");
        },
        hydrate: async () => [],
      },
      { env, fetch },
    );
    await expect(wrapped.record(input)).rejects.toThrow("down");
    expect(fetch).not.toHaveBeenCalled();
  });
});
