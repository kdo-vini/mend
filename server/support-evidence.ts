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

/**
 * Operator-only headings that must never reach the customer. Knowledge often
 * documents when to escalate; that is automation policy, not reply copy.
 */
const operatorOnlySectionHeading =
  /^(?:#{1,6}\s*|\*{1,2}|_{1,2}|[-•]\s*)?(?:quando\s+encaminhar(?:\s+para\s+(?:o\s+)?humano)?|when\s+to\s+(?:escalate|hand\s*off|transfer)(?:\s+to\s+(?:a\s+)?human)?|escalate\s+when|escalar\s+quando|operator\s+notes?|notas?\s+do\s+operador|internal\s+(?:only|notes?)|somente\s+interno|objetivo|pr[eé]-?requisito)\s*:?\s*$/i;

const operatorOnlyInlinePrefix =
  /^(?:#{1,6}\s*|\*{1,2}|_{1,2}|[-•]\s*)?(?:quando\s+encaminhar(?:\s+para\s+(?:o\s+)?humano)?|when\s+to\s+(?:escalate|hand\s*off|transfer)(?:\s+to\s+(?:a\s+)?human)?|escalate\s+when|escalar\s+quando|objetivo|pr[eé]-?requisito)\s*:\s*/i;

const knowledgeMetaHeading =
  /^(?:#{1,6}\s*|\*{1,2}|_{1,2}|[-•]\s*)?(?:fluxo\s+b[aá]sico|passo\s+a\s+passo|recursos?\s+[uú]teis|dicas?|problemas?\s+comuns|o\s+que\s+(?:existe\s+hoje|n[aã]o\s+(?:prometer|dizer))|sinais?\s+de\s+problema|limites?\s+importantes|como\s+orientar|resposta\s+curta\s+modelo)\s*:?\s*$/i;

/**
 * Remove operator-only escalation / internal sections from knowledge or reply
 * text before the customer sees it. Keeps product how-to content intact.
 */
export function stripOperatorOnlySupportSections(text: string): string {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const kept: string[] = [];
  let skipping = false;
  for (const line of lines) {
    const trimmed = line.trim();
    if (
      operatorOnlySectionHeading.test(trimmed) ||
      operatorOnlyInlinePrefix.test(trimmed)
    ) {
      skipping = true;
      continue;
    }
    if (skipping) {
      if (!trimmed) {
        skipping = false;
        continue;
      }
      // Resume at the next customer-facing section or closing question.
      if (
        /\?\s*$/.test(trimmed) ||
        (/^[A-ZÀ-Ú].{0,80}:\s*$/u.test(trimmed) &&
          !operatorOnlySectionHeading.test(trimmed))
      ) {
        skipping = false;
      } else {
        continue;
      }
    }
    // Drop bare knowledge outline labels that models often echo.
    if (knowledgeMetaHeading.test(trimmed)) continue;
    kept.push(line);
  }
  return kept
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Final customer-facing reply sanitizer (prompt + deterministic strip). */
export function sanitizeCustomerSupportReply(body: string): string {
  return stripOperatorOnlySupportSections(body);
}

export function containsOperatorPlaybookLeak(body: string): boolean {
  return /\b(?:quando\s+encaminhar\s+para\s+(?:o\s+)?humano|when\s+to\s+escalate\s+to\s+(?:a\s+)?human|escalate\s+when|escalar\s+quando)\b/i.test(
    body,
  );
}

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
  if (containsOperatorPlaybookLeak(reply.body))
    return { valid: false, reason: "operator_playbook_leak" };
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
