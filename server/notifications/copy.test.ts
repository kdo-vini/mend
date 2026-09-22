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
});
