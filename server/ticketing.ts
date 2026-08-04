import type { TriageResult } from "./triage.js";

export type TicketIssueStatus =
  | "triage"
  | "backlog"
  | "todo"
  | "in_progress"
  | "review"
  | "done"
  | "canceled"
  | string;

export interface TicketIssue {
  id: string;
  workspaceId: string;
  title: string;
  summary: string;
  intent: TriageResult["intent"];
  priority: TriageResult["priority"];
  status: TicketIssueStatus;
  conversationId?: string;
  dedupeKey?: string;
  updatedAt: string;
}

export interface UpsertTicketInput {
  workspaceId: string;
  conversationId?: string;
  title: string;
  summary: string;
  triage: Pick<TriageResult, "intent" | "priority">;
  dedupeKey?: string;
}

export interface TicketIssuePatch {
  title: string;
  summary: string;
  intent: TriageResult["intent"];
  priority: TriageResult["priority"];
  updatedAt: string;
}

export interface TicketingTransaction {
  findCandidates(input: {
    workspaceId: string;
    conversationId?: string;
    dedupeKey?: string;
  }): Promise<readonly TicketIssue[]>;
  createIssue(
    input: UpsertTicketInput & { status: "triage"; updatedAt: string },
  ): Promise<TicketIssue>;
  updateIssue(id: string, patch: TicketIssuePatch): Promise<TicketIssue>;
}

export interface TicketingPort {
  transaction<T>(
    callback: (transaction: TicketingTransaction) => Promise<T>,
  ): Promise<T>;
}

export interface TicketingResult {
  operation: "created" | "updated";
  issue: TicketIssue;
  matchedBy?: "conversation" | "dedupe_key" | "text";
}

const closedStatuses = new Set(["done", "canceled"]);

function normalizeText(value: string): string[] {
  return value
    .toLocaleLowerCase("en-US")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((word) => word.length > 3);
}

function textSimilarity(left: string, right: string): number {
  const leftWords = new Set(normalizeText(left));
  const rightWords = new Set(normalizeText(right));
  if (!leftWords.size || !rightWords.size) return 0;
  const overlap = [...leftWords].filter((word) => rightWords.has(word)).length;
  return overlap / Math.max(leftWords.size, rightWords.size);
}

export function findDuplicateIssue(
  input: UpsertTicketInput,
  candidates: readonly TicketIssue[],
): { issue: TicketIssue; matchedBy: TicketingResult["matchedBy"] } | undefined {
  const openCandidates = candidates.filter(
    (candidate) =>
      candidate.workspaceId === input.workspaceId &&
      !closedStatuses.has(candidate.status),
  );
  const exactConversation =
    input.conversationId &&
    openCandidates.find(
      (candidate) => candidate.conversationId === input.conversationId,
    );
  if (exactConversation)
    return { issue: exactConversation, matchedBy: "conversation" };

  const exactKey =
    input.dedupeKey &&
    openCandidates.find((candidate) => candidate.dedupeKey === input.dedupeKey);
  if (exactKey) return { issue: exactKey, matchedBy: "dedupe_key" };

  const textMatch = openCandidates
    .map((issue) => ({
      issue,
      score: textSimilarity(
        `${input.title} ${input.summary}`,
        `${issue.title} ${issue.summary}`,
      ),
    }))
    .sort((left, right) => right.score - left.score)[0];
  return textMatch && textMatch.score >= 0.55
    ? { issue: textMatch.issue, matchedBy: "text" }
    : undefined;
}

export class TicketingService {
  constructor(
    private readonly port: TicketingPort,
    private readonly options: { now?: () => string } = {},
  ) {}

  async upsertFromTriage(input: UpsertTicketInput): Promise<TicketingResult> {
    const updatedAt = this.options.now?.() ?? new Date().toISOString();
    return this.port.transaction(async (transaction) => {
      const candidates = await transaction.findCandidates({
        workspaceId: input.workspaceId,
        conversationId: input.conversationId,
        dedupeKey: input.dedupeKey,
      });
      const duplicate = findDuplicateIssue(input, candidates);
      if (duplicate) {
        const issue = await transaction.updateIssue(duplicate.issue.id, {
          title: input.title,
          summary: input.summary,
          intent: input.triage.intent,
          priority: input.triage.priority,
          updatedAt,
        });
        return { operation: "updated", issue, matchedBy: duplicate.matchedBy };
      }

      const issue = await transaction.createIssue({
        ...input,
        status: "triage",
        updatedAt,
      });
      return { operation: "created", issue };
    });
  }
}
