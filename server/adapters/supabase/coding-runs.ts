import crypto from "node:crypto";
import { normalizeWorkspaceAiPolicy } from "../../../src/ai-policy.js";
import type { AllowedCommand } from "../../../src/core.js";
import {
  AGENT_RUN_REQUESTED_JOB_TYPE,
  type AgentRunRequestedJobPayload,
} from "../../agent-runtime.js";
import { SupabaseBugLoopStore, type BugLoopStage } from "../../bug-loop.js";
import type { CodexRunEvent, CodexRunEventInput } from "../../codex-events.js";
import {
  CodexService,
  CodexServiceError,
  type RepositoryConfigPort,
} from "../../codex-service.js";
import {
  redactSecrets,
  type CodexRunStore,
  type CreateCodexRunAttemptInput,
  type CreateCodexRunInput,
  type SafeTool,
  type UpdateCodexRunInput,
} from "../../codex.js";
import {
  assertRunContinuation,
  legacyModeForStage,
  type CodingStage,
  type ResearchArtifact,
} from "../../coding-control-plane.js";
import {
  type CodingControlPlanePort,
  type CodingRunCreateInput,
  type CodingRunListQuery,
  type CodingRunPort,
  type RequestContext,
} from "../../contracts/api-ports.js";
import { createDokployDeploymentFromEnv } from "../../deployment.js";
import type { JobStore } from "../../jobs.js";
import type { AnySupabaseClient } from "./types.js";
import type { WhatsmiauMessageJobPayload } from "../../worker.js";
import {
  checked,
  row,
  rows,
  run,
  runAttempt,
  str,
  type Row,
} from "../supabase-mappers.js";
import { SupabaseExternalOperationAdapter } from "./external-operations.js";
export class SupabaseCodexRunStore implements CodexRunStore {
  constructor(
    private readonly client: AnySupabaseClient,
    private readonly privilegedClient: AnySupabaseClient = client,
  ) {}

  async getRunWithAttempts(id: string, workspaceId: string) {
    const result = await this.client
      .from("agent_runs")
      .select("*, agent_run_attempts(*)")
      .eq("id", id)
      .eq("workspace_id", workspaceId)
      .maybeSingle();
    const data = checked("agent_runs.get_with_attempts", result);
    if (!data) return null;
    const value = row(data);
    const mapped = run(value);
    const attempts = rows(value.agent_run_attempts).map(runAttempt);
    if (attempts.length) mapped.attempts = attempts;
    return mapped;
  }

  async createRun(input: CreateCodexRunInput) {
    if (input.id) {
      const existing = await this.client
        .from("agent_runs")
        .select("*")
        .eq("id", input.id)
        .maybeSingle();
      const existingData = checked("agent_runs.get_existing", existing);
      if (existingData) {
        const updated = await this.client
          .from("agent_runs")
          .update({
            repository_id: input.repositoryId ?? null,
            mode: input.mode,
            ...(input.stage ? { stage: input.stage } : {}),
            ...(input.parentRunId ? { parent_run_id: input.parentRunId } : {}),
            ...(input.researchArtifactId
              ? { research_artifact_id: input.researchArtifactId }
              : {}),
            ...(input.connectionId
              ? { connection_id: input.connectionId }
              : {}),
            ...(input.provider ? { provider: input.provider } : {}),
            ...(input.requestedModel
              ? { requested_model: input.requestedModel }
              : {}),
            ...(input.realModel ? { real_model: input.realModel } : {}),
            ...(input.effort ? { effort: input.effort } : {}),
            ...(input.authMethod ? { billing_method: input.authMethod } : {}),
            ...(input.requestedConfig
              ? { requested_config_json: input.requestedConfig }
              : {}),
            ...(input.effectiveConfig
              ? { effective_config_json: input.effectiveConfig }
              : {}),
            ...(input.usage ? { usage_json: input.usage } : {}),
            ...(input.cache ? { cache_json: input.cache } : {}),
            ...(input.costAmountUsd !== undefined
              ? { cost_amount_usd: input.costAmountUsd }
              : {}),
            ...(input.costStatus ? { cost_status: input.costStatus } : {}),
            ...(input.durationMs !== undefined
              ? { duration_ms: input.durationMs }
              : {}),
            ...(input.quota ? { quota_json: input.quota } : {}),
            branch_name: input.branchName ?? null,
            created_by_user_id: input.createdByUserId ?? null,
          })
          .eq("id", input.id)
          .select("*")
          .single();
        return run(row(checked("agent_runs.attach", updated)));
      }
    }
    const result = await this.client
      .from("agent_runs")
      .insert({
        ...(input.id ? { id: input.id } : {}),
        workspace_id: input.workspaceId,
        issue_id: input.issueId,
        repository_id: input.repositoryId ?? null,
        mode: input.mode,
        ...(input.stage ? { stage: input.stage } : {}),
        ...(input.parentRunId ? { parent_run_id: input.parentRunId } : {}),
        ...(input.researchArtifactId
          ? { research_artifact_id: input.researchArtifactId }
          : {}),
        ...(input.connectionId ? { connection_id: input.connectionId } : {}),
        ...(input.provider ? { provider: input.provider } : {}),
        ...(input.requestedModel
          ? { requested_model: input.requestedModel }
          : {}),
        ...(input.realModel ? { real_model: input.realModel } : {}),
        ...(input.effort ? { effort: input.effort } : {}),
        ...(input.authMethod ? { billing_method: input.authMethod } : {}),
        ...(input.requestedConfig
          ? { requested_config_json: input.requestedConfig }
          : {}),
        ...(input.effectiveConfig
          ? { effective_config_json: input.effectiveConfig }
          : {}),
        ...(input.usage ? { usage_json: input.usage } : {}),
        ...(input.cache ? { cache_json: input.cache } : {}),
        ...(input.costAmountUsd !== undefined
          ? { cost_amount_usd: input.costAmountUsd }
          : {}),
        ...(input.costStatus ? { cost_status: input.costStatus } : {}),
        ...(input.durationMs !== undefined
          ? { duration_ms: input.durationMs }
          : {}),
        ...(input.quota ? { quota_json: input.quota } : {}),
        status: "queued",
        progress: 0,
        branch_name: input.branchName ?? null,
        result_json: {},
        created_by_user_id: input.createdByUserId ?? null,
      })
      .select("*")
      .single();
    return run(row(checked("agent_runs.create", result)));
  }
  async getRun(id: string) {
    const result = await this.client
      .from("agent_runs")
      .select("*")
      .eq("id", id)
      .maybeSingle();
    const data = checked("agent_runs.get", result);
    return data ? run(row(data)) : null;
  }
  async getRunScoped(id: string, workspaceId: string) {
    const result = await this.client
      .from("agent_runs")
      .select("*")
      .eq("id", id)
      .eq("workspace_id", workspaceId)
      .maybeSingle();
    const data = checked("agent_runs.get_scoped", result);
    return data ? run(row(data)) : null;
  }
  async updateRun(id: string, input: UpdateCodexRunInput) {
    const result = await this.client
      .from("agent_runs")
      .update({
        ...(input.status !== undefined ? { status: input.status } : {}),
        ...(input.progress !== undefined ? { progress: input.progress } : {}),
        ...(input.branchName !== undefined
          ? { branch_name: input.branchName }
          : {}),
        ...(input.commitSha !== undefined
          ? { commit_sha: input.commitSha }
          : {}),
        ...(input.result !== undefined ? { result_json: input.result } : {}),
        ...(input.stage !== undefined ? { stage: input.stage } : {}),
        ...(input.researchArtifactId !== undefined
          ? { research_artifact_id: input.researchArtifactId }
          : {}),
        ...(input.connectionId !== undefined
          ? { connection_id: input.connectionId }
          : {}),
        ...(input.provider !== undefined ? { provider: input.provider } : {}),
        ...(input.requestedModel !== undefined
          ? { requested_model: input.requestedModel }
          : {}),
        ...(input.realModel !== undefined
          ? { real_model: input.realModel }
          : {}),
        ...(input.effort !== undefined ? { effort: input.effort } : {}),
        ...(input.authMethod !== undefined
          ? { billing_method: input.authMethod }
          : {}),
        ...(input.requestedConfig !== undefined
          ? { requested_config_json: input.requestedConfig }
          : {}),
        ...(input.effectiveConfig !== undefined
          ? { effective_config_json: input.effectiveConfig }
          : {}),
        ...(input.usage !== undefined ? { usage_json: input.usage } : {}),
        ...(input.cache !== undefined ? { cache_json: input.cache } : {}),
        ...(input.costAmountUsd !== undefined
          ? { cost_amount_usd: input.costAmountUsd }
          : {}),
        ...(input.costStatus !== undefined
          ? { cost_status: input.costStatus }
          : {}),
        ...(input.durationMs !== undefined
          ? { duration_ms: input.durationMs }
          : {}),
        ...(input.quota !== undefined ? { quota_json: input.quota } : {}),
        ...(input.startedAt !== undefined
          ? { started_at: input.startedAt }
          : {}),
        ...(input.finishedAt !== undefined
          ? { finished_at: input.finishedAt }
          : {}),
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .select("*")
      .maybeSingle();
    const data = checked("agent_runs.update", result);
    return data ? run(row(data)) : undefined;
  }
  async appendEvent(
    runId: string,
    input: CodexRunEventInput,
  ): Promise<CodexRunEvent> {
    const current = await this.getRun(runId);
    if (!current) throw new Error("agent_run_not_found");
    const result = await this.client
      .from("agent_run_events")
      .insert({
        workspace_id: current.workspaceId,
        agent_run_id: runId,
        event_type: input.eventType,
        message: redactSecrets(input.message).slice(0, 2_000),
        metadata_json: input.metadata ?? {},
      })
      .select("*")
      .single();
    const value = row(checked("agent_run_events.create", result));
    return {
      id: str(value.id),
      runId,
      eventType: str(value.event_type) as CodexRunEvent["eventType"],
      message: str(value.message),
      metadata: row(value.metadata_json),
      createdAt: str(value.created_at),
    };
  }

  async saveResearchArtifact(
    artifact: ResearchArtifact,
  ): Promise<ResearchArtifact> {
    const result = await this.privilegedClient
      .from("agent_research_artifacts")
      .upsert(
        {
          ...(artifact.id ? { id: artifact.id } : {}),
          workspace_id: artifact.workspaceId,
          case_id: artifact.caseId,
          issue_id: artifact.issueId,
          ticket_revision: artifact.ticketRevision,
          base_sha: artifact.baseSha,
          content_hash: artifact.contentHash,
          status: artifact.status,
          artifact_json: artifact,
          created_by_user_id: null,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "workspace_id,case_id,ticket_revision,base_sha" },
      )
      .select("id, artifact_json")
      .single();
    const value = row(checked("agent_research_artifacts.save", result));
    const stored = row(value.artifact_json) as unknown as ResearchArtifact;
    return { ...stored, id: str(value.id) };
  }

  async getResearchArtifact(
    artifactId: string,
    workspaceId?: string,
  ): Promise<ResearchArtifact | null> {
    let request = this.privilegedClient
      .from("agent_research_artifacts")
      .select("id, workspace_id, artifact_json")
      .eq("id", artifactId);
    if (workspaceId) request = request.eq("workspace_id", workspaceId);
    const result = await request.maybeSingle();
    const data = checked("agent_research_artifacts.get", result);
    if (!data) return null;
    const value = row(data);
    return {
      ...(row(value.artifact_json) as unknown as ResearchArtifact),
      id: str(value.id),
    };
  }

  async createAttempt(input: CreateCodexRunAttemptInput): Promise<void> {
    const result = await this.privilegedClient
      .from("agent_run_attempts")
      .insert({
        run_id: input.runId,
        workspace_id: input.workspaceId,
        attempt_number: input.attemptNumber,
        stage: input.stage,
        connection_id: input.connectionId ?? null,
        provider: input.provider ?? null,
        requested_model: input.requestedModel ?? null,
        real_model: input.realModel ?? null,
        effort: input.effort ?? null,
        auth_method: input.authMethod ?? null,
        status: "queued",
      });
    if (result.error)
      throw new Error(`agent_run_attempt.create:${result.error.message}`);
  }

  async updateAttempt(
    runId: string,
    attemptNumber: number,
    patch: Record<string, unknown>,
  ): Promise<void> {
    const result = await this.privilegedClient
      .from("agent_run_attempts")
      .update({ ...patch, updated_at: new Date().toISOString() })
      .eq("run_id", runId)
      .eq("attempt_number", attemptNumber);
    if (result.error)
      throw new Error(`agent_run_attempt.update:${result.error.message}`);
    const cost = Number(patch.cost_amount_usd);
    if (Number.isFinite(cost) && cost >= 0) {
      const runResult = await this.privilegedClient
        .from("agent_runs")
        .select("workspace_id, issue_id")
        .eq("id", runId)
        .maybeSingle();
      const runValue = checked("agent_run_attempt.cost_run", runResult);
      if (runValue) {
        const runRow = row(runValue);
        const caseResult = await this.privilegedClient
          .from("bug_cases")
          .select("conversation_id")
          .eq("workspace_id", str(runRow.workspace_id))
          .eq("issue_id", str(runRow.issue_id))
          .maybeSingle();
        const caseValue = checked("workflow_facts.cost_case", caseResult);
        const workflowId = caseValue
          ? str(row(caseValue).conversation_id, str(runRow.issue_id))
          : str(runRow.issue_id);
        const fact = await this.privilegedClient.from("workflow_facts").upsert(
          {
            workspace_id: str(runRow.workspace_id),
            workflow_id: workflowId,
            fact_type: "cost_recorded",
            value_numeric: cost,
            idempotency_key: `${runId}:cost:${attemptNumber}`,
          },
          {
            onConflict: "workspace_id,idempotency_key",
            ignoreDuplicates: true,
          },
        );
        checked("workflow_facts.cost_recorded", fact);
      }
    }
  }
}

export class SupabaseCodingRunAdapter implements CodingRunPort {
  private readonly codex: CodexService;
  private readonly bugLoop: SupabaseBugLoopStore;

  constructor(
    private readonly client: AnySupabaseClient,
    private readonly repositories: RepositoryConfigPort,
    private readonly store: SupabaseCodexRunStore,
    codexService?: CodexService,
    private readonly privilegedClient: AnySupabaseClient = client,
    private readonly jobStore?: JobStore<WhatsmiauMessageJobPayload>,
    private readonly controlPlane?: CodingControlPlanePort,
  ) {
    this.bugLoop = new SupabaseBugLoopStore(privilegedClient as never);
    this.codex =
      codexService ??
      new CodexService({
        repositories,
        runs: store,
        deployment: createDokployDeploymentFromEnv(),
        externalOperations: new SupabaseExternalOperationAdapter(
          privilegedClient,
        ),
        ...(controlPlane
          ? {
              agentConnectionSecretResolver:
                controlPlane.resolveConnectionSecret.bind(controlPlane),
            }
          : {}),
      });
  }

  private async recordRunFact(
    runRecord: import("../../codex.js").CodexRunRecord,
    factType: "policy_required_touch" | "fix_verified" | "cost_recorded",
    suffix: string,
    value: boolean | number = true,
  ): Promise<void> {
    const caseResult = await this.privilegedClient
      .from("bug_cases")
      .select("conversation_id")
      .eq("workspace_id", runRecord.workspaceId)
      .eq("issue_id", runRecord.issueId)
      .maybeSingle();
    const caseValue = checked("workflow_facts.bug_case", caseResult);
    const workflowId = caseValue
      ? str(row(caseValue).conversation_id, runRecord.issueId)
      : runRecord.issueId;
    const result = await this.privilegedClient.from("workflow_facts").upsert(
      {
        workspace_id: runRecord.workspaceId,
        workflow_id: workflowId,
        fact_type: factType,
        ...(typeof value === "boolean"
          ? { value_boolean: value }
          : { value_numeric: value }),
        idempotency_key: `${runRecord.id}:${factType}:${suffix}`,
      },
      { onConflict: "workspace_id,idempotency_key", ignoreDuplicates: true },
    );
    checked(`workflow_facts.${factType}`, result);
  }

  async list(context: RequestContext, query: CodingRunListQuery) {
    let request = this.client
      .from("agent_runs")
      .select("*, agent_run_attempts(*)")
      .eq("workspace_id", context.workspaceId);
    if (query.issueId) request = request.eq("issue_id", query.issueId);
    if (query.status) request = request.eq("status", query.status);
    if (query.cursor) request = request.gt("id", query.cursor);
    const result = await request
      .order("created_at", { ascending: false })
      .limit(query.limit);
    return rows(checked("agent_runs.list", result)).map((value) => {
      const mapped = run(value);
      const attempts = rows(value.agent_run_attempts).map(runAttempt);
      if (attempts.length) mapped.attempts = attempts;
      return mapped;
    });
  }

  async create(
    context: RequestContext,
    identifier: string,
    input: CodingRunCreateInput,
  ) {
    const issueResult = await this.client
      .from("issues")
      .select("*")
      .eq("workspace_id", context.workspaceId)
      .eq("identifier", identifier)
      .maybeSingle();
    const issueValue = checked("agent_runs.issue", issueResult);
    if (!issueValue) throw new Error("issue_not_found");
    const issue = row(issueValue);
    if (!input.repositoryId) throw new Error("repository_required");
    if (
      !(await this.repositories.getRepository(
        context.workspaceId,
        input.repositoryId,
      ))
    )
      throw new Error("repository_not_found");
    const stage: CodingStage =
      input.stage ??
      (input.mode === "implement_fix"
        ? "implement"
        : input.mode === "propose_fix"
          ? "research"
          : "research");
    const requestedMode = input.mode ?? legacyModeForStage(stage);
    if (input.parentRunId) {
      const parentResult = await this.privilegedClient
        .from("agent_runs")
        .select(
          "id, issue_id, repository_id, mode, status, verdict, research_artifact_id",
        )
        .eq("id", input.parentRunId)
        .eq("workspace_id", context.workspaceId)
        .maybeSingle();
      const parentData = checked("agent_runs.parent", parentResult);
      if (!parentData) throw new Error("parent_run_not_found");
      const parent = row(parentData);
      assertRunContinuation({
        parent: {
          issueId: str(parent.issue_id),
          ...(parent.repository_id
            ? { repositoryId: str(parent.repository_id) }
            : {}),
          mode: str(parent.mode) as
            | "investigate"
            | "propose_fix"
            | "implement_fix",
          status: str(parent.status),
          ...(parent.verdict ? { verdict: str(parent.verdict) } : {}),
          ...(parent.research_artifact_id
            ? { researchArtifactId: str(parent.research_artifact_id) }
            : {}),
        },
        child: {
          issueId: str(issue.id),
          repositoryId: input.repositoryId,
          mode: requestedMode,
          ...(input.researchArtifactId
            ? { researchArtifactId: input.researchArtifactId }
            : {}),
        },
      });
    }
    let effectiveConfig;
    let researchArtifact: ResearchArtifact | undefined;
    let caseId: string | undefined;
    if (input.stage) {
      if (!this.controlPlane)
        throw new Error("coding_control_plane_unavailable");
      if (stage === "implement" && !input.researchArtifactId)
        throw new Error("research_artifact_required");
      if (input.researchArtifactId) {
        const artifactResult = await this.privilegedClient
          .from("agent_research_artifacts")
          .select("id, workspace_id, artifact_json")
          .eq("id", input.researchArtifactId)
          .eq("workspace_id", context.workspaceId)
          .maybeSingle();
        const artifactData = checked(
          "agent_research_artifacts.run",
          artifactResult,
        );
        if (!artifactData) throw new Error("research_artifact_not_found");
        const artifactRow = row(artifactData);
        researchArtifact = {
          ...(row(artifactRow.artifact_json) as unknown as ResearchArtifact),
          id: str(artifactRow.id),
        };
        if (
          researchArtifact.status !== "current" ||
          researchArtifact.ticketRevision !== str(issue.updated_at)
        )
          throw new Error("research_artifact_stale");
      }
      effectiveConfig = await this.controlPlane.resolveRunConfig({
        context,
        stage,
        repositoryId: input.repositoryId,
        override: input.routeOverride,
        automation: false,
      });
      const caseResult = await this.privilegedClient
        .from("bug_cases")
        .select("id")
        .eq("workspace_id", context.workspaceId)
        .eq("issue_id", str(issue.id))
        .maybeSingle();
      const caseData = checked("bug_cases.run_case", caseResult);
      caseId = caseData ? str(row(caseData).id) : undefined;
      if (!caseId && stage === "research")
        caseId = await this.createCaseForResearchRun(
          context.workspaceId,
          str(issue.id),
        );
    }
    const policy = await this.workspacePolicy(context.workspaceId);
    if (!policy.allowedIntegrations.includes("agent"))
      throw new CodexServiceError(
        "Agent execution is disabled by the workspace AI integration policy",
      );
    const action =
      requestedMode === "investigate"
        ? "investigate"
        : requestedMode === "propose_fix"
          ? "propose_fix"
          : "implement_fix";
    if (!policy.allowedActions.includes(action))
      throw new CodexServiceError(
        `Agent action ${action} is disabled by the workspace AI policy`,
      );

    const agentContext = await this.loadCodexContext(
      context,
      issue,
      identifier,
      input.instructions,
    );
    const tools: SafeTool[] = (input.commands ?? []).map((name) => ({
      kind: "command",
      name: name as AllowedCommand,
    }));
    const requestedConfig = input.stage
      ? input.routeOverride
        ? { ...input.routeOverride }
        : { stage, source: "inherited" }
      : undefined;
    const runId = crypto.randomUUID();
    const queued = await this.store.createRun({
      id: runId,
      workspaceId: context.workspaceId,
      issueId: str(issue.id),
      repositoryId: input.repositoryId,
      mode: requestedMode,
      ...(input.stage ? { stage } : {}),
      ...(input.parentRunId ? { parentRunId: input.parentRunId } : {}),
      ...(input.researchArtifactId
        ? { researchArtifactId: input.researchArtifactId }
        : {}),
      ...(effectiveConfig
        ? {
            connectionId: effectiveConfig.connectionId,
            provider: effectiveConfig.provider,
            requestedModel: effectiveConfig.model,
            effort: effectiveConfig.effort,
            authMethod: effectiveConfig.authMethod,
            requestedConfig,
            effectiveConfig,
          }
        : {}),
      createdByUserId: context.userId,
    });
    const request = {
      issueIdentifier: identifier,
      branchBase: input.branchBase ?? "main",
      commands: input.commands ?? [],
      allowChanges: input.allowChanges ?? false,
      ...(input.instructions
        ? { instructions: redactSecrets(input.instructions).slice(0, 20_000) }
        : {}),
    };
    const jobPayload: AgentRunRequestedJobPayload = {
      stage: "agent_run_requested",
      runId,
      workspaceId: context.workspaceId,
      issueId: str(issue.id),
      repositoryId: input.repositoryId,
      issueIdentifier: identifier,
      issueTitle: str(issue.title),
      mode: requestedMode,
      ...(input.stage ? { codingStage: stage } : {}),
      ...(input.researchArtifactId
        ? { researchArtifactId: input.researchArtifactId }
        : {}),
      ...(researchArtifact ? { researchArtifact } : {}),
      ...(requestedConfig ? { requestedConfig } : {}),
      ...(effectiveConfig ? { effectiveConfig } : {}),
      ...(caseId ? { caseId } : {}),
      ticketRevision: str(issue.updated_at),
      ...(effectiveConfig
        ? { maxRuntimeMs: effectiveConfig.budget.maxRuntimeMs }
        : {}),
      context: agentContext,
      tools,
      createdByUserId: context.userId,
    };
    const persisted = await this.store.updateRun(runId, {
      result: { request },
    });
    if (this.jobStore) {
      await (
        this.jobStore as unknown as JobStore<AgentRunRequestedJobPayload>
      ).enqueue({
        workspaceId: context.workspaceId,
        type: AGENT_RUN_REQUESTED_JOB_TYPE,
        payload: jobPayload,
        dedupeKey: `mend:agent-run:${runId}`,
        maxAttempts: 5,
      });
    } else {
      void this.codex
        .start({
          runId,
          workspaceId: context.workspaceId,
          issueId: str(issue.id),
          repositoryId: input.repositoryId,
          issueIdentifier: identifier,
          issueTitle: str(issue.title),
          mode: requestedMode,
          ...(input.stage ? { stage } : {}),
          ...(input.researchArtifactId
            ? { researchArtifactId: input.researchArtifactId }
            : {}),
          ...(researchArtifact ? { researchArtifact } : {}),
          ...(requestedConfig ? { requestedConfig } : {}),
          ...(effectiveConfig ? { effectiveConfig } : {}),
          ...(caseId ? { caseId } : {}),
          ticketRevision: str(issue.updated_at),
          ...(effectiveConfig
            ? { maxRuntimeMs: effectiveConfig.budget.maxRuntimeMs }
            : {}),
          context: agentContext,
          tools,
          createdByUserId: context.userId,
        })
        .then((handle) => handle.completion)
        .catch(() => undefined);
    }

    // The Runs retry action creates a fresh run. If the previous case was
    // failed, reopen its durable checkpoint as part of the same request so
    // the new execution is visible in the complaint-to-fix state machine.
    const failedCase = await this.privilegedClient
      .from("bug_cases")
      .select("id, stage")
      .eq("workspace_id", context.workspaceId)
      .eq("issue_id", str(issue.id))
      .eq("stage", "failed")
      .maybeSingle();
    const failedCaseData = checked("bug_cases.retry", failedCase);
    const failedCaseRow = failedCaseData ? row(failedCaseData) : undefined;
    if (failedCaseRow && str(failedCaseRow.id)) {
      const bugCaseId = str(failedCaseRow.id);
      const retryStage: BugLoopStage =
        requestedMode === "investigate" ? "investigation" : "fix";
      await this.bugLoop.advance({
        workspaceId: context.workspaceId,
        bugCaseId,
        stage: retryStage,
        status: "active",
        eventType: "coding_run.retry",
        message: `A new ${requestedMode} run was started after the previous attempt failed.`,
        idempotencyKey: `agent-run-retry:${runId}`,
        ...(retryStage === "investigation"
          ? { investigationRunId: runId }
          : { fixRunId: runId }),
        metadata: {
          runId,
          mode: requestedMode,
          ...(input.stage ? { codingStage: stage } : {}),
        },
      });
    }
    return persisted ?? queued;
  }

  private async createCaseForResearchRun(
    workspaceId: string,
    issueId: string,
  ): Promise<string> {
    const created = await this.privilegedClient
      .from("bug_cases")
      .insert({
        workspace_id: workspaceId,
        issue_id: issueId,
        stage: "evidence",
        status: "active",
        evidence_json: [],
      })
      .select("id")
      .single();
    if (!created.error && created.data) return str(row(created.data).id);

    // A concurrent request may have created the issue's unique case after the
    // lookup above. Re-read before surfacing the original insert failure.
    const raced = await this.privilegedClient
      .from("bug_cases")
      .select("id")
      .eq("workspace_id", workspaceId)
      .eq("issue_id", issueId)
      .maybeSingle();
    const racedData = checked("bug_cases.run_case_race", raced);
    if (racedData) return str(row(racedData).id);
    throw new Error(
      `supabase:bug_cases.run_case_create:${created.error?.message ?? "empty_result"}`,
    );
  }

  private async loadCodexContext(
    context: RequestContext,
    issue: Row,
    identifier: string,
    instructions?: string,
  ) {
    const issueId = str(issue.id);
    const commentsPromise = this.client
      .from("issue_comments")
      .select("author_type, body, created_at")
      .eq("issue_id", issueId)
      .eq("workspace_id", context.workspaceId)
      .order("created_at", { ascending: true })
      .limit(100);
    const conversationId = str(issue.conversation_id);
    const messagesPromise = conversationId
      ? this.client
          .from("messages")
          .select("direction, sender_type, text, caption, created_at")
          .eq("conversation_id", conversationId)
          .eq("workspace_id", context.workspaceId)
          .order("created_at", { ascending: true })
          .limit(200)
      : Promise.resolve(null);
    const [comments, messages] = await Promise.all([
      commentsPromise,
      messagesPromise,
    ]);
    const commentRows = rows(checked("agent_runs.issue_comments", comments));
    const messageRows = messages
      ? rows(checked("agent_runs.messages", messages))
      : [];
    const contextMessages = [
      ...messageRows.map((value) => ({
        direction: str(value.direction),
        senderType: str(value.sender_type),
        text: str(value.text || value.caption),
        createdAt: str(value.created_at),
      })),
      ...commentRows.map((value) => ({
        direction: "comment",
        senderType: str(value.author_type),
        text: str(value.body),
        createdAt: str(value.created_at),
      })),
    ];
    const description = [
      str(issue.description),
      str(issue.impact) ? `Impact: ${str(issue.impact)}` : "",
      Array.isArray(issue.reproduction_steps_json) &&
      issue.reproduction_steps_json.length
        ? `Reproduction steps:\n${issue.reproduction_steps_json.map((step) => String(step)).join("\n")}`
        : "",
      str(issue.expected_behavior)
        ? `Expected behavior: ${str(issue.expected_behavior)}`
        : "",
      str(issue.actual_behavior)
        ? `Actual behavior: ${str(issue.actual_behavior)}`
        : "",
    ]
      .filter(Boolean)
      .join("\n\n");
    return {
      issue: {
        id: issueId,
        identifier,
        title: str(issue.title),
        ...(str(issue.ai_summary) ? { summary: str(issue.ai_summary) } : {}),
        ...(description ? { description } : {}),
        ...(str(issue.priority) ? { priority: str(issue.priority) } : {}),
        ...(str(issue.status) ? { status: str(issue.status) } : {}),
      },
      ...(contextMessages.length || str(issue.ai_summary)
        ? {
            conversation: {
              ...(str(issue.ai_summary)
                ? { summary: str(issue.ai_summary) }
                : {}),
              messages: contextMessages,
            },
          }
        : {}),
      ...(instructions
        ? { goal: redactSecrets(instructions).slice(0, 20_000) }
        : {}),
    };
  }
  async get(context: RequestContext, id: string) {
    return this.store.getRunWithAttempts(id, context.workspaceId);
  }
  private async scoped(context: RequestContext, id: string) {
    return this.store.getRunScoped(id, context.workspaceId);
  }
  async cancel(context: RequestContext, id: string) {
    if (!(await this.scoped(context, id))) return null;
    return this.codex.cancel(id);
  }
  async approve(context: RequestContext, id: string) {
    const run = await this.scoped(context, id);
    if (!run) return null;
    if (run.mode !== "implement_fix")
      throw new CodexServiceError(
        "Only implement_fix runs can be approved; resolve or notify the customer from the bug case",
      );
    await this.requirePolicyAction(context.workspaceId, "implement_fix");
    const updated = await this.codex.approve(id);
    await this.recordRunFact(updated, "policy_required_touch", "approval");
    await this.advanceCaseForRun(context.workspaceId, updated, "approval", {
      eventType: "fix.approved",
      message: "A human approved the verified fix.",
    });
    return updated;
  }
  async publish(context: RequestContext, id: string) {
    if (!(await this.scoped(context, id))) return null;
    await this.requirePolicyAction(context.workspaceId, "publish");
    const updated = await this.codex.publish(id);
    const pullRequest = row(row(updated.result).pullRequest);
    await this.advanceCaseForRun(context.workspaceId, updated, "pull_request", {
      eventType: "pull_request.created",
      message: "A draft pull request was created through the GitHub App.",
      ...(pullRequest.url ? { prUrl: str(pullRequest.url) } : {}),
      ...(Number.isSafeInteger(Number(pullRequest.number))
        ? { prNumber: Number(pullRequest.number) }
        : {}),
    });
    return updated;
  }
  async deploy(context: RequestContext, id: string) {
    if (!(await this.scoped(context, id))) return null;
    await this.requirePolicyAction(context.workspaceId, "deploy");
    const workspace = await this.client
      .from("workspaces")
      .select("ai_policy_json")
      .eq("id", context.workspaceId)
      .maybeSingle();
    const workspaceData = checked("agent_runs.deploy_policy", workspace);
    const workspaceRow = workspaceData ? row(workspaceData) : null;
    if (
      !workspaceRow ||
      !normalizeWorkspaceAiPolicy(workspaceRow.ai_policy_json)
        .bugAutoDeployEnabled
    )
      throw new Error("deployment_not_enabled_in_ai_policy");
    const updated = await this.codex.deploy(id);
    const deployment = row(row(updated.result).deployment);
    await this.advanceCaseForRun(context.workspaceId, updated, "deploy", {
      eventType: "deployment.started",
      message: "The approved fix was sent to the deployment provider.",
      ...(deployment.url ? { deploymentUrl: str(deployment.url) } : {}),
    });
    return updated;
  }
  async merge(context: RequestContext, id: string) {
    if (!(await this.scoped(context, id))) return null;
    await this.requirePolicyAction(context.workspaceId, "publish");
    const updated = await this.codex.merge(id);
    const merge = row(row(updated.result).merge);
    await this.advanceCaseForRun(context.workspaceId, updated, "merge", {
      eventType: "pull_request.merged",
      message: "The approved pull request was merged through the GitHub App.",
      mergeSha: str(merge.sha),
    });
    return updated;
  }
  async health(context: RequestContext, id: string) {
    if (!(await this.scoped(context, id))) return null;
    const updated = await this.codex.verifyHealth(id);
    const result = row(updated.result);
    const healthStatus =
      result.healthStatus === "healthy" ? "healthy" : "unhealthy";
    await this.advanceCaseForRun(context.workspaceId, updated, "health_check", {
      eventType: `deployment.health_${healthStatus}`,
      message:
        healthStatus === "healthy"
          ? "The deployed fix passed its health check."
          : "The deployed fix failed its health check and needs attention.",
      healthStatus,
    });
    if (healthStatus === "healthy")
      await this.recordRunFact(updated, "fix_verified", "health-check");
    return updated;
  }
  async reject(context: RequestContext, id: string) {
    if (!(await this.scoped(context, id))) return null;
    return this.codex.reject(id);
  }

  private async workspacePolicy(workspaceId: string) {
    const result = await this.client
      .from("workspaces")
      .select("ai_policy_json")
      .eq("id", workspaceId)
      .maybeSingle();
    const data = checked("agent_runs.ai_policy", result);
    return normalizeWorkspaceAiPolicy(row(data ?? {}).ai_policy_json);
  }

  private async requirePolicyAction(
    workspaceId: string,
    action: "implement_fix" | "publish" | "deploy",
  ) {
    const policy = await this.workspacePolicy(workspaceId);
    if (!policy.allowedActions.includes(action))
      throw new CodexServiceError(
        `AI action ${action} is disabled by the workspace AI policy`,
      );
  }
  private async advanceCaseForRun(
    workspaceId: string,
    runRecord: import("../../codex.js").CodexRunRecord,
    stage: BugLoopStage,
    details: {
      eventType: string;
      message: string;
      prUrl?: string;
      prNumber?: number;
      deploymentUrl?: string;
      mergeSha?: string;
      healthStatus?: "healthy" | "unhealthy";
    },
  ): Promise<void> {
    const column =
      runRecord.mode === "investigate"
        ? "investigation_agent_run_id"
        : "fix_agent_run_id";
    const result = await this.privilegedClient
      .from("bug_cases")
      .select("id")
      .eq("workspace_id", workspaceId)
      .eq(column, runRecord.id)
      .maybeSingle();
    const data = checked("bug_cases.run", result);
    if (!data) return;
    const bugCaseId = str(row(data).id);
    await this.bugLoop.advance({
      workspaceId,
      bugCaseId,
      stage,
      eventType: details.eventType,
      message: details.message,
      idempotencyKey: `${details.eventType}:${runRecord.id}`,
      metadata: { runId: runRecord.id },
      ...(details.prUrl ? { prUrl: details.prUrl } : {}),
      ...(details.prNumber ? { prNumber: details.prNumber } : {}),
      ...(details.deploymentUrl
        ? { deploymentUrl: details.deploymentUrl }
        : {}),
      ...(details.mergeSha ? { mergeSha: details.mergeSha } : {}),
      ...(details.healthStatus ? { healthStatus: details.healthStatus } : {}),
    });
  }
  async patch(context: RequestContext, id: string) {
    if (!(await this.scoped(context, id))) return null;
    const diff = await this.codex.getDiff(id);
    return { patch: diff.patch, truncated: diff.truncated };
  }
}
