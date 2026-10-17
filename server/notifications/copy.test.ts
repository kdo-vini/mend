import { describe, expect, it } from "vitest";
import { buildNotificationCopy } from "./copy.js";

describe("buildNotificationCopy", () => {
  it("localizes human escalation in Portuguese", () => {
    const copy = buildNotificationCopy("ai.human_escalation", {
      summary: "Cliente pediu renovação do plano",
    });
    expect(copy?.title).toBe("IA encaminhou para atendimento humano");
    expect(copy?.body).toContain("Cliente pediu renovação do plano");
    expect(copy?.titleKey).toBe("aiHumanEscalationTitle");
  });

  it("builds bug reported copy in Portuguese", () => {
    const copy = buildNotificationCopy("ai.bug_reported", {
      identifier: "TEC-9",
      summary: "Checkout falha",
    });
    expect(copy?.title).toBe("Bug reportado em TEC-9");
    expect(copy?.body).toContain("Checkout falha");
  });

  it("builds a localized inbound message push with a preview", () => {
    const pt = buildNotificationCopy("inbox.message_received", {
      contact: "Ana",
      preview: "Oi, preciso de ajuda",
    });
    expect(pt?.title).toBe("Nova mensagem");
    expect(pt?.body).toBe("Ana: Oi, preciso de ajuda");
    const attachment = buildNotificationCopy("inbox.message_received", {
      contact: "Ana",
    });
    expect(attachment?.body).toBe("Ana: Enviou um anexo");
    expect(buildNotificationCopy("inbox.message_received", {})?.body).toBe(
      "Enviou um anexo",
    );
  });
});
