import { describe, expect, it } from "vitest";
import {
  AiProviderUnavailableError,
  ClaudeSupportProvider,
  GeminiSupportProvider,
  OpenAiSupportProvider,
  type OpenAiResponsesClient,
  createSupportAiProviderRegistry,
} from "./providers.js";

describe("support AI providers", () => {
  it("uses the OpenAI responses contract for drafts and triage", async () => {
    const calls: string[] = [];
    const client: OpenAiResponsesClient = {
      responses: {
        async create(input) {
          calls.push(input.input[0].content);
          return {
            output_text:
              calls.length === 1
                ? "Draft reply"
                : '{"intent":"bug","priority":"high","confidence":0.91,"summary":"Checkout fails"}',
          };
        },
      },
    };
    const provider = new OpenAiSupportProvider(client, { model: "test-model" });

    await expect(
      provider.draftReply("hello", "Checkout closes at 18:00."),
    ).resolves.toBe("Draft reply");
    await expect(provider.triage("checkout fails")).resolves.toContain(
      '"intent":"bug"',
    );
    expect(calls).toHaveLength(2);
    expect(calls[0]).toContain("Checkout closes at 18:00.");
  });

  it("registers future providers without requiring their keys at startup", () => {
    const registry = createSupportAiProviderRegistry({
      claude: {},
      gemini: {},
    });
    expect(registry.has("openai")).toBe(true);
    expect(registry.has("claude")).toBe(true);
    expect(registry.has("gemini")).toBe(true);
    expect(registry.create("claude")).toBeInstanceOf(ClaudeSupportProvider);
    expect(registry.create("gemini")).toBeInstanceOf(GeminiSupportProvider);
  });

  it("fails clearly when an unconfigured future provider is used", async () => {
    await expect(
      new ClaudeSupportProvider().draftReply("hello"),
    ).rejects.toBeInstanceOf(AiProviderUnavailableError);
    await expect(
      new GeminiSupportProvider().triage("hello"),
    ).rejects.toMatchObject({ message: "gemini: API key is missing" });
  });
});
