import { createHash, randomUUID } from "node:crypto";
import { mkdir, realpath, rm, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { allowedCommands, type AllowedCommand } from "../src/core.js";
import {
  CodexCancellationRegistry,
  CodexRunRecord,
  CodexRunStore,
  RunCodexInput,
  RunCodexResult,
  SafeTool,
  SafeToolResult,
  createBranchName,
  redactSecrets,
} from "./codex.js";
import type { CodexEventSink, CodexRunEventInput } from "./codex-events.js";
import {
  createLocalGit,
  type GitCommitResult,
  type GitLocalPort,
} from "./git-local.js";
import type { OpenAiCodexClient, OpenAiCodexOptions } from "./codex-openai.js";
import type { CodexDeploymentPort } from "./deployment.js";
import { createDokployDeploymentFromEnv } from "./deployment.js";
import { createCodingAgentRunExecutor } from "./coding-agent-executor.js";
import type { CodingAgentName } from "./coding-agent-cli.js";
import type { AgentCredentialResolver } from "./coding-agent-executor.js";
import {
  collectGitHubPublishFiles,
  createGitHubControlPlaneFromEnv,
  GitHubControlPlaneError,
  probeDeploymentHealth,
  type GitHubControlPlane,
  type GitHubFetch,
  type GitHubRepositoryRef,
} from "./github-control-plane.js";

const maxContextText = 4_000;
const maxContextMessages = 6;
const maxPersistedCommandOutput = 160_000;
const repositoryLockLeaseMs = 30 * 60_000;

function waitMs(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

export interface RepositoryConfig {
  id: string;
  workspaceId: string;
  name: string;
  defaultBranch: string;
  allowedCommands?: readonly string[];
  agentProvider?: CodingAgentName;
  executionPlane?: "dokploy" | "github_actions";
  githubOwner?: string;
  githubRepo?: string;
  githubInstallationId?: string;
}

export interface ResolvedRepository extends RepositoryConfig {
  root: string;
  allowedCommandSet: ReadonlySet<AllowedCommand>;
}

export interface RepositoryConfigPort {
  getRepository(
    workspaceId: string,
    repositoryId: string,
  ): Promise<RepositoryConfig | null>;
}

export interface CodexRunLookupPort {
  getRun(runId: string): Promise<CodexRunRecord | null>;
}

export type CodexServiceRunStore = CodexRunStore & Partial<CodexRunLookupPort>;

export interface CodexContextMessage {
  direction?: string;
  senderType?: string;
  text?: string;
  createdAt?: string;
}

export interface CodexContextInput {
  issue: {
    id: string;
    identifier: string;
    title: string;
    summary?: string;
    description?: string;
    priority?: string;
    status?: string;
  };
  conversation?: {
    summary?: string;
    messages?: readonly CodexContextMessage[];
  };
  goal?: string;
}

export interface CodexContext {
  issue: {
    id: string;
    identifier: string;
    title: string;
    summary?: string;
    description?: string;
    priority?: string;
    status?: string;
  };
  repository: {
    id: string;
    name: string;
    defaultBranch: string;
  };
  conversation?: {
    summary?: string;
    messages: readonly CodexContextMessage[];
  };
  goal?: string;
}

export interface CodexContextPort {
  mount(context: CodexContext): Promise<CodexContext>;
}

export class InMemoryCodexContextPort implements CodexContextPort {
  readonly mounted: CodexContext[] = [];

  async mount(context: CodexContext): Promise<CodexContext> {
    this.mounted.push(context);
    return context;
  }
}

export type CodexRunExecutor = (
  input: RunCodexInput,
  context: CodexContext,
) => Promise<RunCodexResult>;

export interface CodexServicePorts {
  repositories: RepositoryConfigPort;
  runs: CodexServiceRunStore;
  git?: GitLocalPort;
  context?: CodexContextPort;
  execute?: CodexRunExecutor;
  agentCredentialResolver?: AgentCredentialResolver;
  eventSink?: CodexEventSink;
  cancellation?: CodexCancellationRegistry;
  openAi?: OpenAiCodexOptions & {
    client?: OpenAiCodexClient;
    enabled?: boolean;
  };
  deployment?: CodexDeploymentPort;
  github?: GitHubControlPlane | null;
  healthProbe?: typeof probeDeploymentHealth;
  healthFetcher?: GitHubFetch;
}

export interface StartCodexRunInput {
  runId?: string;
  workspaceId: string;
  issueId: string;
  repositoryId: string;
  issueIdentifier: string;
  issueTitle: string;
  mode: RunCodexInput["mode"];
  context: CodexContextInput;
  tools?: readonly SafeTool[];
  createdByUserId?: string;
  maxRuntimeMs?: number;
  commandTimeoutMs?: number;
}

export interface CodexCommandResultRecord {
  name: AllowedCommand;
  output: string;
  exitCode: number;
  passed: boolean;
}

export interface CodexTestResultRecord extends CodexCommandResultRecord {
  name: "test";
}

export interface CodexLocalCommit {
  status: "created" | "not_created" | "failed";
  branch?: string;
  sha?: string;
  paths?: string[];
  reason?: string;
  error?: string;
}

export interface CodexServiceResult extends RunCodexResult {
  context: CodexContext;
  commandResults: CodexCommandResultRecord[];
  testResults: CodexTestResultRecord[];
}

export interface CodexRunHandle {
  runId: string;
  run: CodexRunRecord;
  completion: Promise<CodexServiceResult>;
}

export class CodexServiceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CodexServiceError";
  }
}

function nonEmpty(value: string | undefined, label: string): string {
  if (typeof value !== "string" || !value.trim())
    throw new CodexServiceError(`${label} is required`);
  return value.trim();
}

function boundedText(
  value: unknown,
  limit = maxContextText,
): string | undefined {
  if (typeof value !== "string" || !value.trim()) return undefined;
  return redactSecrets(value.trim()).slice(0, limit);
}

function requiredBoundedText(
  value: string,
  label: string,
  limit = maxContextText,
): string {
  const text = boundedText(nonEmpty(value, label), limit);
  if (!text) throw new CodexServiceError(`${label} is required`);
  return text;
}

function boundedContextMessage(
  message: CodexContextMessage,
): CodexContextMessage | null {
  const text = boundedText(message.text, maxContextText);
  if (!text) return null;
  return {
    ...(boundedText(message.direction, 32)
      ? { direction: boundedText(message.direction, 32) }
      : {}),
    ...(boundedText(message.senderType, 32)
      ? { senderType: boundedText(message.senderType, 32) }
      : {}),
    text,
    ...(boundedText(message.createdAt, 80)
      ? { createdAt: boundedText(message.createdAt, 80) }
      : {}),
  };
}

export function mountCodexContext(
  input: CodexContextInput,
  repository: RepositoryConfig,
): CodexContext {
  const issue = input.issue;
  const messages = (input.conversation?.messages ?? [])
    .slice(-maxContextMessages)
    .map(boundedContextMessage)
    .filter((message): message is CodexContextMessage => Boolean(message));
  return {
    issue: {
      id: requiredBoundedText(issue.id, "issue.id"),
      identifier: requiredBoundedText(
        issue.identifier,
        "issue.identifier",
        128,
      ),
      title: requiredBoundedText(issue.title, "issue.title"),
      ...(boundedText(issue.summary)
        ? { summary: boundedText(issue.summary) }
        : {}),
      ...(boundedText(issue.description)
        ? { description: boundedText(issue.description) }
        : {}),
      ...(boundedText(issue.priority, 32)
        ? { priority: boundedText(issue.priority, 32) }
        : {}),
      ...(boundedText(issue.status, 32)
        ? { status: boundedText(issue.status, 32) }
        : {}),
    },
    repository: {
      id: requiredBoundedText(repository.id, "repository.id"),
      name: requiredBoundedText(repository.name, "repository.name"),
      defaultBranch: requiredBoundedText(
        repository.defaultBranch,
        "repository.defaultBranch",
        128,
      ),
    },
    ...(input.conversation
      ? {
          conversation: {
            ...(boundedText(input.conversation.summary)
              ? { summary: boundedText(input.conversation.summary) }
              : {}),
            messages,
          },
        }
      : {}),
    ...(boundedText(input.goal) ? { goal: boundedText(input.goal) } : {}),
  };
}

function isWithin(root: string, candidate: string): boolean {
  const relative = path.relative(root, candidate);
  return (
    relative === "" ||
    (relative !== ".." &&
      !relative.startsWith(`..${path.sep}`) &&
      !path.isAbsolute(relative))
  );
}

function normalizeAllowedCommands(
  value: readonly string[] | undefined,
): ReadonlySet<AllowedCommand> {
  const names = value ?? Object.keys(allowedCommands);
  if (!Array.isArray(names))
    throw new CodexServiceError("Repository allowedCommands must be an array");
  const normalized = new Set<AllowedCommand>();
  for (const name of names) {
    if (
      typeof name !== "string" ||
      !Object.prototype.hasOwnProperty.call(allowedCommands, name)
    ) {
      throw new CodexServiceError(
        `Repository command is not allowed: ${String(name)}`,
      );
    }
    normalized.add(name as AllowedCommand);
  }
  return normalized;
}

async function resolveRepository(
  rootValue: string,
  config: RepositoryConfig,
): Promise<ResolvedRepository> {
  const workspaceRoot = await realpath(
    nonEmpty(rootValue, "MEND_AGENT_WORKSPACE_ROOT"),
  );
  if (!(await stat(workspaceRoot)).isDirectory())
    throw new CodexServiceError(
      "MEND_AGENT_WORKSPACE_ROOT must be a directory",
    );
  const root = workspaceRoot;
  if (!(await stat(root)).isDirectory())
    throw new CodexServiceError("Configured repository must be a directory");
  if (!isWithin(workspaceRoot, root))
    throw new CodexServiceError(
      "Configured repository is outside the Agent workspace",
    );
  return {
    ...config,
    id: nonEmpty(config.id, "repository.id"),
    workspaceId: nonEmpty(config.workspaceId, "repository.workspaceId"),
    name: nonEmpty(config.name, "repository.name"),
    defaultBranch: nonEmpty(config.defaultBranch, "repository.defaultBranch"),
    root,
    allowedCommandSet: normalizeAllowedCommands(config.allowedCommands),
  };
}

function validateTools(
  tools: readonly SafeTool[] | undefined,
  allowed: ReadonlySet<AllowedCommand>,
): readonly SafeTool[] {
  const requested = tools ?? [];
  if (requested.length > 32)
    throw new CodexServiceError("Codex tool list exceeds 32 steps");
  return requested.map((tool) => {
    if (!tool || typeof tool !== "object" || !("kind" in tool))
      throw new CodexServiceError("Invalid Codex tool");
    if (tool.kind === "command") {
      if (
        !Object.prototype.hasOwnProperty.call(allowedCommands, tool.name) ||
        !allowed.has(tool.name)
      ) {
        throw new CodexServiceError(
          `Command is not enabled for this repository: ${String(tool.name)}`,
        );
      }
      return { kind: "command", name: tool.name };
    }
    if (tool.kind === "list_files") {
      if (
        tool.relativeDirectory !== undefined &&
        typeof tool.relativeDirectory !== "string"
      )
        throw new CodexServiceError("Invalid list_files directory");
      return {
        kind: "list_files",
        ...(tool.relativeDirectory !== undefined
          ? { relativeDirectory: tool.relativeDirectory }
          : {}),
      };
    }
    if (tool.kind === "git_status" || tool.kind === "diff")
      return { kind: tool.kind };
    throw new CodexServiceError(
      `Tool is not allowed: ${String((tool as { kind: string }).kind)}`,
    );
  });
}

function commandResults(
  tools: readonly SafeToolResult[],
): CodexCommandResultRecord[] {
  return tools.flatMap((tool) =>
    tool.kind === "command"
      ? [
          {
            name: tool.name,
            output: redactSecrets(tool.output).slice(
              -maxPersistedCommandOutput,
            ),
            exitCode: tool.exitCode,
            passed: tool.exitCode === 0,
          },
        ]
      : [],
  );
}

function testResults(
  commands: readonly CodexCommandResultRecord[],
): CodexTestResultRecord[] {
  return commands.filter(
    (command): command is CodexTestResultRecord => command.name === "test",
  );
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function deferred<T>(): {
  promise: Promise<T>;
  resolve(value: T): void;
  reject(error: unknown): void;
} {
  let resolvePromise!: (value: T) => void;
  let rejectPromise!: (error: unknown) => void;
  const promise = new Promise<T>((resolve, reject) => {
    resolvePromise = resolve;
    rejectPromise = reject;
  });
  return { promise, resolve: resolvePromise, reject: rejectPromise };
}

export class CodexService {
  private readonly cache = new Map<string, CodexRunRecord>();
  private readonly active = new Map<string, AbortController>();
  private readonly git: GitLocalPort;
  private readonly contextPort: CodexContextPort;
  private readonly execute: CodexRunExecutor;
  private readonly cancellation: CodexCancellationRegistry;
  private readonly github: GitHubControlPlane | null;
  private readonly healthProbe: typeof probeDeploymentHealth;
  private readonly actionLocks = new Map<string, Promise<CodexRunRecord>>();
  private readonly repositoryLocks = new Map<string, Promise<unknown>>();

  constructor(private readonly ports: CodexServicePorts) {
    this.git = ports.git ?? createLocalGit();
    this.contextPort = ports.context ?? new InMemoryCodexContextPort();
    this.execute =
      ports.execute ??
      createCodingAgentRunExecutor(
        ports.repositories,
        undefined,
        ports.agentCredentialResolver,
      );
    this.cancellation = ports.cancellation ?? new CodexCancellationRegistry();
    this.github =
      ports.github === undefined
        ? createGitHubControlPlaneFromEnv()
        : ports.github;
    this.healthProbe = ports.healthProbe ?? probeDeploymentHealth;
  }

  async start(input: StartCodexRunInput): Promise<CodexRunHandle> {
    const workspaceId = nonEmpty(input.workspaceId, "workspaceId");
    const issueId = nonEmpty(input.issueId, "issueId");
    const repositoryId = nonEmpty(input.repositoryId, "repositoryId");
    const repositoryConfig = await this.ports.repositories.getRepository(
      workspaceId,
      repositoryId,
    );
    if (!repositoryConfig)
      throw new CodexServiceError(`Repository not found: ${repositoryId}`);
    if (repositoryConfig.workspaceId !== workspaceId)
      throw new CodexServiceError("Repository belongs to another workspace");
    const executionId = input.runId ?? randomUUID();
    let repository: ResolvedRepository;
    let cleanupCheckout: (() => Promise<void>) | undefined;
    try {
      const githubRepository = this.githubRepository(repositoryConfig);
      if (repositoryConfig.executionPlane === "dokploy") {
        if (!githubRepository || !this.github?.checkoutRepositoryArchive)
          throw new CodexServiceError(
            "Dokploy Agent runs require a connected GitHub repository",
          );
        const agentRoot = await realpath(
          nonEmpty(
            process.env.MEND_AGENT_WORKSPACE_ROOT,
            "MEND_AGENT_WORKSPACE_ROOT",
          ),
        );
        const checkoutRoot = path.join(agentRoot, executionId);
        await mkdir(checkoutRoot, { recursive: true, mode: 0o700 });
        cleanupCheckout = async () => {
          await rm(checkoutRoot, { recursive: true, force: true });
        };
        await this.github.checkoutRepositoryArchive(
          githubRepository,
          repositoryConfig.defaultBranch,
          checkoutRoot,
        );
        repository = await resolveRepository(checkoutRoot, {
          ...repositoryConfig,
        });
      } else {
        repository = await resolveRepository(
          process.env.MEND_AGENT_WORKSPACE_ROOT ?? "",
          repositoryConfig,
        );
      }
    } catch (error) {
      await cleanupCheckout?.().catch(() => undefined);
      throw error;
    }
    let githubBaseSha: string | undefined;
    const githubRepository = this.githubRepository(repositoryConfig);
    let context: CodexContext;
    let tools: readonly SafeTool[];
    try {
      await this.withRepositoryLock(repository.root, async () => {
        await this.ensureRepositoryBase(repository);
        if (githubRepository && this.github?.getBranchSha) {
          try {
            const baseSha = await this.github!.getBranchSha(
              githubRepository,
              repository.defaultBranch,
            );
            try {
              const localState = await this.git.inspect(repository.root);
              if (
                localState.head &&
                localState.head.toLowerCase() !== baseSha.toLowerCase()
              ) {
                throw new CodexServiceError(
                  "Local checkout is not at the connected GitHub base commit; update it before starting a run",
                );
              }
            } catch (error) {
              if (error instanceof CodexServiceError) throw error;
              if (!/not a git repository/i.test(String(error))) throw error;
            }
            githubBaseSha = baseSha;
          } catch (error) {
            if (error instanceof CodexServiceError) throw error;
            // A local investigation can still run when GitHub is temporarily
            // unavailable. Publication will fail closed if no base can be proven.
          }
        }
      });
      context = await this.contextPort.mount(
        mountCodexContext(input.context, repository),
      );
      if (context.issue.id !== issueId)
        throw new CodexServiceError("Context issue does not match run issue");
      tools = validateTools(input.tools, repository.allowedCommandSet);
    } catch (error) {
      await cleanupCheckout?.().catch(() => undefined);
      throw error;
    }
    const controller = new AbortController();
    const created = deferred<CodexRunRecord>();
    let createdRun: CodexRunRecord | undefined;

    const store: CodexRunStore = {
      createRun: async (runInput) => {
        try {
          const run = await this.ports.runs.createRun(runInput);
          createdRun = run;
          this.cache.set(run.id, run);
          this.active.set(run.id, controller);
          created.resolve(run);
          return run;
        } catch (error) {
          created.reject(error);
          throw error;
        }
      },
      updateRun: async (runId, patch) => {
        const updated = await this.ports.runs.updateRun(runId, patch);
        const current = this.cache.get(runId);
        const next =
          updated ??
          (current
            ? { ...current, ...patch, updatedAt: new Date().toISOString() }
            : undefined);
        if (!next) throw new CodexServiceError(`Codex run not found: ${runId}`);
        this.cache.set(runId, next);
        return next;
      },
      appendEvent: (runId, event) => this.ports.runs.appendEvent(runId, event),
    };
    const runnerInput: RunCodexInput = {
      workspaceId,
      runId: executionId,
      issueId,
      repositoryId,
      issueIdentifier: nonEmpty(input.issueIdentifier, "issueIdentifier"),
      issueTitle: nonEmpty(input.issueTitle, "issueTitle"),
      mode: input.mode,
      repoRoot: repository.root,
      tools,
      store,
      eventSink: this.ports.eventSink,
      cancellation: this.cancellation,
      signal: controller.signal,
      maxRuntimeMs: input.maxRuntimeMs,
      commandTimeoutMs: input.commandTimeoutMs,
      createdByUserId: input.createdByUserId,
      allowedCommands: [...repository.allowedCommandSet],
      context: context as unknown as Record<string, unknown>,
      openAiClient: this.ports.openAi?.client,
      openAiOptions: this.ports.openAi,
      openAiEnabled: this.ports.openAi?.enabled,
      ...(githubBaseSha ? { githubBaseSha } : {}),
    };

    const completion = (async (): Promise<CodexServiceResult> => {
      try {
        // Keep the shared checkout stable while the executor snapshots it.
        // The executor then works entirely from its disposable copy.
        const result = await this.withRepositoryLock(repository.root, () =>
          this.execute(runnerInput, context),
        );
        return await this.finalize(result, repository, context, input);
      } catch (error) {
        if (createdRun) await this.markFailed(createdRun.id, error);
        else created.reject(error);
        throw error;
      } finally {
        if (createdRun) this.active.delete(createdRun.id);
        await cleanupCheckout?.().catch(() => undefined);
      }
    })();

    let run: CodexRunRecord;
    try {
      run = await created.promise;
    } catch (error) {
      await completion.catch(() => undefined);
      throw error;
    }
    return { runId: run.id, run, completion };
  }

  startRun(input: StartCodexRunInput): Promise<CodexRunHandle> {
    return this.start(input);
  }

  async cancel(runId: string): Promise<CodexRunRecord> {
    const run = await this.requireRun(runId);
    if (run.status !== "queued" && run.status !== "running")
      throw new CodexServiceError(
        `Run cannot be canceled from status ${run.status}`,
      );
    const controller = this.active.get(run.id);
    if (!controller) {
      if (run.status !== "queued")
        throw new CodexServiceError("Run is not active in this process");
      const canceled = await this.update(run.id, {
        status: "canceled",
        finishedAt: new Date().toISOString(),
        result: { ...asRecord(run.result), canceledBy: "service" },
      });
      await this.emitProgress(run.id, "Run canceled before execution started", {
        phase: "canceled",
      });
      return canceled;
    }
    controller.abort();
    this.cancellation.cancel(run.id);
    return this.requireRun(run.id);
  }

  cancelRun(runId: string): Promise<CodexRunRecord> {
    return this.cancel(runId);
  }

  async approve(runId: string): Promise<CodexRunRecord> {
    const run = await this.requireRun(runId);
    if (run.status === "approved") return run;
    if (run.status !== "completed")
      throw new CodexServiceError(
        `Only completed runs can be approved: ${run.status}`,
      );
    let result = asRecord(run.result);
    if (run.mode === "implement_fix") {
      const checks = Array.isArray(result.commandResults)
        ? result.commandResults
        : Array.isArray(result.checks)
          ? result.checks
          : [];
      if (
        checks.some(
          (check) =>
            check &&
            typeof check === "object" &&
            Number((check as Record<string, unknown>).exitCode ?? 1) !== 0,
        )
      ) {
        throw new CodexServiceError(
          "Cannot approve a fix while a configured check is failing",
        );
      }
      const diff = this.persistedDiff(run);
      if (diff.files.length) {
        if (!run.repositoryId)
          throw new CodexServiceError("Run has no repository configured");
        const repositoryConfig = await this.ports.repositories.getRepository(
          run.workspaceId,
          run.repositoryId,
        );
        if (!repositoryConfig)
          throw new CodexServiceError("Repository no longer exists");
        if (repositoryConfig.executionPlane !== "dokploy") {
          const repository = await resolveRepository(
            process.env.MEND_AGENT_WORKSPACE_ROOT ?? "",
            repositoryConfig,
          );
          const context = asRecord(result.context);
          const issue = asRecord(context.issue);
          const commit = await this.withRepositoryLock(repository.root, () =>
            this.commitLocalFix(
              { run, diff },
              repository,
              String(issue.identifier ?? run.issueId),
              String(issue.title ?? "Approved Agent fix"),
            ),
          );
          result = {
            ...result,
            localCommit: {
              status: "created",
              branch: commit.branch,
              sha: commit.sha,
              paths: commit.paths,
            } satisfies CodexLocalCommit,
          };
          const committed = await this.update(run.id, {
            status: "approved",
            branchName: commit.branch,
            commitSha: commit.sha,
            result: {
              ...result,
              decision: {
                status: "approved",
                decidedAt: new Date().toISOString(),
              },
            },
          });
          await this.emitProgress(
            run.id,
            "Approved: local branch and commit created; publication remains explicit",
            { phase: "local_commit", branch: commit.branch, sha: commit.sha },
          );
          return committed;
        }
      }
    }
    const approved = await this.update(run.id, {
      status: "approved",
      result: {
        ...result,
        decision: { status: "approved", decidedAt: new Date().toISOString() },
      },
    });
    await this.emitProgress(
      run.id,
      "Run approved; no push, merge or deploy was performed",
      { phase: "approved" },
    );
    return approved;
  }

  publish(runId: string): Promise<CodexRunRecord> {
    return this.withActionLock("publish", runId, () =>
      this.publishUnlocked(runId),
    );
  }

  private async publishUnlocked(runId: string): Promise<CodexRunRecord> {
    const run = await this.requireRun(runId);
    if (run.status !== "approved")
      throw new CodexServiceError(
        `Only approved runs can be published: ${run.status}`,
      );
    if (asRecord(asRecord(run.result).publication).status === "published")
      return run;
    if (!run.repositoryId || !run.branchName)
      throw new CodexServiceError(
        "Approved run has no local branch to publish",
      );
    const repositoryConfig = await this.ports.repositories.getRepository(
      run.workspaceId,
      run.repositoryId,
    );
    if (!repositoryConfig)
      throw new CodexServiceError("Repository no longer exists");
    const repository =
      repositoryConfig.executionPlane === "dokploy"
        ? undefined
        : await resolveRepository(
            process.env.MEND_AGENT_WORKSPACE_ROOT ?? "",
            repositoryConfig,
          );
    const githubRepository = this.githubRepository(repositoryConfig);
    if (githubRepository && this.github) {
      const diff = this.persistedDiff(run);
      if (diff.truncated)
        throw new CodexServiceError("Refusing to publish a truncated diff");
      const persistedFiles = asRecord(run.result).publishFiles;
      if (!Array.isArray(persistedFiles) && !repository)
        throw new CodexServiceError(
          "The Agent result did not retain publishable files",
        );
      const files = Array.isArray(persistedFiles)
        ? (persistedFiles as Awaited<
            ReturnType<typeof collectGitHubPublishFiles>
          >)
        : await this.withRepositoryLock(repository!.root, async () => {
            if (this.git.switchBranch) {
              await this.git.switchBranch(repository!.root, run.branchName!);
            }
            try {
              return await collectGitHubPublishFiles(
                repository!.root,
                diff.files,
              );
            } finally {
              if (this.git.switchBranch) {
                await this.git.switchBranch(
                  repository!.root,
                  repositoryConfig.defaultBranch,
                );
              }
            }
          });
      const context = asRecord(asRecord(run.result).context);
      const issue = asRecord(context.issue);
      const identifier = String(issue.identifier ?? run.issueId);
      const title = String(issue.title ?? "Verified fix");
      const persistedBaseSha = String(
        asRecord(run.result).githubBaseSha ?? "",
      ).trim();
      if (typeof this.github.getBranchSha === "function" && !persistedBaseSha) {
        throw new CodexServiceError(
          "GitHub base commit was not recorded when this run started; rerun the investigation before publishing",
        );
      }
      const expectedBaseSha = persistedBaseSha || undefined;
      // Persist an intent before the first external mutation. If the worker
      // dies after GitHub creates the branch/PR but before `updateRun`, a
      // retry can prove that the existing branch belongs to this run and
      // complete the missing checkpoint instead of creating a second branch
      // or PR.
      let runResult = asRecord(run.result);
      const existingIntent = asRecord(runResult.publicationIntent);
      if (
        existingIntent.branch !== run.branchName ||
        existingIntent.base !== repositoryConfig.defaultBranch
      ) {
        const intentRun = await this.update(run.id, {
          result: {
            ...runResult,
            publicationIntent: {
              provider: "github_app",
              branch: run.branchName,
              base: repositoryConfig.defaultBranch,
              files: diff.files.map((file) => ({
                path: file.relativePath,
                status: file.status,
              })),
              createdAt: new Date().toISOString(),
            },
          },
        });
        runResult = asRecord(intentRun.result);
      }

      let publishedBranch: Awaited<
        ReturnType<GitHubControlPlane["publishBranch"]>
      >;
      let recoveredPullRequest:
        | Awaited<ReturnType<GitHubControlPlane["findOpenPullRequest"]>>
        | undefined;
      const canReconcile =
        typeof this.github.getBranchSha === "function" &&
        typeof this.github.findOpenPullRequest === "function";
      if (canReconcile) {
        let existingBranchSha: string | undefined;
        try {
          existingBranchSha = await this.github.getBranchSha(
            githubRepository,
            run.branchName,
          );
        } catch (error) {
          if (
            !(error instanceof GitHubControlPlaneError) ||
            error.status !== 404
          )
            throw error;
        }
        if (existingBranchSha) {
          if (runResult.publicationIntent === undefined)
            throw new CodexServiceError(
              "GitHub branch already exists without a persisted publication intent",
            );
          recoveredPullRequest = await this.github.findOpenPullRequest(
            githubRepository,
            { head: run.branchName, base: repositoryConfig.defaultBranch },
          );
          publishedBranch = {
            branch: run.branchName,
            commitSha: existingBranchSha,
            baseSha: expectedBaseSha ?? "unknown",
          };
        } else {
          publishedBranch = await this.github.publishBranch(githubRepository, {
            base: repositoryConfig.defaultBranch,
            branch: run.branchName,
            message: `Fix ${identifier}: ${title}`,
            files,
            ...(expectedBaseSha ? { expectedBaseSha } : {}),
          });
        }
      } else {
        publishedBranch = await this.github.publishBranch(githubRepository, {
          base: repositoryConfig.defaultBranch,
          branch: run.branchName,
          message: `Fix ${identifier}: ${title}`,
          files,
          ...(expectedBaseSha ? { expectedBaseSha } : {}),
        });
      }
      const checks = Array.isArray(asRecord(run.result).commandResults)
        ? (asRecord(run.result).commandResults as Array<
            Record<string, unknown>
          >)
        : [];
      const failedChecks = checks.filter(
        (check) => Number(check.exitCode ?? 1) !== 0,
      );
      await this.github.createCheckRun(githubRepository, {
        name: "Mend independent checks",
        headSha: publishedBranch.commitSha,
        status: "completed",
        conclusion: failedChecks.length ? "failure" : "success",
        output: {
          title: failedChecks.length
            ? "One or more checks failed"
            : "Independent checks passed",
          summary: checks.length
            ? checks
                .map(
                  (check) =>
                    `${String(check.name ?? "check")}: exit ${Number(check.exitCode ?? 1)}`,
                )
                .join("\n")
            : "No repository check was configured.",
        },
      });
      if (failedChecks.length)
        throw new CodexServiceError(
          "GitHub publication stopped because an independent check failed",
        );
      const pullRequest =
        recoveredPullRequest ??
        (await this.github.createDraftPullRequest(githubRepository, {
          title: `Fix ${identifier}: ${title}`,
          body: [
            `Mend run: ${run.id}`,
            `Provider: ${String(runResult.provider ?? "coding agent")}`,
            "",
            "The patch passed the configured independent checks and still requires pull request review.",
          ].join("\n"),
          head: publishedBranch.branch,
          base: repositoryConfig.defaultBranch,
        }));
      const published = await this.update(run.id, {
        commitSha: publishedBranch.commitSha,
        result: {
          ...runResult,
          publication: {
            status: "published",
            provider: "github_app",
            branch: publishedBranch.branch,
            commitSha: publishedBranch.commitSha,
            publishedAt: new Date().toISOString(),
          },
          pullRequest,
        },
      });
      await this.emitProgress(
        run.id,
        `Draft pull request #${pullRequest.number} created through the GitHub App`,
        {
          phase: "pull_request",
          pullRequestNumber: pullRequest.number,
          pullRequestUrl: pullRequest.url,
        },
      );
      return published;
    }
    if (!this.git.push)
      throw new CodexServiceError("Git publication is not configured");
    if (!repository)
      throw new CodexServiceError(
        "GitHub publication is not configured for this Agent run",
      );
    const remote = process.env.CODEX_GIT_REMOTE?.trim() || "origin";
    const pushed = await this.git.push(repository.root, remote, run.branchName);
    const published = await this.update(run.id, {
      result: {
        ...asRecord(run.result),
        publication: {
          status: "published",
          remote: pushed.remote,
          branch: pushed.branch,
          publishedAt: new Date().toISOString(),
        },
      },
    });
    await this.emitProgress(
      run.id,
      `Approved branch published to ${pushed.remote}; no merge or deploy was performed`,
      { phase: "published", remote: pushed.remote, branch: pushed.branch },
    );
    return published;
  }

  deploy(runId: string): Promise<CodexRunRecord> {
    return this.withActionLock("deploy", runId, () =>
      this.deployUnlocked(runId),
    );
  }

  private async deployUnlocked(runId: string): Promise<CodexRunRecord> {
    const run = await this.requireRun(runId);
    if (run.status !== "approved")
      throw new CodexServiceError(
        `Only approved runs can be deployed: ${run.status}`,
      );
    const result = asRecord(run.result);
    if (asRecord(result.deployment).status === "deployed") return run;
    const publication = asRecord(result.publication);
    if (publication.status !== "published")
      throw new CodexServiceError(
        "Publish the approved branch before deploying",
      );
    const pullRequest = asRecord(result.pullRequest);
    const merge = asRecord(result.merge);
    if (pullRequest.number && merge.status !== "merged")
      throw new CodexServiceError(
        "Merge the approved GitHub pull request before deploying",
      );
    let deploymentBranch = run.branchName ?? String(publication.branch ?? "");
    let deploymentCommitSha = run.commitSha;
    if (merge.status === "merged") {
      if (!run.repositoryId)
        throw new CodexServiceError("Merged run has no repository configured");
      const repository = await this.ports.repositories.getRepository(
        run.workspaceId,
        run.repositoryId,
      );
      if (!repository)
        throw new CodexServiceError("Repository no longer exists");
      const mergeSha = String(merge.sha ?? "").trim();
      if (!mergeSha)
        throw new CodexServiceError("Merged run has no merge commit SHA");
      deploymentBranch = repository.defaultBranch;
      deploymentCommitSha = mergeSha;
    }
    const deployment =
      this.ports.deployment ?? createDokployDeploymentFromEnv();
    if (!deployment)
      throw new CodexServiceError(
        "Deployment is not configured. Set DOKPLOY_API_URL, DOKPLOY_API_KEY and DOKPLOY_APPLICATION_ID.",
      );
    const idempotencyKey = `mend:deploy:${run.id}:${deploymentCommitSha ?? deploymentBranch}`;
    let deploymentResult = result;
    const deploymentIntent = asRecord(result.deploymentIntent);
    if (
      deploymentIntent.idempotencyKey !== idempotencyKey ||
      deploymentIntent.branch !== deploymentBranch ||
      deploymentIntent.commitSha !== (deploymentCommitSha ?? null)
    ) {
      const intentRun = await this.update(run.id, {
        result: {
          ...result,
          deploymentIntent: {
            provider: "dokploy",
            idempotencyKey,
            branch: deploymentBranch,
            commitSha: deploymentCommitSha ?? null,
            createdAt: new Date().toISOString(),
          },
        },
      });
      deploymentResult = asRecord(intentRun.result);
    }
    const deployed = await deployment.deploy({
      workspaceId: run.workspaceId,
      runId: run.id,
      branch: deploymentBranch,
      ...(deploymentCommitSha ? { commitSha: deploymentCommitSha } : {}),
      idempotencyKey,
    });
    const updated = await this.update(run.id, {
      result: {
        ...deploymentResult,
        deployment: {
          status: "deployed",
          ...deployed,
          branch: deploymentBranch,
          ...(deploymentCommitSha ? { commitSha: deploymentCommitSha } : {}),
          deployedAt: new Date().toISOString(),
        },
      },
    });
    await this.emitProgress(
      run.id,
      "Approved branch sent to the configured deployment provider",
      { phase: "deployed", provider: deployed.provider },
    );
    return updated;
  }

  verifyHealth(runId: string): Promise<CodexRunRecord> {
    return this.withActionLock("health", runId, () =>
      this.verifyHealthUnlocked(runId),
    );
  }

  private async verifyHealthUnlocked(runId: string): Promise<CodexRunRecord> {
    const run = await this.requireRun(runId);
    const result = asRecord(run.result);
    const deployment = asRecord(result.deployment);
    if (deployment.status !== "deployed")
      throw new CodexServiceError(
        "Deploy the approved fix before checking health",
      );
    const configuredUrl = process.env.MEND_DEPLOYMENT_HEALTH_URL?.trim();
    const url = configuredUrl || String(deployment.url ?? "").trim();
    if (!url)
      throw new CodexServiceError(
        "Deployment health URL is not configured. Set MEND_DEPLOYMENT_HEALTH_URL or return a deployment URL.",
      );
    const allowedOrigins = (process.env.MEND_HEALTHCHECK_ALLOWED_ORIGINS ?? "")
      .split(",")
      .map((origin) => origin.trim())
      .filter(Boolean);
    if (configuredUrl) allowedOrigins.push(new URL(configuredUrl).origin);
    if (!allowedOrigins.length)
      throw new CodexServiceError(
        "Deployment health origin is not allowlisted. Set MEND_HEALTHCHECK_ALLOWED_ORIGINS.",
      );
    const health = await this.healthProbe({
      url,
      allowedOrigins,
      ...(this.ports.healthFetcher
        ? { fetcher: this.ports.healthFetcher }
        : {}),
    });
    const checkedAt = new Date().toISOString();
    const updated = await this.update(run.id, {
      result: {
        ...result,
        deployment: {
          ...deployment,
          health: { ...health, checkedAt, url },
        },
        healthStatus: health.healthy ? "healthy" : "unhealthy",
      },
    });
    await this.emitProgress(
      run.id,
      health.healthy
        ? `Deployment health check passed with HTTP ${health.status}`
        : `Deployment health check failed with HTTP ${health.status}`,
      { phase: "health_check", ...health },
    );
    return updated;
  }

  merge(runId: string): Promise<CodexRunRecord> {
    return this.withActionLock("merge", runId, () => this.mergeUnlocked(runId));
  }

  private async mergeUnlocked(runId: string): Promise<CodexRunRecord> {
    const run = await this.requireRun(runId);
    if (run.status !== "approved")
      throw new CodexServiceError(
        `Only approved runs can be merged: ${run.status}`,
      );
    if (asRecord(asRecord(run.result).merge).status === "merged") return run;
    if (!run.repositoryId)
      throw new CodexServiceError("Run has no repository configured");
    const result = asRecord(run.result);
    const pullRequest = asRecord(result.pullRequest);
    const publication = asRecord(result.publication);
    const pullNumber = Number(pullRequest.number);
    const headSha = String(publication.commitSha ?? run.commitSha ?? "");
    if (!Number.isSafeInteger(pullNumber) || pullNumber < 1 || !headSha)
      throw new CodexServiceError(
        "Create a GitHub pull request before merging",
      );
    const repository = await this.ports.repositories.getRepository(
      run.workspaceId,
      run.repositoryId,
    );
    if (!repository) throw new CodexServiceError("Repository no longer exists");
    const githubRepository = this.githubRepository(repository);
    if (!githubRepository || !this.github)
      throw new CodexServiceError("GitHub App merge is not configured");
    const readyPullRequest = await this.github.markPullRequestReadyForReview(
      githubRepository,
      pullNumber,
    );
    if (readyPullRequest.draft)
      throw new CodexServiceError(
        "GitHub pull request is still a draft after requesting review",
      );
    const merged = await this.github.mergePullRequest(
      githubRepository,
      pullNumber,
      headSha,
      "squash",
    );
    if (!merged.merged || !merged.sha)
      throw new CodexServiceError(
        `GitHub did not merge the pull request: ${merged.message}`,
      );
    const updated = await this.update(run.id, {
      result: {
        ...result,
        merge: {
          status: "merged",
          sha: merged.sha,
          mergedAt: new Date().toISOString(),
        },
        mergeSha: merged.sha,
      },
    });
    await this.emitProgress(run.id, `Pull request #${pullNumber} merged`, {
      phase: "merge",
      pullRequestNumber: pullNumber,
      mergeSha: merged.sha,
    });
    return updated;
  }

  approveRun(runId: string): Promise<CodexRunRecord> {
    return this.approve(runId);
  }

  async reject(runId: string, reason?: string): Promise<CodexRunRecord> {
    const run = await this.requireRun(runId);
    if (run.status !== "completed")
      throw new CodexServiceError(
        `Only completed runs can be rejected: ${run.status}`,
      );
    const rejected = await this.update(run.id, {
      status: "rejected",
      result: {
        ...asRecord(run.result),
        decision: {
          status: "rejected",
          reason: boundedText(reason, 1_000),
          decidedAt: new Date().toISOString(),
        },
      },
    });
    await this.emitProgress(
      run.id,
      "Run rejected in Mend; local branch remains local",
      { phase: "rejected" },
    );
    return rejected;
  }

  rejectRun(runId: string, reason?: string): Promise<CodexRunRecord> {
    return this.reject(runId, reason);
  }

  async getDiff(runId: string): Promise<RunCodexResult["diff"]> {
    const run = await this.requireRun(runId);
    const result = asRecord(run.result);
    const candidate =
      result.diff && typeof result.diff === "object"
        ? asRecord(result.diff)
        : result;
    const files = Array.isArray(candidate.files) ? candidate.files : [];
    return {
      files: files as RunCodexResult["diff"]["files"],
      patch:
        typeof candidate.patch === "string"
          ? redactSecrets(candidate.patch)
          : "",
      truncated:
        candidate.diffTruncated === true || candidate.truncated === true,
    };
  }

  getRunDiff(runId: string): Promise<RunCodexResult["diff"]> {
    return this.getDiff(runId);
  }

  async getPatch(runId: string): Promise<string> {
    return (await this.getDiff(runId)).patch;
  }

  private async requireRun(runId: string): Promise<CodexRunRecord> {
    const id = nonEmpty(runId, "runId");
    const persisted = await this.ports.runs.getRun?.(id);
    if (persisted) {
      this.cache.set(id, persisted);
      return persisted;
    }
    const cached = this.cache.get(id);
    if (cached) return cached;
    throw new CodexServiceError(`Codex run not found: ${id}`);
  }

  private async update(
    runId: string,
    patch: Parameters<CodexRunStore["updateRun"]>[1],
  ): Promise<CodexRunRecord> {
    const updated = await this.ports.runs.updateRun(runId, patch);
    const current = this.cache.get(runId);
    const next =
      updated ??
      (current
        ? { ...current, ...patch, updatedAt: new Date().toISOString() }
        : undefined);
    if (!next) throw new CodexServiceError(`Codex run not found: ${runId}`);
    this.cache.set(runId, next);
    return next;
  }

  private async emitProgress(
    runId: string,
    message: string,
    metadata: Record<string, unknown>,
  ): Promise<void> {
    const input: CodexRunEventInput = {
      eventType: "progress",
      message,
      metadata,
    };
    const event = await this.ports.runs.appendEvent(runId, input);
    await this.ports.eventSink?.publish(event).catch(() => undefined);
  }

  private async markFailed(runId: string, error: unknown): Promise<void> {
    const message = redactSecrets(
      error instanceof Error ? error.message : String(error),
    );
    try {
      await this.update(runId, {
        status: "failed",
        finishedAt: new Date().toISOString(),
        result: {
          ...asRecord((await this.requireRun(runId)).result),
          error: message,
        },
      });
      await this.emitProgress(
        runId,
        "Application service failed after the Codex runner started",
        { phase: "service_failed", error: message },
      );
    } catch {
      // The runner's persisted failure remains the source of truth if the secondary update fails.
    }
  }

  private async finalize(
    result: RunCodexResult,
    repository: ResolvedRepository,
    context: CodexContext,
    input: StartCodexRunInput,
  ): Promise<CodexServiceResult> {
    // The API adapter may persist request metadata immediately after start;
    // refresh before composing the final payload so a fast run cannot erase it.
    let run = (await this.ports.runs.getRun?.(result.run.id)) ?? result.run;
    this.cache.set(run.id, run);
    const commands = commandResults(result.tools);
    const tests = testResults(commands);
    const payload: Record<string, unknown> = {
      ...asRecord(run.result),
      context,
      commandResults: commands,
      testResults: tests,
      repository: {
        id: repository.id,
        name: repository.name,
        defaultBranch: repository.defaultBranch,
      },
    };
    run = await this.update(run.id, { result: payload });

    if (run.status === "completed" && input.mode === "implement_fix") {
      if (!result.diff.files.length) {
        payload.localCommit = {
          status: "not_created",
          reason: "no_changes",
        } satisfies CodexLocalCommit;
        run = await this.update(run.id, { result: payload });
      } else if (commands.some((command) => !command.passed)) {
        payload.localCommit = {
          status: "not_created",
          reason: "checks_failed",
        } satisfies CodexLocalCommit;
        run = await this.update(run.id, { result: payload });
        await this.emitProgress(
          run.id,
          "Local commit was withheld because an approved check failed",
          {
            phase: "local_commit_blocked",
            failedCommands: commands
              .filter((command) => !command.passed)
              .map((command) => command.name),
          },
        );
      } else {
        payload.approval = {
          required: true,
          reason: "A human must review the diff and checks before commit",
        };
        run = await this.update(run.id, { result: payload });
        await this.emitProgress(
          run.id,
          "Fix ready for human approval; no local commit, push or deploy was performed",
          { phase: "awaiting_approval", files: result.diff.files.length },
        );
      }
    }
    return {
      ...result,
      run,
      context,
      commandResults: commands,
      testResults: tests,
    };
  }

  private async commitLocalFix(
    result: Pick<RunCodexResult, "run" | "diff">,
    repository: ResolvedRepository,
    issueIdentifier: string,
    issueTitle: string,
  ): Promise<GitCommitResult> {
    if (result.diff.truncated)
      throw new CodexServiceError("Refusing to commit a truncated diff");
    const branch =
      result.run.branchName ?? createBranchName(issueIdentifier, issueTitle);
    await this.ensureRepositoryBase(repository);
    const branched = await this.git.createBranch(
      repository.root,
      branch,
      repository.defaultBranch,
    );
    await this.git.applyPatch(branched.root, result.diff.patch);
    return this.git.commit(
      branched.root,
      result.diff.files.map((file) => file.relativePath),
      `Fix ${issueIdentifier}: ${issueTitle}`,
    );
  }

  private async ensureRepositoryBase(
    repository: ResolvedRepository,
  ): Promise<void> {
    let state;
    try {
      state = await this.git.inspect(repository.root);
    } catch (error) {
      // Investigation can run against a source snapshot that is not itself a
      // Git checkout. Commit/publish paths still fail closed when Git is
      // actually required, but a read-only triage run should remain usable.
      if (/not a git repository/i.test(String(error))) return;
      throw error;
    }
    if (!state.clean)
      throw new CodexServiceError(
        "Repository checkout has uncommitted changes; commit or discard them before starting a coding run",
      );
    if (state.branch === repository.defaultBranch) return;
    if (!this.git.switchBranch)
      throw new CodexServiceError(
        `Repository is on ${state.branch ?? "a detached HEAD"}; switch it to ${repository.defaultBranch} before starting another run`,
      );
    await this.git.switchBranch(repository.root, repository.defaultBranch);
  }

  private persistedDiff(run: CodexRunRecord): RunCodexResult["diff"] {
    const result = asRecord(run.result);
    const files = Array.isArray(result.files) ? result.files : [];
    return {
      files: files as RunCodexResult["diff"]["files"],
      patch: typeof result.patch === "string" ? result.patch : "",
      truncated: result.diffTruncated === true,
    };
  }

  private withActionLock(
    action: string,
    runId: string,
    operation: () => Promise<CodexRunRecord>,
  ): Promise<CodexRunRecord> {
    const key = `${action}:${runId}`;
    const inFlight = this.actionLocks.get(key);
    if (inFlight) return inFlight;
    const promise = Promise.resolve().then(operation);
    this.actionLocks.set(key, promise);
    void promise
      .finally(() => {
        if (this.actionLocks.get(key) === promise) this.actionLocks.delete(key);
      })
      .catch(() => undefined);
    return promise;
  }

  /** Serialize mutations to a shared checkout inside this process. */
  private withRepositoryLock<T>(
    repositoryRoot: string,
    operation: () => Promise<T>,
  ): Promise<T> {
    const previous = this.repositoryLocks.get(repositoryRoot);
    const promise = (
      previous ? previous.catch(() => undefined) : Promise.resolve()
    ).then(() => this.withRepositoryFileLock(repositoryRoot, operation));
    this.repositoryLocks.set(repositoryRoot, promise);
    void promise
      .finally(() => {
        if (this.repositoryLocks.get(repositoryRoot) === promise)
          this.repositoryLocks.delete(repositoryRoot);
      })
      .catch(() => undefined);
    return promise;
  }

  /**
   * The in-memory queue above only coordinates one Node process.  Production
   * workers can be replicated, so also lease a lock directory in the shared
   * temp volume before switching branches or snapshotting a checkout.  The
   * lock is outside the repository and has a bounded stale lease so a killed
   * worker cannot strand every later run.
   */
  private async withRepositoryFileLock<T>(
    repositoryRoot: string,
    operation: () => Promise<T>,
  ): Promise<T> {
    const lockRoot = path.join(os.tmpdir(), "mend-repository-locks");
    const key = createHash("sha256")
      .update(path.resolve(repositoryRoot))
      .digest("hex");
    const lockPath = path.join(lockRoot, `${key}.lock`);
    await mkdir(lockRoot, { recursive: true });
    const owner = `${process.pid}:${Date.now()}:${Math.random()}`;
    let acquired = false;
    for (let attempt = 0; attempt < 600; attempt += 1) {
      try {
        await mkdir(lockPath);
        await writeFile(lockPath + ".owner", owner, "utf8");
        acquired = true;
        break;
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
        const lockStats = await stat(lockPath).catch(() => undefined);
        if (
          lockStats &&
          Date.now() - lockStats.mtimeMs > repositoryLockLeaseMs
        ) {
          await rm(lockPath, { recursive: true, force: true });
          await rm(lockPath + ".owner", { force: true });
          continue;
        }
        await waitMs(Math.min(250, 25 + attempt));
      }
    }
    if (!acquired)
      throw new CodexServiceError(
        "Timed out waiting for another worker to release the repository checkout",
      );
    try {
      return await operation();
    } finally {
      await rm(lockPath + ".owner", { force: true }).catch(() => undefined);
      await rm(lockPath, { recursive: true, force: true }).catch(
        () => undefined,
      );
    }
  }

  private githubRepository(
    repository: RepositoryConfig,
  ): GitHubRepositoryRef | null {
    const hasGithubConfiguration = Boolean(
      repository.githubOwner ||
        repository.githubRepo ||
        repository.githubInstallationId,
    );
    const installationId = Number(repository.githubInstallationId);
    if (
      !repository.githubOwner ||
      !repository.githubRepo ||
      !Number.isSafeInteger(installationId) ||
      installationId < 1
    ) {
      if (hasGithubConfiguration)
        throw new CodexServiceError(
          "GitHub repository configuration is incomplete; connect the GitHub App before running or publishing fixes",
        );
      return null;
    }
    if (!this.github)
      throw new CodexServiceError(
        "Repository is connected to GitHub, but the GitHub App is not configured",
      );
    return {
      owner: repository.githubOwner,
      repo: repository.githubRepo,
      installationId,
    };
  }
}

export function createCodexService(ports: CodexServicePorts): CodexService {
  return new CodexService(ports);
}
