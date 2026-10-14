import { describe, expect, it } from "vitest";
import type { Conversation, Message } from "../../types";
import {
  conversationPreviewText,
  mergeConversationSnapshot,
  stripHumanWhatsAppIntro,
} from "./conversation-snapshot";

describe("conversationPreviewText", () => {
  const labels = {
    empty: "No messages yet",
    audio: "Audio message",
    image: "Image",
    video: "Video",
    document: "Document",
  };

  it("labels an empty audio message instead of the empty-state copy", () => {
    expect(
      conversationPreviewText(
        {
          type: "audio",
          text: "",
          attachment: { name: "voice.ogg", meta: "audio/ogg" },
        },
        labels,
      ),
    ).toBe("Audio message");
  });

  it("keeps a transcript or caption when the media message has text", () => {
    expect(
      conversationPreviewText(
        { type: "audio", text: "Preciso de ajuda" },
        labels,
      ),
    ).toBe("Preciso de ajuda");
  });
});

function message(
  partial: Partial<Message> & Pick<Message, "id" | "direction" | "text">,
): Message {
  return {
    conversationId: "conv-1",
    sender: partial.direction === "inbound" ? "Customer" : "Operator",
    time: "20:00",
    type: "text",
    createdAt: partial.createdAt ?? "2026-09-20T23:00:00.000Z",
    ...partial,
  };
}

const baseConversation: Conversation = {
  id: "conv-1",
  contactId: "contact-1",
  chatType: "direct",
  name: "Lucas Ferreira",
  company: "",
  phone: "+55 11 99999-9999",
  initials: "LF",
  accent: "#2E7DFF",
  unread: 0,
  attention: "none",
  status: "open",
  aiMode: "draft",
  automationState: "human_paused",
  assignee: "Unassigned",
  lastMessage: "",
  lastTime: "now",
  lastMessageAt: "2026-09-20T23:10:00.000Z",
  messages: [],
};

describe("conversation-snapshot", () => {
  it("strips the attending intro from persisted WhatsApp bodies", () => {
    expect(
      stripHumanWhatsAppIntro(
        "_*Vinícius está te atendendo*_\n\nBoa noite, como posso te ajudar ?",
      ),
    ).toBe("Boa noite, como posso te ajudar ?");
    expect(
      stripHumanWhatsAppIntro(
        "*Vinicius* está te atendendo\n\nBoa noite, como posso te ajudar ?",
      ),
    ).toBe("Boa noite, como posso te ajudar ?");
  });

  it("retires optimistic sends when the snapshot body includes the agent intro", () => {
    const current: Conversation[] = [
      {
        ...baseConversation,
        messages: [
          message({
            id: "temp:client-1",
            direction: "outbound",
            text: "Boa noite, como posso te ajudar ?",
            createdAt: "2026-09-20T23:00:00.000Z",
            status: "sending",
          }),
        ],
      },
    ];
    const snapshot: Conversation = {
      ...baseConversation,
      messages: [
        message({
          id: "m-out",
          direction: "outbound",
          text: "_*Vinícius está te atendendo*_\n\nBoa noite, como posso te ajudar ?",
          createdAt: "2026-09-20T23:00:01.000Z",
          status: "sent",
        }),
        message({
          id: "m-in",
          direction: "inbound",
          text: "Meus site está com inconsistência",
          createdAt: "2026-09-20T23:10:00.000Z",
        }),
      ],
    };

    const merged = mergeConversationSnapshot(current, snapshot)[0]!;
    expect(merged.messages.map((item) => item.id)).toEqual(["m-out", "m-in"]);
    expect(merged.messages.some((item) => item.status === "sending")).toBe(
      false,
    );
    expect(merged.messages[0]?.text).toContain("Boa noite");
    expect(merged.messages[1]?.text).toContain("inconsistência");
  });

  it("keeps true in-flight temps and sorts them chronologically", () => {
    const current: Conversation[] = [
      {
        ...baseConversation,
        messages: [
          message({
            id: "m-in",
            direction: "inbound",
            text: "Meus site está com inconsistência",
            createdAt: "2026-09-20T23:10:00.000Z",
          }),
          message({
            id: "temp:still-sending",
            direction: "outbound",
            text: "Ainda estou digitando",
            createdAt: "2026-09-20T23:11:00.000Z",
            status: "sending",
          }),
        ],
      },
    ];
    const snapshot: Conversation = {
      ...baseConversation,
      messages: [
        message({
          id: "m-in",
          direction: "inbound",
          text: "Meus site está com inconsistência",
          createdAt: "2026-09-20T23:10:00.000Z",
        }),
      ],
    };

    const merged = mergeConversationSnapshot(current, snapshot)[0]!;
    expect(merged.messages.map((item) => item.id)).toEqual([
      "m-in",
      "temp:still-sending",
    ]);
  });

  it("preserves older local history when a thin list snapshot arrives after a reply", () => {
    const current: Conversation[] = [
      {
        ...baseConversation,
        messages: [
          message({
            id: "m-1",
            direction: "outbound",
            text: "Boa noite, como posso te ajudar ?",
            createdAt: "2026-09-20T23:00:00.000Z",
            status: "sent",
          }),
          message({
            id: "m-2",
            direction: "inbound",
            text: "Meus site está com inconsistência",
            createdAt: "2026-09-20T23:10:00.000Z",
          }),
        ],
      },
    ];
    // Workspace list refresh only embeds the latest message.
    const snapshot: Conversation = {
      ...baseConversation,
      lastMessage: "Vou verificar",
      messages: [
        message({
          id: "m-3",
          direction: "outbound",
          text: "Vou verificar",
          createdAt: "2026-09-20T23:12:00.000Z",
          status: "sent",
        }),
      ],
    };

    const merged = mergeConversationSnapshot(current, snapshot, {
      partialMessages: true,
    })[0]!;
    expect(merged.messages.map((item) => item.id)).toEqual([
      "m-1",
      "m-2",
      "m-3",
    ]);
    expect(
      merged.messages.map((item) => stripHumanWhatsAppIntro(item.text)),
    ).toEqual([
      "Boa noite, como posso te ajudar ?",
      "Meus site está com inconsistência",
      "Vou verificar",
    ]);
  });

  it("does not shrink a hydrated thread when a thinner snapshot arrives without the flag", () => {
    const current: Conversation[] = [
      {
        ...baseConversation,
        messages: [
          message({
            id: "m-1",
            direction: "outbound",
            text: "Boa noite",
            createdAt: "2026-09-20T23:00:00.000Z",
            status: "sent",
          }),
          message({
            id: "m-2",
            direction: "inbound",
            text: "Meus site está com inconsistência",
            createdAt: "2026-09-20T23:10:00.000Z",
          }),
          message({
            id: "m-3",
            direction: "outbound",
            text: "Vou verificar",
            createdAt: "2026-09-20T23:12:00.000Z",
            status: "sent",
          }),
        ],
      },
    ];
    const snapshot: Conversation = {
      ...baseConversation,
      messages: [
        message({
          id: "m-3",
          direction: "outbound",
          text: "Vou verificar",
          createdAt: "2026-09-20T23:12:00.000Z",
          status: "delivered",
        }),
      ],
    };

    const merged = mergeConversationSnapshot(current, snapshot)[0]!;
    expect(merged.messages).toHaveLength(3);
    expect(merged.messages.map((item) => item.id)).toEqual([
      "m-1",
      "m-2",
      "m-3",
    ]);
    expect(merged.messages[2]?.status).toBe("delivered");
  });

  it("does not retire a fresh send because an older message has the same text", () => {
    const older = message({
      id: "m-old",
      direction: "outbound",
      text: "Obrigado!",
      createdAt: "2026-09-20T10:00:00.000Z",
    });
    const current: Conversation[] = [
      {
        ...baseConversation,
        messages: [
          older,
          message({
            id: "temp:again",
            direction: "outbound",
            text: "Obrigado!",
            createdAt: "2026-09-20T23:00:00.000Z",
            status: "sending",
          }),
        ],
      },
    ];
    const snapshot: Conversation = { ...baseConversation, messages: [older] };

    const merged = mergeConversationSnapshot(current, snapshot)[0]!;
    expect(merged.messages.map((item) => item.id)).toEqual([
      "m-old",
      "temp:again",
    ]);
  });

  it("keeps a failed send until the operator acts on it", () => {
    const current: Conversation[] = [
      {
        ...baseConversation,
        messages: [
          message({
            id: "temp:failed",
            direction: "outbound",
            text: "Pode mandar o print?",
            createdAt: "2026-09-20T23:00:00.000Z",
            status: "failed",
          }),
        ],
      },
    ];
    const snapshot: Conversation = {
      ...baseConversation,
      messages: [
        message({
          id: "m-other-operator",
          direction: "outbound",
          text: "Pode mandar o print?",
          createdAt: "2026-09-20T23:00:05.000Z",
        }),
      ],
    };

    const merged = mergeConversationSnapshot(current, snapshot)[0]!;
    expect(merged.messages.map((item) => item.id)).toContain("temp:failed");
  });

  it("retires an uploading attachment only by its own batch", () => {
    const earlierPhoto = message({
      id: "m-photo-1",
      direction: "outbound",
      text: "",
      type: "image",
      createdAt: "2026-09-20T22:59:00.000Z",
    });
    const current: Conversation[] = [
      {
        ...baseConversation,
        messages: [
          message({
            id: "temp:photo-2",
            direction: "outbound",
            text: "",
            type: "image",
            mediaBatchId: "batch-2",
            createdAt: "2026-09-20T23:00:00.000Z",
            status: "sending",
          }),
        ],
      },
    ];

    // Another caption-less photo the thread had not loaded yet is not this one.
    const unrelated = mergeConversationSnapshot(current, {
      ...baseConversation,
      messages: [earlierPhoto],
    })[0]!;
    expect(unrelated.messages.map((item) => item.id)).toContain("temp:photo-2");

    const persisted = mergeConversationSnapshot(current, {
      ...baseConversation,
      messages: [
        earlierPhoto,
        message({
          id: "m-photo-2",
          direction: "outbound",
          text: "",
          type: "image",
          mediaBatchId: "batch-2",
          createdAt: "2026-09-20T23:00:03.000Z",
        }),
      ],
    })[0]!;
    expect(persisted.messages.map((item) => item.id)).toEqual([
      "m-photo-1",
      "m-photo-2",
    ]);
  });
});
