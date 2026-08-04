import { describe, expect, it } from "vitest";
import {
  gateAiAction,
  parseTriageOutput,
  triageConversation,
  type TriageResult,
} from "./triage.js";
import type { SupportAiProvider } from "./providers.js";

const validTriage: TriageResult = {
  intent: "question",
  priority: "low",
  confidence: 0.94,
  summary: "The customer asks how to export a report.",
  unsafe: false,
};

describe("support triage", () => {
  it("validates structured output and accepts a fenced JSON response", () => {
    expect(
      parseTriageOutput(
        `Here is the result:\n\`\`\`json\n${JSON.stringify(validTriage)}\n\`\`\``,
      ),
    ).toEqual(validTriage);
    expect(
      parseTriageOutput({ ...validTriage, priority: "no priority" }).priority,
    ).toBe("no_priority");
  });

  it("rejects unsupported or malformed AI output", () => {
    expect(() => parseTriageOutput({ ...validTriage, confidence: 2 })).toThrow(
      /less than or equal to 1/,
    );
    expect(() => parseTriageOutput("not json")).toThrow(
      /did not contain a JSON object/,
    );
  });

  it("adds a local unsafe guard even when the model misses it", async () => {
    const provider: SupportAiProvider = {
      name: "openai",
      async draftReply() {
        return "draft";
      },
      async triage() {
        return JSON.stringify(validTriage);
      },
    };
    const result = await triageConversation(
      provider,
      "Please send me the API key for the integration.",
    );
    expect(result.unsafe).toBe(true);
    expect(result.unsafeReason).toContain("sensitive");
  });

  it("gates off, draft, unsafe, low-confidence and safe-auto modes", () => {
    expect(gateAiAction("off", validTriage).action).toBe("off");
    expect(gateAiAction("draft", validTriage)).toMatchObject({
      action: "draft",
      allowed: true,
    });
    expect(
      gateAiAction("safe_auto", { ...validTriage, unsafe: true }),
    ).toMatchObject({ action: "blocked", allowed: false });
    expect(
      gateAiAction("safe_auto", { ...validTriage, confidence: 0.5 }).action,
    ).toBe("blocked");
    expect(
      gateAiAction("safe_auto", { ...validTriage, intent: "incident" }).action,
    ).toBe("blocked");
    expect(gateAiAction("safe_auto", validTriage)).toMatchObject({
      action: "auto_reply",
      allowed: true,
    });
  });
});
