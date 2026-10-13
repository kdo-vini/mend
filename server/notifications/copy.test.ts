import { describe, expect, it } from "vitest";
import { buildNotificationCopy } from "./copy.js";

describe("buildNotificationCopy", () => {
  it("localizes human escalation in Portuguese", () => {
    const copy = buildNotificationCopy("ai.human_escalation", "pt-BR", {
      summary: "Cliente pediu renovação do plano",
    });
    expect(copy?.title).toBe("IA encaminhou para atendimento humano");
    expect(copy?.body).toContain("Cliente pediu renovação do plano");
    expect(copy?.titleKey).toBe("aiHumanEscalationTitle");
  });

  it("localizes bug reported in English", () => {
    const copy = buildNotificationCopy("ai.bug_reported", "en-US", {
      identifier: "TEC-9",
      summary: "Checkout fails",
    });
    expect(copy?.title).toBe("Bug reported in TEC-9");
    expect(copy?.body).toContain("Checkout fails");
  });

  it("builds a localized inbound message push with a preview", () => {
    const pt = buildNotificationCopy("inbox.message_received", "pt-BR", {
      contact: "Ana",
      preview: "Oi, preciso de ajuda",
    });
    expect(pt?.title).toBe("Nova mensagem");
    expect(pt?.body).toBe("Ana: Oi, preciso de ajuda");
    const en = buildNotificationCopy("inbox.message_received", "en-US", {
      contact: "Ana",
    });
    expect(en?.title).toBe("New message");
    expect(en?.body).toBe("Ana: Sent an attachment");
    expect(
      buildNotificationCopy("inbox.message_received", "pt-BR", {})?.body,
    ).toBe("Enviou um anexo");
  });
});
