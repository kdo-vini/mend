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

function providerName(value: unknown): CodingAgentName {
  return codingAgentNames.includes(value as CodingAgentName)
    ? (value as CodingAgentName)
    : "openai";
}

function codingPrompt(
  context: CodexContext,
  mode: RunCodexInput["mode"],
): string {
  const objective =
    mode === "implement_fix"
      ? "Implement the smallest safe fix. Do not publish it."
      : mode === "propose_fix"
        ? "Propose the smallest safe fix without changing files."
        : "Investigate whether the complaint is a real product defect. Do not change files.";
  return [
    objective,
    "Base the verdict only on repository evidence and reproducible checks.",
    "If evidence is insufficient, return needs_human instead of guessing.",
    `Case context:\n${JSON.stringify(context)}`,
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

    const provider = providerName(config.agentProvider);
    const apiKey = resolveCredential
      ? await resolveCredential(input.workspaceId, provider)
      : undefined;
    if (resolveCredential && !apiKey)
      throw new Error(`agent_credential_missing:${provider}`);
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
      mode: input.mode,
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

    try {
      await event("run_queued", `${provider} CLI run queued`, {
        provider,
        mode: input.mode,
      });
      await update({
        status: "running",
        progress: 5,
        startedAt: new Date().toISOString(),
      });
      await event(
        "run_started",
        `${provider} CLI started in an isolated copy`,
        {
          provider,
          mode: input.mode,
        },
      );
      const result = await cli.run({
        provider,
        mode: input.mode,
        repoRoot: input.repoRoot,
        prompt: codingPrompt(context, input.mode),
        checks: requestedChecks(input),
        timeoutMs: input.maxRuntimeMs,
        signal: input.signal,
        ...(apiKey ? { apiKey } : {}),
      });
      if (input.mode !== "implement_fix" && result.patch.files.length)
        throw new Error("Read-only coding agent changed repository files");

      const tools = checkTools(result.checks);
      const checks = result.checks.map((check) => ({
        name: check.name,
        exitCode: check.exitCode,
        output: redactSecrets(check.output).slice(-20_000),
      }));
      const persistedResult = {
        provider: result.provider,
        version: result.version,
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
      await event("run_completed", `${provider} CLI run completed`, {
        provider,
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
          provider,
          error: message,
        },
      });
      await event(
        input.signal?.aborted ? "run_canceled" : "run_failed",
        input.signal?.aborted
          ? `${provider} CLI run was canceled`
          : `${provider} CLI run failed`,
        { provider, error: message },
      );
      throw error;
    }
  };
}
