import type { SupabaseClient } from "@supabase/supabase-js";
import {
  flowFromChannelSettings,
  type SupportFlowNode,
} from "../../src/shared/support-flow.js";
import { row, run } from "../adapters/supabase-mappers.js";
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
} from "../automation/decision.js";
import {
  bugInvestigationOutcome,
  SupabaseBugLoopStore,
  type BugCaseReference,
} from "../bug-loop.js";
import type { AgentCredentialPort } from "../contracts/api-ports.js";
import { InboxService, SupabaseInboxPort } from "../inbox-service.js";
import { type JobRecord, type JobStore } from "../jobs.js";
import type {
  CodingRunContinuationJobPayload,
  ConversationHistoryMessage,
  LiveWorkerAutomation,
  LiveWorkerAutomationInput,
  LiveWorkerAutomationResult,
  LiveWorkerCodexStarter,
  LiveWorkerDraft,
  LiveWorkerIssue,
  LiveWorkerJobPayload,
  LiveWorkerSendAiReplyInput,
  LiveWorkerSupabaseClient,
  UncheckedSupabaseClient,
} from "../live-worker.js";
import { normalizeLocale } from "../locale.js";
import {
  connectionEncryptionKey,
  mcpArgumentsHmac,
  type McpRuntimeConnection,
} from "../mcp.js";
import {
  resolveSupportAiProvider,
  SupportAiConfigurationError,
  type McpApprovalInput,
  type SupportAiProvider,
} from "../providers.js";
import { WorkspacePushNotifier } from "../push.js";
import { SupabaseMcpConnectionAdapter } from "../adapters/supabase/mcp.js";
import { triageConversation, type TriageResult } from "../triage.js";
import { WhatsAppService, type WhatsAppProvider } from "../whatsapp-service.js";
import { normalizePhoneNumber } from "../whatsmiau.js";
import type { WhatsmiauMessageJobPayload } from "../worker.js";
import {
  CODING_RUN_CONTINUATION_JOB_TYPE,
  safeOperationalError,
} from "./live-worker-shared.js";
export class SupabaseLiveWorkerAutomation implements LiveWorkerAutomation {
  private readonly inbox: InboxService;
  private readonly whatsapp?: WhatsAppService;
  private readonly push = new WorkspacePushNotifier();
  private readonly bugLoop: SupabaseBugLoopStore;
  private readonly continuationJobStore?: JobStore<LiveWorkerJobPayload>;

  constructor(
    private readonly client: LiveWorkerSupabaseClient,
    private readonly provider: SupportAiProvider | undefined,
    inbox?: InboxService,
    whatsappProvider?: WhatsAppProvider,
    private readonly codexStarter?: LiveWorkerCodexStarter,
    continuationJobStore?: JobStore<LiveWorkerJobPayload>,
    private readonly agentCredentials?: AgentCredentialPort,
  ) {
    this.inbox = inbox ?? new InboxService(new SupabaseInboxPort(client));
    this.bugLoop = new SupabaseBugLoopStore(client);
    this.continuationJobStore = continuationJobStore;
    if (whatsappProvider)
      this.whatsapp = new WhatsAppService(this.inbox, whatsappProvider);
  }

  get metadataClient(): UncheckedSupabaseClient {
    return this.client as unknown as UncheckedSupabaseClient;
  }

  private async recordWorkflowFact(
    input: {
      binding: { workspaceId: string };
      persisted: { id: string; conversationId: string };
    },
    factType:
      | "eligible"
      | "policy_required_touch"
      | "founder_intervention"
      | "escalated"
      | "grounded_answer"
      | "ai_resolved"
      | "fix_verified"
      | "cost_recorded",
    suffix: string,
    value: boolean | number = true,
  ): Promise<void> {
    const result = await this.metadataClient.from("workflow_facts").upsert(
      {
        workspace_id: input.binding.workspaceId,
        workflow_id: input.persisted.conversationId,
        fact_type: factType,
        ...(typeof value === "boolean"
          ? { value_boolean: value }
          : { value_numeric: value }),
        idempotency_key: `${input.persisted.id}:${factType}:${suffix}`,
      },
      { onConflict: "workspace_id,idempotency_key", ignoreDuplicates: true },
    );
    if (result.error)
      throw new Error(`supabase:workflow_facts:${result.error.message}`);
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
    let current = await this.currentState(input);
    if (current?.lastTriagedMessageId === input.persisted.id) {
      return;
    }
    if (current?.automationState === "human_paused") return;
    if (await this.processSupportFlow(input)) {
      await this.markMessageCheckpoint(input);
      return;
    }
    input = await this.batchPendingInboundMessages(input);
    current = await this.currentState(input);
    if (current?.lastTriagedMessageId === input.persisted.id) return;
    if (current?.automationState === "human_paused") return;
    const modePolicy = await this.aiMode(input);
    if (modePolicy.mode === "off") return;
    await this.recordWorkflowFact(input, "eligible", "ai-mode-enabled");
    let provider: SupportAiProvider;
    try {
      provider = await this.providerFor(input.binding.workspaceId);
    } catch (error) {
      if (!(error instanceof SupportAiConfigurationError)) throw error;
      await this.markSupportConfigurationNeeded(input, error.code);
      return;
    }
    const triage = await triageConversation(
      provider,
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
    if (route === "human_escalation" || route === "bug_triage")
      await this.recordWorkflowFact(input, "escalated", route);
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
    const bugCase = issue
      ? await this.bugLoop.recordSuspicion({
          workspaceId: input.binding.workspaceId,
          issueId: issue.id,
          conversationId: input.persisted.conversationId,
          signalMessageId: input.persisted.id,
          confidence: triage.confidence,
          summary: triage.summary,
          customerMessage: messageText(input.message),
        })
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
    if (draft && decision.allowed) {
      await this.persistDraft(
        input,
        draft,
        triage,
        modePolicy.mode,
        modePolicy.policy,
        decision,
        matchedKnowledge,
      );
      if (matchedKnowledge.length)
        await this.recordWorkflowFact(
          input,
          "grounded_answer",
          "knowledge-backed-draft",
        );
    }
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
      modePolicy.policy.allowedIntegrations.includes("agent") &&
      modePolicy.policy.allowedActions.includes("investigate") &&
      !triage.unsafe &&
      triage.confidence >= modePolicy.policy.safeAutoMinConfidence &&
      !bugCase?.duplicate &&
      this.codexStarter
    ) {
      await this.startCodexForBug(
        input,
        issue,
        bugCase,
        triage,
        modePolicy.policy,
      );
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
      await this.recordWorkflowFact(
        input,
        "policy_required_touch",
        takeoverReason,
      );
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
      await this.recordWorkflowFact(
        {
          binding: input.binding,
          persisted: {
            id: input.sourceMessageId,
            conversationId: input.conversationId,
          },
        },
        "ai_resolved",
        "auto-reply-sent",
      );
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

  private continuationInput(
    payload: CodingRunContinuationJobPayload,
  ): LiveWorkerAutomationInput {
    return {
      binding: {
        workspaceId: payload.workspaceId,
        channelConnectionId: "bug-loop",
        instanceName: "bug-loop",
      },
      idempotencyKey: `coding-run:${payload.runId}`,
      job: {} as JobRecord<WhatsmiauMessageJobPayload>,
      knowledge: [],
      message: {
        instanceName: "bug-loop",
        providerMessageId: payload.runId,
        remoteJid: "bug-loop",
        phoneNumber: "",
        direction: "inbound",
        messageType: "text",
        text: payload.customerMessage,
        raw: { source: "coding_run_continuation" },
      },
      persisted: {
        id: payload.issue.id,
        workspaceId: payload.workspaceId,
        conversationId: "bug-loop",
        contactId: "bug-loop",
        providerMessageId: payload.runId,
        direction: "inbound",
        messageType: "text",
        unreadCount: 0,
        inserted: true,
      },
    };
  }

  private async enqueueCodingContinuation(
    payload: CodingRunContinuationJobPayload,
  ): Promise<boolean> {
    if (!this.continuationJobStore) return false;
    try {
      await this.continuationJobStore.enqueue({
        workspaceId: payload.workspaceId,
        type: CODING_RUN_CONTINUATION_JOB_TYPE,
        payload,
        dedupeKey: `mend:coding-run:${payload.runId}:continuation`,
        maxAttempts: 40,
        availableAt: new Date(Date.now() + 30_000),
      });
      return true;
    } catch {
      // A queue outage must not strand a run after its start checkpoint. The
      // in-process completion callback is the best-effort fallback; the next
      // inbound retry can recover a terminal run through the mode-aware dedupe.
      return false;
    }
  }

  async processCodingRunContinuation(
    payload: CodingRunContinuationJobPayload,
  ): Promise<void> {
    const result = await this.client
      .from("agent_runs")
      .select("*")
      .eq("workspace_id", payload.workspaceId)
      .eq("id", payload.runId)
      .maybeSingle();
    if (result.error)
      throw new Error(
        `supabase:agent_runs:continuation:${result.error.message}`,
      );
    if (!result.data) throw new Error("coding_run_continuation_not_found");
    let persisted = run(row(result.data));
    const staleAfterMs = Math.min(
      86_400_000,
      Math.max(
        60_000,
        Number(process.env.MEND_CODING_RUN_STALE_MS ?? 1_800_000),
      ),
    );
    const lastUpdate = Date.parse(persisted.updatedAt);
    if (
      (persisted.status === "queued" || persisted.status === "running") &&
      Number.isFinite(lastUpdate) &&
      Date.now() - lastUpdate > staleAfterMs
    ) {
      const recovered = await this.client
        .from("agent_runs")
        .update({
          status: "failed",
          finished_at: new Date().toISOString(),
          result_json: {
            ...(row(result.data).result_json &&
            typeof row(result.data).result_json === "object"
              ? (row(result.data).result_json as Record<string, unknown>)
              : {}),
            error: "coding_run_stale_executor",
            staleAfterMs,
          },
          updated_at: new Date().toISOString(),
        })
        .eq("workspace_id", payload.workspaceId)
        .eq("id", payload.runId)
        .eq("status", persisted.status)
        .select("*")
        .maybeSingle();
      if (recovered.error)
        throw new Error(
          `supabase:agent_runs:stale_recovery:${recovered.error.message}`,
        );
      if (recovered.data) persisted = run(row(recovered.data));
    }
    if (persisted.status === "queued" || persisted.status === "running")
      throw new Error("coding_run_not_terminal");
    const input = this.continuationInput(payload);
    if (payload.phase === "investigation") {
      if (persisted.status === "failed" || persisted.status === "canceled")
        return this.failInvestigation(payload, persisted.result);
      return this.completeInvestigation(payload, { run: persisted });
    }
    if (persisted.status === "failed" || persisted.status === "canceled")
      return this.failFix(payload, persisted.result);
    await this.bugLoop.advance({
      workspaceId: payload.workspaceId,
      bugCaseId: payload.bugCaseId,
      stage: "verification",
      status: "awaiting_human",
      eventType: "fix.verified",
      message: "The fix run and independent checks are ready for approval.",
      idempotencyKey: `fix:${payload.runId}:verified`,
      metadata: { runId: payload.runId },
    });
    await this.notifyWorkspace(
      input,
      payload.triage,
      "ai.agent_ready",
      `Fix ready for ${payload.issue.identifier}`,
      "Review the patch and independent checks before creating the commit and draft pull request.",
      `ai-agent-fix-ready:${payload.runId}`,
      payload.issue.id,
    );
  }

  private async completeInvestigation(
    payload: CodingRunContinuationJobPayload,
    result: unknown,
  ): Promise<void> {
    const outcome = bugInvestigationOutcome(result);
    const shouldAutoFix =
      outcome.verdict === "confirmed" &&
      payload.autoFixEnabled &&
      payload.implementFixAllowed &&
      !payload.humanApprovalRequired;
    await this.bugLoop.advance({
      workspaceId: payload.workspaceId,
      bugCaseId: payload.bugCaseId,
      stage: "verdict",
      status: shouldAutoFix ? "active" : "awaiting_human",
      verdict: outcome.verdict,
      eventType: "investigation.completed",
      message: "Investigation finished and its verdict is ready for review.",
      idempotencyKey: `investigation:${payload.runId}:completed`,
      metadata: { runId: payload.runId, ...outcome },
    });
    await this.bugLoop.advance({
      workspaceId: payload.workspaceId,
      bugCaseId: payload.bugCaseId,
      stage: "decision",
      status: shouldAutoFix ? "active" : "awaiting_human",
      decision: shouldAutoFix ? "autofix" : "notify",
      eventType: shouldAutoFix ? "decision.autofix" : "decision.notify",
      message: shouldAutoFix
        ? "Policy authorized a separate fix run."
        : "The investigation requires an operator decision.",
      idempotencyKey: `decision:${payload.runId}`,
      metadata: { investigationRunId: payload.runId, verdict: outcome.verdict },
    });
    const input = this.continuationInput(payload);
    await this.notifyWorkspace(
      input,
      payload.triage,
      "ai.agent_ready",
      `Investigation ready for ${payload.issue.identifier}`,
      "The evidence and verdict are ready for human review before a fix starts.",
      `ai-agent-ready:${payload.runId}`,
      payload.issue.id,
    );
    if (shouldAutoFix)
      await this.startFixForBug(
        input,
        payload.issue,
        {
          id: payload.bugCaseId,
          issueId: payload.issue.id,
          stage: "decision",
          duplicate: false,
        },
        payload.triage,
      );
  }

  private async failInvestigation(
    payload: CodingRunContinuationJobPayload,
    error: unknown,
  ): Promise<void> {
    await this.bugLoop.advance({
      workspaceId: payload.workspaceId,
      bugCaseId: payload.bugCaseId,
      stage: "failed",
      status: "failed",
      eventType: "investigation.failed",
      message: "The isolated investigation failed.",
      idempotencyKey: `investigation:${payload.runId}:failed`,
      metadata: { runId: payload.runId },
      lastError: error instanceof Error ? error.message : String(error),
    });
  }

  private async failFix(
    payload: CodingRunContinuationJobPayload,
    error: unknown,
  ): Promise<void> {
    await this.bugLoop.advance({
      workspaceId: payload.workspaceId,
      bugCaseId: payload.bugCaseId,
      stage: "failed",
      status: "failed",
      eventType: "fix.failed",
      message: "The separate fix run failed.",
      idempotencyKey: `fix:${payload.runId}:failed`,
      metadata: { runId: payload.runId },
      lastError: error instanceof Error ? error.message : String(error),
    });
  }

  private async startCodexForBug(
    input: LiveWorkerAutomationInput,
    issue: { id: string; identifier: string; operation: "created" | "updated" },
    bugCase: BugCaseReference | undefined,
    triage: TriageResult,
    policy: LiveWorkerAiPolicy,
  ): Promise<void> {
    try {
      const started = await this.codexStarter?.start({
        workspaceId: input.binding.workspaceId,
        ...(bugCase ? { bugCaseId: bugCase.id } : {}),
        issueId: issue.id,
        issueIdentifier: issue.identifier,
        issueTitle: triage.summary,
        summary: triage.summary,
        customerMessage: input.message.text ?? "",
        mode: "investigate",
      });
      if (!started) return;
      if (bugCase) {
        await this.bugLoop.advance({
          workspaceId: input.binding.workspaceId,
          bugCaseId: bugCase.id,
          stage: "investigation",
          eventType: "investigation.started",
          message: "A coding agent started an isolated investigation.",
          idempotencyKey: `investigation:${started.runId}:started`,
          investigationRunId: started.runId,
          metadata: { runId: started.runId },
        });
      }
      await this.notifyWorkspace(
        input,
        triage,
        "ai.agent_started",
        `Coding agent started for ${issue.identifier}`,
        `The selected coding agent is investigating this bug. Run ${started.runId} will stop for approval before publication.`,
        `ai-agent-started:${started.runId}`,
        issue.id,
      );
      if (bugCase) {
        const continuation: CodingRunContinuationJobPayload = {
          stage: "coding_run_continuation",
          workspaceId: input.binding.workspaceId,
          runId: started.runId,
          bugCaseId: bugCase.id,
          phase: "investigation",
          issue: {
            id: issue.id,
            identifier: issue.identifier,
            title: triage.summary,
          },
          triage,
          customerMessage: input.message.text ?? "",
          autoFixEnabled: policy.bugAutoFixEnabled,
          implementFixAllowed: policy.allowedActions.includes("implement_fix"),
          humanApprovalRequired:
            policy.humanApprovalActions.includes("implement_fix"),
        };
        if (await this.enqueueCodingContinuation(continuation)) return;
      }
      void started.completion
        .then(async (result) => {
          const outcome = bugInvestigationOutcome(result);
          const shouldAutoFix =
            outcome.verdict === "confirmed" &&
            policy.bugAutoFixEnabled &&
            policy.allowedActions.includes("implement_fix") &&
            !policy.humanApprovalActions.includes("implement_fix");
          if (bugCase) {
            await this.bugLoop.advance({
              workspaceId: input.binding.workspaceId,
              bugCaseId: bugCase.id,
              stage: "verdict",
              status: shouldAutoFix ? "active" : "awaiting_human",
              verdict: outcome.verdict,
              eventType: "investigation.completed",
              message:
                "Investigation finished and its verdict is ready for review.",
              idempotencyKey: `investigation:${started.runId}:completed`,
              metadata: { runId: started.runId, ...outcome },
            });
            await this.bugLoop.advance({
              workspaceId: input.binding.workspaceId,
              bugCaseId: bugCase.id,
              stage: "decision",
              status: shouldAutoFix ? "active" : "awaiting_human",
              decision: shouldAutoFix ? "autofix" : "notify",
              eventType: shouldAutoFix ? "decision.autofix" : "decision.notify",
              message: shouldAutoFix
                ? "Policy authorized a separate fix run."
                : "The investigation requires an operator decision.",
              idempotencyKey: `decision:${started.runId}`,
              metadata: {
                investigationRunId: started.runId,
                verdict: outcome.verdict,
              },
            });
          }
          await this.notifyWorkspace(
            input,
            triage,
            "ai.agent_ready",
            `Investigation ready for ${issue.identifier}`,
            "The evidence and verdict are ready for human review before a fix starts.",
            `ai-agent-ready:${started.runId}`,
            issue.id,
          );
          if (shouldAutoFix && bugCase)
            await this.startFixForBug(input, issue, bugCase, triage);
        })
        .catch(async (error) => {
          if (bugCase) {
            await this.bugLoop.advance({
              workspaceId: input.binding.workspaceId,
              bugCaseId: bugCase.id,
              stage: "failed",
              status: "failed",
              eventType: "investigation.failed",
              message: "The isolated investigation failed.",
              idempotencyKey: `investigation:${started.runId}:failed`,
              metadata: { runId: started.runId },
              lastError: error instanceof Error ? error.message : String(error),
            });
          }
          await this.notifyWorkspace(
            input,
            triage,
            "ai.agent_failed",
            `Investigation failed for ${issue.identifier}`,
            `The automatic investigation could not be completed: ${error instanceof Error ? error.message : String(error)}`,
            `ai-agent-failed:${started.runId}`,
            issue.id,
          );
        })
        .catch(() => undefined);
    } catch (error) {
      await this.notifyWorkspace(
        input,
        triage,
        "ai.agent_failed",
        `Coding agent could not start for ${issue.identifier}`,
        `Configure a repository before automatic fixes: ${error instanceof Error ? error.message : String(error)}`,
        `ai-agent-start-failed:${issue.id}:${input.persisted.id}`,
        issue.id,
      );
    }
  }

  private async startFixForBug(
    input: LiveWorkerAutomationInput,
    issue: { id: string; identifier: string },
    bugCase: BugCaseReference,
    triage: TriageResult,
  ): Promise<void> {
    const started = await this.codexStarter?.start({
      workspaceId: input.binding.workspaceId,
      bugCaseId: bugCase.id,
      issueId: issue.id,
      issueIdentifier: issue.identifier,
      issueTitle: triage.summary,
      summary: triage.summary,
      customerMessage: input.message.text ?? "",
      mode: "implement_fix",
    });
    if (!started) return;
    await this.bugLoop.advance({
      workspaceId: input.binding.workspaceId,
      bugCaseId: bugCase.id,
      stage: "fix",
      status: "active",
      eventType: "fix.started",
      message:
        "A separate coding agent run started the approved automatic fix.",
      idempotencyKey: `fix:${started.runId}:started`,
      fixRunId: started.runId,
      metadata: { runId: started.runId },
    });
    await this.notifyWorkspace(
      input,
      triage,
      "ai.agent_started",
      `Automatic fix started for ${issue.identifier}`,
      `Run ${started.runId} is implementing the fix. Publication still requires review.`,
      `ai-agent-fix-started:${started.runId}`,
      issue.id,
    );
    const continuation: CodingRunContinuationJobPayload = {
      stage: "coding_run_continuation",
      workspaceId: input.binding.workspaceId,
      runId: started.runId,
      bugCaseId: bugCase.id,
      phase: "fix",
      issue: {
        id: issue.id,
        identifier: issue.identifier,
        title: triage.summary,
      },
      triage,
      customerMessage: input.message.text ?? "",
      autoFixEnabled: true,
      implementFixAllowed: true,
      humanApprovalRequired: false,
    };
    if (await this.enqueueCodingContinuation(continuation)) return;
    void started.completion
      .then(async () => {
        await this.bugLoop.advance({
          workspaceId: input.binding.workspaceId,
          bugCaseId: bugCase.id,
          stage: "verification",
          status: "awaiting_human",
          eventType: "fix.verified",
          message: "The fix run and independent checks are ready for approval.",
          idempotencyKey: `fix:${started.runId}:verified`,
          metadata: { runId: started.runId },
        });
        await this.notifyWorkspace(
          input,
          triage,
          "ai.agent_ready",
          `Fix ready for ${issue.identifier}`,
          "Review the patch and independent checks before creating the commit and draft pull request.",
          `ai-agent-fix-ready:${started.runId}`,
          issue.id,
        );
      })
      .catch(async (error) => {
        await this.bugLoop.advance({
          workspaceId: input.binding.workspaceId,
          bugCaseId: bugCase.id,
          stage: "failed",
          status: "failed",
          eventType: "fix.failed",
          message: "The separate fix run failed.",
          idempotencyKey: `fix:${started.runId}:failed`,
          metadata: { runId: started.runId },
          lastError: error instanceof Error ? error.message : String(error),
        });
      })
      .catch(() => undefined);
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
    const provider = await this.providerFor(input.binding.workspaceId);
    const contextResult =
      mcpConnections.length && provider.draftReplyWithContext
        ? await provider.draftReplyWithContext({
            conversation,
            knowledgeContext: safeKnowledgeContext(knowledge),
            language: normalizeLocale(workspaceRow.default_language),
            mcpConnections,
            onMcpApproval: (approval) =>
              this.approveMcpWrite(input, mode, mcpConnections, approval),
          })
        : {
            body: await provider.draftReply(
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

  private async providerFor(workspaceId: string): Promise<SupportAiProvider> {
    if (this.agentCredentials)
      return resolveSupportAiProvider(workspaceId, this.agentCredentials);
    if (this.provider) return this.provider;
    throw new Error("support_ai_credential_required");
  }

  private async markSupportConfigurationNeeded(
    input: LiveWorkerAutomationInput,
    code: string,
  ): Promise<void> {
    const now = new Date().toISOString();
    const state = await this.metadataClient
      .from("conversation_ai_state")
      .upsert(
        {
          workspace_id: input.binding.workspaceId,
          conversation_id: input.persisted.conversationId,
          automation_state: "human_paused",
          needs_human: true,
          needs_human_reason: code,
          last_decision: "blocked",
          last_decision_reason: code,
          last_decision_at: now,
          updated_at: now,
        },
        { onConflict: "conversation_id" },
      );
    if (state.error)
      throw new Error(`supabase:conversation_ai_state:${state.error.message}`);
    const notification = await this.metadataClient
      .from("notifications")
      .insert({
        workspace_id: input.binding.workspaceId,
        kind: "support_ai_configuration_required",
        title: "Support AI configuration required",
        body: "Configure the workspace support credential and models, then resume AI.",
        entity_type: "conversation",
        entity_id: input.persisted.conversationId,
        dedupe_key: `support-ai-config:${input.persisted.conversationId}`,
      });
    if (
      notification.error &&
      !/duplicate|unique/i.test(notification.error.message)
    )
      throw new Error(`supabase:notifications:${notification.error.message}`);
    await this.recordWorkflowFact(
      input,
      "policy_required_touch",
      "support-ai-configuration",
    );
  }

  private async conversationHistory(
    input: LiveWorkerAutomationInput,
  ): Promise<ConversationHistoryMessage[]> {
    const history = await this.loadConversationHistory(input);
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

  private async loadConversationHistory(
    input: LiveWorkerAutomationInput,
  ): Promise<ConversationHistoryMessage[]> {
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

    return [...(result.data ?? [])].reverse().map((message) => ({
      id: String(message.id),
      direction: String(message.direction),
      text: message.text ?? null,
      caption: message.caption ?? null,
      createdAt: message.created_at ?? null,
    }));
  }

  private async batchPendingInboundMessages(
    input: LiveWorkerAutomationInput,
  ): Promise<LiveWorkerAutomationInput> {
    const history = await this.loadConversationHistory(input);
    const targetIndex = history.findIndex(
      (message) => message.id === input.persisted.id,
    );
    if (targetIndex < 0) return input;

    const cutoff = input.job.availableAt.getTime();
    let lastInboundIndex = targetIndex;
    for (let index = targetIndex + 1; index < history.length; index += 1) {
      const message = history[index];
      const createdAt = message.createdAt
        ? Date.parse(message.createdAt)
        : Number.NaN;
      if (Number.isFinite(createdAt) && createdAt > cutoff) break;
      if (message.direction === "outbound") break;
      if (message.direction === "inbound") lastInboundIndex = index;
    }
    if (lastInboundIndex === targetIndex) return input;

    const inboundMessages = history
      .slice(targetIndex, lastInboundIndex + 1)
      .filter((message) => message.direction === "inbound");
    const combinedText = inboundMessages
      .map((message) => (message.text || message.caption || "").trim())
      .filter(Boolean)
      .join("\n");
    const latest = history[lastInboundIndex];
    if (!combinedText || !latest) return input;

    const whatsappKeyPrefix = `whatsapp:${input.binding.channelConnectionId}:`;
    const idempotencyKey = input.idempotencyKey.startsWith(whatsappKeyPrefix)
      ? `${whatsappKeyPrefix}${latest.id}`
      : `${input.idempotencyKey}:batch:${latest.id}`;
    return {
      ...input,
      idempotencyKey,
      message: {
        ...input.message,
        text: combinedText,
        caption: undefined,
        interactionId: undefined,
      },
      persisted: {
        ...input.persisted,
        id: latest.id,
      },
    };
  }

  private async loadMcpConnections(
    input: LiveWorkerAutomationInput,
  ): Promise<McpRuntimeConnection[]> {
    return new SupabaseMcpConnectionAdapter(
      this.metadataClient as unknown as SupabaseClient,
      this.metadataClient as unknown as SupabaseClient,
    ).runtimeList({ workspaceId: input.binding.workspaceId });
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

  private async markMessageCheckpoint(
    input: LiveWorkerAutomationInput,
  ): Promise<void> {
    const result = await this.client.from("conversation_ai_state").upsert(
      {
        workspace_id: input.binding.workspaceId,
        conversation_id: input.persisted.conversationId,
        last_triaged_message_id: input.persisted.id,
        last_triaged_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      { onConflict: "conversation_id" },
    );
    if (result.error)
      throw new Error(
        `supabase:conversation_ai_state:checkpoint:${result.error.message}`,
      );
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
