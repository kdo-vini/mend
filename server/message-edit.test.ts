import { describe, expect, it } from "vitest";
import { extractProviderMessageEdit } from "../supabase/functions/whats-mend-webhook/message-edit.js";

const edited = (data: Record<string, unknown>) => ({
  event: "messages.edited",
  instance: "Atendimento01",
  data: {
    key: {
      remoteJid: "5511999999999@s.whatsapp.net",
      id: "3EB04A2D1F75",
      fromMe: false,
    },
    messageType: "conversation",
    status: "received",
    ...data,
  },
});

describe("Whatsmiau messages.edited payload", () => {
  it("targets the original message id and carries the new text", () => {
    expect(
      extractProviderMessageEdit(
        edited({ editedMessage: { conversation: "Texto editado" } }),
      ),
    ).toEqual({ providerMessageId: "3EB04A2D1F75", text: "Texto editado" });
  });

  it("reads extended text and nested message wrappers", () => {
    expect(
      extractProviderMessageEdit(
        edited({
          editedMessage: { extendedTextMessage: { text: "Com link" } },
        }),
      )?.text,
    ).toBe("Com link");
    expect(
      extractProviderMessageEdit(
        edited({ editedMessage: { message: { conversation: "Aninhado" } } }),
      )?.text,
    ).toBe("Aninhado");
  });

  it("reads an edited media caption", () => {
    expect(
      extractProviderMessageEdit(
        edited({
          messageType: "imageMessage",
          editedMessage: { imageMessage: { caption: "Nova legenda" } },
        }),
      )?.text,
    ).toBe("Nova legenda");
  });

  it("ignores payloads without an id or readable content", () => {
    expect(
      extractProviderMessageEdit({
        data: { editedMessage: { conversation: "sem id" } },
      }),
    ).toBeNull();
    expect(
      extractProviderMessageEdit(edited({ editedMessage: {} })),
    ).toBeNull();
    expect(extractProviderMessageEdit({ event: "messages.edited" })).toBeNull();
  });
});
