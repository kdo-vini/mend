import { describe, expect, it } from "vitest";
import {
  normalizePhoneNumber,
  normalizeWhatsmiauEvent,
  WhatsmiauMessagingProvider,
} from "./whatsmiau.js";

describe("Whatsmiau normalization", () => {
  it("normalizes Baileys text and media shapes", () => {
    const messages = normalizeWhatsmiauEvent({
      event: "messages.upsert",
      instance: "mend-demo",
      data: {
        messages: [
          {
            key: {
              id: "wamid-1",
              remoteJid: "5511999999999@s.whatsapp.net",
              fromMe: false,
            },
            pushName: "Ana",
            messageTimestamp: 1_700_000_000,
            message: { extendedTextMessage: { text: "Olá" } },
          },
          {
            key: {
              id: "wamid-2",
              remoteJid: "5511888888888@s.whatsapp.net",
              fromMe: true,
            },
            message: {
              imageMessage: {
                caption: "comprovante",
                mimetype: "image/png",
                fileName: "proof.png",
                url: "https://media.example/proof",
              },
            },
          },
        ],
      },
    });

    expect(messages).toHaveLength(2);
    expect(messages[0]).toMatchObject({
      providerMessageId: "wamid-1",
      phoneNumber: "5511999999999",
      text: "Olá",
      direction: "inbound",
      contactName: "Ana",
    });
    expect(messages[1]).toMatchObject({
      providerMessageId: "wamid-2",
      messageType: "image",
      caption: "comprovante",
      mimeType: "image/png",
      mediaUrl: "https://media.example/proof",
      direction: "outbound",
    });
  });

  it("preserves Whatsmiau's documented top-level mediaUrl", () => {
    const [message] = normalizeWhatsmiauEvent({
      event: "messages.upsert",
      instance: "mend-demo",
      data: {
        key: {
          id: "video-1",
          remoteJid: "5511999999999@s.whatsapp.net",
          fromMe: false,
        },
        message: {
          videoMessage: {
            mimetype: "video/mp4",
            caption: "pedido",
          },
        },
        mediaUrl: "https://media.example/video.mp4",
      },
    });
    expect(message).toMatchObject({
      messageType: "video",
      mediaUrl: "https://media.example/video.mp4",
    });
  });

  it("creates a stable id when the provider omits an id", () => {
    const payload = {
      event: "messages.upsert",
      instance: "mend-demo",
      data: {
        key: { remoteJid: "5511999999999@s.whatsapp.net" },
        message: { conversation: "hello" },
        messageTimestamp: 1_700_000_000,
      },
    };
    const first = normalizeWhatsmiauEvent(payload)[0];
    const second = normalizeWhatsmiauEvent(payload)[0];
    expect(first.providerMessageId).toBe(second.providerMessageId);
    expect(first.providerMessageId).toMatch(/^generated-/);
  });

  it("keeps the provider id for delivery/read status events", () => {
    const message = normalizeWhatsmiauEvent({
      event: "messages.update",
      instance: "mend-demo",
      data: {
        messageId: "wamid-1",
        keyId: "wamid-1",
        remoteJid: "5511999999999@s.whatsapp.net",
        fromMe: true,
        status: "DELIVERY_ACK",
      },
    })[0];
    expect(message).toMatchObject({
      providerMessageId: "wamid-1",
      direction: "outbound",
      phoneNumber: "5511999999999",
    });
  });

  it("normalizes button and list selections for flow automation", () => {
    const messages = normalizeWhatsmiauEvent({
      event: "messages.upsert",
      instance: "mend-demo",
      data: {
        key: {
          id: "wamid-choice",
          remoteJid: "5511999999999@s.whatsapp.net",
        },
        message: {
          listResponseMessage: {
            singleSelectReply: {
              selectedRowId: "billing",
              title: "Billing",
            },
          },
        },
      },
    });
    expect(messages[0]).toMatchObject({
      interactionId: "billing",
      text: "Billing",
    });
  });

  it("classifies group chats and keeps the participant display name", () => {
    const [message] = normalizeWhatsmiauEvent({
      event: "messages.upsert",
      instance: "mend-demo",
      data: {
        key: {
          id: "group-message-1",
          remoteJid: "120363426966918405@g.us",
          participant: "551231999058@s.whatsapp.net",
          fromMe: false,
        },
        pushName: "Guilherme Correa",
        message: { conversation: "Até amanhã!" },
      },
    });

    expect(message).toMatchObject({
      chatType: "group",
      participantName: "Guilherme Correa",
      phoneNumber: "120363426966918405",
    });
  });

  it("normalizes JIDs for contact and send contracts", () => {
    expect(normalizePhoneNumber("+55 (11) 99999-9999@s.whatsapp.net")).toBe(
      "5511999999999",
    );
  });

  it("cleans up a provider instance when webhook setup fails", async () => {
    const originalFetch = globalThis.fetch;
    const calls: string[] = [];
    globalThis.fetch = async (input, init) => {
      const url = String(input);
      calls.push(`${init?.method ?? "GET"} ${url}`);
      if (url.endsWith("/instance/create"))
        return new Response(
          JSON.stringify({ instanceName: "mend-test", state: "closed" }),
          { status: 200 },
        );
      if (url.includes("/webhook/set/"))
        return new Response("invalid webhook", { status: 400 });
      if (url.includes("/instance/logout/"))
        return new Response(null, { status: 204 });
      return new Response(null, { status: 404 });
    };

    try {
      const provider = new WhatsmiauMessagingProvider(
        "https://provider.test/v2",
        "test-key",
      );
      await expect(
        provider.createInstance({
          instanceName: "mend-test",
          webhookUrl: "https://mend.test/webhook",
          webhookSecret: "secret",
        }),
      ).rejects.toMatchObject({ status: 400 });
      expect(calls).toEqual([
        "POST https://provider.test/v2/instance/create",
        "POST https://provider.test/v2/webhook/set/mend-test",
        "DELETE https://provider.test/v2/instance/logout/mend-test",
      ]);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("configures path fallback and bearer authentication for all message events", async () => {
    const originalFetch = globalThis.fetch;
    let webhookBody: Record<string, unknown> | undefined;
    globalThis.fetch = async (_input, init) => {
      webhookBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
      return new Response(null, { status: 204 });
    };

    try {
      const provider = new WhatsmiauMessagingProvider(
        "https://provider.test/v2",
        "test-key",
      );
      await provider.configureWebhook({
        instanceName: "mend-test",
        url: "https://mend.test/functions/v1/whats-mend-webhook",
        secret: "path-secret",
      });
      expect(webhookBody).toEqual({
        webhook: {
          enabled: true,
          url: "https://mend.test/functions/v1/whats-mend-webhook/path-secret",
          events: [
            "messages.upsert",
            "messages.update",
            "messages.delete",
            "messages.set",
            "connection.update",
            "contacts.upsert",
          ],
          headers: { Authorization: "Bearer path-secret" },
          byEvents: false,
          base64: false,
        },
      });
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("revokes a message for everyone with the documented Whatsmiau payload", async () => {
    const originalFetch = globalThis.fetch;
    let request: { method?: string; body?: Record<string, unknown> } = {};
    globalThis.fetch = async (_input, init) => {
      request = {
        method: init?.method,
        body: JSON.parse(String(init?.body)) as Record<string, unknown>,
      };
      return new Response(null, { status: 204 });
    };

    try {
      const provider = new WhatsmiauMessagingProvider(
        "https://provider.test/v2",
        "test-key",
      );
      await provider.deleteMessageForEveryone({
        instanceName: "mend-test",
        id: "wamid-1",
        remoteJid: "5511999999999@s.whatsapp.net",
        fromMe: true,
      });
      expect(request).toEqual({
        method: "DELETE",
        body: {
          id: "wamid-1",
          remoteJid: "5511999999999@s.whatsapp.net",
          fromMe: true,
        },
      });
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("sends documented reactions and interactive buttons", async () => {
    const originalFetch = globalThis.fetch;
    const calls: Array<{ url: string; method?: string; body?: unknown }> = [];
    globalThis.fetch = async (input, init) => {
      calls.push({
        url: String(input),
        method: init?.method,
        body: init?.body ? JSON.parse(String(init.body)) : undefined,
      });
      return new Response(JSON.stringify({ key: { id: "wamid-out" } }), {
        status: 200,
      });
    };
    try {
      const provider = new WhatsmiauMessagingProvider(
        "https://provider.test/v2",
        "test-key",
      );
      await provider.sendReaction({
        instanceName: "mend-test",
        remoteJid: "5511999999999@s.whatsapp.net",
        id: "wamid-1",
        fromMe: false,
        reaction: "👍",
      });
      await provider.sendButtons({
        instanceName: "mend-test",
        number: "5511999999999",
        title: "Choose",
        description: "Pick one",
        buttons: [{ type: "reply", displayText: "Help", id: "help" }],
      });
      expect(calls).toMatchObject([
        {
          url: "https://provider.test/v2/message/sendReaction/mend-test",
          method: "POST",
        },
        {
          url: "https://provider.test/v2/message/sendButtons/mend-test",
          method: "POST",
        },
      ]);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
