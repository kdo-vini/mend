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
  it("returns cited customer-safe structured replies when evidence keys are supplied", async () => {
    const client: OpenAiResponsesClient = {
      responses: {
        async create() {
          return {
            output_text: JSON.stringify({
              body: "Abra o caixa em Operações.",
              usedCitationKeys: ["kb:chunk-1"],
              confidence: 0.92,
              customerSafe: true,
              needsClarification: false,
            }),
          };
        },
      },
    };
    await expect(
      new OpenAiSupportProvider(client, {
        model: "test-model",
      }).draftReplyWithContext({
        conversation: "Como abro o caixa?",
        knowledgeContext: "[evidence kb:chunk-1] Abra em Operações.",
        evidenceKeys: ["kb:chunk-1"],
        language: "pt-BR",
        mcpConnections: [],
      }),
    ).resolves.toMatchObject({
      body: "Abra o caixa em Operações.",
      usedCitationKeys: ["kb:chunk-1"],
      customerSafe: true,
    });
  });

  it("instructs the provider to send only the active guided step", async () => {
    const calls: Array<Record<string, unknown>> = [];
    const client: OpenAiResponsesClient = {
      responses: {
        async create(input) {
          calls.push(input as Record<string, unknown>);
          return { output_text: "Abra o ZeloPDV e entre em Produtos." };
        },
      },
    };

    await new OpenAiSupportProvider(client, {
      model: "test-model",
    }).draftReplyWithContext({
      conversation: "O cliente respondeu sim.",
      knowledgeContext: "Como cadastrar produtos.",
      language: "pt-BR",
      mcpConnections: [],
      guidedHowTo: { topic: "cadastrar produtos", step: 2 },
    });

    expect(calls[0]?.input[0].content).toContain(
      "Send only step 2 now, do not repeat previous steps",
    );
  });

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
    expect(calls[0]).toContain("Answer the customer's current ask only");
    expect(calls[0]).toContain(
      "For a multi-step how-to request, first ask whether the customer wants guidance",
    );
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
    const previousDevMode = process.env.MEND_DEV_MODE;
    process.env.MEND_DEV_MODE = "0";
    process.env.OPENAI_API_KEY = "global-key-must-not-be-used";
    try {
      expect(() => createSupportAiProvider()).toThrow(
        SupportAiConfigurationError,
      );

      await expect(
        resolveSupportAiProvider("workspace-1", {
          resolve: async () => ({ apiKey: "workspace-key", config: {} }),
        }),
      ).rejects.toMatchObject({ code: "support_ai_model_missing" });
    } finally {
      if (previousDevMode === undefined) delete process.env.MEND_DEV_MODE;
      else process.env.MEND_DEV_MODE = previousDevMode;
    }
  });

  it("falls back to OPENAI_API_KEY only when MEND_DEV_MODE is enabled", async () => {
    const previous = {
      MEND_DEV_MODE: process.env.MEND_DEV_MODE,
      NODE_ENV: process.env.NODE_ENV,
      OPENAI_API_KEY: process.env.OPENAI_API_KEY,
      SUPPORT_AI_MODEL: process.env.SUPPORT_AI_MODEL,
    };
    process.env.MEND_DEV_MODE = "1";
    process.env.NODE_ENV = "development";
    process.env.OPENAI_API_KEY = "local-dev-key";
    process.env.SUPPORT_AI_MODEL = "gpt-local";
    try {
      const calls: Array<Record<string, unknown>> = [];
      const provider = await resolveSupportAiProvider(
        "workspace-1",
        {
          resolve: async () => {
            throw new Error("Connection encryption is not configured.");
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
      expect(calls[0]?.model).toBe("gpt-local");
    } finally {
      for (const [key, value] of Object.entries(previous)) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
    }
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
          return {
            apiKey: "workspace-key",
            config: {
              supportModel: "gpt-test",
              visionModel: "gpt-vision",
              transcriptionModel: "gpt-transcribe",
              embeddingModel: "text-embedding-3-small",
            },
          };
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

  it("uses the V2 support roles for text and vision independently", async () => {
    const calls: Array<Record<string, unknown>> = [];
    const provider = await resolveSupportAiProvider(
      "workspace-1",
      {
        resolve: async () => ({
          apiKey: "workspace-key",
          config: {
            supportModel: "gpt-support",
            visionModel: "gpt-vision",
            transcriptionModel: "gpt-transcribe",
            embeddingModel: "text-embedding-3-small",
          },
        }),
      },
      () => ({
        responses: {
          async create(input) {
            calls.push(input as Record<string, unknown>);
            return { output_text: "grounded media summary" };
          },
        },
      }),
    );

    await provider.draftReply("hello", undefined, "en-US");
    await provider.analyzeMedia({
      conversation: "The customer sent an image.",
      files: [
        {
          data: new Uint8Array([137, 80, 78, 71]),
          mimeType: "image/png",
          fileName: "receipt.png",
        },
      ],
    });

    expect(calls.map((call) => call.model)).toEqual([
      "gpt-support",
      "gpt-vision",
    ]);
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
          authMode: "oauth",
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
          headers: {
            Authorization: "Bearer oauth-access-token",
            "x-workspace-id": "workspace-1",
          },
        },
      ],
    });
    expect(result.mcpEvidence).toBe(true);
    expect(result.body).toContain("Zelo PDV");
    expect(calls[0]?.tools).toEqual([
      expect.objectContaining({
        allowed_tools: ["buscar_cliente"],
        authorization: "oauth-access-token",
        headers: { "x-workspace-id": "workspace-1" },
      }),
    ]);
  });
});
