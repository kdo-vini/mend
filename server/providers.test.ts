import { describe, expect, it } from "vitest";
import {
  OpenAiSupportProvider,
  type OpenAiResponsesClient,
  createSupportAiProvider,
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
      provider.draftReply("hello", "Checkout closes at 18:00.", "en-US"),
    ).resolves.toBe("Draft reply");
    await expect(provider.triage("checkout fails")).resolves.toContain(
      '"intent":"bug"',
    );
    expect(calls).toHaveLength(2);
    expect(calls[0]).toContain("Checkout closes at 18:00.");
  });

  it("creates the configured OpenAI provider without a registry", () => {
    expect(
      createSupportAiProvider({
        client: {
          responses: { create: async () => ({ output_text: "" }) },
        },
      }),
    ).toBeInstanceOf(OpenAiSupportProvider);
  });
});
