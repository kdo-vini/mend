import { describe, expect, it } from "vitest";
import {
  isConversationAiActive,
  planConversationAiToggle,
} from "./conversation-ai-toggle";

describe("isConversationAiActive", () => {
  it("is on only when ai_mode is not off and AI is not human_paused", () => {
    expect(
      isConversationAiActive({
        aiMode: "safe_auto",
        automationState: "ai_active",
      }),
    ).toBe(true);
    expect(
      isConversationAiActive({ aiMode: "draft", automationState: "ai_active" }),
    ).toBe(true);
    expect(
      isConversationAiActive({ aiMode: "off", automationState: "ai_active" }),
    ).toBe(false);
    expect(
      isConversationAiActive({
        aiMode: "safe_auto",
        automationState: "human_paused",
      }),
    ).toBe(false);
    expect(
      isConversationAiActive({
        aiMode: "draft",
        automationState: "human_paused",
      }),
    ).toBe(false);
  });
});

describe("planConversationAiToggle", () => {
  it("turns off by writing ai_mode=off only", () => {
    expect(
      planConversationAiToggle(
        { aiMode: "safe_auto", automationState: "ai_active" },
        false,
      ),
    ).toEqual({ aiMode: "off", resume: false });
    expect(
      planConversationAiToggle(
        { aiMode: "draft", automationState: "ai_active" },
        false,
      ),
    ).toEqual({ aiMode: "off", resume: false });
  });

  it("does not rewrite conversations that already show off", () => {
    expect(
      planConversationAiToggle(
        { aiMode: "off", automationState: "ai_active" },
        false,
      ),
    ).toBeNull();
    expect(
      planConversationAiToggle(
        { aiMode: "safe_auto", automationState: "human_paused" },
        false,
      ),
    ).toBeNull();
  });

  it("turns on with safe_auto and clears human_paused", () => {
    expect(
      planConversationAiToggle(
        { aiMode: "off", automationState: "human_paused" },
        true,
      ),
    ).toEqual({ aiMode: "safe_auto", resume: true });
    expect(
      planConversationAiToggle(
        { aiMode: "off", automationState: "ai_active" },
        true,
      ),
    ).toEqual({ aiMode: "safe_auto", resume: false });
    expect(
      planConversationAiToggle(
        { aiMode: "draft", automationState: "human_paused" },
        true,
      ),
    ).toEqual({ aiMode: "safe_auto", resume: true });
  });

  it("only resumes when ai_mode is already safe_auto", () => {
    expect(
      planConversationAiToggle(
        { aiMode: "safe_auto", automationState: "human_paused" },
        true,
      ),
    ).toEqual({ resume: true });
  });

  it("does not rewrite conversations that already show on", () => {
    expect(
      planConversationAiToggle(
        { aiMode: "safe_auto", automationState: "ai_active" },
        true,
      ),
    ).toBeNull();
  });
});
