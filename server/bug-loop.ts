import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "../src/lib/database.types.js";
import { redactSecrets } from "./codex.js";

export const BUG_LOOP_STAGES = [
  "signal",
  "suspicion",
  "evidence",
  "investigation",
  "verdict",
  "decision",
  "fix",
  "verification",
  "approval",
  "pull_request",
  "merge",
  "deploy",
  "health_check",
  "customer_response",
  "completed",
  "failed",
] as const;

export type BugLoopStage = (typeof BUG_LOOP_STAGES)[number];
export type BugLoopStatus =
  | "active"
  | "awaiting_human"
  | "completed"
  | "failed"
  | "canceled";
export type BugLoopVerdict =
  | "pending"
  | "confirmed"
  | "not_reproduced"
  | "not_a_bug"
  | "duplicate"
  | "needs_human";
export type BugLoopDecision =
  | "pending"
  | "notify"
  | "autofix"
  | "manual_fix"
  | "dismiss";

type BugCaseRow = Database["public"]["Tables"]["bug_cases"]["Row"];
type BugLoopClient = SupabaseClient<Database>;

export interface BugSuspicionInput {
  workspaceId: string;
  issueId: string;
  conversationId: string;
  signalMessageId: string;
  confidence: number;
  summary: string;
  customerMessage: string;
}

export interface BugCaseReference {
  id: string;
  issueId: string;
  stage: BugLoopStage;
  duplicate: boolean;
}

export interface AdvanceBugCaseInput {
  workspaceId: string;
  bugCaseId: string;
  stage: BugLoopStage;
  eventType: string;
  message: string;
  idempotencyKey: string;
  metadata?: Json;
  status?: BugLoopStatus;
  verdict?: BugLoopVerdict;
  decision?: BugLoopDecision;
  investigationRunId?: string;
  fixRunId?: string;
  prUrl?: string;
  prNumber?: number;
  mergeSha?: string;
  deploymentUrl?: string;
  healthStatus?: "pending" | "healthy" | "unhealthy";
  customerResponseStatus?: "pending" | "drafted" | "sent" | "skipped";
  lastError?: string;
}

export interface BugInvestigationOutcome {
  verdict: BugLoopVerdict;
  provider?: string;
  summary?: string;
  evidenceCount?: number;
  evidence?: Array<{
    kind: string;
    label: string;
    detail?: string;
  }>;
}

function bounded(value: string, limit: number): string {
  return redactSecrets(value.trim()).slice(0, limit);
}

export function bugFingerprint(summary: string): string {
  const normalized = summary
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .slice(0, 500);
  return createHash("sha256")
    .update(normalized || "unknown-bug")
    .digest("hex");
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function optionalText(value: unknown, limit: number): string | undefined {
  return typeof value === "string" && value.trim()
    ? bounded(value, limit)
    : undefined;
}

/** Keep only a bounded verdict envelope; patches and command output stay in the run. */
export function bugInvestigationOutcome(
  value: unknown,
): BugInvestigationOutcome {
  const result = record(value);
  const persisted = record(record(result.run).result);
  const agent = record(result.agent ?? persisted.agent);
  const report = record(result.report ?? agent.report ?? persisted.report);
  const rawVerdict = optionalText(
    report.verdict ?? result.verdict ?? persisted.verdict,
    80,
  )
    ?.toLocaleLowerCase()
    .replace(/[\s-]+/g, "_");
  const verdict: BugLoopVerdict =
    rawVerdict === "confirmed" ||
    rawVerdict === "reproduced" ||
    rawVerdict === "real_bug"
      ? "confirmed"
      : rawVerdict === "not_reproduced" || rawVerdict === "unconfirmed"
        ? "not_reproduced"
        : rawVerdict === "not_a_bug"
          ? "not_a_bug"
          : rawVerdict === "duplicate"
            ? "duplicate"
            : "needs_human";
  const provider = optionalText(
    report.provider ?? result.provider ?? agent.provider ?? persisted.provider,
    80,
  );
  const summary = optionalText(report.summary ?? report.reason, 1_000);
  const evidence = report.evidence;
  const normalizedEvidence = Array.isArray(evidence)
    ? evidence.slice(0, 30).flatMap((item) => {
        const itemRecord = record(item);
        const label = optionalText(
          itemRecord.label ?? itemRecord.title ?? itemRecord.summary,
          500,
        );
        if (!label) return [];
        const detail = optionalText(
          itemRecord.detail ?? itemRecord.value,
          4_000,
        );
        return [
          {
            kind: optionalText(itemRecord.kind, 80) ?? "evidence",
            label,
            ...(detail ? { detail } : {}),
          },
        ];
      })
    : [];
  const count =
    Array.isArray(evidence) && evidence.length <= 10_000
      ? evidence.length
      : typeof report.evidenceCount === "number" &&
          Number.isSafeInteger(report.evidenceCount) &&
          report.evidenceCount >= 0
        ? report.evidenceCount
        : undefined;
  return {
    verdict,
    ...(provider ? { provider } : {}),
    ...(summary ? { summary } : {}),
    ...(count !== undefined ? { evidenceCount: count } : {}),
    ...(normalizedEvidence.length ? { evidence: normalizedEvidence } : {}),
  };
}

/** Durable checkpoints shared by support triage and later CLI/GitHub stages. */
export class SupabaseBugLoopStore {
  constructor(private readonly client: BugLoopClient) {}

  async recordSuspicion(input: BugSuspicionInput): Promise<BugCaseReference> {
    const existing = await this.findByIssue(input.workspaceId, input.issueId);
    if (existing) {
      await this.appendEvent(existing, {
        stage: existing.stage as BugLoopStage,
        eventType: "signal.replayed",
        message: "The same complaint signal was received again.",
        idempotencyKey: `signal:${input.signalMessageId}`,
        metadata: { signalMessageId: input.signalMessageId },
      });
      // A worker can crash after creating the case (or after appending the
      // signal event) but before the first two checkpoints. Replay repairs
      // that prefix instead of leaving the loop permanently stuck at signal.
      let repaired = existing;
      if (repaired.stage === "signal") {
        repaired = await this.advance({
          workspaceId: input.workspaceId,
          bugCaseId: repaired.id,
          stage: "suspicion",
          eventType: "suspicion.scored",
          message: "Support triage classified the signal as a possible bug.",
          idempotencyKey: `suspicion:${input.signalMessageId}`,
          metadata: { confidence: input.confidence, summary: input.summary },
        });
      }
      if (repaired.stage === "suspicion") {
        repaired = await this.advance({
          workspaceId: input.workspaceId,
          bugCaseId: repaired.id,
          stage: "evidence",
          eventType: "evidence.collected",
          message:
            "The complaint and conversation were attached as initial evidence.",
          idempotencyKey: `evidence:${input.signalMessageId}`,
          metadata: { signalMessageId: input.signalMessageId },
        });
      }
      return this.reference(repaired, Boolean(repaired.duplicate_of_issue_id));
    }

    const fingerprint = bugFingerprint(input.summary);
    const matched = await this.findActiveFingerprint(
      input.workspaceId,
      fingerprint,
    );
    if (matched && matched.issue_id !== input.issueId) {
      const duplicate = await this.client
        .from("issues")
        .update({
          duplicate_of_issue_id: matched.issue_id,
          updated_at: new Date().toISOString(),
        })
        .eq("workspace_id", input.workspaceId)
        .eq("id", input.issueId);
      if (duplicate.error)
        throw new Error(`supabase:issues:dedupe:${duplicate.error.message}`);
      await this.appendEvent(matched, {
        stage: matched.stage as BugLoopStage,
        eventType: "evidence.duplicate_matched",
        message: "A new customer signal matched this active bug case.",
        idempotencyKey: `duplicate:${input.signalMessageId}`,
        metadata: {
          duplicateIssueId: input.issueId,
          signalMessageId: input.signalMessageId,
          confidence: input.confidence,
        },
      });
      return { ...this.reference(matched, true), issueId: input.issueId };
    }

    const created = await this.client
      .from("bug_cases")
      .insert({
        workspace_id: input.workspaceId,
        issue_id: input.issueId,
        conversation_id: input.conversationId,
        signal_message_id: input.signalMessageId,
        fingerprint,
        stage: "signal",
        status: "active",
        suspicion_score: Math.max(0, Math.min(1, input.confidence)),
        evidence_json: [
          {
            kind: "customer_message",
            sourceMessageId: input.signalMessageId,
            summary: bounded(input.summary, 2_000),
            customerMessage: bounded(input.customerMessage, 20_000),
          },
        ],
      })
      .select("*")
      .single();
    if (created.error || !created.data) {
      const raced = await this.findActiveFingerprint(
        input.workspaceId,
        fingerprint,
      );
      if (raced) return this.reference(raced, raced.issue_id !== input.issueId);
      throw new Error(
        `supabase:bug_cases:create:${created.error?.message ?? "empty_result"}`,
      );
    }

    await this.appendEvent(created.data, {
      stage: "signal",
      eventType: "signal.received",
      message: "Customer complaint was captured as a bug signal.",
      idempotencyKey: `signal:${input.signalMessageId}`,
      metadata: { signalMessageId: input.signalMessageId },
    });
    await this.advance({
      workspaceId: input.workspaceId,
      bugCaseId: created.data.id,
      stage: "suspicion",
      eventType: "suspicion.scored",
      message: "Support triage classified the signal as a possible bug.",
      idempotencyKey: `suspicion:${input.signalMessageId}`,
      metadata: { confidence: input.confidence, summary: input.summary },
    });
    const advanced = await this.advance({
      workspaceId: input.workspaceId,
      bugCaseId: created.data.id,
      stage: "evidence",
      eventType: "evidence.collected",
      message:
        "The complaint and conversation were attached as initial evidence.",
      idempotencyKey: `evidence:${input.signalMessageId}`,
      metadata: { signalMessageId: input.signalMessageId },
    });
    return this.reference(advanced, false);
  }

  async advance(input: AdvanceBugCaseInput): Promise<BugCaseRow> {
    const rpc = this.client.rpc as unknown as (
      name: string,
      args: Record<string, unknown>,
    ) => Promise<{ data: unknown; error: { message: string } | null }>;
    const result = await rpc.call(this.client, "advance_bug_case", {
      p_workspace_id: input.workspaceId,
      p_bug_case_id: input.bugCaseId,
      p_stage: input.stage,
      p_event_type: bounded(input.eventType, 120),
      p_message: bounded(input.message, 2_000),
      p_idempotency_key: bounded(input.idempotencyKey, 300),
      p_metadata: input.metadata ?? {},
      p_status: input.status ?? null,
      p_verdict: input.verdict ?? null,
      p_decision: input.decision ?? null,
      p_investigation_agent_run_id: input.investigationRunId ?? null,
      p_fix_agent_run_id: input.fixRunId ?? null,
      p_pr_url: input.prUrl ?? null,
      p_pr_number: input.prNumber ?? null,
      p_merge_sha: input.mergeSha ?? null,
      p_deployment_url: input.deploymentUrl ?? null,
      p_health_status: input.healthStatus ?? null,
      p_customer_response_status: input.customerResponseStatus ?? null,
      p_last_error: input.lastError ? bounded(input.lastError, 2_000) : null,
    });
    if (result.error)
      throw new Error(`supabase:bug_cases:advance:${result.error.message}`);
    const row = Array.isArray(result.data) ? result.data[0] : result.data;
    if (!row || typeof row !== "object")
      throw new Error("supabase:bug_cases:advance:empty_result");
    return row as BugCaseRow;
  }

  private async findByIssue(
    workspaceId: string,
    issueId: string,
  ): Promise<BugCaseRow | null> {
    const result = await this.client
      .from("bug_cases")
      .select("*")
      .eq("workspace_id", workspaceId)
      .eq("issue_id", issueId)
      .maybeSingle();
    if (result.error)
      throw new Error(`supabase:bug_cases:find:${result.error.message}`);
    return result.data;
  }

  private async findActiveFingerprint(
    workspaceId: string,
    fingerprint: string,
  ): Promise<BugCaseRow | null> {
    const result = await this.client
      .from("bug_cases")
      .select("*")
      .eq("workspace_id", workspaceId)
      .eq("fingerprint", fingerprint)
      .in("status", ["active", "awaiting_human"])
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    if (result.error)
      throw new Error(`supabase:bug_cases:dedupe:${result.error.message}`);
    return result.data;
  }

  private async appendEvent(
    bugCase: BugCaseRow,
    event: {
      stage: BugLoopStage;
      eventType: string;
      message: string;
      idempotencyKey: string;
      metadata: Json;
    },
  ): Promise<void> {
    const result = await this.client.from("bug_case_events").insert({
      workspace_id: bugCase.workspace_id,
      bug_case_id: bugCase.id,
      stage: event.stage,
      event_type: bounded(event.eventType, 120),
      message: bounded(event.message, 2_000),
      idempotency_key: bounded(event.idempotencyKey, 300),
      metadata_json: event.metadata,
    });
    if (result.error && !/duplicate|unique/i.test(result.error.message))
      throw new Error(`supabase:bug_case_events:${result.error.message}`);
  }

  private reference(row: BugCaseRow, duplicate: boolean): BugCaseReference {
    return {
      id: row.id,
      issueId: row.issue_id,
      stage: row.stage as BugLoopStage,
      duplicate,
    };
  }
}
