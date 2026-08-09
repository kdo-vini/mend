import { randomUUID } from "node:crypto";
import type { AllowedCommand } from "../src/core.js";
import {
  createBranchName,
  redactSecrets,
  type CodexRunRecord,
  type RunCodexInput,
  type RunCodexResult,
  type SafeToolResult,
} from "./codex.js";
import type { CodexContext, CodexRunExecutor } from "./codex-service.js";
import {
  CodingAgentCli,
  codingAgentNames,
  createCodingAgentCli,
  type CodingAgentName,
} from "./coding-agent-cli.js";
import {
  createResearchArtifact,
  isRecoverableFallbackError,
  isResearchArtifactCurrent,
  legacyModeForStage,
  normalizeAgentUsage,
  type CodingStage,
  type EffectiveFallbackRoute,
  type EffectiveRunConfig,
  type ResearchArtifact,
} from "./coding-control-plane.js";

export interface CodingAgentRepositoryConfig {
  agentProvider?: CodingAgentName;
  executionPlane?: "dokploy" | "github_actions";
}

export interface CodingAgentRepositoryPort {
  getRepository(
    workspaceId: string,
    repositoryId: string,
  ): Promise<CodingAgentRepositoryConfig | null>;
}

export type AgentCredentialResolver = (
  workspaceId: string,
  provider: CodingAgentName,
) => Promise<string | null>;

export interface AgentConnectionSecret {
  apiKey?: string;
  bundle?: Record<string, string>;
}

export type AgentConnectionSecretResolver = (
  workspaceId: string,
  connectionId: string,
) => Promise<AgentConnectionSecret | null>;

function providerName(value: unknown): CodingAgentName {
  return codingAgentNames.includes(value as CodingAgentName)
    ? (value as CodingAgentName)
    : "openai";
}

function codingPrompt(
  context: CodexContext,
  mode: RunCodexInput["mode"],
  stage?: CodingStage,
  researchArtifact?: ResearchArtifact,
): string {
  const objective =
    stage === "research"
      ? "Perform one repository research pass. Return the diagnosis, evidence, reproduction, smallest safe proposal, acceptance criteria and checks in the structured report. Do not change files."
      : stage === "implement"
        ? "Implement the smallest safe fix described by the research artifact. Do not research the repository again and do not publish it."
        : stage === "review"
          ? "Review the supplied research artifact, diff and checks. Do not research the repository again and do not change files."
          : stage === "verify"
            ? "Interpret only the supplied deterministic check logs, diff and research artifact. Do not research the repository again and do not change files."
            : mode === "implement_fix"
              ? "Implement the smallest safe fix. Do not publish it."
              : mode === "propose_fix"
                ? "Propose the smallest safe fix without changing files."
                : "Investigate whether the complaint is a real product defect. Do not change files.";
  const payload = researchArtifact
    ? JSON.stringify({
        issue: context.issue,
        repository: context.repository,
        researchArtifact,
      })
    : JSON.stringify(context);
  return [
    objective,
    "Base the verdict only on repository evidence and reproducible checks.",
    "If evidence is insufficient, return needs_human instead of guessing.",
    `Case context:\n${payload}`,
  ].join("\n\n");
}

function requestedChecks(input: RunCodexInput): AllowedCommand[] {
  const allowed = new Set<AllowedCommand>(["lint", "test", "build"]);
  return [
    ...new Set(
      (input.tools ?? []).flatMap((tool) =>
        tool.kind === "command" && allowed.has(tool.name) ? [tool.name] : [],
      ),
    ),
  ];
}

function checkTools(
  checks: readonly {
    name: AllowedCommand;
    output: string;
    exitCode: number;
  }[],
): SafeToolResult[] {
  return checks.map((check) => ({
    kind: "command",
    name: check.name,
    output: redactSecrets(check.output),
    exitCode: check.exitCode,
  }));
}

/** Bridges the provider-neutral CLI contract into the existing durable run store. */
export function createCodingAgentRunExecutor(
  repositories: CodingAgentRepositoryPort,
  cli: CodingAgentCli = createCodingAgentCli(),
  resolveCredential?: AgentCredentialResolver,
  resolveConnectionSecret?: AgentConnectionSecretResolver,
): CodexRunExecutor {
  return async (
    input: RunCodexInput,
    context: CodexContext,
  ): Promise<RunCodexResult> => {
    const config = input.repositoryId
      ? await repositories.getRepository(input.workspaceId, input.repositoryId)
      : null;
    if (!config) throw new Error("Coding agent repository is unavailable");
    if (config.executionPlane === "github_actions")
      throw new Error(
        "GitHub Actions execution requires the Mend workflow callback; choose Dokploy until it is configured",
      );

    if (
      input.stage === "implement" &&
      input.researchArtifact &&
      !isResearchArtifactCurrent(
        input.researchArtifact,
        input.ticketRevision ?? context.issue.id,
        input.baseSha ?? input.githubBaseSha ?? "unknown",
      )
    )
      throw new Error("research_artifact_stale");

    const provider = providerName(config.agentProvider);
    const routed = input.effectiveConfig;
    let selectedProvider = routed?.provider ?? provider;
    const selectedMode = input.stage
      ? legacyModeForStage(input.stage)
      : input.mode === "research" ||
          input.mode === "implement" ||
          input.mode === "review" ||
          input.mode === "verify"
        ? legacyModeForStage(input.mode)
        : input.mode;
    const resolveRouteAuth = async (
      route: EffectiveRunConfig | EffectiveFallbackRoute,
      allowLegacyCredential: boolean,
    ) => {
      const secret = resolveConnectionSecret
        ? await resolveConnectionSecret(input.workspaceId, route.connectionId)
        : null;
      const apiKey =
        secret?.apiKey ??
        (allowLegacyCredential && resolveCredential
          ? await resolveCredential(input.workspaceId, route.provider)
          : undefined);
      if (route.authMethod === "api_key" && !apiKey)
        throw new Error(
          `agent_connection_secret_missing:${route.connectionId}`,
        );
      if (route.authMethod === "subscription" && !secret?.bundle)
        throw new Error(
          `agent_subscription_bundle_missing:${route.connectionId}`,
        );
      return { secret, apiKey };
    };
    const initialAuth = routed
      ? await resolveRouteAuth(routed, true)
      : {
          secret: null,
          apiKey: resolveCredential
            ? await resolveCredential(input.workspaceId, selectedProvider)
            : undefined,
        };
    if (!routed && resolveCredential && !initialAuth.apiKey)
      throw new Error(`agent_credential_missing:${selectedProvider}`);
    const candidateRoutes: Array<
      EffectiveRunConfig | EffectiveFallbackRoute | undefined
    > = routed ? [routed, ...routed.fallbacks] : [undefined];
    let activeRoute: EffectiveRunConfig | EffectiveFallbackRoute | undefined =
      routed;
    let activeSecret = initialAuth.secret;
    let activeApiKey = initialAuth.apiKey;
    const runId = input.runId ?? randomUUID();
    const branchName = createBranchName(
      input.issueIdentifier,
      input.issueTitle,
      runId,
    );
    let current: CodexRunRecord = await input.store.createRun({
      id: runId,
      workspaceId: input.workspaceId,
      issueId: input.issueId,
      repositoryId: input.repositoryId,
      mode: input.stage ? legacyModeForStage(input.stage) : input.mode,
      provider: selectedProvider,
      ...(input.stage ? { stage: input.stage } : {}),
      ...(input.researchArtifactId
        ? { researchArtifactId: input.researchArtifactId }
        : {}),
      ...(routed
        ? {
            connectionId: routed.connectionId,
            requestedModel: routed.model,
            effort: routed.effort,
            authMethod: routed.authMethod,
            effectiveConfig: routed,
            requestedConfig: input.requestedConfig ?? routed.snapshot,
          }
        : {}),
      branchName,
      createdByUserId: input.createdByUserId,
    });
    const update = async (
      patch: Parameters<RunCodexInput["store"]["updateRun"]>[1],
    ) => {
      const updated = await input.store.updateRun(current.id, patch);
      current =
        updated ??
        ({
          ...current,
          ...patch,
          updatedAt: new Date().toISOString(),
        } as CodexRunRecord);
    };
    const event = async (
      eventType: Parameters<
        RunCodexInput["store"]["appendEvent"]
      >[1]["eventType"],
      message: string,
      metadata: Record<string, unknown> = {},
    ) => {
      const persisted = await input.store.appendEvent(current.id, {
        eventType,
        message,
        metadata,
      });
      await input.eventSink?.publish(persisted).catch(() => undefined);
    };
    let attemptNumber = 1;
    if (input.stage && routed && input.store.createAttempt) {
      await input.store.createAttempt({
        runId: current.id,
        workspaceId: input.workspaceId,
        attemptNumber,
        stage: input.stage,
        connectionId: routed.connectionId,
        provider: selectedProvider,
        requestedModel: routed.model,
        effort: routed.effort,
        authMethod: routed.authMethod,
      });
    }

    try {
      await event("run_queued", `${provider} CLI run queued`, {
        provider: selectedProvider,
        mode: input.mode,
        ...(input.stage ? { stage: input.stage } : {}),
      });
      await update({
        status: "running",
        progress: 5,
        startedAt: new Date().toISOString(),
      });
      await event(
        "run_started",
        `${selectedProvider} CLI started in an isolated copy`,
        {
          provider: selectedProvider,
          mode: input.mode,
          ...(input.stage ? { stage: input.stage } : {}),
        },
      );
      if (input.stage && input.store.updateAttempt)
        await input.store.updateAttempt(current.id, attemptNumber, {
          status: "running",
          started_at: new Date().toISOString(),
        });
      let result: Awaited<ReturnType<CodingAgentCli["run"]>> | undefined;
      let lastRouteError: unknown;
      for (
        let candidateIndex = 0;
        candidateIndex < candidateRoutes.length;
        candidateIndex += 1
      ) {
        const candidate = candidateRoutes[candidateIndex];
        if (candidate && candidateIndex > 0) {
          attemptNumber = candidateIndex + 1;
          activeRoute = candidate;
          selectedProvider = candidate.provider;
          const auth = await resolveRouteAuth(candidate, false);
          activeSecret = auth.secret;
          activeApiKey = auth.apiKey;
          if (input.stage && input.store.createAttempt)
            await input.store.createAttempt({
              runId: current.id,
              workspaceId: input.workspaceId,
              attemptNumber,
              stage: input.stage,
              connectionId: candidate.connectionId,
              provider: candidate.provider,
              requestedModel: candidate.model,
              effort: candidate.effort,
              authMethod: candidate.authMethod,
            });
          await event(
            "run_fallback",
            `Fallback attempt ${attemptNumber} selected after a recoverable provider error`,
            {
              provider: candidate.provider,
              connectionId: candidate.connectionId,
              attemptNumber,
            },
          );
          if (input.stage && input.store.updateAttempt)
            await input.store.updateAttempt(current.id, attemptNumber, {
              status: "running",
              started_at: new Date().toISOString(),
            });
        }
        try {
          result = await cli.run({
            provider: selectedProvider,
            mode: selectedMode,
            ...(input.stage ? { stage: input.stage } : {}),
            ...(activeRoute?.model ? { model: activeRoute.model } : {}),
            ...(activeRoute?.effort ? { effort: activeRoute.effort } : {}),
            ...(routed?.budget.maxOutputTokens
              ? { maxOutputTokens: routed.budget.maxOutputTokens }
              : {}),
            repoRoot: input.repoRoot,
            prompt: codingPrompt(
              context,
              input.mode,
              input.stage,
              input.researchArtifact,
            ),
            checks: requestedChecks(input),
            timeoutMs: input.maxRuntimeMs,
            signal: input.signal,
            ...(activeApiKey ? { apiKey: activeApiKey } : {}),
            ...(activeSecret?.bundle
              ? { authBundle: activeSecret.bundle }
              : {}),
          });
          break;
        } catch (error) {
          lastRouteError = error;
          const next = candidateRoutes[candidateIndex + 1];
          if (
            !next ||
            !routed?.fallbackEnabled ||
            !isRecoverableFallbackError(error)
          )
            throw error;
          if (input.stage && input.store.updateAttempt)
            await input.store
              .updateAttempt(current.id, attemptNumber, {
                status: "failed",
                error_category: "capacity",
                error_message: redactSecrets(
                  error instanceof Error ? error.message : String(error),
                ).slice(0, 2_000),
                finished_at: new Date().toISOString(),
              })
              .catch(() => undefined);
        }
      }
      if (!result) throw lastRouteError ?? new Error("coding_agent_no_result");
      if (
        input.stage !== "implement" &&
        input.mode !== "implement_fix" &&
        result.patch.files.length
      )
        throw new Error("Read-only coding agent changed repository files");

      const tools = checkTools(result.checks);
      const checks = result.checks.map((check) => ({
        name: check.name,
        exitCode: check.exitCode,
        output: redactSecrets(check.output).slice(-20_000),
      }));
      let researchArtifact: ResearchArtifact | undefined;
      if (input.stage === "research") {
        researchArtifact = createResearchArtifact({
          schemaVersion: 1,
          workspaceId: input.workspaceId,
          caseId: input.caseId ?? input.issueId,
          issueId: input.issueId,
          ticketRevision: input.ticketRevision ?? context.issue.id,
          baseSha: input.baseSha ?? input.githubBaseSha ?? "unknown",
          diagnosis: {
            verdict:
              result.report.verdict === "not_reproduced"
                ? "not_reproduced"
                : result.report.verdict === "needs_human"
                  ? "needs_human"
                  : "confirmed",
            summary: result.report.summary,
            ...(result.report.rootCause
              ? { rootCause: result.report.rootCause }
              : {}),
          },
          evidence: result.report.evidence,
          reproduction: result.report.reproduction ?? { steps: [] },
          files:
            result.report.files ??
            result.patch.files.map((file) => ({ path: file.relativePath })),
          proposal: result.report.proposal ?? {
            summary: result.report.summary,
            changes: [],
          },
          acceptanceCriteria: result.report.acceptanceCriteria ?? [],
          checks: result.checks.map((check) => check.name),
          hashes: {
            base: input.baseSha ?? input.githubBaseSha ?? "unknown",
          },
        });
        if (input.store.saveResearchArtifact)
          researchArtifact =
            await input.store.saveResearchArtifact(researchArtifact);
      }
      const usage = normalizeAgentUsage(
        result.usage ?? result.metadata,
        activeRoute?.authMethod ?? "api_key",
      );
      if (
        routed?.budget.maxCostUsd !== undefined &&
        usage.cost.amountUsd !== undefined &&
        usage.cost.amountUsd > routed.budget.maxCostUsd
      )
        throw new Error("agent_budget_cost_exceeded");
      if (input.stage && input.store.updateAttempt)
        await input.store.updateAttempt(current.id, attemptNumber, {
          status: "completed",
          real_model: result.realModel ?? activeRoute?.model ?? null,
          input_tokens: usage.inputTokens,
          output_tokens: usage.outputTokens,
          cached_input_tokens: usage.cachedInputTokens,
          total_tokens: usage.totalTokens,
          cache_json: usage.cache,
          quota_json: usage.quota,
          cost_amount_usd: usage.cost.amountUsd ?? null,
          cost_status: usage.cost.method,
          duration_ms: usage.durationMs,
          finished_at: new Date().toISOString(),
        });
      const persistedResult = {
        provider: result.provider,
        version: result.version,
        ...(result.requestedModel
          ? { requestedModel: result.requestedModel }
          : {}),
        ...(result.realModel ? { realModel: result.realModel } : {}),
        ...(result.effort ? { effort: result.effort } : {}),
        usage: { ...usage },
        cache: usage.cache,
        ...(researchArtifact
          ? {
              researchArtifactId:
                researchArtifact.id ?? researchArtifact.contentHash,
              researchArtifact,
            }
          : {}),
        ...(input.githubBaseSha ? { githubBaseSha: input.githubBaseSha } : {}),
        agent: {
          provider: result.provider,
          version: result.version,
          report: result.report,
          metadata: result.metadata,
        },
        files: result.patch.files,
        patch: result.patch.patch,
        diffTruncated: result.patch.truncated,
        publishFiles: result.publishFiles?.map((file) => ({
          path: file.path,
          status: file.status,
          ...(file.content !== undefined
            ? {
                content: Buffer.from(file.content).toString("base64"),
                contentEncoding: "base64" as const,
              }
            : {}),
          ...(file.mode ? { mode: file.mode } : {}),
        })),
        checks,
        branchLocalOnly: true,
      };
      await update({
        status: "completed",
        progress: 100,
        finishedAt: new Date().toISOString(),
        ...(input.stage ? { stage: input.stage } : {}),
        ...(researchArtifact
          ? {
              researchArtifactId:
                researchArtifact.id ?? researchArtifact.contentHash,
            }
          : {}),
        ...(activeRoute
          ? {
              connectionId: activeRoute.connectionId,
              authMethod: activeRoute.authMethod,
              effort: activeRoute.effort,
              realModel: result.realModel ?? activeRoute.model,
              usage: { ...usage },
              cache: usage.cache,
              provider: selectedProvider,
              quota: usage.quota,
              ...(usage.cost.amountUsd !== undefined
                ? { costAmountUsd: usage.cost.amountUsd }
                : {}),
              costStatus: usage.cost.method,
              durationMs: usage.durationMs,
            }
          : {}),
        result: persistedResult,
      });
      if (result.patch.files.length)
        await event(
          "diff_ready",
          `${result.patch.files.length} changed file(s) ready for review`,
          {
            files: result.patch.files.map((file) => file.relativePath),
            truncated: result.patch.truncated,
          },
        );
      await event("run_completed", `${selectedProvider} CLI run completed`, {
        provider: selectedProvider,
        verdict: result.report.verdict,
        recommendedAction: result.report.recommendedAction,
        checksPassed: result.checks.every((check) => check.passed),
      });
      return { run: current, diff: result.patch, tools };
    } catch (error) {
      const message = redactSecrets(
        error instanceof Error ? error.message : String(error),
      );
      await update({
        status: input.signal?.aborted ? "canceled" : "failed",
        finishedAt: new Date().toISOString(),
        result: {
          ...(input.githubBaseSha
            ? { githubBaseSha: input.githubBaseSha }
            : {}),
          provider: selectedProvider,
          error: message,
        },
      });
      if (input.stage && input.store.updateAttempt)
        await input.store
          .updateAttempt(current.id, attemptNumber, {
            status: input.signal?.aborted ? "canceled" : "failed",
            error_category: /auth|credential/i.test(message)
              ? "authentication"
              : /rate|quota|429|503|unavailable/i.test(message)
                ? "capacity"
                : /schema/i.test(message)
                  ? "schema"
                  : /security|permission/i.test(message)
                    ? "security"
                    : "execution",
            error_message: message.slice(0, 2_000),
            finished_at: new Date().toISOString(),
          })
          .catch(() => undefined);
      await event(
        input.signal?.aborted ? "run_canceled" : "run_failed",
        input.signal?.aborted
          ? `${selectedProvider} CLI run was canceled`
          : `${selectedProvider} CLI run failed`,
        { provider: selectedProvider, error: message },
      );
      throw error;
    }
  };
}
