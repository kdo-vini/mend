import type { ProductResolution } from "./knowledge-products.js";

export interface SupportKnowledgeEvidence {
  evidenceKey: string;
  articleId?: string;
  chunkId?: string;
  articleVersion?: string;
  productIds: readonly string[];
  sourceKind: "manual" | "repository" | "repository_research";
  sourceRevision?: string;
  sourcePath?: string;
  title: string;
  heading: string;
  content: string;
  trustLevel: "reviewed" | "deterministic" | "generated";
  audience: "customer" | "internal";
  score: number;
}

export interface SupportEvidenceBundle {
  resolution: ProductResolution;
  evidence: readonly SupportKnowledgeEvidence[];
  sufficient: boolean;
  stale: boolean;
  citations: readonly string[];
}

export interface GroundedSupportReply {
  body: string;
  usedCitationKeys: readonly string[];
  confidence: number;
  customerSafe: boolean;
  needsClarification: boolean;
  clarificationQuestion?: string;
}

const forbiddenCustomerPatterns = [
  /```/,
  /(?:^|\s)(?:[a-zA-Z]:\\|\/(?:home|srv|var|opt|tmp)\/)/,
  /\b(?:select|insert|update|delete)\s+.+\s+(?:from|into|set)\b/i,
  /\b(?:api[_-]?key|authorization|private[_-]?key|password|secret)\s*[:=]/i,
  /\b(?:stack trace|according to the code|de acordo com o codigo|de acordo com o código)\b/i,
  /\b[a-z][a-z0-9_-]{1,31}:[a-zA-Z0-9:_-]{2,180}\b/,
];

export function validateGroundedSupportReply(
  reply: GroundedSupportReply,
  bundle: SupportEvidenceBundle,
): { valid: boolean; reason?: string } {
  const allowed = new Set(bundle.evidence.map((item) => item.evidenceKey));
  if (!reply.customerSafe)
    return { valid: false, reason: "provider_marked_unsafe" };
  if (bundle.resolution.ambiguous && !reply.needsClarification)
    return { valid: false, reason: "product_ambiguous" };
  if (reply.usedCitationKeys.some((key) => !allowed.has(key)))
    return { valid: false, reason: "unknown_citation" };
  if (
    !reply.needsClarification &&
    bundle.sufficient &&
    !reply.usedCitationKeys.length
  )
    return { valid: false, reason: "citation_required" };
  if (forbiddenCustomerPatterns.some((pattern) => pattern.test(reply.body)))
    return { valid: false, reason: "customer_unsafe_content" };
  if (!reply.body.trim()) return { valid: false, reason: "empty_reply" };
  return { valid: true };
}

export function boundedEvidenceBundle(
  resolution: ProductResolution,
  evidence: readonly SupportKnowledgeEvidence[],
  options: {
    maxItems?: number;
    maxPerRepository?: number;
    maxCharacters?: number;
  } = {},
): SupportEvidenceBundle {
  const maxItems = options.maxItems ?? 12;
  const maxPerRepository = options.maxPerRepository ?? 4;
  const maxCharacters = options.maxCharacters ?? 24_000;
  const counts = new Map<string, number>();
  const selected: SupportKnowledgeEvidence[] = [];
  let characters = 0;
  for (const item of [...evidence].sort((a, b) => b.score - a.score)) {
    const repositoryKey = `${item.sourceKind}:${item.sourceRevision ?? item.articleId ?? "shared"}`;
    if ((counts.get(repositoryKey) ?? 0) >= maxPerRepository) continue;
    if (
      characters + item.content.length > maxCharacters ||
      selected.length >= maxItems
    )
      continue;
    selected.push(item);
    counts.set(repositoryKey, (counts.get(repositoryKey) ?? 0) + 1);
    characters += item.content.length;
  }
  return {
    resolution,
    evidence: selected,
    sufficient:
      !resolution.ambiguous && selected.some((item) => item.score >= 0.18),
    stale: false,
    citations: selected.map((item) => item.evidenceKey),
  };
}
