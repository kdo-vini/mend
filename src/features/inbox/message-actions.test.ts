import { describe, expect, it } from "vitest";
import type { Message } from "../../types";
import {
  MESSAGE_EDIT_WINDOW_MS,
  canEditMessage,
  canReplyToMessage,
  replaceVisibleBody,
} from "./message-actions";

const now = Date.parse("2026-10-28T12:00:00.000Z");
const sent: Message = {
  id: "0b8f3c4e-6d1a-4f6e-9a3b-2c1d0e9f8a7b",
  providerMessageId: "wamid-1",
  conversationId: "c-1",
  direction: "outbound",
  sender: "Você",
  text: "Resposta",
  time: "11:58",
  createdAt: new Date(now - 2 * 60 * 1000).toISOString(),
  type: "text",
  status: "delivered",
};

describe("message actions", () => {
  it("edits only a recent text this workspace sent", () => {
    expect(canEditMessage(sent, now)).toBe(true);
    expect(
      canEditMessage(
        {
          ...sent,
          createdAt: new Date(now - MESSAGE_EDIT_WINDOW_MS - 1).toISOString(),
        },
        now,
      ),
    ).toBe(false);
    expect(canEditMessage({ ...sent, direction: "inbound" }, now)).toBe(false);
    expect(canEditMessage({ ...sent, type: "image" }, now)).toBe(false);
    expect(canEditMessage({ ...sent, deleted: true }, now)).toBe(false);
  });

  it("quotes only messages WhatsApp already holds", () => {
    expect(canReplyToMessage({ ...sent, direction: "inbound" })).toBe(true);
    expect(canReplyToMessage({ ...sent, id: "temp:abc" })).toBe(false);
    expect(canReplyToMessage({ ...sent, status: "failed" })).toBe(false);
    expect(canReplyToMessage({ ...sent, providerMessageId: undefined })).toBe(
      false,
    );
  });

  it("keeps the attending intro in front of an edited body", () => {
    expect(
      replaceVisibleBody(
        "_*Lucas está te atendendo*_\n\nResposta antiga",
        "Resposta nova",
      ),
    ).toBe("_*Lucas está te atendendo*_\n\nResposta nova");
    expect(replaceVisibleBody("Resposta antiga", "Nova")).toBe("Nova");
  });
});
