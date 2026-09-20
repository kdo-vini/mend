import { describe, expect, it } from "vitest";
import {
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

  it("builds italic+bold attending intros in pt-BR and en-US", () => {
    expect(agentAttendingLine("Lucas Silva", "pt-BR")).toBe(
      "_*Lucas está te atendendo*_",
    );
    expect(agentAttendingLine("Lucas Silva", "en-US")).toBe(
      "_*Lucas is assisting you*_",
    );
  });

  it("places the agent intro above the reply body", () => {
    expect(formatHumanWhatsAppText("Lucas", "Boa tarde!", "pt-BR")).toBe(
      "_*Lucas está te atendendo*_\n\nBoa tarde!",
    );
    expect(
      formatHumanWhatsAppText("Lucas Silva", "Hello there", "en-US"),
    ).toBe("_*Lucas is assisting you*_\n\nHello there");
  });

  it("skips the intro when includeIntro is false", () => {
    expect(
      formatHumanWhatsAppText("Lucas", "Boa tarde!", "pt-BR", {
        includeIntro: false,
      }),
    ).toBe("Boa tarde!");
  });

  it("does not stack the intro on retries that already include it", () => {
    const once = formatHumanWhatsAppText("Lucas", "Boa tarde!", "pt-BR");
    expect(formatHumanWhatsAppText("Lucas", once, "pt-BR")).toBe(once);
    expect(
      formatHumanWhatsAppText(
        "Lucas",
        "*Lucas* está te atendendo\n\nBoa tarde!",
        "pt-BR",
      ),
    ).toBe("*Lucas* está te atendendo\n\nBoa tarde!");
  });

  it("falls through when the agent name is empty", () => {
    expect(formatHumanWhatsAppText("   ", "Boa tarde!", "pt-BR")).toBe(
      "Boa tarde!",
    );
  });
});
