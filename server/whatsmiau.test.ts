import { describe, expect, it } from "vitest";
import {
  normalizePhoneNumber,
  normalizeWhatsmiauEvent,
  resolveWhatsAppSendDestination,
  WhatsmiauMessagingProvider,
} from "./whatsmiau.js";
import { isUndecryptedProviderStub } from "./whatsmiau-message.js";

describe("Whatsmiau normalization", () => {
  it("gives shared contacts, locations and polls a readable body", () => {
    const item = (id: string, message: Record<string, unknown>) => ({
      key: {
        id,
        remoteJid: "5511999999999@s.whatsapp.net",
        fromMe: false,
      },
      messageType: Object.keys(message)[0],
      message,
    });
    const messages = normalizeWhatsmiauEvent({
      event: "messages.upsert",
      instance: "mend-demo",
      data: {
        messages: [
          item("contact", {
            contactMessage: {
              displayName: "Kayke",
              vcard:
                "BEGIN:VCARD\nVERSION:3.0\nN:;Kayke;;;\nFN:Kayke\nitem1.TEL;waid=5511988887777:+55 11 98888-7777\nitem1.X-ABLabel:Celular\nEND:VCARD",
            },
          }),
          item("contacts", {
            contactsArrayMessage: {
              contacts: [
                { displayName: "Ana", vcard: "TEL;type=CELL:+55 11 1111-1111" },
                { displayName: "Bia" },
              ],
            },
          }),
          item("location", {
            locationMessage: {
              degreesLatitude: -23.5,
              degreesLongitude: -46.6,
              name: "Loja",
            },
          }),
          item("poll", {
            pollCreationMessageV3: {
              name: "Melhor horário?",
              options: [{ optionName: "Manhã" }, { optionName: "Tarde" }],
            },
          }),
        ],
      },
    });

    expect(messages.map((message) => message.messageType)).toEqual([
      "text",
      "text",
      "text",
      "text",
    ]);
    expect(messages.map((message) => message.text)).toEqual([
      "📇 Kayke\n+55 11 98888-7777",
      "📇 Ana\n+55 11 1111-1111\n\n📇 Bia",
      "📍 Loja\nhttps://maps.google.com/?q=-23.5,-46.6",
      "📊 Melhor horário?\n• Manhã\n• Tarde",
    ]);
  });

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

  it("keeps a view-once voice note playable instead of an empty text bubble", () => {
    const [message] = normalizeWhatsmiauEvent({
      event: "messages.upsert",
      instance: "mend-demo",
      data: {
        key: {
          id: "3EB04A9D406D657729A5D4",
          remoteJid: "120363426966918405@g.us",
          fromMe: false,
        },
        pushName: "Guilherme Correa",
        messageType: "audioMessage",
        message: {
          viewOnceMessageV2: {
            message: {
              audioMessage: {
                mimetype: "audio/ogg; codecs=opus",
                seconds: 8,
                ptt: true,
                url: "https://mmg.whatsapp.net/audio.enc",
              },
            },
          },
          mediaUrl: "https://storage.googleapis.com/whatsmiau/voice.ogg",
          base64: Buffer.from([1, 2, 3]).toString("base64"),
        },
      },
    });

    expect(message).toMatchObject({
      messageType: "audio",
      mimeType: "audio/ogg; codecs=opus",
      durationSeconds: 8,
      mediaUrl: "https://storage.googleapis.com/whatsmiau/voice.ogg",
      chatType: "group",
      participantName: "Guilherme Correa",
    });
    expect(message.text).toBeUndefined();
  });

  it("classifies a base64 voice note when the provider omits audioMessage", () => {
    const [message] = normalizeWhatsmiauEvent({
      event: "messages.upsert",
      instance: "mend-demo",
      data: {
        key: {
          id: "audio-base64",
          remoteJid: "5511999999999@s.whatsapp.net",
          fromMe: false,
        },
        messageType: "audioMessage",
        message: {
          base64: Buffer.from([1, 2, 3]).toString("base64"),
          mimetype: "audio/ogg",
        },
      },
    });

    expect(message).toMatchObject({
      messageType: "audio",
      mimeType: "audio/ogg",
    });
    expect(message.text).toBeUndefined();
  });

  it("prefers Whatsmiau's converted media URL over encrypted WhatsApp media", () => {
    const [message] = normalizeWhatsmiauEvent({
      event: "messages.upsert",
      instance: "mend-demo",
      data: {
        key: {
          id: "audio-1",
          remoteJid: "5511999999999@s.whatsapp.net",
          fromMe: false,
        },
        message: {
          audioMessage: {
            mimetype: "audio/ogg; codecs=opus",
            url: "https://mmg.whatsapp.net/audio.enc",
          },
          mediaUrl: "https://storage.googleapis.com/whatsmiau/audio.ogg",
        },
      },
    });

    expect(message.mediaUrl).toBe(
      "https://storage.googleapis.com/whatsmiau/audio.ogg",
    );
  });

  it("does not expose WhatsApp CDN ciphertext as a browser media URL", () => {
    const [message] = normalizeWhatsmiauEvent({
      event: "messages.upsert",
      instance: "mend-demo",
      data: {
        key: {
          id: "image-1",
          remoteJid: "5511999999999@s.whatsapp.net",
        },
        message: {
          imageMessage: {
            mimetype: "image/jpeg",
            url: "https://mmg.whatsapp.net/image",
            mediaKey: Buffer.alloc(32).toString("base64"),
          },
        },
      },
    });

    expect(message.mediaUrl).toBeUndefined();
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
    expect(
      resolveWhatsAppSendDestination({
        phoneNumber: "120363426966918405",
        remoteJid: "120363426966918405@g.us",
      }),
    ).toBe("120363426966918405@g.us");
    expect(
      resolveWhatsAppSendDestination({
        phoneNumber: "5511999999999",
        remoteJid: "5511999999999@s.whatsapp.net",
      }),
    ).toBe("5511999999999");
  });

  it("preserves the group JID when sending text through the provider", async () => {
    const originalFetch = globalThis.fetch;
    let body: Record<string, unknown> | undefined;
    globalThis.fetch = async (_input, init) => {
      body = JSON.parse(String(init?.body)) as Record<string, unknown>;
      return new Response(JSON.stringify({ key: { id: "wamid-out" } }), {
        status: 200,
      });
    };
    try {
      const provider = new WhatsmiauMessagingProvider(
        "https://provider.test/v2",
        "test-key",
      );
      await provider.sendText({
        instanceName: "mend-test",
        number: "120363426966918405@g.us",
        text: "Olá, grupo!",
      });
      expect(body).toEqual({
        number: "120363426966918405@g.us",
        text: "Olá, grupo!",
        delay: undefined,
      });
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("sends contact cards in the provider's vCard shape", async () => {
    const originalFetch = globalThis.fetch;
    let url = "";
    let body: Record<string, unknown> | undefined;
    globalThis.fetch = async (input, init) => {
      url = String(input);
      body = JSON.parse(String(init?.body)) as Record<string, unknown>;
      return new Response(JSON.stringify({ key: { id: "wamid-contact" } }), {
        status: 200,
      });
    };
    try {
      const provider = new WhatsmiauMessagingProvider(
        "https://provider.test/v2",
        "test-key",
      );
      await provider.sendContact({
        instanceName: "mend-test",
        number: "5511999998888@s.whatsapp.net",
        contacts: [
          { fullName: "Ivo Silva", phoneNumber: "5511999997777" },
          {
            fullName: "Ana",
            phoneNumber: "5511888887777",
            email: "ana@example.com",
          },
        ],
      });
      expect(url).toBe(
        "https://provider.test/v2/message/sendContact/mend-test",
      );
      expect(body).toEqual({
        number: "5511999998888",
        contact: [
          { fullName: "Ivo Silva", phoneNumber: "5511999997777" },
          {
            fullName: "Ana",
            phoneNumber: "5511888887777",
            email: "ana@example.com",
          },
        ],
      });
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("keeps the provider instance when webhook setup fails", async () => {
    const originalFetch = globalThis.fetch;
    const calls: string[] = [];
    globalThis.fetch = async (input, init) => {
      const url = String(input);
      calls.push(`${init?.method ?? "GET"} ${url}`);
      if (url.endsWith("/instance/create"))
        return new Response(
          JSON.stringify({
            instanceName: "mend-test",
            state: "closed",
            base64: "data:image/png;base64,qr",
          }),
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
      ).resolves.toMatchObject({
        instanceName: "mend-test",
        qrcode: "data:image/png;base64,qr",
      });
      expect(calls).toEqual([
        "POST https://provider.test/v2/instance/create",
        "POST https://provider.test/v2/webhook/set/mend-test",
      ]);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("normalizes connect QR payloads and ignores empty image responses", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async (input) => {
      const url = String(input);
      if (url.endsWith("/instance/connect/mend-test"))
        return new Response(
          JSON.stringify({
            qrcode: { base64: "data:image/png;base64,abc123" },
            pairingCode: "123-456",
          }),
          { status: 200 },
        );
      if (url.endsWith("/instance/connect/mend-test/image"))
        return new Response(null, { status: 204 });
      if (url.endsWith("/instance/create"))
        return new Response(
          JSON.stringify({
            instanceName: "mend-created",
            state: "connecting",
            base64: "data:image/png;base64,from-create",
          }),
          { status: 200 },
        );
      return new Response(null, { status: 404 });
    };

    try {
      const provider = new WhatsmiauMessagingProvider(
        "https://provider.test/v2",
        "test-key",
      );
      await expect(provider.connectInstance("mend-test")).resolves.toEqual({
        qrcode: "data:image/png;base64,abc123",
        pairingCode: "123-456",
      });
      await expect(provider.getQrCode("mend-test")).resolves.toBeNull();
      await expect(
        provider.createInstance({ instanceName: "mend-created" }),
      ).resolves.toMatchObject({
        instanceName: "mend-created",
        qrcode: "data:image/png;base64,from-create",
      });
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("normalizes nested connection state payloads", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async (input) => {
      const url = String(input);
      if (url.endsWith("/instance/connectionState/mend-test"))
        return new Response(
          JSON.stringify({
            instance: { instanceName: "mend-test", state: "open" },
          }),
          { status: 200 },
        );
      return new Response(null, { status: 404 });
    };

    try {
      const provider = new WhatsmiauMessagingProvider(
        "https://provider.test/v2",
        "test-key",
      );
      await expect(provider.getConnectionState("mend-test")).resolves.toEqual({
        state: "open",
      });
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("creates an instance with only the Whatsmiau Cloud create fields", async () => {
    const originalFetch = globalThis.fetch;
    let createBody: Record<string, unknown> | undefined;
    globalThis.fetch = async (input, init) => {
      const url = String(input);
      if (url.endsWith("/instance/create")) {
        createBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
        return new Response(
          JSON.stringify({ instanceName: "mend-minimal", state: "closed" }),
          { status: 200 },
        );
      }
      return new Response(null, { status: 404 });
    };

    try {
      const provider = new WhatsmiauMessagingProvider(
        "https://provider.test/v2",
        "test-key",
      );
      await provider.createInstance({ instanceName: " mend-minimal " });
      expect(createBody).toEqual({ instanceName: "mend-minimal" });
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

  it("fetches and caches the real group subject", async () => {
    const originalFetch = globalThis.fetch;
    const calls: string[] = [];
    globalThis.fetch = async (input) => {
      calls.push(String(input));
      return new Response(
        JSON.stringify({
          id: "120363426966918405@g.us",
          subject: "[CAÇADOR PRO] Téchne Soluções",
        }),
        { status: 200 },
      );
    };

    try {
      const provider = new WhatsmiauMessagingProvider(
        "https://provider.test/v2",
        "test-key",
      );
      const input = {
        instanceName: "mend-test",
        remoteJid: "120363426966918405@g.us",
      };
      expect(await provider.getGroupInfo(input)).toEqual({
        id: input.remoteJid,
        subject: "[CAÇADOR PRO] Téchne Soluções",
      });
      expect(await provider.getGroupInfo(input)).toEqual({
        id: input.remoteJid,
        subject: "[CAÇADOR PRO] Téchne Soluções",
      });
      expect(calls).toEqual([
        "https://provider.test/v2/group/findGroupInfos/mend-test?groupJid=120363426966918405%40g.us",
      ]);
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

  it("forwards a stable idempotency key for retry-safe text delivery", async () => {
    const originalFetch = globalThis.fetch;
    let headers: Headers | undefined;
    try {
      globalThis.fetch = async (_input, init) => {
        headers = new Headers(init?.headers);
        return new Response(JSON.stringify({ key: { id: "wamid-out" } }), {
          status: 200,
        });
      };
      const provider = new WhatsmiauMessagingProvider(
        "https://provider.test/v2",
        "test-key",
      );
      await provider.sendText({
        instanceName: "mend-test",
        number: "5511999999999",
        text: "The fix is live.",
        idempotencyKey: "mend:customer-response:issue-1",
      });
      expect(headers?.get("idempotency-key")).toBe(
        "mend:customer-response:issue-1",
      );
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

describe("undecrypted provider stub", () => {
  it("matches only the empty unknown message", () => {
    expect(
      isUndecryptedProviderStub({ messageType: "unknown", message: {} }),
    ).toBe(true);
    expect(isUndecryptedProviderStub({ messageType: "unknown" })).toBe(true);
    expect(
      isUndecryptedProviderStub({
        messageType: "conversation",
        message: { conversation: "oi" },
      }),
    ).toBe(false);
    expect(
      isUndecryptedProviderStub({
        messageType: "unknown",
        message: { protocolMessage: { type: 0 } },
      }),
    ).toBe(false);
    expect(
      isUndecryptedProviderStub({
        messageType: "unknown",
        message: {},
        mediaUrl: "https://example.com/a.ogg",
      }),
    ).toBe(false);
    expect(isUndecryptedProviderStub({ message: {} })).toBe(false);
  });
});
