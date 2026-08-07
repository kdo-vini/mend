import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../src/lib/database.types.js";
import {
  InboxService,
  SupabaseInboxPort,
  type InboxContext,
  type InboxMessageRecord,
} from "./inbox-service.js";
import { redactJobError, type JobRecord, type JobStore } from "./jobs.js";
import {
  OpenAiAudioTranscriber,
  type McpApprovalInput,
  type SupportAiDraftResult,
  type SupportAiProvider,
} from "./providers.js";
import { normalizeLocale } from "./locale.js";
import { SupabaseMediaStorage } from "./media.js";
import {
  MEDIA_PROCESS_JOB_TYPE,
  SupabaseMediaPipeline,
  type MediaProcessJobPayload,
} from "./media-pipeline.js";
import { WhatsAppService, type WhatsAppProvider } from "./whatsapp-service.js";
import { WorkspacePushNotifier } from "./push.js";
import { triageConversation, type TriageResult } from "./triage.js";
import {
  aiStateInput,
  boundedText,
  conversationReplyInput,
  issueIdentifierNumber,
  issuePriority,
  issueType,
  messageText,
  normalizeAiPolicy,
  policyDecision,
  policyJson,
  relevantKnowledge,
  safeKnowledgeContext,
  triageConversationInput,
  type LiveWorkerAiMode,
  type LiveWorkerAiPolicy,
  type LiveWorkerKnowledgeArticle,
  type LiveWorkerTriageState,
} from "./automation/decision.js";
import {
  normalizePhoneNumber,
  type NormalizedWhatsmiauMessage,
} from "./whatsmiau.js";
import type { WhatsmiauMessageJobPayload } from "./worker.js";
import {
  flowFromChannelSettings,
  type SupportFlowNode,
} from "../src/shared/support-flow.js";
import type { SafeTool } from "./codex.js";
import { CodexService } from "./codex-service.js";
import {
  SupabaseCodexRunStore,
  SupabaseRepositoryAdapter,
} from "./supabase-api-adapters.js";
import {
  connectionEncryptionKey,
  decryptMcpSecret,
  mcpArgumentsHmac,
  mcpConnectionRecordFromRow,
  type McpRuntimeConnection,
} from "./mcp.js";

type LiveWorkerSupabaseClient = SupabaseClient<Database>;
type KnowledgeArticleRow =
  Database["public"]["Tables"]["knowledge_articles"]["Row"];

export const WHATSAPP_INGEST_JOB_TYPE = "whatsmiau.message.received";
export const PROCESS_INBOUND_MESSAGE_JOB_TYPE = "mend.process_inbound_message";
export const SEND_AI_REPLY_JOB_TYPE = "mend.send_ai_reply";

interface ProcessInboundMessageJobPayload {
  stage: "process_inbound_message";
  ingestionJobId: string;
  binding: LiveChannelBinding;
  idempotencyKey: string;
  message: NormalizedWhatsmiauMessage;
  persisted: InboxMessageRecord;
}

export interface LiveWorkerSendAiReplyInput {
  binding: LiveChannelBinding;
  conversationId: string;
  sourceMessageId: string;
  idempotencyKey: string;
  body: string;
  triage: TriageResult;
}

export interface LiveWorkerCodexStarterInput {
  workspaceId: string;
  issueId: string;
  issueIdentifier: string;
  issueTitle: string;
  summary: string;
  customerMessage: string;
}

export interface LiveWorkerCodexStarter {
  start(input: LiveWorkerCodexStarterInput): Promise<{
    runId: string;
    completion: Promise<unknown>;
  } | null>;
}

interface SendAiReplyJobPayload extends LiveWorkerSendAiReplyInput {
  stage: "send_ai_reply";
}

type LiveWorkerJobPayload =
  | WhatsmiauMessageJobPayload
  | ProcessInboundMessageJobPayload
  | SendAiReplyJobPayload
  | MediaProcessJobPayload;

interface UncheckedSupabaseQuery
  extends PromiseLike<{
    data: unknown;
    error: { message: string } | null;
  }> {
  select(columns?: string): UncheckedSupabaseQuery;
  insert(values: unknown): UncheckedSupabaseQuery;
  update(values: unknown): UncheckedSupabaseQuery;
  eq(column: string, value: unknown): UncheckedSupabaseQuery;
  order(
    column: string,
    options?: { ascending?: boolean },
  ): UncheckedSupabaseQuery;
  limit(value: number): UncheckedSupabaseQuery;
  maybeSingle(): Promise<{ data: unknown; error: { message: string } | null }>;
}

interface UncheckedSupabaseClient {
  from(table: string): UncheckedSupabaseQuery;
}

export interface LiveChannelBinding {
  channelConnectionId: string;
  instanceName: string;
  workspaceId: string;
}

export interface LiveWorkerChannelResolver {
  resolve(instanceName: string): Promise<LiveChannelBinding | null>;
}

export interface LiveWorkerInbox {
  persistNormalizedMessage(
    context: InboxContext,
    channelConnectionId: string,
    message: NormalizedWhatsmiauMessage,
  ): Promise<InboxMessageRecord>;
  setContactDisplayName?(
    context: InboxContext,
    contactId: string,
    displayName: string,
  ): Promise<void>;
}

export interface LiveWorkerGroupDirectory {
  getGroupInfo?(input: {
    instanceName: string;
    remoteJid: string;
  }): Promise<{ subject: string } | null>;
}

export interface LiveWorkerKnowledge {
  listPublished(
    workspaceId: string,
  ): Promise<readonly LiveWorkerKnowledgeArticle[]>;
}

export interface LiveWorkerAutomationInput {
  binding: LiveChannelBinding;
  idempotencyKey: string;
  job: JobRecord<WhatsmiauMessageJobPayload>;
  knowledge: readonly LiveWorkerKnowledgeArticle[];
  message: NormalizedWhatsmiauMessage;
  persisted: InboxMessageRecord;
}

export interface LiveWorkerDraft {
  conversationId: string;
  messageId: string;
  idempotencyKey: string;
  body: string;
  knowledgeArticleIds: readonly string[];
  triage: TriageResult;
  mcpEvidence?: boolean;
  mcpCalls?: SupportAiDraftResult["mcpCalls"];
}

export interface LiveWorkerIssue {
  id: string;
  identifier: string;
  operation: "created" | "updated";
}

export interface LiveWorkerAutomationResult {
  draft?: LiveWorkerDraft;
  issue?: LiveWorkerIssue;
  send?: LiveWorkerSendAiReplyInput;
}

export interface LiveWorkerAutomation {
  /** Durable checkpoint check. In-memory callers may omit it, but production should implement it. */
  isComplete?(
    input: Omit<LiveWorkerAutomationInput, "knowledge">,
  ): Promise<boolean>;
  process(
    input: LiveWorkerAutomationInput,
  ): Promise<LiveWorkerAutomationResult | void>;
  sendAiReply?(input: LiveWorkerSendAiReplyInput): Promise<void>;
}

export interface LiveWorkerUnmappedMessage {
  instanceName: string;
  jobId: string;
  providerMessageId: string;
}

export interface LiveWorkerOptions {
  automation?: LiveWorkerAutomation;
  channelResolver: LiveWorkerChannelResolver;
  inbox: LiveWorkerInbox;
  groupDirectory?: LiveWorkerGroupDirectory;
  jobStore: JobStore<WhatsmiauMessageJobPayload>;
  mediaPipeline?: SupabaseMediaPipeline;
  knowledge?: LiveWorkerKnowledge;
  onDraftReady?: (draft: LiveWorkerDraft) => Promise<void> | void;
  onIssueReady?: (issue: LiveWorkerIssue) => Promise<void> | void;
  onUnmappedMessage?: (input: LiveWorkerUnmappedMessage) => void;
  pollIntervalMs?: number;
  workerId?: string;
}

const DEFAULT_POLL_INTERVAL_MS = 1_000;

function safeOperationalError(error: unknown): string {
  return redactJobError(error);
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function cleanInstanceName(value: string): string {
  const normalized = value.trim();
  return normalized.length <= 240 ? normalized : "";
}

/**
 * Consumes the existing WhatsmiauWorker and adds the live application boundary:
 * provider instance -> channel/workspace -> atomic inbox RPC -> safe automation.
 */
export class LiveWorker {
  private readonly pollIntervalMs: number;
  private readonly options: LiveWorkerOptions;
  private readonly workerId: string;
  private readonly stageJobStore: JobStore<LiveWorkerJobPayload>;
  private loopPromise: Promise<void> | null = null;
  private stopRequested = false;

  constructor(options: LiveWorkerOptions) {
    this.options = options;
    this.pollIntervalMs = Math.max(
      100,
      options.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS,
    );
    this.workerId = options.workerId ?? `mend-worker-${process.pid}`;
    // The webhook adapter is intentionally kept as the public ingress
    // contract. Internally the store also carries the durable processing-stage
    // payload; both shapes live in the same service-role jobs table.
    this.stageJobStore =
      options.jobStore as unknown as JobStore<LiveWorkerJobPayload>;
  }

  /** Poll once. The job store owns claim, retry/backoff and dead-letter behavior. */
  async poll(): Promise<boolean> {
    const job = await this.options.jobStore.claim(this.workerId);
    if (!job) return false;

    const typedJob = job as unknown as JobRecord<LiveWorkerJobPayload>;
    try {
      await this.processJob(typedJob);
      await this.options.jobStore.complete(job.id, this.workerId);
      if (typedJob.type === PROCESS_INBOUND_MESSAGE_JOB_TYPE) {
        const stage = typedJob.payload as ProcessInboundMessageJobPayload;
        await this.markWebhookEvent(
          stage.ingestionJobId,
          "processed",
          stage.persisted.id,
        );
      }
    } catch (error) {
      try {
        const retry = await this.options.jobStore.fail(
          job.id,
          error,
          new Date(),
          this.workerId,
        );
        const eventJobId =
          typedJob.type === PROCESS_INBOUND_MESSAGE_JOB_TYPE
            ? (typedJob.payload as ProcessInboundMessageJobPayload)
                .ingestionJobId
            : job.id;
        await this.markWebhookEvent(
          eventJobId,
          retry?.status === "dead" ? "dead" : "retrying",
          undefined,
          error,
        );
      } catch {
        // A lost lease or store outage must not terminate the polling loop.
        // The durable job remains available for its current owner/reclaimer.
      }
    }
    return true;
  }

  /** Start a single polling loop. Calling start repeatedly is safe. */
  start(): void {
    if (this.loopPromise) return;
    this.stopRequested = false;
    this.loopPromise = this.runLoop();
  }

  /** Stop after the current poll finishes. */
  async stop(): Promise<void> {
    this.stopRequested = true;
    const loop = this.loopPromise;
    if (loop) await loop;
    this.loopPromise = null;
  }

  get running(): boolean {
    return this.loopPromise !== null;
  }

  private async runLoop(): Promise<void> {
    try {
      while (!this.stopRequested) {
        let worked = false;
        try {
          worked = await this.poll();
        } catch {
          // A store outage must not kill the long-lived worker process. The next
          // poll retries the claim and the job store handles per-job retries.
        }
        if (!worked && !this.stopRequested) await delay(this.pollIntervalMs);
      }
    } finally {
      this.loopPromise = null;
    }
  }

  private async processJob(
    job: JobRecord<LiveWorkerJobPayload>,
  ): Promise<void> {
    if (job.type === WHATSAPP_INGEST_JOB_TYPE) {
      const payload = job.payload as WhatsmiauMessageJobPayload;
      if (
        !payload?.message ||
        typeof payload.message.providerMessageId !== "string"
      ) {
        throw new Error("invalid_whatsmiau_message_job");
      }
      await this.processMessage(
        payload.message,
        job as unknown as JobRecord<WhatsmiauMessageJobPayload>,
      );
      return;
    }
    if (job.type === PROCESS_INBOUND_MESSAGE_JOB_TYPE) {
      await this.processInboundStage(
        job.payload as ProcessInboundMessageJobPayload,
        job,
      );
      return;
    }
    if (job.type === SEND_AI_REPLY_JOB_TYPE) {
      if (!this.options.automation?.sendAiReply) return;
      const payload = job.payload as SendAiReplyJobPayload;
      if (payload.stage !== "send_ai_reply" || !payload.binding?.workspaceId)
        throw new Error("invalid_send_ai_reply_job");
      await this.options.automation.sendAiReply(payload);
      return;
    }
    if (job.type === MEDIA_PROCESS_JOB_TYPE) {
      if (!this.options.mediaPipeline)
        throw new Error("media_pipeline_not_configured");
      const payload = job.payload as MediaProcessJobPayload;
      if (!payload?.assetId || !payload.workspaceId)
        throw new Error("invalid_media_process_job");
      await this.options.mediaPipeline.processAsset(payload);
      return;
    }
    throw new Error(`unsupported_job_type:${job.type}`);
  }

  private async processMessage(
    message: NormalizedWhatsmiauMessage,
    job: JobRecord<WhatsmiauMessageJobPayload>,
  ): Promise<void> {
    const instanceName = cleanInstanceName(message.instanceName);
    if (!instanceName) return;

    const binding = await this.options.channelResolver.resolve(instanceName);
    if (!binding) {
      await this.markWebhookEvent(job.id, "unmapped");
      this.options.onUnmappedMessage?.({
        instanceName,
        jobId: job.id,
        providerMessageId: message.providerMessageId,
      });
      // The provider can send events before an instance is onboarded. Ack it
      // without guessing a workspace or retrying a permanently unmapped event.
      return;
    }

    if (job.workspaceId && job.workspaceId !== binding.workspaceId) {
      throw new Error("job_workspace_channel_mismatch");
    }

    const persisted = await this.options.inbox.persistNormalizedMessage(
      { workspaceId: binding.workspaceId, actorType: "system" },
      binding.channelConnectionId,
      { ...message, instanceName },
    );

    const isGroup =
      message.chatType === "group" || message.remoteJid.endsWith("@g.us");
    if (
      isGroup &&
      this.options.groupDirectory?.getGroupInfo &&
      this.options.inbox.setContactDisplayName
    ) {
      try {
        const group = await this.options.groupDirectory.getGroupInfo({
          instanceName,
          remoteJid: message.remoteJid,
        });
        if (group?.subject)
          await this.options.inbox.setContactDisplayName(
            { workspaceId: binding.workspaceId, actorType: "system" },
            persisted.contactId,
            group.subject,
          );
      } catch {
        // Group metadata is supplemental; message ingestion must still finish.
      }
    }

    if (message.direction !== "inbound" || !this.options.automation) {
      await this.markWebhookEvent(job.id, "processed", persisted.id);
      return;
    }

    const idempotencyKey = `whatsapp:${binding.channelConnectionId}:${persisted.id}`;
    await this.stageJobStore.enqueue({
      workspaceId: binding.workspaceId,
      type: PROCESS_INBOUND_MESSAGE_JOB_TYPE,
      payload: {
        stage: "process_inbound_message",
        ingestionJobId: job.id,
        binding,
        idempotencyKey,
        message: {
          ...message,
          ...(persisted.transcript ? { text: persisted.transcript } : {}),
        },
        persisted,
      },
      dedupeKey: `mend:process-inbound:${binding.channelConnectionId}:${persisted.id}`,
      maxAttempts: job.maxAttempts,
    });
    await this.markWebhookEvent(job.id, "queued", persisted.id);
  }

  private async processInboundStage(
    payload: ProcessInboundMessageJobPayload,
    job: JobRecord<LiveWorkerJobPayload>,
  ): Promise<void> {
    if (
      payload.stage !== "process_inbound_message" ||
      !payload.binding?.workspaceId ||
      !payload.persisted?.id
    ) {
      throw new Error("invalid_process_inbound_message_job");
    }
    if (!this.options.automation) return;
    const automation = this.options.automation;
    const automationBase = {
      binding: payload.binding,
      idempotencyKey: payload.idempotencyKey,
      job: job as unknown as JobRecord<WhatsmiauMessageJobPayload>,
      message: payload.message,
      persisted: payload.persisted,
    };
    if (automation.isComplete && (await automation.isComplete(automationBase)))
      return;

    const knowledge = this.options.knowledge
      ? await this.options.knowledge.listPublished(payload.binding.workspaceId)
      : [];
    const result = await automation.process({ ...automationBase, knowledge });
    if (result?.send) {
      await this.stageJobStore.enqueue({
        workspaceId: payload.binding.workspaceId,
        type: SEND_AI_REPLY_JOB_TYPE,
        payload: { stage: "send_ai_reply", ...result.send },
        dedupeKey: `mend:send-ai-reply:${payload.binding.workspaceId}:${payload.persisted.id}`,
        maxAttempts: job.maxAttempts,
      });
    }
    if (result?.issue && this.options.onIssueReady)
      await this.options.onIssueReady(result.issue);
    if (result?.draft && this.options.onDraftReady)
      await this.options.onDraftReady(result.draft);
  }

  private async markWebhookEvent(
    jobId: string,
    status: "queued" | "processed" | "retrying" | "dead" | "unmapped",
    messageId?: string,
    error?: unknown,
  ): Promise<void> {
    if (!jobId) return;
    const client =
      this.options.automation instanceof SupabaseLiveWorkerAutomation
        ? this.options.automation.metadataClient
        : null;
    if (!client) return;
    const patch = {
      status,
      ...(messageId ? { message_id: messageId } : {}),
      ...(status === "processed"
        ? { processed_at: new Date().toISOString() }
        : {}),
      ...(error ? { last_error: safeOperationalError(error) } : {}),
      updated_at: new Date().toISOString(),
    };
    try {
      await client
        .from("webhook_events")
        .update(patch)
        .eq("job_id", jobId)
        .select("id")
        .maybeSingle();
    } catch {
      // Delivery metadata is diagnostic; it must never turn a successfully
      // persisted message into a retry storm.
    }
  }
}

/** Supabase-backed instance lookup. Ambiguous instances are rejected safely. */
export class SupabaseLiveWorkerChannelResolver
  implements LiveWorkerChannelResolver
{
  constructor(private readonly client: LiveWorkerSupabaseClient) {}

  async resolve(instanceName: string): Promise<LiveChannelBinding | null> {
    const normalized = cleanInstanceName(instanceName);
    if (!normalized) return null;
    const result = await this.client
      .from("channel_connections")
      .select("id, workspace_id, provider_instance_name")
      .eq("provider", "whatsmiau")
      .eq("provider_instance_name", normalized);
    if (result.error)
      throw new Error(`supabase:channel_connections:${result.error.message}`);
    const rows = result.data ?? [];
    if (rows.length === 0) return null;
    if (rows.length > 1) throw new Error("channel_instance_ambiguous");
    return {
      channelConnectionId: String(rows[0].id),
      instanceName: String(rows[0].provider_instance_name),
      workspaceId: String(rows[0].workspace_id),
    };
  }
}

/** Reads bounded published articles only; drafts never enter an AI prompt. */
export class SupabaseLiveWorkerKnowledge implements LiveWorkerKnowledge {
  constructor(
    private readonly client: LiveWorkerSupabaseClient,
    private readonly maxArticles = 20,
    private readonly maxTotalCharacters = 50_000,
  ) {}

  async listPublished(
    workspaceId: string,
  ): Promise<readonly LiveWorkerKnowledgeArticle[]> {
    const result = await this.client
      .from("knowledge_articles")
      .select("id, title, category, body")
      .eq("workspace_id", workspaceId)
      .eq("status", "published")
      .order("updated_at", { ascending: false })
      .limit(this.maxArticles);
    if (result.error)
      throw new Error(`supabase:knowledge_articles:${result.error.message}`);

    let remaining = Math.max(0, this.maxTotalCharacters);
    const articles: LiveWorkerKnowledgeArticle[] = [];
    for (const row of result.data ?? []) {
      if (remaining <= 0) break;
      const article = row as Pick<
        KnowledgeArticleRow,
        "id" | "title" | "category" | "body"
      >;
      const body = article.body.slice(0, remaining);
      articles.push({
        id: String(article.id),
        title: String(article.title),
        category: String(article.category),
        body,
      });
      remaining -= body.length;
    }
    return articles;
  }
}

/**
 * Safe default automation: retrieve published knowledge, validate structured
 * triage, create/update a native issue for operational intents, and expose a
 * reviewable draft for low-risk intents. It never sends a reply, executes
 * tools, changes permissions, or treats customer content as instructions.
 */
export class SupabaseLiveWorkerAutomation implements LiveWorkerAutomation {
  private readonly inbox: InboxService;
  private readonly whatsapp?: WhatsAppService;
  private readonly push = new WorkspacePushNotifier();

  constructor(
    private readonly client: LiveWorkerSupabaseClient,
    private readonly provider: SupportAiProvider,
    inbox?: InboxService,
    whatsappProvider?: WhatsAppProvider,
    private readonly codexStarter?: LiveWorkerCodexStarter,
  ) {
    this.inbox = inbox ?? new InboxService(new SupabaseInboxPort(client));
    if (whatsappProvider)
      this.whatsapp = new WhatsAppService(this.inbox, whatsappProvider);
  }

  get metadataClient(): UncheckedSupabaseClient {
    return this.client as unknown as UncheckedSupabaseClient;
  }

  async isComplete(
    input: Omit<LiveWorkerAutomationInput, "knowledge">,
  ): Promise<boolean> {
    const result = await this.client
      .from("conversation_ai_state")
      .select("last_triaged_message_id")
      .eq("workspace_id", input.binding.workspaceId)
      .eq("conversation_id", input.persisted.conversationId)
      .maybeSingle();
    if (result.error)
      throw new Error(`supabase:conversation_ai_state:${result.error.message}`);
    return result.data?.last_triaged_message_id === input.persisted.id;
  }

  async process(
    input: LiveWorkerAutomationInput,
  ): Promise<LiveWorkerAutomationResult | void> {
    if (await this.processSupportFlow(input)) return;
    const current = await this.currentState(input);
    if (current?.lastTriagedMessageId === input.persisted.id) {
      return;
    }
    if (current?.automationState === "human_paused") return;
    const modePolicy = await this.aiMode(input);
    if (modePolicy.mode === "off") return;
    const triage = await triageConversation(
      this.provider,
      triageConversationInput(input.message, input.knowledge),
    );
    const beforeWrite = await this.currentState(input);
    if (
      (beforeWrite?.lastTriagedMessageId ?? null) !==
      (current?.lastTriagedMessageId ?? null)
    ) {
      // Another worker advanced the checkpoint while AI was running. Do not
      // overwrite its newer result; this job can complete safely.
      return;
    }
    if (beforeWrite?.automationState === "human_paused") {
      await this.auditDecision(input, triage, "ai.human_paused", {
        stage: "triage",
      });
      return;
    }

    const matchedKnowledge = relevantKnowledge(input.message, input.knowledge);
    let mcpConnections: McpRuntimeConnection[] = [];
    let mcpFailureRequiresReview = false;
    if (modePolicy.policy.allowedIntegrations.includes("mcp")) {
      const attempts =
        modePolicy.policy.mcpFailurePolicy === "retry_then_review" ? 3 : 1;
      for (let attempt = 0; attempt < attempts; attempt += 1) {
        try {
          mcpConnections = await this.loadMcpConnections(input);
          break;
        } catch (error) {
          if (attempt === attempts - 1) {
            mcpFailureRequiresReview =
              modePolicy.policy.mcpFailurePolicy !== "generic_reply";
            await this.auditDecision(input, triage, "ai.mcp_failed", {
              policy: modePolicy.policy.mcpFailurePolicy,
              attempts: attempt + 1,
              error:
                error instanceof Error
                  ? error.message.slice(0, 200)
                  : "unknown",
            });
          }
        }
      }
    }
    const configuredRoute = modePolicy.policy.routes[triage.intent];
    let route =
      configuredRoute === "knowledge_auto_reply" &&
      modePolicy.policy.requirePublishedKnowledge &&
      !matchedKnowledge.length &&
      !mcpConnections.length
        ? modePolicy.policy.fallbackRoute
        : configuredRoute;
    if (mcpFailureRequiresReview && route !== "bug_triage")
      route = "human_escalation";
    const provisionalDecision = policyDecision(
      modePolicy.mode,
      triage,
      modePolicy.policy,
      matchedKnowledge.length > 0 || mcpConnections.length > 0,
      route,
    );
    const issue =
      route === "bug_triage"
        ? await this.upsertIssue(input, triage)
        : undefined;
    let draft: LiveWorkerDraft | undefined;
    if (provisionalDecision.allowed && route !== "bug_triage") {
      try {
        draft = await this.buildDraft(
          input,
          triage,
          modePolicy.mode,
          provisionalDecision,
          matchedKnowledge,
          mcpConnections,
        );
      } catch (error) {
        await this.auditDecision(input, triage, "ai.mcp_failed", {
          policy: modePolicy.policy.mcpFailurePolicy,
          stage: "draft",
          error:
            error instanceof Error ? error.message.slice(0, 200) : "unknown",
        });
        if (
          modePolicy.policy.mcpFailurePolicy === "generic_reply" &&
          matchedKnowledge.length
        ) {
          draft = await this.buildDraft(
            input,
            triage,
            modePolicy.mode,
            provisionalDecision,
            matchedKnowledge,
            [],
          );
        } else {
          route = "human_escalation";
        }
      }
    }
    const hasEvidence =
      matchedKnowledge.length > 0 || draft?.mcpEvidence === true;
    for (const call of draft?.mcpCalls ?? []) {
      await this.auditDecision(input, triage, "ai.mcp_tool_called", {
        connectionId: call.connectionId,
        tool: call.toolName,
        classification: call.kind,
        status: call.status,
        mode: modePolicy.mode,
      });
      if (call.kind === "write" && call.status !== "approval_denied") {
        await this.metadataClient
          .from("mcp_tool_executions")
          .update({
            status: call.status === "completed" ? "completed" : "failed",
            updated_at: new Date().toISOString(),
          })
          .eq("workspace_id", input.binding.workspaceId)
          .eq("source_message_id", input.persisted.id)
          .eq("idempotency_key", input.idempotencyKey)
          .eq("connection_id", call.connectionId)
          .eq("tool_name", call.toolName);
      }
    }
    const decision = policyDecision(
      modePolicy.mode,
      triage,
      modePolicy.policy,
      hasEvidence,
      route,
    );
    if (draft && decision.allowed)
      await this.persistDraft(
        input,
        draft,
        triage,
        modePolicy.mode,
        modePolicy.policy,
        decision,
        matchedKnowledge,
      );
    if (
      (route === "human_escalation" ||
        (route === "knowledge_auto_reply" && !matchedKnowledge.length)) &&
      modePolicy.policy.notifyOnHumanEscalation
    ) {
      await this.notifyWorkspace(
        input,
        triage,
        "ai.human_escalation",
        "AI escalated a conversation",
        `The AI could not safely answer: ${triage.summary}`,
        `ai-human-escalation:${input.persisted.conversationId}:${input.persisted.id}`,
      );
    }
    if (route === "bug_triage" && modePolicy.policy.notifyOnBug && issue) {
      await this.notifyWorkspace(
        input,
        triage,
        "ai.bug_reported",
        `Bug reported in ${issue.identifier}`,
        `A customer reported a possible bug: ${triage.summary}`,
        `ai-bug-reported:${issue.id}:${input.persisted.id}`,
        issue.id,
      );
    }
    if (
      route === "bug_triage" &&
      issue &&
      modePolicy.policy.bugAutoFixEnabled &&
      modePolicy.policy.allowedIntegrations.includes("codex") &&
      modePolicy.policy.allowedActions.includes("investigate") &&
      !triage.unsafe &&
      triage.confidence >= modePolicy.policy.safeAutoMinConfidence &&
      this.codexStarter
    ) {
      await this.startCodexForBug(input, issue, triage);
    }
    await this.auditDecision(
      input,
      triage,
      decision.allowed ? "ai.triage.completed" : "ai.blocked",
      {
        mode: modePolicy.mode,
        decision: decision.action,
        route,
        hasKnowledge: hasEvidence,
        mcpEvidence: draft?.mcpEvidence ?? false,
        mcpCalls: draft?.mcpCalls?.map(
          ({ connectionId, toolName, kind, status }) => ({
            connectionId,
            toolName,
            kind,
            status,
          }),
        ),
      },
    );
    const { error } = await this.client
      .from("conversation_ai_state")
      .upsert(
        aiStateInput(
          input,
          triage,
          modePolicy.mode,
          modePolicy.policy,
          matchedKnowledge.length > 0,
          route,
        ),
        { onConflict: "conversation_id" },
      );
    if (error)
      throw new Error(`supabase:conversation_ai_state:${error.message}`);
    const takeoverReason = triage.unsafe
      ? "unsafe_intent"
      : modePolicy.mode === "safe_auto" &&
          triage.confidence < modePolicy.policy.safeAutoMinConfidence
        ? "low_confidence"
        : null;
    if (takeoverReason) {
      const takeover = await this.client.rpc("pause_conversation_ai", {
        p_workspace_id: input.binding.workspaceId,
        p_conversation_id: input.persisted.conversationId,
        p_reason: takeoverReason,
      });
      if (takeover.error)
        throw new Error(
          `supabase:conversation_ai.pause:${takeover.error.message}`,
        );
    }
    const canSend =
      Boolean(draft && decision.allowed) &&
      decision.action === "auto_reply" &&
      modePolicy.policy.safeAutoSendEnabled;
    const result: LiveWorkerAutomationResult = {
      ...(issue ? { issue } : {}),
      ...(draft ? { draft } : {}),
      ...(canSend && draft
        ? {
            send: {
              binding: input.binding,
              conversationId: draft.conversationId,
              sourceMessageId: draft.messageId,
              idempotencyKey: draft.idempotencyKey,
              body: draft.body,
              triage,
            },
          }
        : {}),
    };
    return Object.keys(result).length ? result : undefined;
  }

  private async processSupportFlow(
    input: LiveWorkerAutomationInput,
  ): Promise<boolean> {
    const channelResult = await this.client
      .from("channel_connections")
      .select("settings_json")
      .eq("id", input.binding.channelConnectionId)
      .eq("workspace_id", input.binding.workspaceId)
      .maybeSingle();
    if (channelResult.error)
      throw new Error(
        `supabase:channel_connections:flow:${channelResult.error.message}`,
      );
    const channel = channelResult.data as { settings_json?: unknown } | null;
    const flow = flowFromChannelSettings(channel?.settings_json);
    if (!flow.enabled) return false;

    const conversationResult = await this.client
      .from("conversations")
      .select("support_flow_state_json")
      .eq("id", input.persisted.conversationId)
      .eq("workspace_id", input.binding.workspaceId)
      .maybeSingle();
    if (conversationResult.error)
      throw new Error(
        `supabase:conversations:flow:${conversationResult.error.message}`,
      );
    const stateValue = (
      conversationResult.data as { support_flow_state_json?: unknown } | null
    )?.support_flow_state_json;
    const state =
      stateValue && typeof stateValue === "object" && !Array.isArray(stateValue)
        ? (stateValue as { started?: boolean; nodeId?: string })
        : {};
    const currentNode = state.nodeId
      ? flow.nodes.find((node) => node.id === state.nodeId)
      : undefined;
    const normalizedText = input.message.text?.trim().toLocaleLowerCase() ?? "";
    let target: SupportFlowNode | undefined;
    if (!state.started) {
      const triggered =
        flow.trigger.type === "first_message" ||
        flow.trigger.keywords.some((keyword) =>
          normalizedText.includes(keyword.toLocaleLowerCase()),
        );
      if (!triggered) return false;
      target = flow.nodes.find((node) => node.id === flow.rootNodeId);
    } else if (currentNode?.type === "menu") {
      const option = currentNode.options.find(
        (item) =>
          item.id === input.message.interactionId ||
          item.label.toLocaleLowerCase() === normalizedText,
      );
      if (!option) {
        await this.sendFlowNode(input, currentNode);
        return true;
      }
      target = option.nextNodeId
        ? flow.nodes.find((node) => node.id === option.nextNodeId)
        : undefined;
      if (!target) {
        await this.updateFlowState(input, { started: true });
        return true;
      }
    } else {
      return false;
    }
    if (!target) return false;
    await this.sendFlowNode(input, target);
    await this.updateFlowState(
      input,
      target.type === "menu"
        ? { started: true, nodeId: target.id }
        : { started: true },
    );
    if (target.type === "handoff") {
      await this.client
        .from("conversations")
        .update({
          attention_state: "needs_attention",
          updated_at: new Date().toISOString(),
        })
        .eq("id", input.persisted.conversationId)
        .eq("workspace_id", input.binding.workspaceId);
    }
    return true;
  }

  private async sendFlowNode(
    input: LiveWorkerAutomationInput,
    node: SupportFlowNode,
  ): Promise<void> {
    if (!this.whatsapp) return;
    await this.whatsapp.sendFlowNode(
      { workspaceId: input.binding.workspaceId, actorType: "system" },
      input.persisted.conversationId,
      node,
    );
  }

  private async updateFlowState(
    input: LiveWorkerAutomationInput,
    state: { started: boolean; nodeId?: string },
  ): Promise<void> {
    const result = await this.client
      .from("conversations")
      .update({
        support_flow_state_json: {
          ...state,
          updatedAt: new Date().toISOString(),
        },
        updated_at: new Date().toISOString(),
      })
      .eq("id", input.persisted.conversationId)
      .eq("workspace_id", input.binding.workspaceId)
      .select("id")
      .maybeSingle();
    if (result.error)
      throw new Error(
        `supabase:conversations:flow_update:${result.error.message}`,
      );
  }

  async sendAiReply(input: LiveWorkerSendAiReplyInput): Promise<void> {
    if (!this.whatsapp) throw new Error("whatsapp_provider_not_configured");
    const claim = await this.client.rpc("claim_ai_reply_send", {
      p_workspace_id: input.binding.workspaceId,
      p_conversation_id: input.conversationId,
      p_source_message_id: input.sourceMessageId,
      p_idempotency_key: input.idempotencyKey,
    });
    if (claim.error) {
      if (/human_paused/i.test(claim.error.message)) {
        await this.auditDecision(input, input.triage, "ai.human_paused", {
          stage: "send_ai_reply",
        });
        return;
      }
      throw new Error(`supabase:claim_ai_reply_send:${claim.error.message}`);
    }
    const row = (
      Array.isArray(claim.data) ? claim.data[0] : claim.data
    ) as Record<string, unknown> | null;
    if (!row?.id) throw new Error("supabase:claim_ai_reply_send:empty_result");
    if (row.status === "sent") return;
    try {
      await this.whatsapp.sendText(
        {
          workspaceId: input.binding.workspaceId,
          actorType: "ai",
        },
        input.conversationId,
        {
          text: input.body,
          aiGenerated: true,
          onProviderMessageId: async (providerMessageId) => {
            const updated = await this.metadataClient
              .from("ai_outbound_messages")
              .update({
                provider_message_id: providerMessageId,
                status: "sent",
                sent_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
              })
              .eq("id", String(row.id))
              .select("id")
              .maybeSingle();
            if (updated.error)
              throw new Error(
                `supabase:ai_outbound_messages:${updated.error.message}`,
              );
          },
        },
      );
      await this.auditDecision(input, input.triage, "ai.auto_reply.sent", {
        sourceMessageId: input.sourceMessageId,
      });
    } catch (error) {
      await this.metadataClient
        .from("ai_outbound_messages")
        .update({
          status: "failed",
          error_code: safeOperationalError(error),
          updated_at: new Date().toISOString(),
        })
        .eq("id", String(row.id));
      throw error;
    }
  }

  private async aiMode(
    input: LiveWorkerAutomationInput,
  ): Promise<{ mode: LiveWorkerAiMode; policy: LiveWorkerAiPolicy }> {
    const [conversation, workspace] = await Promise.all([
      this.client
        .from("conversations")
        .select("ai_mode")
        .eq("id", input.persisted.conversationId)
        .eq("workspace_id", input.binding.workspaceId)
        .maybeSingle(),
      this.client
        .from("workspaces")
        .select("ai_policy_json")
        .eq("id", input.binding.workspaceId)
        .maybeSingle(),
    ]);
    if (conversation.error)
      throw new Error(`supabase:conversations:${conversation.error.message}`);
    if (workspace.error)
      throw new Error(`supabase:workspaces:${workspace.error.message}`);
    const mode = conversation.data?.ai_mode;
    return {
      mode:
        mode === "off" || mode === "safe_auto" || mode === "draft"
          ? mode
          : "draft",
      policy: normalizeAiPolicy(
        (workspace.data as Record<string, unknown> | null)?.ai_policy_json,
      ),
    };
  }

  private async upsertIssue(
    input: LiveWorkerAutomationInput,
    triage: TriageResult,
  ): Promise<LiveWorkerIssue | undefined> {
    const type = issueType(triage.intent);
    if (!type) return undefined;

    const existing = await this.client
      .from("issues")
      .select("id, identifier")
      .eq("workspace_id", input.binding.workspaceId)
      .eq("conversation_id", input.persisted.conversationId)
      .in("status", ["triage", "backlog", "todo", "in_progress", "review"])
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    if (existing.error)
      throw new Error(`supabase:issues:find:${existing.error.message}`);

    const patch = {
      type,
      priority: issuePriority(triage.priority),
      title: boundedText(triage.summary, 240) || "WhatsApp support handoff",
      description: boundedText(messageText(input.message), 20_000),
      ai_summary: boundedText(triage.summary, 2_000),
      confidence: triage.confidence,
      updated_at: new Date().toISOString(),
    };
    let issueId: string;
    let identifier: string;
    let operation: LiveWorkerIssue["operation"];
    if (existing.data) {
      issueId = String(existing.data.id);
      identifier = String(existing.data.identifier);
      const updated = await this.client
        .from("issues")
        .update(patch)
        .eq("id", issueId)
        .eq("workspace_id", input.binding.workspaceId)
        .select("id, identifier")
        .single();
      if (updated.error || !updated.data)
        throw new Error(
          `supabase:issues:update:${updated.error?.message ?? "empty_result"}`,
        );
      operation = "updated";
    } else {
      const claimed = await this.client.rpc("claim_issue_number", {
        target_workspace_id: input.binding.workspaceId,
      });
      if (claimed.error || !claimed.data)
        throw new Error(
          `supabase:claim_issue_number:${claimed.error?.message ?? "empty_result"}`,
        );
      identifier = String(claimed.data);
      const created = await this.client
        .from("issues")
        .insert({
          workspace_id: input.binding.workspaceId,
          number: issueIdentifierNumber(identifier),
          identifier,
          conversation_id: input.persisted.conversationId,
          contact_id: input.persisted.contactId,
          source: "ai",
          created_by: "ai",
          status: "triage",
          ...patch,
        })
        .select("id, identifier")
        .single();
      if (created.error || !created.data)
        throw new Error(
          `supabase:issues:create:${created.error?.message ?? "empty_result"}`,
        );
      issueId = String(created.data.id);
      identifier = String(created.data.identifier);
      operation = "created";
    }

    await this.inbox.linkIssueMessage(
      { workspaceId: input.binding.workspaceId },
      issueId,
      input.persisted.id,
    );
    return { id: issueId, identifier, operation };
  }

  private async notifyWorkspace(
    input: LiveWorkerAutomationInput,
    triage: TriageResult,
    kind: string,
    title: string,
    body: string,
    dedupeKey: string,
    entityId = input.persisted.conversationId,
  ): Promise<void> {
    const result = await this.metadataClient
      .from("notifications")
      .insert({
        workspace_id: input.binding.workspaceId,
        user_id: null,
        kind,
        title: boundedText(title, 240),
        body: boundedText(body, 2_000),
        entity_type:
          entityId === input.persisted.conversationId
            ? "conversation"
            : "issue",
        entity_id: entityId,
        payload_json: {
          intent: triage.intent,
          confidence: triage.confidence,
          summary: triage.summary,
          i18n: {
            namespace: "notifications",
            titleKey:
              kind === "conversation_message"
                ? "conversationMessageTitle"
                : "workspaceNotificationFallback",
            bodyKey:
              kind === "conversation_message"
                ? "conversationMessageBody"
                : "workspaceNotificationFallback",
            params: {},
          },
        },
        dedupe_key: dedupeKey,
      })
      .select("id")
      .maybeSingle();
    if (result.error && !/duplicate|unique/i.test(result.error.message))
      throw new Error(`supabase:notifications:${result.error.message}`);
    if (!result.error) {
      await this.push.notify(this.client, input.binding.workspaceId, {
        title: boundedText(title, 240),
        body: boundedText(body, 2_000),
        kind,
        url:
          entityId === input.persisted.conversationId
            ? `/inbox?conversation=${encodeURIComponent(input.persisted.conversationId)}`
            : `/issues/${encodeURIComponent(entityId)}`,
        tag: kind,
      });
    }
  }

  private async startCodexForBug(
    input: LiveWorkerAutomationInput,
    issue: { id: string; identifier: string; operation: "created" | "updated" },
    triage: TriageResult,
  ): Promise<void> {
    try {
      const started = await this.codexStarter?.start({
        workspaceId: input.binding.workspaceId,
        issueId: issue.id,
        issueIdentifier: issue.identifier,
        issueTitle: triage.summary,
        summary: triage.summary,
        customerMessage: input.message.text ?? "",
      });
      if (!started) return;
      await this.notifyWorkspace(
        input,
        triage,
        "ai.codex_started",
        `Codex started for ${issue.identifier}`,
        `Codex is investigating this bug automatically. Run ${started.runId} will stop for approval before publication.`,
        `ai-codex-started:${started.runId}`,
        issue.id,
      );
      void started.completion.then(
        async () =>
          this.notifyWorkspace(
            input,
            triage,
            "ai.codex_ready",
            `Codex result ready for ${issue.identifier}`,
            "The proposed fix and checks are ready for human approval.",
            `ai-codex-ready:${started.runId}`,
            issue.id,
          ),
        async (error) =>
          this.notifyWorkspace(
            input,
            triage,
            "ai.codex_failed",
            `Codex failed for ${issue.identifier}`,
            `The automatic fix could not be completed: ${error instanceof Error ? error.message : String(error)}`,
            `ai-codex-failed:${started.runId}`,
            issue.id,
          ),
      );
    } catch (error) {
      await this.notifyWorkspace(
        input,
        triage,
        "ai.codex_failed",
        `Codex could not start for ${issue.identifier}`,
        `Configure a repository before automatic fixes: ${error instanceof Error ? error.message : String(error)}`,
        `ai-codex-start-failed:${issue.id}:${input.persisted.id}`,
        issue.id,
      );
    }
  }

  private async buildDraft(
    input: LiveWorkerAutomationInput,
    triage: TriageResult,
    mode: LiveWorkerAiMode,
    decision: ReturnType<typeof policyDecision>,
    knowledge: readonly LiveWorkerKnowledgeArticle[],
    mcpConnections: readonly McpRuntimeConnection[],
  ): Promise<LiveWorkerDraft | undefined> {
    if (triage.unsafe || !decision.allowed || mode === "off") return undefined;
    const workspace = await this.metadataClient
      .from("workspaces")
      .select("default_language")
      .eq("id", input.binding.workspaceId)
      .maybeSingle();
    if (workspace.error)
      throw new Error(
        "supabase:workspaces:language:" + workspace.error.message,
      );
    const workspaceRow = (workspace.data ?? {}) as {
      default_language?: unknown;
    };
    const phone = await this.customerPhone(input);
    const history = await this.conversationHistory(input);
    const conversation = [
      "<customer_context>",
      `normalized_phone: ${phone}`,
      "</customer_context>",
      conversationReplyInput(history, input.persisted.id),
    ].join("\n");
    const contextResult =
      mcpConnections.length && this.provider.draftReplyWithContext
        ? await this.provider.draftReplyWithContext({
            conversation,
            knowledgeContext: safeKnowledgeContext(knowledge),
            language: normalizeLocale(workspaceRow.default_language),
            mcpConnections,
            onMcpApproval: (approval) =>
              this.approveMcpWrite(input, mode, mcpConnections, approval),
          })
        : {
            body: await this.provider.draftReply(
              conversation,
              safeKnowledgeContext(knowledge),
              normalizeLocale(workspaceRow.default_language),
            ),
            mcpEvidence: false,
            mcpCalls: [],
          };
    const body = boundedText(contextResult.body, 12_000);
    if (!body) return undefined;
    return {
      conversationId: input.persisted.conversationId,
      messageId: input.persisted.id,
      idempotencyKey: input.idempotencyKey,
      body,
      knowledgeArticleIds: knowledge.map((article) => article.id),
      triage,
      mcpEvidence: contextResult.mcpEvidence,
      mcpCalls: contextResult.mcpCalls,
    };
  }

  private async conversationHistory(input: LiveWorkerAutomationInput): Promise<
    Array<{
      id: string;
      direction: string;
      text: string | null;
      caption: string | null;
    }>
  > {
    const result = await this.client
      .from("messages")
      .select("id, direction, text, caption, created_at")
      .eq("workspace_id", input.binding.workspaceId)
      .eq("conversation_id", input.persisted.conversationId)
      .eq("is_deleted", false)
      .order("created_at", { ascending: false })
      .limit(50);
    if (result.error)
      throw new Error(`supabase:messages:ai_context:${result.error.message}`);

    const history = [...(result.data ?? [])].reverse();
    const targetIndex = history.findIndex(
      (message) => message.id === input.persisted.id,
    );
    if (targetIndex >= 0) {
      const context = history.slice(0, targetIndex + 1);
      const target = context[targetIndex];
      if (!target.text?.trim() && !target.caption?.trim())
        target.text = messageText(input.message);
      return context;
    }
    return [
      {
        id: input.persisted.id,
        direction: "inbound",
        text: messageText(input.message),
        caption: null,
      },
    ];
  }

  private async loadMcpConnections(
    input: LiveWorkerAutomationInput,
  ): Promise<McpRuntimeConnection[]> {
    const result = await this.metadataClient
      .from("mcp_connections")
      .select("*")
      .eq("workspace_id", input.binding.workspaceId)
      .eq("status", "connected");
    if (result.error)
      throw new Error(`supabase:mcp_connections:${result.error.message}`);
    const rows = Array.isArray(result.data) ? result.data : [];
    const output: McpRuntimeConnection[] = [];
    for (const value of rows) {
      const row = value as Record<string, unknown>;
      const connection = mcpConnectionRecordFromRow(row);
      if (!connection.allowedToolNames.length) continue;
      let headers: Record<string, string> = {};
      if (row.auth_mode === "headers") {
        const secret = await this.metadataClient
          .from("mcp_connection_secrets")
          .select("headers_encrypted")
          .eq("connection_id", String(row.id))
          .maybeSingle();
        if (secret.error)
          throw new Error(`supabase:mcp_secrets:${secret.error.message}`);
        if (
          typeof (secret.data as Record<string, unknown> | null)
            ?.headers_encrypted === "string"
        ) {
          const plaintext = decryptMcpSecret(
            String((secret.data as Record<string, unknown>).headers_encrypted),
            connectionEncryptionKey(),
          );
          const parsed = JSON.parse(plaintext) as unknown;
          if (parsed && typeof parsed === "object" && !Array.isArray(parsed))
            headers = Object.fromEntries(
              Object.entries(parsed).filter(
                (entry): entry is [string, string] =>
                  typeof entry[1] === "string",
              ),
            );
        }
      }
      output.push({
        ...connection,
        status: "connected",
        lastError: connection.lastError,
        headers,
      });
    }
    return output;
  }

  private async customerPhone(
    input: LiveWorkerAutomationInput,
  ): Promise<string> {
    const fromMessage = normalizePhoneNumber(input.message.phoneNumber || "");
    if (fromMessage) return fromMessage;
    const result = await this.metadataClient
      .from("contacts")
      .select("phone_number")
      .eq("id", input.persisted.contactId)
      .eq("workspace_id", input.binding.workspaceId)
      .maybeSingle();
    if (result.error)
      throw new Error(`supabase:contacts:phone:${result.error.message}`);
    return normalizePhoneNumber(
      String(
        (result.data as Record<string, unknown> | null)?.phone_number ?? "",
      ),
    );
  }

  private async approveMcpWrite(
    input: LiveWorkerAutomationInput,
    mode: LiveWorkerAiMode,
    connections: readonly McpRuntimeConnection[],
    approval: McpApprovalInput,
  ): Promise<boolean> {
    const connection = connections.find(
      (item) => item.id === approval.connectionId,
    );
    const tool = connection?.tools.find(
      (item) => item.name === approval.toolName,
    );
    if (
      !connection ||
      !tool ||
      tool.readOnly ||
      !connection.writeModes.includes(mode as "draft" | "safe_auto")
    )
      return false;
    const key = mcpArgumentsHmac(
      approval.argumentsJson,
      connectionEncryptionKey(),
    );
    const existing = await this.metadataClient
      .from("mcp_tool_executions")
      .select("status")
      .eq("workspace_id", input.binding.workspaceId)
      .eq("connection_id", connection.id)
      .eq("idempotency_key", input.idempotencyKey)
      .eq("tool_name", approval.toolName)
      .eq("arguments_hmac", key)
      .maybeSingle();
    if (existing.error)
      throw new Error(`supabase:mcp_tool_executions:${existing.error.message}`);
    if (existing.data) return false;
    const inserted = await this.metadataClient
      .from("mcp_tool_executions")
      .insert({
        workspace_id: input.binding.workspaceId,
        connection_id: connection.id,
        source_message_id: input.persisted.id,
        idempotency_key: input.idempotencyKey,
        tool_name: approval.toolName,
        arguments_hmac: key,
        mode,
        status: "approved",
        openai_response_id: approval.responseId ?? null,
        approval_request_id: approval.approvalRequestId,
      });
    if (inserted.error && !/duplicate|unique/i.test(inserted.error.message))
      throw new Error(`supabase:mcp_tool_executions:${inserted.error.message}`);
    await this.metadataClient.from("audit_log").insert({
      workspace_id: input.binding.workspaceId,
      action: "ai.mcp_tool_approval",
      entity_type: "mcp_connection",
      entity_id: connection.id,
      metadata_json: { tool: approval.toolName, mode, status: "approved" },
    });
    return !inserted.error;
  }

  private async persistDraft(
    input: LiveWorkerAutomationInput,
    draft: LiveWorkerDraft,
    triage: TriageResult,
    mode: LiveWorkerAiMode,
    policy: LiveWorkerAiPolicy,
    decision: ReturnType<typeof policyDecision>,
    knowledge: readonly LiveWorkerKnowledgeArticle[],
  ): Promise<void> {
    const client = this.metadataClient;
    const status =
      mode === "safe_auto" && decision.action === "auto_reply"
        ? "auto_eligible"
        : "pending_review";
    const inserted = await client
      .from("ai_drafts")
      .insert({
        workspace_id: input.binding.workspaceId,
        conversation_id: draft.conversationId,
        source_message_id: draft.messageId,
        idempotency_key: draft.idempotencyKey,
        mode,
        action: decision.action,
        status,
        body: draft.body,
        triage_json: triage,
        policy_json: policyJson(policy),
        safety_reason: decision.allowed ? null : decision.reason,
      })
      .select("id")
      .maybeSingle();
    let draftId = String(
      (inserted.data as Record<string, unknown> | null)?.id ?? "",
    );
    if (inserted.error || !draftId) {
      const existing = await client
        .from("ai_drafts")
        .select("id")
        .eq("workspace_id", input.binding.workspaceId)
        .eq("idempotency_key", draft.idempotencyKey)
        .maybeSingle();
      if (existing.error || !existing.data)
        throw new Error(
          `supabase:ai_drafts:${inserted.error?.message ?? "missing_id"}`,
        );
      draftId = String((existing.data as Record<string, unknown>).id ?? "");
    }
    if (!draftId) throw new Error("supabase:ai_drafts:missing_id");

    for (const [rank, article] of knowledge.entries()) {
      const reference = await client
        .from("ai_draft_knowledge")
        .insert({
          draft_id: draftId,
          knowledge_article_id: article.id,
          rank,
        })
        .select("draft_id")
        .maybeSingle();
      if (
        reference.error &&
        !/duplicate|unique/i.test(reference.error.message)
      ) {
        throw new Error(
          `supabase:ai_draft_knowledge:${reference.error.message}`,
        );
      }
    }
  }

  private async currentState(
    input: LiveWorkerAutomationInput,
  ): Promise<LiveWorkerTriageState | null> {
    const result = await this.client
      .from("conversation_ai_state")
      .select("last_triaged_message_id, automation_state")
      .eq("workspace_id", input.binding.workspaceId)
      .eq("conversation_id", input.persisted.conversationId)
      .maybeSingle();
    if (result.error)
      throw new Error(`supabase:conversation_ai_state:${result.error.message}`);
    return result.data
      ? {
          lastTriagedMessageId: result.data.last_triaged_message_id,
          automationState:
            result.data.automation_state === "human_paused"
              ? "human_paused"
              : "ai_active",
        }
      : null;
  }

  private async auditDecision(
    input:
      | Pick<LiveWorkerAutomationInput, "binding" | "persisted">
      | LiveWorkerSendAiReplyInput,
    triage: TriageResult,
    action: string,
    metadata: Record<string, unknown>,
  ) {
    await this.metadataClient.from("audit_log").insert({
      workspace_id: input.binding.workspaceId,
      action,
      entity_type: "conversation",
      entity_id:
        "persisted" in input
          ? input.persisted.conversationId
          : input.conversationId,
      metadata_json: {
        intent: triage.intent,
        confidence: triage.confidence,
        unsafe: triage.unsafe,
        ...metadata,
      },
    });
  }
}

export interface CreateSupabaseLiveWorkerOptions {
  client: LiveWorkerSupabaseClient;
  jobStore: JobStore<WhatsmiauMessageJobPayload>;
  provider: SupportAiProvider;
  whatsappProvider?: WhatsAppProvider;
  inbox?: LiveWorkerInbox;
  knowledge?: LiveWorkerKnowledge;
  onDraftReady?: LiveWorkerOptions["onDraftReady"];
  onIssueReady?: LiveWorkerOptions["onIssueReady"];
  onUnmappedMessage?: LiveWorkerOptions["onUnmappedMessage"];
  codexStarter?: LiveWorkerCodexStarter;
  pollIntervalMs?: number;
  workerId?: string;
}

class SupabaseCodexStarter implements LiveWorkerCodexStarter {
  constructor(private readonly client: LiveWorkerSupabaseClient) {}

  async start(input: LiveWorkerCodexStarterInput) {
    const existing = await this.client
      .from("coding_runs")
      .select("id, status")
      .eq("workspace_id", input.workspaceId)
      .eq("issue_id", input.issueId)
      .in("status", ["queued", "running", "completed", "approved"])
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (existing.error)
      throw new Error(
        `supabase:coding_runs:existing:${existing.error.message}`,
      );
    if (existing.data) return null;

    const repositoryRow = await this.client
      .from("repositories")
      .select("id")
      .eq("workspace_id", input.workspaceId)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    if (repositoryRow.error)
      throw new Error(
        `supabase:repositories:auto_fix:${repositoryRow.error.message}`,
      );
    const repositoryId = repositoryRow.data?.id;
    if (!repositoryId)
      throw new Error("No repository is configured for this workspace");

    const repositories = new SupabaseRepositoryAdapter(this.client);
    const repository = await repositories.getRepository(
      input.workspaceId,
      String(repositoryId),
    );
    if (!repository) throw new Error("Repository is unavailable");
    const commands = ["lint", "test", "build"].filter((name) =>
      repository.allowedCommands?.includes(name),
    ) as unknown as SafeTool[];
    const service = new CodexService({
      repositories,
      runs: new SupabaseCodexRunStore(this.client),
      openAi: { enabled: Boolean(process.env.OPENAI_API_KEY) },
    });
    const handle = await service.start({
      workspaceId: input.workspaceId,
      issueId: input.issueId,
      repositoryId: String(repositoryId),
      issueIdentifier: input.issueIdentifier,
      issueTitle: input.issueTitle,
      mode: "implement_fix",
      tools: commands,
      context: {
        issue: {
          id: input.issueId,
          identifier: input.issueIdentifier,
          title: input.issueTitle,
          summary: input.summary,
          description: `Customer report:\n${input.customerMessage}`,
        },
        conversation: {
          summary: input.summary,
          messages: [{ direction: "inbound", text: input.customerMessage }],
        },
      },
    });
    return { runId: handle.runId, completion: handle.completion };
  }
}

/** Compose the production Supabase worker without changing server/index.ts. */
export function createSupabaseLiveWorker(
  options: CreateSupabaseLiveWorkerOptions,
): LiveWorker {
  const mediaStorage = new SupabaseMediaStorage(options.client);
  const mediaPipeline = new SupabaseMediaPipeline(
    options.client,
    options.jobStore as unknown as import("./media-pipeline.js").MediaJobEnqueuer,
  );
  const inboxService = new InboxService(new SupabaseInboxPort(options.client), {
    mediaStorage,
    transcriber: new OpenAiAudioTranscriber(),
  });
  const inbox = options.inbox ?? inboxService;
  const knowledge =
    options.knowledge ?? new SupabaseLiveWorkerKnowledge(options.client);
  const automation = new SupabaseLiveWorkerAutomation(
    options.client,
    options.provider,
    inboxService,
    options.whatsappProvider,
    options.codexStarter ?? new SupabaseCodexStarter(options.client),
  );
  return new LiveWorker({
    jobStore: options.jobStore,
    channelResolver: new SupabaseLiveWorkerChannelResolver(options.client),
    inbox,
    groupDirectory: options.whatsappProvider,
    mediaPipeline,
    knowledge,
    automation,
    ...(options.onDraftReady ? { onDraftReady: options.onDraftReady } : {}),
    ...(options.onIssueReady ? { onIssueReady: options.onIssueReady } : {}),
    ...(options.onUnmappedMessage
      ? { onUnmappedMessage: options.onUnmappedMessage }
      : {}),
    ...(options.pollIntervalMs !== undefined
      ? { pollIntervalMs: options.pollIntervalMs }
      : {}),
    ...(options.workerId ? { workerId: options.workerId } : {}),
  });
}
