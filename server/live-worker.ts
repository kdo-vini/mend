import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../src/lib/database.types.js";
import {
  AGENT_RUN_REQUESTED_JOB_TYPE,
  type AgentRunRequestedJobPayload,
} from "./agent-runtime.js";
import {
  messageText,
  type LiveWorkerKnowledgeArticle,
} from "./automation/decision.js";
import type { AgentCredentialPort } from "./contracts/api-ports.js";
import {
  InboxService,
  SupabaseInboxPort,
  type InboxContext,
  type InboxMessageRecord,
} from "./inbox-service.js";
import { type JobRecord, type JobStore } from "./jobs.js";
import {
  MEDIA_PROCESS_JOB_TYPE,
  SupabaseMediaPipeline,
  type MediaProcessJobPayload,
} from "./media-pipeline.js";
import { SupabaseMediaStorage } from "./media.js";
import {
  WorkspaceSupportAudioTranscriber,
  type SupportAiDraftResult,
  type SupportAiProvider,
} from "./providers.js";
import { type TriageResult } from "./triage.js";
import { type WhatsAppProvider } from "./whatsapp-service.js";
import { type NormalizedWhatsmiauMessage } from "./whatsmiau.js";
import type { WhatsmiauMessageJobPayload } from "./worker.js";
import { SupabaseLiveWorkerAutomation } from "./workers/automation.js";
import { SupabaseLiveWorkerChannelResolver } from "./workers/channel-resolver.js";
import { SupabaseCodexStarter } from "./workers/codex-starter.js";
import { SupabaseLiveWorkerKnowledge } from "./workers/knowledge.js";
import {
  cleanInstanceName,
  CODING_RUN_CONTINUATION_JOB_TYPE,
  delay,
  PROCESS_INBOUND_MESSAGE_JOB_TYPE,
  safeOperationalError,
  SEND_AI_REPLY_JOB_TYPE,
  WHATSAPP_INGEST_JOB_TYPE,
} from "./workers/live-worker-shared.js";
import { SupabaseRunnerHeartbeat } from "./workers/runner-heartbeat.js";

export type LiveWorkerSupabaseClient = SupabaseClient<Database>;
export type KnowledgeArticleRow =
  Database["public"]["Tables"]["knowledge_articles"]["Row"];

export interface ProcessInboundMessageJobPayload {
  stage: "process_inbound_message";
  ingestionJobId: string;
  binding: LiveChannelBinding;
  idempotencyKey: string;
  message: NormalizedWhatsmiauMessage;
  persisted: InboxMessageRecord;
}

const DEFAULT_INBOUND_DEBOUNCE_MS = 1_500;

export type ConversationHistoryMessage = {
  id: string;
  direction: string;
  text: string | null;
  caption: string | null;
  createdAt?: string | null;
};

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
  bugCaseId?: string;
  issueId: string;
  issueIdentifier: string;
  issueTitle: string;
  summary: string;
  customerMessage: string;
  mode?: "investigate" | "implement_fix";
}

export interface LiveWorkerCodexStarter {
  start(input: LiveWorkerCodexStarterInput): Promise<{
    runId: string;
    completion: Promise<unknown>;
  } | null>;
}

export interface CodingRunContinuationJobPayload {
  stage: "coding_run_continuation";
  workspaceId: string;
  runId: string;
  bugCaseId: string;
  phase: "investigation" | "fix";
  issue: { id: string; identifier: string; title: string };
  triage: TriageResult;
  customerMessage: string;
  autoFixEnabled: boolean;
  implementFixAllowed: boolean;
  humanApprovalRequired: boolean;
}

export interface SendAiReplyJobPayload extends LiveWorkerSendAiReplyInput {
  stage: "send_ai_reply";
}

export type LiveWorkerJobPayload =
  | WhatsmiauMessageJobPayload
  | ProcessInboundMessageJobPayload
  | SendAiReplyJobPayload
  | CodingRunContinuationJobPayload
  | AgentRunRequestedJobPayload
  | MediaProcessJobPayload;

export interface UncheckedSupabaseQuery
  extends PromiseLike<{
    data: unknown;
    error: { message: string } | null;
  }> {
  select(columns?: string): UncheckedSupabaseQuery;
  insert(values: unknown): UncheckedSupabaseQuery;
  upsert(
    values: unknown,
    options?: { onConflict?: string; ignoreDuplicates?: boolean },
  ): UncheckedSupabaseQuery;
  update(values: unknown): UncheckedSupabaseQuery;
  eq(column: string, value: unknown): UncheckedSupabaseQuery;
  order(
    column: string,
    options?: { ascending?: boolean },
  ): UncheckedSupabaseQuery;
  limit(value: number): UncheckedSupabaseQuery;
  maybeSingle(): Promise<{ data: unknown; error: { message: string } | null }>;
}

export interface UncheckedSupabaseClient {
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
    query?: string,
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
  processCodingRunContinuation?(
    input: CodingRunContinuationJobPayload,
  ): Promise<void>;
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
  agentRunRunner?: (payload: AgentRunRequestedJobPayload) => Promise<void>;
  knowledge?: LiveWorkerKnowledge;
  onDraftReady?: (draft: LiveWorkerDraft) => Promise<void> | void;
  onIssueReady?: (issue: LiveWorkerIssue) => Promise<void> | void;
  onUnmappedMessage?: (input: LiveWorkerUnmappedMessage) => void;
  pollIntervalMs?: number;
  /** Delay inbound automation so consecutive customer messages can be grouped. */
  inboundDebounceMs?: number;
  workerId?: string;
  heartbeat?: {
    beat(input: {
      workerId: string;
      currentJobType?: string;
      currentJobId?: string;
    }): Promise<void>;
  };
}

const DEFAULT_POLL_INTERVAL_MS = 1_000;

/**
 * Consumes the existing WhatsmiauWorker and adds the live application boundary:
 * provider instance -> channel/workspace -> atomic inbox RPC -> safe automation.
 */
export class LiveWorker {
  private readonly pollIntervalMs: number;
  private readonly options: LiveWorkerOptions;
  private readonly workerId: string;
  private readonly inboundDebounceMs: number;
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
    this.inboundDebounceMs = Math.max(
      0,
      options.inboundDebounceMs ?? DEFAULT_INBOUND_DEBOUNCE_MS,
    );
    // The webhook adapter is intentionally kept as the public ingress
    // contract. Internally the store also carries the durable processing-stage
    // payload; both shapes live in the same service-role jobs table.
    this.stageJobStore =
      options.jobStore as unknown as JobStore<LiveWorkerJobPayload>;
  }

  /** Poll once. The job store owns claim, retry/backoff and dead-letter behavior. */
  async poll(): Promise<boolean> {
    await this.options.heartbeat
      ?.beat({ workerId: this.workerId })
      .catch(() => undefined);
    const job = await this.options.jobStore.claim(this.workerId);
    if (!job) return false;

    await this.options.heartbeat
      ?.beat({
        workerId: this.workerId,
        currentJobType: job.type,
        currentJobId: job.id,
      })
      .catch(() => undefined);

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
    await this.options.heartbeat
      ?.beat({ workerId: this.workerId })
      .catch(() => undefined);
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
    if (job.type === CODING_RUN_CONTINUATION_JOB_TYPE) {
      if (!this.options.automation?.processCodingRunContinuation)
        throw new Error("coding_run_continuation_not_configured");
      const payload = job.payload as CodingRunContinuationJobPayload;
      if (
        payload.stage !== "coding_run_continuation" ||
        !payload.workspaceId ||
        !payload.runId ||
        !payload.bugCaseId
      )
        throw new Error("invalid_coding_run_continuation_job");
      await this.options.automation.processCodingRunContinuation(payload);
      return;
    }
    if (job.type === AGENT_RUN_REQUESTED_JOB_TYPE) {
      if (!this.options.agentRunRunner)
        throw new Error("agent_run_runner_not_configured");
      const payload = job.payload as AgentRunRequestedJobPayload;
      if (
        payload.stage !== "agent_run_requested" ||
        !payload.runId ||
        !payload.workspaceId ||
        !payload.repositoryId
      )
        throw new Error("invalid_agent_run_requested_job");
      await this.options.agentRunRunner(payload);
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
      ...(this.inboundDebounceMs > 0
        ? {
            availableAt: new Date(Date.now() + this.inboundDebounceMs),
          }
        : {}),
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
      ? await this.options.knowledge.listPublished(
          payload.binding.workspaceId,
          messageText(payload.message),
        )
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

export interface CreateSupabaseLiveWorkerOptions {
  client: LiveWorkerSupabaseClient;
  jobStore: JobStore<WhatsmiauMessageJobPayload>;
  provider?: SupportAiProvider;
  whatsappProvider?: WhatsAppProvider;
  inbox?: LiveWorkerInbox;
  knowledge?: LiveWorkerKnowledge;
  onDraftReady?: LiveWorkerOptions["onDraftReady"];
  onIssueReady?: LiveWorkerOptions["onIssueReady"];
  onUnmappedMessage?: LiveWorkerOptions["onUnmappedMessage"];
  codexStarter?: LiveWorkerCodexStarter;
  agentRunRunner?: LiveWorkerOptions["agentRunRunner"];
  agentCredentials?: AgentCredentialPort;
  pollIntervalMs?: number;
  inboundDebounceMs?: number;
  workerId?: string;
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
    ...(options.agentCredentials
      ? {
          transcriber: new WorkspaceSupportAudioTranscriber(
            options.agentCredentials,
          ),
        }
      : {}),
  });
  const inbox = options.inbox ?? inboxService;
  const knowledge =
    options.knowledge ??
    new SupabaseLiveWorkerKnowledge(
      options.client,
      20,
      50_000,
      options.agentCredentials,
    );
  const automation = new SupabaseLiveWorkerAutomation(
    options.client,
    options.provider,
    inboxService,
    options.whatsappProvider,
    options.codexStarter ??
      new SupabaseCodexStarter(options.client, options.agentCredentials),
    options.jobStore as unknown as JobStore<LiveWorkerJobPayload>,
    options.agentCredentials,
  );
  return new LiveWorker({
    jobStore: options.jobStore,
    channelResolver: new SupabaseLiveWorkerChannelResolver(options.client),
    inbox,
    groupDirectory: options.whatsappProvider,
    mediaPipeline,
    knowledge,
    automation,
    heartbeat: new SupabaseRunnerHeartbeat(options.client),
    ...(options.onDraftReady ? { onDraftReady: options.onDraftReady } : {}),
    ...(options.onIssueReady ? { onIssueReady: options.onIssueReady } : {}),
    ...(options.onUnmappedMessage
      ? { onUnmappedMessage: options.onUnmappedMessage }
      : {}),
    ...(options.agentRunRunner
      ? { agentRunRunner: options.agentRunRunner }
      : {}),
    ...(options.pollIntervalMs !== undefined
      ? { pollIntervalMs: options.pollIntervalMs }
      : {}),
    ...(options.inboundDebounceMs !== undefined
      ? { inboundDebounceMs: options.inboundDebounceMs }
      : {}),
    ...(options.workerId ? { workerId: options.workerId } : {}),
  });
}

export { SupabaseLiveWorkerAutomation } from "./workers/automation.js";
export { SupabaseLiveWorkerChannelResolver } from "./workers/channel-resolver.js";
export {
  repositorySafeTools,
  SupabaseCodexStarter,
} from "./workers/codex-starter.js";
export { SupabaseLiveWorkerKnowledge } from "./workers/knowledge.js";
export {
  CODING_RUN_CONTINUATION_JOB_TYPE,
  PROCESS_INBOUND_MESSAGE_JOB_TYPE,
  SEND_AI_REPLY_JOB_TYPE,
  WHATSAPP_INGEST_JOB_TYPE,
} from "./workers/live-worker-shared.js";
