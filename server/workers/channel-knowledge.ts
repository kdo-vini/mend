import {
  allowedChannelProductIds,
  scopeProductIds,
} from "../../src/shared/channel-ai.js";
import type { LiveWorkerKnowledgeArticle } from "../automation/decision.js";
import type { ProductResolution } from "../knowledge-products.js";
import type { LiveWorkerKnowledge } from "../live-worker.js";

export interface LiveWorkerKnowledgeScope {
  /** Only these products may be resolved (product-scoped channel). */
  allowedProductIds?: readonly string[];
  /** Drop shared/unmapped articles and the workspace-wide fallback. */
  strictProducts?: boolean;
}

/**
 * Resolves products and retrieves published knowledge under the channel's AI
 * lock: a locked channel reads nothing, and a product-scoped channel never
 * widens beyond its own products (no shared articles, no workspace fallback).
 * Automation still runs for a locked channel so its scripted support flow,
 * which is not AI, keeps working.
 */
export async function retrieveChannelKnowledge(
  knowledge: LiveWorkerKnowledge | undefined,
  input: {
    workspaceId: string;
    channelConnectionId: string;
    conversationId: string;
    messageId: string;
    text: string;
  },
): Promise<{
  knowledge: readonly LiveWorkerKnowledgeArticle[];
  productResolution?: ProductResolution;
}> {
  if (!knowledge) return { knowledge: [] };
  const channelAi = knowledge.channelAi
    ? await knowledge.channelAi(input.workspaceId, input.channelConnectionId)
    : undefined;
  if (channelAi && !channelAi.enabled) return { knowledge: [] };
  const allowedProductIds = channelAi
    ? allowedChannelProductIds(channelAi)
    : undefined;
  const scope: LiveWorkerKnowledgeScope | undefined = allowedProductIds
    ? { allowedProductIds, strictProducts: true }
    : undefined;
  // Legacy ports are called with their original arity.
  const scopeArgs = scope ? ([scope] as const) : ([] as const);
  const productResolution = knowledge.resolveProducts
    ? await knowledge.resolveProducts(
        input.workspaceId,
        input.conversationId,
        input.messageId,
        input.text,
        ...scopeArgs,
      )
    : undefined;
  const articles = await knowledge.listPublished(
    input.workspaceId,
    input.text,
    scope
      ? scopeProductIds(productResolution?.productIds, scope.allowedProductIds)
      : productResolution?.productIds,
    { conversationId: input.conversationId, messageId: input.messageId },
    ...scopeArgs,
  );
  return {
    knowledge: articles,
    ...(productResolution ? { productResolution } : {}),
  };
}
