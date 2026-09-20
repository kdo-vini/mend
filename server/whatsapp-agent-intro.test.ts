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

  it("builds the attending intro in pt-BR and en-US", () => {
    expect(agentAttendingLine("Lucas Silva", "pt-BR")).toBe(
      "*Lucas* está te atendendo",
    );
    expect(agentAttendingLine("Lucas Silva", "en-US")).toBe(
      "*Lucas* is assisting you",
    );
  });

  it("places the agent intro above the reply body", () => {
    expect(formatHumanWhatsAppText("Lucas", "Boa tarde!", "pt-BR")).toBe(
      "*Lucas* está te atendendo\n\nBoa tarde!",
    );
    expect(
      formatHumanWhatsAppText("Lucas Silva", "Hello there", "en-US"),
    ).toBe("*Lucas* is assisting you\n\nHello there");
  });

  it("does not stack the intro on retries that already include it", () => {
    const once = formatHumanWhatsAppText("Lucas", "Boa tarde!", "pt-BR");
    expect(formatHumanWhatsAppText("Lucas", once, "pt-BR")).toBe(once);
  });

  it("falls through when the agent name is empty", () => {
    expect(formatHumanWhatsAppText("   ", "Boa tarde!", "pt-BR")).toBe(
      "Boa tarde!",
    );
  });
});
