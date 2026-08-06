import { describe, expect, it, vi } from "vitest";
import {
  OpenAiAudioTranscriber,
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

  it("transcribes audio with the configured model", async () => {
    const create = vi.fn(async () => ({ text: "Olá, tudo bem?" }));
    const transcriber = new OpenAiAudioTranscriber(
      { audio: { transcriptions: { create } } },
      { model: "transcribe-test" },
    );

    await expect(
      transcriber.transcribe({
        data: new Uint8Array([1, 2, 3]),
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
