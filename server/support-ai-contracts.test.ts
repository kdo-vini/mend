import { describe, expect, it } from "vitest";
import {
  agentConnectionCreateSchema,
  supportModelConfigSchema,
} from "./routes/schemas.js";
import {
  isSupportModelConfigReady,
  type SupportModelConfig,
} from "./coding-control-plane.js";
import { SupabaseCodingControlPlaneAdapter } from "./adapters/supabase/coding-control-plane.js";

describe("Support AI V2 contracts", () => {
  it("rejects subscription connections for Support", () => {
    expect(
      agentConnectionCreateSchema.safeParse({
        label: "Inbox Support",
        provider: "openai",
        authMethod: "subscription",
        purpose: "support",
      }).success,
    ).toBe(false);
  });

  it("rejects Support subscriptions at the backend adapter boundary", async () => {
    const adapter = new SupabaseCodingControlPlaneAdapter({} as never);
    await expect(
      adapter.createConnection(
        {
          userId: "user-1",
          workspaceId: "workspace-1",
          role: "admin",
        },
        {
          label: "Inbox Support",
          provider: "openai",
          authMethod: "subscription",
          purpose: "support",
        },
      ),
    ).rejects.toThrow("support_ai_byok_required");
  });

  it("requires all four Support model roles", () => {
    expect(
      supportModelConfigSchema.safeParse({
        supportModel: "gpt-support",
        visionModel: "gpt-vision",
        transcriptionModel: "gpt-transcribe",
        embeddingModel: "text-embedding-3-small",
      }).success,
    ).toBe(true);
    expect(
      supportModelConfigSchema.safeParse({
        supportModel: "gpt-support",
        visionModel: "",
        transcriptionModel: "gpt-transcribe",
        embeddingModel: "text-embedding-3-small",
      }).success,
    ).toBe(false);
  });

  it("only reports ready when each selected model has its capability", () => {
    const config: SupportModelConfig = {
      supportModel: "gpt-support",
      visionModel: "gpt-vision",
      transcriptionModel: "gpt-transcribe",
      embeddingModel: "text-embedding-3-small",
    };
    expect(
      isSupportModelConfigReady(config, [
        { id: "gpt-support", capabilities: ["text"] },
        { id: "gpt-vision", capabilities: ["text", "vision"] },
        { id: "gpt-transcribe", capabilities: ["transcription"] },
        { id: "text-embedding-3-small", capabilities: ["embedding"] },
      ]),
    ).toBe(true);
    expect(
      isSupportModelConfigReady(config, [
        { id: "gpt-support", capabilities: ["text"] },
        { id: "gpt-vision", capabilities: ["text"] },
        { id: "gpt-transcribe", capabilities: ["transcription"] },
        { id: "text-embedding-3-small", capabilities: ["embedding"] },
      ]),
    ).toBe(false);
  });
});
