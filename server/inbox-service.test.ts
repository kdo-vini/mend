import { describe, expect, it, vi } from "vitest";
import { InMemoryMediaStorage } from "./media.js";
import {
  InboxService,
  extractProviderMessageUpdate,
  type InboxMessageRecord,
  type ConversationStateRecord,
  type InboxConversationContext,
  type InboxIngestPortInput,
  type InboxIngestPortResult,
  type InboxPort,
} from "./inbox-service.js";
import { WhatsAppService, type WhatsAppProvider } from "./whatsapp-service.js";

const workspaceId = "11111111-1111-4111-8111-111111111111";
const otherWorkspaceId = "22222222-2222-4222-8222-222222222222";
const channelId = "33333333-3333-4333-8333-333333333333";
const conversationId = "44444444-4444-4444-8444-444444444444";
const issueId = "55555555-5555-4555-8555-555555555555";

type FakeContact = {
  id: string;
  workspaceId: string;
  phoneNumber: string;
  displayName: string;
};
type FakeConversation = InboxConversationContext & {
  unreadCount: number;
  status: string;
  lastInbound?: string;
};
type FakeMessage = {
  id: string;
  workspaceId: string;
  conversationId: string;
  channelConnectionId: string;
  providerMessageId: string;
  direction: "inbound" | "outbound";
  messageType: string;
  storagePath?: string;
  remoteJid: string;
  providerStatus?: string;
  isDeleted?: boolean;
  aiGenerated?: boolean;
  remoteUrl?: string;
  text?: string;
  mimeType?: string;
  fileName?: string;
  transcriptionStatus?: "processing" | "ready" | "failed";
  transcriptionErrorCode?: string;
};

class FakeInboxPort implements InboxPort {
  readonly contacts = new Map<string, FakeContact>();
  readonly conversations = new Map<string, FakeConversation>();
  readonly messages = new Map<string, FakeMessage>();
  readonly timelineKeys = new Set<string>();
  readonly links = new Set<string>();
  readonly evidence: Array<{
    id: string;
    issueId: string;
    messageId?: string;
    storagePath?: string;
  }> = [];
  readonly notifications: Array<{ workspaceId: string; dedupeKey?: string }> =
    [];
  private sequence = 0;

  async ingestMessage(
    input: InboxIngestPortInput,
  ): Promise<InboxIngestPortResult> {
    const contactKey = `${input.workspaceId}:${input.phoneNumber}`;
    let contact = this.contacts.get(contactKey);
    if (!contact) {
      contact = {
        id: `contact-${++this.sequence}`,
        workspaceId: input.workspaceId,
        phoneNumber: input.phoneNumber,
        displayName: input.displayName ?? "WhatsApp contact",
      };
      this.contacts.set(contactKey, contact);
    }
    if (input.displayName?.trim())
      contact.displayName = input.displayName.trim();
    const conversationKey = `${input.workspaceId}:${input.channelConnectionId}:${contact.id}`;
    let conversation = this.conversations.get(conversationKey);
    if (!conversation) {
      conversation = {
        id:
          input.workspaceId === workspaceId
            ? conversationId
            : `conversation-${++this.sequence}`,
        workspaceId: input.workspaceId,
        channelConnectionId: input.channelConnectionId,
        providerInstanceName: "mend-demo",
        remoteJid: `${input.phoneNumber}@s.whatsapp.net`,
        phoneNumber: input.phoneNumber,
        contactId: contact.id,
        contactName: contact.displayName,
        status: "open",
        unreadCount: 0,
      };
      this.conversations.set(conversationKey, conversation);
    }
    const messageKey = `${input.workspaceId}:${input.channelConnectionId}:${input.providerMessageId}`;
    const existing = this.messages.get(messageKey);
    if (existing)
      return {
        id: existing.id,
        workspaceId: input.workspaceId,
        conversationId: existing.conversationId,
        contactId: contact.id,
        providerMessageId: input.providerMessageId,
        unreadCount: conversation.unreadCount,
        inserted: false,
      };
    const id = `message-${++this.sequence}`;
    this.messages.set(messageKey, {
      id,
      workspaceId: input.workspaceId,
      conversationId: conversation.id,
      channelConnectionId: input.channelConnectionId,
      providerMessageId: input.providerMessageId,
      direction: input.direction,
      messageType: input.messageType,
      remoteJid: conversation.remoteJid,
      ...(input.mediaStoragePath
        ? { storagePath: input.mediaStoragePath }
        : {}),
      ...(input.mediaRemoteUrl ? { remoteUrl: input.mediaRemoteUrl } : {}),
      ...(input.aiGenerated ? { aiGenerated: true } : {}),
      ...(input.text ? { text: input.text } : {}),
      ...(input.mimeType ? { mimeType: input.mimeType } : {}),
      ...(input.fileName ? { fileName: input.fileName } : {}),
    });
    if (input.direction === "inbound") {
      conversation.unreadCount += 1;
      conversation.lastInbound = input.providerTimestamp;
      conversation.status = "open";
    }
    this.timelineKeys.add(input.timelineKey);
    return {
      id,
      workspaceId: input.workspaceId,
      conversationId: conversation.id,
      contactId: contact.id,
      providerMessageId: input.providerMessageId,
      unreadCount: conversation.unreadCount,
      inserted: true,
    };
  }

  async updateProviderMessage(
    input: Parameters<NonNullable<InboxPort["updateProviderMessage"]>>[0],
  ) {
    const message = [...this.messages.values()].find(
      (candidate) =>
        candidate.workspaceId === input.workspaceId &&
        candidate.channelConnectionId === input.channelConnectionId &&
        candidate.providerMessageId === input.providerMessageId,
    );
    if (!message) return null;
    if (input.providerStatus) message.providerStatus = input.providerStatus;
    if (input.isDeleted) message.isDeleted = true;
    const conversation = [...this.conversations.values()].find(
      (item) =>
        item.id === message.conversationId &&
        item.workspaceId === input.workspaceId,
    );
    return {
      id: message.id,
      workspaceId: input.workspaceId,
      conversationId: message.conversationId,
      contactId: conversation?.contactId ?? "",
      providerMessageId: message.providerMessageId,
      direction: message.direction,
      messageType: message.messageType as InboxMessageRecord["messageType"],
      unreadCount: conversation?.unreadCount ?? 0,
      inserted: false,
      ...(message.providerStatus
        ? { providerStatus: message.providerStatus }
        : {}),
      ...(message.isDeleted !== undefined
        ? { isDeleted: message.isDeleted }
        : {}),
    };
  }

  async getConversationContext(workspaceIdInput: string, id: string) {
    return (
      [...this.conversations.values()].find(
        (conversation) =>
          conversation.workspaceId === workspaceIdInput &&
          conversation.id === id,
      ) ?? null
    );
  }

  async getLatestInbound(workspaceIdInput: string, id: string) {
    const conversation = await this.getConversationContext(
      workspaceIdInput,
      id,
    );
    if (!conversation) return null;
    const message = [...this.messages.values()]
      .reverse()
      .find(
        (candidate) =>
          candidate.workspaceId === workspaceIdInput &&
          candidate.conversationId === id &&
          candidate.direction === "inbound",
      );
    return message
      ? {
          providerMessageId: message.providerMessageId,
          remoteJid: message.remoteJid,
        }
      : null;
  }

  async setConversationState(
    input: Parameters<InboxPort["setConversationState"]>[0],
  ): Promise<ConversationStateRecord> {
    const conversation = await this.getConversationContext(
      input.workspaceId,
      input.conversationId,
    );
    if (!conversation) throw new Error("conversation_not_found");
    if (input.action === "read" || input.action === "resolve")
      conversation.unreadCount = 0;
    if (input.action === "unread")
      conversation.unreadCount = Math.max(1, conversation.unreadCount);
    if (input.action === "snooze") conversation.status = "snoozed";
    if (input.action === "resolve") conversation.status = "resolved";
    if (input.action === "unread") conversation.status = "open";
    this.timelineKeys.add(input.timelineKey);
    return {
      id: conversation.id,
      workspaceId: conversation.workspaceId,
      status: conversation.status,
      attentionState: conversation.unreadCount ? "needs_attention" : "none",
      unreadCount: conversation.unreadCount,
      ...(input.action === "snooze"
        ? { snoozedUntil: input.snoozedUntil }
        : {}),
    };
  }

  async attachMessageMedia(
    input: Parameters<InboxPort["attachMessageMedia"]>[0],
  ) {
    const message = [...this.messages.values()].find(
      (candidate) =>
        candidate.id === input.messageId &&
        candidate.workspaceId === input.workspaceId,
    );
    if (!message) throw new Error("message_not_found");
    message.storagePath = input.storagePath;
  }

  async linkIssueMessage(input: Parameters<InboxPort["linkIssueMessage"]>[0]) {
    const key = `${input.workspaceId}:${input.issueId}:${input.messageId}`;
    const inserted = !this.links.has(key);
    this.links.add(key);
    this.timelineKeys.add(input.timelineKey);
    return { inserted };
  }

  async setMessageText(
    input: Parameters<NonNullable<InboxPort["setMessageText"]>>[0],
  ) {
    const message = [...this.messages.values()].find(
      (candidate) =>
        candidate.id === input.messageId &&
        candidate.workspaceId === input.workspaceId,
    );
    if (!message) throw new Error("message_not_found");
    message.text = input.text;
  }

  async getStoredAudioMessage(input: {
    workspaceId: string;
    messageId: string;
  }) {
    const message = [...this.messages.values()].find(
      (candidate) =>
        candidate.id === input.messageId &&
        candidate.workspaceId === input.workspaceId,
    );
    if (!message) return null;
    return {
      id: message.id,
      workspaceId: message.workspaceId,
      direction: message.direction,
      messageType: message.messageType as InboxMessageRecord["messageType"],
      text: message.text,
      mediaStoragePath: message.storagePath,
      mimeType: message.mimeType,
      fileName: message.fileName,
    };
  }

  async setMessageTranscriptionStatus(input: {
    workspaceId: string;
    messageId: string;
    status: "processing" | "ready" | "failed";
    errorCode?: string;
  }) {
    const message = [...this.messages.values()].find(
      (candidate) =>
        candidate.id === input.messageId &&
        candidate.workspaceId === input.workspaceId,
    );
    if (!message) throw new Error("message_not_found");
    message.transcriptionStatus = input.status;
    message.transcriptionErrorCode = input.errorCode;
  }

  async createEvidence(input: Parameters<InboxPort["createEvidence"]>[0]) {
    const item = {
      id: `evidence-${++this.sequence}`,
      issueId: input.issueId,
      ...(input.evidence.messageId
        ? { messageId: input.evidence.messageId }
        : {}),
      ...(input.evidence.storagePath
        ? { storagePath: input.evidence.storagePath }
        : {}),
    };
    this.evidence.push(item);
    this.timelineKeys.add(input.timelineKey);
    return {
      id: item.id,
      workspaceId: input.workspaceId,
      issueId: input.issueId,
      messageId: item.messageId ?? null,
    };
  }

  async getMediaPath(input: {
    workspaceId: string;
    messageId?: string;
    evidenceId?: string;
  }) {
    if (input.messageId)
      return (
        [...this.messages.values()].find(
          (message) =>
            message.id === input.messageId &&
            message.workspaceId === input.workspaceId,
        )?.storagePath ?? null
      );
    return (
      this.evidence.find((item) => item.id === input.evidenceId)?.storagePath ??
      null
    );
  }

  async createNotification(
    input: Parameters<InboxPort["createNotification"]>[0],
  ) {
    this.notifications.push({
      workspaceId: input.workspaceId,
      dedupeKey: input.dedupeKey,
    });
  }
}

function inbound(providerMessageId = "wamid-in-1") {
  return {
    instanceName: "mend-demo",
    providerMessageId,
    remoteJid: "5511999999999@s.whatsapp.net",
    phoneNumber: "5511999999999",
    direction: "inbound" as const,
    messageType: "text" as const,
    text: "senha super-secreta",
    contactName: "Ana",
    providerTimestamp: "2026-08-03T12:00:00.000Z",
    raw: { token: "must-not-persist" },
  };
}

describe("InboxService and WhatsAppService", () => {
  it("persists a normalized inbound message once and scopes the conversation to its workspace", async () => {
    const port = new FakeInboxPort();
    const inbox = new InboxService(port);
    const first = await inbox.persistNormalizedMessage(
      { workspaceId },
      channelId,
      inbound(),
    );
    const duplicate = await inbox.persistNormalizedMessage(
      { workspaceId },
      channelId,
      inbound(),
    );

    expect(first).toMatchObject({
      inserted: true,
      unreadCount: 1,
      conversationId,
    });
    expect(duplicate).toMatchObject({
      inserted: false,
      unreadCount: 1,
      conversationId,
    });
    expect(port.contacts.size).toBe(1);
    expect(port.messages.size).toBe(1);
    expect(port.timelineKeys.size).toBe(1);
    expect(
      await inbox.getConversation(
        { workspaceId: otherWorkspaceId },
        conversationId,
      ),
    ).toBeNull();
  });

  it("never replaces an inbound contact name with the connected WhatsApp account name", async () => {
    const port = new FakeInboxPort();
    const inbox = new InboxService(port);

    await inbox.persistNormalizedMessage({ workspaceId }, channelId, {
      ...inbound("wamid-inbound-name"),
      contactName: "Juliana Lamber",
    });
    await inbox.persistNormalizedMessage({ workspaceId }, channelId, {
      ...inbound("wamid-outbound-echo"),
      direction: "outbound",
      contactName: "Téchne Sistemas",
    });

    expect([...port.contacts.values()][0].displayName).toBe("Juliana Lamber");
  });

  it("handles provider receipts without inserting a phantom message or persisting a provider media URL", async () => {
    const port = new FakeInboxPort();
    const inbox = new InboxService(port);
    await inbox.persistNormalizedMessage({ workspaceId }, channelId, inbound());
    const receipt = await inbox.persistNormalizedMessage(
      { workspaceId },
      channelId,
      { ...inbound(), raw: { update: { status: 4 } }, text: undefined },
    );

    expect(extractProviderMessageUpdate({ update: { status: 4 } })).toEqual({
      providerStatus: "delivered",
    });
    expect(extractProviderMessageUpdate({ status: "DELETED" })).toEqual({
      isDeleted: true,
    });
    expect(
      extractProviderMessageUpdate({
        message: { conversation: "Nos vemos lá" },
        status: "sent",
      }),
    ).toBeNull();
    expect(receipt).toMatchObject({
      inserted: false,
      providerStatus: "delivered",
    });
    expect(port.messages.size).toBe(1);
    const outbound = await inbox.persistNormalizedMessage(
      { workspaceId },
      channelId,
      {
        ...inbound("wamid-outbound-upsert"),
        remoteJid: "120363426966918405@g.us",
        phoneNumber: "120363426966918405",
        direction: "outbound",
        text: "Nos vemos lá",
        contactName: "Téchne Sistemas",
        raw: {
          message: { conversation: "Nos vemos lá" },
          status: "sent",
        },
      },
    );
    expect(outbound).toMatchObject({ inserted: true, direction: "outbound" });
    expect(port.messages.size).toBe(2);
    const deleted = await inbox.persistNormalizedMessage(
      { workspaceId },
      channelId,
      { ...inbound(), raw: { deleted: true }, text: undefined },
    );
    expect(deleted).toMatchObject({ inserted: false, isDeleted: true });

    const media = await inbox.persistNormalizedMessage(
      { workspaceId },
      channelId,
      {
        ...inbound("wamid-media"),
        messageType: "image",
        mediaUrl: "https://provider.example/temporary",
        mimeType: "image/png",
        fileName: "proof.png",
        text: undefined,
      },
    );
    const stored = [...port.messages.values()].find(
      (message) => message.id === media.id,
    );
    expect(stored?.remoteUrl).toBeUndefined();
  });

  it("stores a playable inbound audio and sends its transcript to the message context", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn(
      async () =>
        new Response(new Uint8Array([1, 2, 3]), {
          headers: { "content-type": "audio/ogg" },
        }),
    );
    try {
      const port = new FakeInboxPort();
      const transcriber = {
        transcribe: vi.fn(async () => "Preciso de ajuda com o pedido"),
      };
      const inbox = new InboxService(port, {
        mediaStorage: new InMemoryMediaStorage(),
        transcriber,
      });
      const result = await inbox.persistNormalizedMessage(
        { workspaceId },
        channelId,
        {
          ...inbound("wamid-audio"),
          messageType: "audio",
          text: undefined,
          mediaUrl: "https://provider.example/audio.ogg",
          mimeType: "audio/ogg",
          fileName: "voice.ogg",
        },
      );

      expect(result.transcript).toBe("Preciso de ajuda com o pedido");
      expect(transcriber.transcribe).toHaveBeenCalledWith(
        expect.objectContaining({ mimeType: "audio/ogg" }),
      );
      expect(
        [...port.messages.values()].find((message) => message.id === result.id)
          ?.text,
      ).toBe("Preciso de ajuda com o pedido");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("retranscribes an existing stored inbound audio and persists its status", async () => {
    const port = new FakeInboxPort();
    const storage = new InMemoryMediaStorage();
    const storagePath = `${workspaceId}/${conversationId}/audio.ogg`;
    await storage.upload(storagePath, {
      data: new Uint8Array([1, 2, 3]),
      mimeType: "audio/ogg",
      fileName: "audio.ogg",
      size: 3,
    });
    const message = await port.ingestMessage({
      workspaceId,
      channelConnectionId: channelId,
      phoneNumber: "5511999999999",
      providerMessageId: "wamid-existing-audio",
      direction: "inbound",
      senderType: "contact",
      messageType: "audio",
      mediaStoragePath: storagePath,
      mimeType: "audio/ogg",
      fileName: "audio.ogg",
      actorType: "system",
      timelineKey: "whatsapp:existing-audio",
      metadata: {},
    });
    const transcriber = {
      transcribe: vi.fn(async () => "Transcrição recuperada"),
    };
    const inbox = new InboxService(port, {
      mediaStorage: storage,
      transcriber,
    });

    await expect(
      inbox.retranscribeStoredAudio({ workspaceId }, message.id),
    ).resolves.toBe("Transcrição recuperada");
    expect(transcriber.transcribe).toHaveBeenCalledWith(
      expect.objectContaining({ mimeType: "audio/ogg", fileName: "audio.ogg" }),
    );
    const stored = [...port.messages.values()].find(
      (candidate) => candidate.id === message.id,
    );
    expect(stored?.text).toBe("Transcrição recuperada");
    expect(stored?.transcriptionStatus).toBe("ready");
  });

  it("supports read, unread, snooze and resolve transitions with workspace scoping", async () => {
    const port = new FakeInboxPort();
    const inbox = new InboxService(port);
    await inbox.persistNormalizedMessage({ workspaceId }, channelId, inbound());
    expect(
      (
        await inbox.readConversation(
          { workspaceId, actorUserId: "user-1" },
          conversationId,
        )
      ).unreadCount,
    ).toBe(0);
    expect(
      (await inbox.markUnread({ workspaceId }, conversationId)).unreadCount,
    ).toBe(1);
    const until = new Date(Date.now() + 60_000);
    expect(
      (await inbox.snoozeConversation({ workspaceId }, conversationId, until))
        .status,
    ).toBe("snoozed");
    expect(
      (await inbox.resolveConversation({ workspaceId }, conversationId)).status,
    ).toBe("resolved");
    await expect(
      inbox.readConversation({ workspaceId: otherWorkspaceId }, conversationId),
    ).rejects.toThrow("conversation_not_found");
  });

  it("links issue evidence and rejects storage paths from another workspace", async () => {
    const port = new FakeInboxPort();
    const inbox = new InboxService(port);
    const message = await inbox.persistNormalizedMessage(
      { workspaceId },
      channelId,
      inbound(),
    );
    expect(
      await inbox.linkIssueMessage({ workspaceId }, issueId, message.id),
    ).toEqual({ inserted: true });
    expect(
      await inbox.linkIssueMessage({ workspaceId }, issueId, message.id),
    ).toEqual({ inserted: false });
    const evidence = await inbox.addEvidence({ workspaceId }, issueId, {
      kind: "message",
      label: "Customer message",
      messageId: message.id,
    });
    expect(evidence).toMatchObject({
      workspaceId,
      issueId,
      messageId: message.id,
    });
    await expect(
      inbox.addEvidence({ workspaceId }, issueId, {
        kind: "file",
        label: "cross-tenant",
        storagePath: `${otherWorkspaceId}/proof.png`,
      }),
    ).rejects.toThrow("evidence_storage_scope_violation");
  });

  it("sends text/media through a fake provider, persists outbound messages and marks provider receipts read", async () => {
    const port = new FakeInboxPort();
    const storage = new InMemoryMediaStorage();
    const inbox = new InboxService(port, { mediaStorage: storage });
    await inbox.persistNormalizedMessage({ workspaceId }, channelId, inbound());
    const provider: WhatsAppProvider = {
      sendPresence: vi.fn(async () => undefined),
      sendText: vi.fn(async () => ({ key: { id: "wamid-out-text" } })),
      sendMedia: vi.fn(async () => ({ key: { id: "wamid-out-media" } })),
      sendAudio: vi.fn(async () => ({ key: { id: "wamid-out-audio" } })),
      markAsRead: vi.fn(async () => undefined),
    };
    const whatsapp = new WhatsAppService(inbox, provider, storage);
    const text = await whatsapp.sendText(
      { workspaceId, actorUserId: "user-1", actorType: "user" },
      conversationId,
      { text: "Olá, Ana", aiGenerated: true },
    );
    const media = await whatsapp.sendMedia(
      { workspaceId, actorUserId: "user-1", actorType: "user" },
      conversationId,
      {
        media: new Uint8Array([1, 2, 3]),
        mimeType: "image/png",
        fileName: "proof.png",
        caption: "Comprovante",
      },
    );

    expect(text.providerMessageId).toBe("wamid-out-text");
    expect(
      [...port.messages.values()].find(
        (message) => message.providerMessageId === text.providerMessageId,
      )?.aiGenerated,
    ).toBe(true);
    expect(media.mediaStoragePath).toMatch(
      new RegExp(`^${workspaceId}/${conversationId}/`),
    );
    expect(provider.sendText).toHaveBeenCalledWith(
      expect.objectContaining({
        instanceName: "mend-demo",
        number: "5511999999999",
        text: "Olá, Ana",
      }),
    );
    expect(provider.sendPresence).toHaveBeenCalledWith(
      "mend-demo",
      "5511999999999",
    );
    expect(provider.sendMedia).toHaveBeenCalledWith(
      expect.objectContaining({ mediatype: "image", caption: "Comprovante" }),
    );
    await whatsapp.markRead({ workspaceId }, conversationId);
    expect(provider.markAsRead).toHaveBeenCalledWith(
      "mend-demo",
      "5511999999999@s.whatsapp.net",
      "wamid-in-1",
    );
    expect(
      (
        await inbox.createSignedMediaUrl(
          { workspaceId },
          { messageId: media.message.id },
        )
      ).startsWith("memory://signed/"),
    ).toBe(true);
  });
});
