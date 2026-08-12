import { describe, expect, it, vi } from "vitest";
import {
  OpenAiAudioTranscriber,
  OpenAiSupportProvider,
  SupportAiConfigurationError,
  type OpenAiResponsesClient,
  createSupportAiProvider,
  resolveSupportAiProvider,
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
        model: "test-model",
      }),
    ).toBeInstanceOf(OpenAiSupportProvider);
  });

  it("never falls back to a process-wide support credential", async () => {
    process.env.OPENAI_API_KEY = "global-key-must-not-be-used";
    expect(() => createSupportAiProvider()).toThrow(
      SupportAiConfigurationError,
    );

    await expect(
      resolveSupportAiProvider("workspace-1", {
        resolve: async () => ({ apiKey: "workspace-key", config: {} }),
      }),
    ).rejects.toMatchObject({ code: "support_ai_model_required" });
  });

  it("resolves the workspace support key and selected model together", async () => {
    const calls: Array<Record<string, unknown>> = [];
    const provider = await resolveSupportAiProvider(
      "workspace-1",
      {
        resolve: async (workspaceId, task, providerName) => {
          expect([workspaceId, task, providerName]).toEqual([
            "workspace-1",
            "support",
            "openai",
          ]);
          return { apiKey: "workspace-key", config: { model: "gpt-test" } };
        },
      },
      () => ({
        responses: {
          async create(input) {
            calls.push(input as Record<string, unknown>);
            return { output_text: "draft" };
          },
        },
      }),
    );

    await provider.draftReply("hello", undefined, "en-US");
    expect(calls[0]?.model).toBe("gpt-test");
  });

  it("transcribes audio with the configured model", async () => {
    const create = vi.fn(async () => ({ text: "Olá, tudo bem?" }));
    const transcriber = new OpenAiAudioTranscriber(
      { audio: { transcriptions: { create } } },
      { model: "transcribe-test" },
    );

    await expect(
      transcriber.transcribe({
        data: new Uint8Array([1, 2, 3]),
        workspaceId: "workspace-1",
        mimeType: "audio/ogg",
        fileName: "voice.ogg",
      }),
    ).resolves.toBe("Olá, tudo bem?");
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        model: "transcribe-test",
        response_format: "json",
      }),
    );
  });

  it("exposes only allowlisted MCP tools and gates writes behind approval", async () => {
    const calls: Array<Record<string, unknown>> = [];
    const client: OpenAiResponsesClient = {
      responses: {
        async create(input) {
          calls.push(input as Record<string, unknown>);
          if (calls.length === 1)
            return {
              id: "response-1",
              output: [
                {
                  type: "mcp_call",
                  server_label: "mcp_plugin-1",
                  name: "buscar_cliente",
                },
              ],
              output_text: "O cliente usa Zelo PDV.",
            };
          return { output_text: "ok" };
        },
      },
    };
    const result = await new OpenAiSupportProvider(client, {
      model: "test-model",
    }).draftReplyWithContext({
      conversation: "normalized_phone: 5511999999999",
      language: "pt-BR",
      mcpConnections: [
        {
          id: "plugin-1",
          workspaceId: "workspace-1",
          name: "Zelo",
          description: "Customer data",
          serverUrl: "https://mcp.example.com",
          authMode: "none",
          status: "connected",
          tools: [
            {
              name: "buscar_cliente",
              description: "",
              inputSchema: {},
              readOnly: true,
            },
          ],
          allowedToolNames: ["buscar_cliente"],
          writeModes: [],
          lastError: null,
          lastTestedAt: null,
          createdAt: "",
          updatedAt: "",
          headers: {},
        },
      ],
    });
    expect(result.mcpEvidence).toBe(true);
    expect(result.body).toContain("Zelo PDV");
    expect(calls[0]?.tools).toEqual([
      expect.objectContaining({ allowed_tools: ["buscar_cliente"] }),
    ]);
  });
});
