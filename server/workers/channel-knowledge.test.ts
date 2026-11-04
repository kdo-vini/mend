import { describe, expect, it, vi } from "vitest";
import type { ChannelAiSettings } from "../../src/shared/channel-ai.js";
import type { LiveWorkerKnowledge } from "../live-worker.js";
import { retrieveChannelKnowledge } from "./channel-knowledge.js";

const ZELO = "11111111-1111-4111-8111-111111111111";
const DIAGIUM = "22222222-2222-4222-8222-222222222222";
const input = {
  workspaceId: "ws-1",
  channelConnectionId: "channel-diagium",
  conversationId: "conv-1",
  messageId: "msg-1",
  text: "Como emito nota no ZeloPDV?",
};

function port(channelAi?: ChannelAiSettings) {
  const knowledge = {
    ...(channelAi ? { channelAi: vi.fn(async () => channelAi) } : {}),
    resolveProducts: vi.fn(async () => ({
      productIds: [ZELO],
      confidence: 1,
      source: "alias" as const,
      ambiguous: false,
    })),
    listPublished: vi.fn(async () => [
      { id: "a-1", title: "T", category: "C", body: "B" },
    ]),
  } satisfies LiveWorkerKnowledge;
  return knowledge;
}

describe("retrieveChannelKnowledge", () => {
  it("reads nothing for a locked channel", async () => {
    const knowledge = port({
      enabled: false,
      knowledge: { mode: "workspace" },
      mcpEnabled: true,
      zeloCustomerLookup: true,
    });
    await expect(retrieveChannelKnowledge(knowledge, input)).resolves.toEqual({
      knowledge: [],
    });
    expect(knowledge.resolveProducts).not.toHaveBeenCalled();
    expect(knowledge.listPublished).not.toHaveBeenCalled();
  });

  it("keeps a product-scoped channel inside its own products", async () => {
    const knowledge = port({
      enabled: true,
      knowledge: { mode: "products", productIds: [DIAGIUM] },
      mcpEnabled: false,
      zeloCustomerLookup: false,
    });
    await retrieveChannelKnowledge(knowledge, input);
    const scope = { allowedProductIds: [DIAGIUM], strictProducts: true };
    expect(knowledge.resolveProducts).toHaveBeenCalledWith(
      "ws-1",
      "conv-1",
      "msg-1",
      input.text,
      scope,
    );
    // The message names ZeloPDV, but the Diagium channel only sees Diagium.
    expect(knowledge.listPublished).toHaveBeenCalledWith(
      "ws-1",
      input.text,
      [DIAGIUM],
      { conversationId: "conv-1", messageId: "msg-1" },
      scope,
    );
  });

  it("keeps the legacy workspace scope unchanged", async () => {
    const knowledge = port({
      enabled: true,
      knowledge: { mode: "workspace" },
      mcpEnabled: true,
      zeloCustomerLookup: true,
    });
    const result = await retrieveChannelKnowledge(knowledge, input);
    expect(knowledge.listPublished).toHaveBeenCalledWith(
      "ws-1",
      input.text,
      [ZELO],
      { conversationId: "conv-1", messageId: "msg-1" },
    );
    expect(result.knowledge).toHaveLength(1);
  });
});
