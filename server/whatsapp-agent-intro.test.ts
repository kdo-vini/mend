import { describe, expect, it } from "vitest";
import {
  replaceHumanWhatsAppBody,
  agentAttendingLine,
  agentFirstName,
  formatHumanWhatsAppText,
} from "./whatsapp-agent-intro.js";

describe("whatsapp-agent-intro", () => {
  it("uses the first name from a display name", () => {
    expect(agentFirstName("Lucas Silva")).toBe("Lucas");
    expect(agentFirstName("  Ana  ")).toBe("Ana");
    expect(agentFirstName("")).toBe("");
  });

  it("builds italic+bold attending intros on the whole phrase", () => {
    expect(agentAttendingLine("Vinícius Silva")).toBe(
      "_*Vinícius está te atendendo*_",
    );
    // Never bold only the name.
    expect(agentAttendingLine("Vinicius")).not.toMatch(/^\*[^*]+\* está/);
  });

  it("places the agent intro above the reply body", () => {
    expect(formatHumanWhatsAppText("Lucas", "Boa tarde!")).toBe(
      "_*Lucas está te atendendo*_\n\nBoa tarde!",
    );
    expect(formatHumanWhatsAppText("Lucas Silva", "Olá!")).toBe(
      "_*Lucas está te atendendo*_\n\nOlá!",
    );
  });

  it("skips the intro when includeIntro is false", () => {
    expect(
      formatHumanWhatsAppText("Lucas", "Boa tarde!", {
        includeIntro: false,
      }),
    ).toBe("Boa tarde!");
  });

  it("upgrades a legacy name-only-bold intro to the whole-phrase format", () => {
    expect(
      formatHumanWhatsAppText(
        "Vinicius",
        "*Vinicius* está te atendendo\n\nBoa tarde!",
      ),
    ).toBe("_*Vinicius está te atendendo*_\n\nBoa tarde!");
  });

  it("does not stack the intro on retries that already include it", () => {
    const once = formatHumanWhatsAppText("Lucas", "Boa tarde!");
    expect(formatHumanWhatsAppText("Lucas", once)).toBe(once);
  });

  it("falls through when the agent name is empty", () => {
    expect(formatHumanWhatsAppText("   ", "Boa tarde!")).toBe("Boa tarde!");
  });
});

describe("replaceHumanWhatsAppBody", () => {
  it("keeps the attending intro the customer already saw", () => {
    expect(
      replaceHumanWhatsAppBody(
        "_*Lucas está te atendendo*_\n\nResposta antiga",
        "Resposta nova",
      ),
    ).toBe("_*Lucas está te atendendo*_\n\nResposta nova");
  });

  it("sends only the new body when the message had no intro", () => {
    expect(replaceHumanWhatsAppBody("Resposta antiga", " Nova ")).toBe("Nova");
  });
});
