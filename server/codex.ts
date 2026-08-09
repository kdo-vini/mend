import { execFile, spawn, type ChildProcess } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import {
  createReadStream,
  lstatSync,
  readlinkSync,
  realpathSync,
} from "node:fs";
import {
  cp,
  lstat,
  mkdtemp,
  readdir,
  readFile,
  realpath,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { allowedCommands, type AllowedCommand } from "../src/core.js";
import type {
  CodexEventSink,
  CodexRunEvent,
  CodexRunEventInput,
} from "./codex-events.js";
import {
  runOpenAiCodexLoop,
  type OpenAiCodexClient,
  type OpenAiCodexOptions,
  type OpenAiCodexResult,
} from "./codex-openai.js";
import type {
  CodingStage,
  EffectiveRunConfig,
  ResearchArtifact,
} from "./coding-control-plane.js";

const execFileAsync = promisify(execFile);
const maxOutputBytes = 160_000;
const maxDiffBytes = 1_000_000;
const maxSnapshotFiles = 10_000;
const defaultCommandTimeoutMs = 120_000;
const defaultRunTimeoutMs = 1_200_000;
const maxWorkspaceFileBytes = 300_000;
const ignoredNames = new Set([".git", "node_modules", "dist", "coverage"]);

export type CodexRunMode =
  | "investigate"
  | "propose_fix"
  | "implement_fix"
  | CodingStage;
export type CodexRunStatus =
  | "queued"
  | "running"
  | "completed"
  | "failed"
  | "canceled"
  | "approved"
  | "rejected";

export interface CodexRunRecord {
  id: string;
  workspaceId: string;
  issueId: string;
  repositoryId?: string;
  mode: CodexRunMode;
  stage?: CodingStage;
  parentRunId?: string;
  researchArtifactId?: string;
  connectionId?: string;
  provider?: string;
  requestedModel?: string;
  realModel?: string;
  effort?: string;
  authMethod?: "api_key" | "subscription";
  requestedConfig?: Record<string, unknown>;
  effectiveConfig?: EffectiveRunConfig;
  usage?: Record<string, unknown>;
  cache?: Record<string, unknown>;
  costAmountUsd?: number;
  costStatus?: string;
  durationMs?: number;
  quota?: Record<string, unknown>;
  attempts?: CodexRunAttemptRecord[];
  status: CodexRunStatus;
  progress: number;
  branchName?: string;
  commitSha?: string;
  result: Record<string, unknown>;
  startedAt?: string;
  finishedAt?: string;
  createdByUserId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CodexRunAttemptRecord {
  id?: string;
  runId: string;
  attemptNumber: number;
  stage: CodingStage;
  connectionId?: string;
  provider?: string;
  requestedModel?: string;
  realModel?: string;
  effort?: string;
  authMethod?: "api_key" | "subscription";
  status: "queued" | "running" | "completed" | "failed" | "canceled";
  inputTokens?: number;
  outputTokens?: number;
  cachedInputTokens?: number;
  totalTokens?: number;
  cache?: Record<string, unknown>;
  quota?: Record<string, unknown>;
  costAmountUsd?: number;
  costStatus?: string;
  durationMs?: number;
  errorCategory?: string;
  errorMessage?: string;
  startedAt?: string;
  finishedAt?: string;
}

export interface CreateCodexRunInput {
  id?: string;
  workspaceId: string;
  issueId: string;
  repositoryId?: string;
  mode: CodexRunMode;
  stage?: CodingStage;
  parentRunId?: string;
  researchArtifactId?: string;
  connectionId?: string;
  provider?: string;
  requestedModel?: string;
  realModel?: string;
  effort?: string;
  authMethod?: "api_key" | "subscription";
  requestedConfig?: Record<string, unknown>;
  effectiveConfig?: EffectiveRunConfig;
  usage?: Record<string, unknown>;
  cache?: Record<string, unknown>;
  costAmountUsd?: number;
  costStatus?: string;
  durationMs?: number;
  quota?: Record<string, unknown>;
  branchName?: string;
  createdByUserId?: string;
}

export interface UpdateCodexRunInput {
  status?: CodexRunStatus;
  progress?: number;
  branchName?: string;
  commitSha?: string;
  result?: Record<string, unknown>;
  stage?: CodingStage;
  researchArtifactId?: string;
  connectionId?: string;
  provider?: string;
  requestedModel?: string;
  realModel?: string;
  effort?: string;
  authMethod?: "api_key" | "subscription";
  requestedConfig?: Record<string, unknown>;
  effectiveConfig?: EffectiveRunConfig;
  usage?: Record<string, unknown>;
  cache?: Record<string, unknown>;
  costAmountUsd?: number;
  costStatus?: string;
  durationMs?: number;
  quota?: Record<string, unknown>;
  startedAt?: string;
  finishedAt?: string;
}

export interface CreateCodexRunAttemptInput {
  runId: string;
  workspaceId: string;
  attemptNumber: number;
  stage: CodingStage;
  connectionId?: string;
  provider?: string;
  requestedModel?: string;
  realModel?: string;
  effort?: string;
  authMethod?: "api_key" | "subscription";
}

export interface CodexRunStore {
  createRun(input: CreateCodexRunInput): Promise<CodexRunRecord>;
  updateRun(
    id: string,
    patch: UpdateCodexRunInput,
  ): Promise<CodexRunRecord | void>;
  appendEvent(runId: string, input: CodexRunEventInput): Promise<CodexRunEvent>;
  saveResearchArtifact?(artifact: ResearchArtifact): Promise<ResearchArtifact>;
  getResearchArtifact?(
    artifactId: string,
    workspaceId?: string,
  ): Promise<ResearchArtifact | null>;
  createAttempt?(input: CreateCodexRunAttemptInput): Promise<void>;
  updateAttempt?(
    runId: string,
    attemptNumber: number,
    patch: Record<string, unknown>,
  ): Promise<void>;
  listAttempts?(
    runId: string,
    workspaceId?: string,
  ): Promise<CodexRunAttemptRecord[]>;
}

export class InMemoryCodexRunStore implements CodexRunStore {
  readonly runs = new Map<string, CodexRunRecord>();
  readonly events: CodexRunEvent[] = [];
  readonly attempts = new Map<string, Record<string, unknown>>();

  async listAttempts(runId: string): Promise<CodexRunAttemptRecord[]> {
    return [...this.attempts.values()]
      .filter((attempt) => attempt.runId === runId)
      .sort(
        (left, right) =>
          Number(left.attemptNumber ?? 0) - Number(right.attemptNumber ?? 0),
      )
      .map((attempt) => attempt as unknown as CodexRunAttemptRecord);
  }

  async createRun(input: CreateCodexRunInput): Promise<CodexRunRecord> {
    const now = new Date().toISOString();
    const run: CodexRunRecord = {
      id: input.id ?? randomUUID(),
      workspaceId: input.workspaceId,
      issueId: input.issueId,
      repositoryId: input.repositoryId,
      mode: input.mode,
      ...(input.stage ? { stage: input.stage } : {}),
      ...(input.parentRunId ? { parentRunId: input.parentRunId } : {}),
      ...(input.researchArtifactId
        ? { researchArtifactId: input.researchArtifactId }
        : {}),
      ...(input.connectionId ? { connectionId: input.connectionId } : {}),
      ...(input.provider ? { provider: input.provider } : {}),
      ...(input.requestedModel ? { requestedModel: input.requestedModel } : {}),
      ...(input.realModel ? { realModel: input.realModel } : {}),
      ...(input.effort ? { effort: input.effort } : {}),
      ...(input.authMethod ? { authMethod: input.authMethod } : {}),
      ...(input.requestedConfig
        ? { requestedConfig: input.requestedConfig }
        : {}),
      ...(input.effectiveConfig
        ? { effectiveConfig: input.effectiveConfig }
        : {}),
      ...(input.usage ? { usage: input.usage } : {}),
      ...(input.cache ? { cache: input.cache } : {}),
      ...(input.costAmountUsd !== undefined
        ? { costAmountUsd: input.costAmountUsd }
        : {}),
      ...(input.costStatus ? { costStatus: input.costStatus } : {}),
      ...(input.durationMs !== undefined
        ? { durationMs: input.durationMs }
        : {}),
      ...(input.quota ? { quota: input.quota } : {}),
      status: "queued",
      progress: 0,
      branchName: input.branchName,
      result: {},
      createdByUserId: input.createdByUserId,
      createdAt: now,
      updatedAt: now,
    };
    this.runs.set(run.id, run);
    return run;
  }

  async updateRun(
    id: string,
    patch: UpdateCodexRunInput,
  ): Promise<CodexRunRecord> {
    const current = this.runs.get(id);
    if (!current) throw new Error(`Unknown Agent run: ${id}`);
    const next = { ...current, ...patch, updatedAt: new Date().toISOString() };
    this.runs.set(id, next);
    return next;
  }

  async appendEvent(
    runId: string,
    input: CodexRunEventInput,
  ): Promise<CodexRunEvent> {
    const event: CodexRunEvent = {
      id: randomUUID(),
      runId,
      eventType: input.eventType,
      message: input.message,
      metadata: input.metadata ?? {},
      createdAt: new Date().toISOString(),
    };
    this.events.push(event);
    return event;
  }

  readonly researchArtifacts = new Map<string, ResearchArtifact>();

  async saveResearchArtifact(
    artifact: ResearchArtifact,
  ): Promise<ResearchArtifact> {
    this.researchArtifacts.set(artifact.contentHash, artifact);
    return artifact;
  }

  async getResearchArtifact(
    artifactId: string,
  ): Promise<ResearchArtifact | null> {
    return this.researchArtifacts.get(artifactId) ?? null;
  }

  async createAttempt(input: CreateCodexRunAttemptInput): Promise<void> {
    this.attempts.set(`${input.runId}:${input.attemptNumber}`, {
      ...input,
      status: "queued",
    });
  }

  async updateAttempt(
    runId: string,
    attemptNumber: number,
    patch: Record<string, unknown>,
  ): Promise<void> {
    const key = `${runId}:${attemptNumber}`;
    this.attempts.set(key, { ...(this.attempts.get(key) ?? {}), ...patch });
  }
}

export function createBranchName(
  identifier: string,
  title: string,
  runId?: string,
): string {
  const slug =
    title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "")
      .slice(0, 48) || "work";
  const suffix = runId
    ?.trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 24);
  return `ops/${identifier.toLowerCase()}-${slug}${suffix ? `-${suffix}` : ""}`;
}

function isIgnoredPath(source: string): boolean {
  const name = path.basename(source);
  return ignoredNames.has(name) || name.startsWith(".env") || name === ".npmrc";
}

function isSafeDependencySymlink(
  sourcePath: string,
  dependencyRoot: string,
): boolean {
  try {
    // Relative links remain relative after the dependency tree is copied.
    // Absolute links would point back into the source checkout, so they are
    // intentionally omitted rather than turning the sandbox into a write
    // tunnel.
    if (path.isAbsolute(readlinkSync(sourcePath))) return false;
    const target = realpathSync(sourcePath);
    const relative = path.relative(dependencyRoot, target);
    return (
      relative === "" ||
      (!relative.startsWith(`..${path.sep}`) &&
        relative !== ".." &&
        !path.isAbsolute(relative))
    );
  } catch {
    return false;
  }
}

function resolveInside(root: string, candidate = ""): string {
  const resolvedRoot = path.resolve(root);
  const resolvedCandidate = path.resolve(resolvedRoot, candidate);
  const relative = path.relative(resolvedRoot, resolvedCandidate);
  if (
    relative === ".." ||
    relative.startsWith(`..${path.sep}`) ||
    path.isAbsolute(relative)
  ) {
    throw new Error("Path is outside the workspace");
  }
  return resolvedCandidate;
}

function sensitiveRelativePath(candidate: string): boolean {
  return candidate
    .split(/[\\/]/)
    .some((part) => part.length > 0 && isIgnoredPath(part));
}

async function resolveWorkspaceFile(
  workspace: string,
  relativePath: string,
): Promise<string> {
  if (
    typeof relativePath !== "string" ||
    !relativePath.trim() ||
    path.isAbsolute(relativePath)
  )
    throw new Error("Workspace file path must be relative");
  const normalized = relativePath.replace(/\\/g, "/");
  if (
    normalized.split("/").some((part) => !part || part === "." || part === "..")
  )
    throw new Error("Workspace file path traversal is not allowed");
  if (sensitiveRelativePath(normalized))
    throw new Error("Sensitive workspace paths are not available to the Agent");
  const root = await realpath(workspace);
  const target = resolveInside(root, normalized);
  const parent = await realpath(path.dirname(target));
  const relativeParent = path.relative(root, parent);
  if (
    relativeParent === ".." ||
    relativeParent.startsWith(`..${path.sep}`) ||
    path.isAbsolute(relativeParent)
  )
    throw new Error("Workspace file path is outside the sandbox");
  try {
    const targetStats = await lstat(target);
    if (targetStats.isSymbolicLink())
      throw new Error(
        "Symbolic-link workspace files are not available to the Agent",
      );
    if (!targetStats.isFile()) throw new Error("Workspace path is not a file");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  return target;
}

export async function readWorkspaceFile(
  workspace: string,
  relativePath: string,
): Promise<string> {
  const target = await resolveWorkspaceFile(workspace, relativePath);
  const content = await readFile(target);
  if (content.length > maxWorkspaceFileBytes)
    throw new Error(`Workspace file exceeds ${maxWorkspaceFileBytes} bytes`);
  if (content.includes(0))
    throw new Error("Binary workspace files are not readable by the Agent");
  return redactSecrets(content.toString("utf8"));
}

export async function writeWorkspaceFile(
  workspace: string,
  relativePath: string,
  content: string,
): Promise<void> {
  if (typeof content !== "string")
    throw new Error("Workspace file content must be text");
  const safeContent = redactSecrets(content);
  if (safeContent !== content)
    throw new Error("Refusing to write secrets into the sandbox");
  if (Buffer.byteLength(content, "utf8") > maxWorkspaceFileBytes)
    throw new Error(`Workspace file exceeds ${maxWorkspaceFileBytes} bytes`);
  if (content.includes("\0"))
    throw new Error("Binary workspace files are not writable by the Agent");
  const target = await resolveWorkspaceFile(workspace, relativePath);
  await writeFile(target, content, "utf8");
}

export async function createIsolatedWorkspace(
  repoRoot: string,
  _identifier: string,
): Promise<string> {
  const source = await realpath(repoRoot);
  const sourceStats = await stat(source);
  if (!sourceStats.isDirectory())
    throw new Error("Repository root must be a directory");

  const root = await mkdtemp(path.join(os.tmpdir(), "mend-codex-"));
  const target = path.join(root, "workspace");
  try {
    await cp(source, target, {
      recursive: true,
      filter: (sourcePath) => {
        if (isIgnoredPath(sourcePath)) return false;
        try {
          return !lstatSync(sourcePath).isSymbolicLink();
        } catch {
          return false;
        }
      },
    });
    // Keep repository dependencies available to checks, but copy them into
    // the disposable workspace. A junction would let an edit-capable agent
    // mutate the source repository through node_modules.
    const sourceDependencies = path.join(source, "node_modules");
    const dependencyStats = await lstat(sourceDependencies).catch(() => null);
    if (dependencyStats?.isDirectory()) {
      await cp(sourceDependencies, path.join(target, "node_modules"), {
        recursive: true,
        filter: (sourcePath) => {
          const name = path.basename(sourcePath);
          if (name.startsWith(".env") || name === ".npmrc") return false;
          try {
            const sourceStat = lstatSync(sourcePath);
            return (
              !sourceStat.isSymbolicLink() ||
              isSafeDependencySymlink(sourcePath, sourceDependencies)
            );
          } catch {
            return false;
          }
        },
      });
    }
  } catch (error) {
    await rm(root, { recursive: true, force: true });
    throw error;
  }
  return target;
}

export async function removeIsolatedWorkspace(
  workspace: string,
): Promise<void> {
  const resolved = path.resolve(workspace);
  const parent = path.dirname(resolved);
  if (
    !path.basename(resolved).startsWith("workspace") ||
    !path.basename(parent).startsWith("mend-codex-") ||
    path.dirname(parent) !== path.resolve(os.tmpdir())
  ) {
    throw new Error("Refusing to remove an unknown workspace");
  }
  await rm(resolved, { recursive: true, force: true });
  await rm(parent, { recursive: true, force: true });
}

export async function listFiles(
  workspace: string,
  relativeDirectory = "",
): Promise<string[]> {
  const directory = resolveInside(workspace, relativeDirectory);
  const output: string[] = [];

  async function visit(current: string, relative: string): Promise<void> {
    const entries = await readdir(current, { withFileTypes: true });
    for (const entry of entries) {
      if (isIgnoredPath(entry.name) || entry.isSymbolicLink()) continue;
      const nextRelative = path.posix.join(
        relative.replace(/\\/g, "/"),
        entry.name,
      );
      const nextPath = resolveInside(workspace, nextRelative);
      if (entry.isDirectory()) await visit(nextPath, nextRelative);
      else if (entry.isFile()) {
        output.push(nextRelative);
        if (output.length >= maxSnapshotFiles)
          throw new Error(`Workspace exceeds ${maxSnapshotFiles} files`);
      }
    }
  }

  await visit(directory, relativeDirectory);
  return output.sort();
}

function isAllowedCommand(name: string): name is AllowedCommand {
  return Object.prototype.hasOwnProperty.call(allowedCommands, name);
}

export function commandSpec(name: AllowedCommand): {
  command: string;
  args: readonly string[];
} {
  if (!isAllowedCommand(name))
    throw new Error(`Command is not allowed: ${name}`);
  const [binary, ...args] = allowedCommands[name];
  if (process.platform === "win32") {
    // Windows cannot spawn .cmd shims with shell=false. The command and every
    // argument below come from the closed allowlist above, never from a user.
    return {
      command: process.env.ComSpec || "cmd.exe",
      args: ["/d", "/s", "/c", `${binary}.cmd`, ...args],
    };
  }
  return { command: binary, args };
}

const sandboxEnvironmentKeys = new Set([
  "PATH",
  "PATHEXT",
  "SYSTEMROOT",
  "WINDIR",
  "COMSPEC",
  "TEMP",
  "TMP",
  "TMPDIR",
  "LANG",
  "LC_ALL",
  "CI",
  "PROGRAMDATA",
]);

function sandboxEnvironment(cwd: string): NodeJS.ProcessEnv {
  const environment: NodeJS.ProcessEnv = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (value !== undefined && sandboxEnvironmentKeys.has(key.toUpperCase()))
      environment[key] = value;
  }
  environment.CI = "1";
  environment.NODE_ENV = "test";
  environment.GIT_CONFIG_NOSYSTEM = "1";
  environment.GIT_TERMINAL_PROMPT = "0";
  environment.HOME = cwd;
  environment.USERPROFILE = cwd;
  environment.APPDATA = cwd;
  environment.LOCALAPPDATA = cwd;
  environment.npm_config_ignore_scripts = "true";
  environment.npm_config_audit = "false";
  environment.npm_config_fund = "false";
  const sandboxState = path.dirname(cwd);
  environment.npm_config_cache = path.join(sandboxState, "npm-cache");
  environment.npm_config_userconfig = path.join(sandboxState, "npmrc");
  return environment;
}

function configuredSecrets(): string[] {
  return Object.entries(process.env)
    .filter(
      ([key, value]) =>
        value &&
        /(KEY|SECRET|TOKEN|PASSWORD|PRIVATE|CREDENTIAL|AUTH)/i.test(key),
    )
    .map(([, value]) => value as string)
    .filter((value) => value.length >= 4);
}

export function redactSecrets(
  value: string,
  extraSecrets: readonly string[] = [],
): string {
  let redacted = value;
  for (const secret of [...configuredSecrets(), ...extraSecrets]
    .filter(Boolean)
    .sort((a, b) => b.length - a.length)) {
    redacted = redacted.split(secret).join("[REDACTED]");
  }
  return redacted
    .replace(/Bearer\s+[A-Za-z0-9._~+/-]+=*/gi, "Bearer [REDACTED]")
    .replace(/\bsk-[A-Za-z0-9_-]{8,}\b/g, "[REDACTED_OPENAI_KEY]")
    .replace(
      /\b(?:gh[pousr]|github_pat)_[A-Za-z0-9_]{8,}\b/g,
      "[REDACTED_GITHUB_TOKEN]",
    )
    .replace(
      /\b(?:sb_publishable|sb_secret)_[A-Za-z0-9_-]{8,}\b/g,
      "[REDACTED_SUPABASE_KEY]",
    );
}

export interface CommandResult {
  output: string;
  exitCode: number;
  signal?: NodeJS.Signals;
}

export class CodexAbortError extends Error {
  name = "AbortError";
}

export class CodexTimeoutError extends Error {
  name = "TimeoutError";
}

function appendOutput(current: string, chunk: string): string {
  const next = `${current}${chunk}`;
  return next.length > maxOutputBytes ? next.slice(-maxOutputBytes) : next;
}

function terminateProcessTree(child: ChildProcess): void {
  if (!child.pid) return;
  if (process.platform === "win32") {
    void execFileAsync(
      "taskkill.exe",
      ["/PID", String(child.pid), "/T", "/F"],
      { windowsHide: true },
    ).catch(() => undefined);
  } else {
    try {
      process.kill(-child.pid, "SIGTERM");
    } catch {
      child.kill("SIGTERM");
    }
  }
}

export async function runAllowedCommand(
  name: AllowedCommand,
  cwd: string,
  timeoutMs = defaultCommandTimeoutMs,
  signal?: AbortSignal,
  extraRedactionSecrets: readonly string[] = [],
): Promise<CommandResult> {
  const directory = await realpath(cwd);
  if (!(await stat(directory)).isDirectory())
    throw new Error("Command cwd must be a directory");
  const spec = commandSpec(name);
  if (signal?.aborted)
    throw new CodexAbortError("Command canceled before it started");

  return new Promise((resolve, reject) => {
    const child = spawn(spec.command, [...spec.args], {
      cwd: directory,
      shell: false,
      windowsHide: true,
      detached: process.platform !== "win32",
      env: sandboxEnvironment(directory),
      stdio: ["ignore", "pipe", "pipe"],
    });
    let output = "";
    let settled = false;
    let timedOut = false;
    let canceled = false;
    const collect = (chunk: Buffer) => {
      output = appendOutput(
        output,
        redactSecrets(chunk.toString(), extraRedactionSecrets),
      );
    };
    child.stdout?.on("data", collect);
    child.stderr?.on("data", collect);
    const finish = (callback: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
      callback();
    };
    const onAbort = () => {
      canceled = true;
      terminateProcessTree(child);
    };
    const timer = setTimeout(() => {
      timedOut = true;
      terminateProcessTree(child);
    }, timeoutMs);
    signal?.addEventListener("abort", onAbort, { once: true });
    if (signal?.aborted) onAbort();
    child.on("error", (error) => finish(() => reject(error)));
    child.on("close", (code, childSignal) =>
      finish(() => {
        if (timedOut)
          return reject(
            new CodexTimeoutError(`Command timed out after ${timeoutMs}ms`),
          );
        if (canceled) return reject(new CodexAbortError("Command canceled"));
        resolve({
          output: redactSecrets(output, extraRedactionSecrets),
          exitCode: code ?? 1,
          signal: childSignal ?? undefined,
        });
      }),
    );
  });
}

async function runReadOnlyGit(cwd: string, args: string[]): Promise<string> {
  const directory = await realpath(cwd);
  const git = process.platform === "win32" ? "git.exe" : "git";
  try {
    const { stdout, stderr } = await execFileAsync(git, args, {
      cwd: directory,
      env: sandboxEnvironment(directory),
      shell: false,
      windowsHide: true,
      maxBuffer: maxOutputBytes,
    });
    return redactSecrets(appendOutput(stdout, stderr));
  } catch (error) {
    const commandError = error as {
      stdout?: string;
      stderr?: string;
      message?: string;
    };
    if (commandError.stdout) return redactSecrets(commandError.stdout);
    throw new Error(
      redactSecrets(commandError.message ?? "Read-only git command failed"),
    );
  }
}

export async function gitStatus(workspace: string): Promise<string> {
  return runReadOnlyGit(workspace, [
    "-c",
    "core.fsmonitor=false",
    "status",
    "--short",
    "--untracked-files=all",
  ]);
}

export interface WorkspaceFileSnapshot {
  relativePath: string;
  size: number;
  sha256: string;
}

export interface ChangedWorkspaceFile {
  relativePath: string;
  status: "added" | "modified" | "deleted";
  oldSize: number;
  newSize: number;
}

export interface WorkspaceDiff {
  files: ChangedWorkspaceFile[];
  patch: string;
  truncated: boolean;
}

async function hashFile(filePath: string): Promise<string> {
  const hash = createHash("sha256");
  const stream = createReadStream(filePath);
  for await (const chunk of stream) hash.update(chunk as Buffer);
  return hash.digest("hex");
}

export async function snapshotWorkspace(
  workspace: string,
): Promise<Map<string, WorkspaceFileSnapshot>> {
  const files = await listFiles(workspace);
  const entries = await Promise.all(
    files.map(async (relativePath) => {
      const absolutePath = resolveInside(workspace, relativePath);
      const fileStats = await stat(absolutePath);
      return [
        relativePath,
        {
          relativePath,
          size: fileStats.size,
          sha256: await hashFile(absolutePath),
        },
      ] as const;
    }),
  );
  return new Map(entries);
}

async function diffFile(
  originalRoot: string,
  isolatedRoot: string,
  changedFile: ChangedWorkspaceFile,
): Promise<string> {
  const originalFile = resolveInside(originalRoot, changedFile.relativePath);
  const isolatedFile = resolveInside(isolatedRoot, changedFile.relativePath);
  const git = process.platform === "win32" ? "git.exe" : "git";
  try {
    const { stdout } = await execFileAsync(
      git,
      [
        "diff",
        "--no-index",
        "--no-ext-diff",
        "--no-textconv",
        "--binary",
        "--",
        originalFile,
        isolatedFile,
      ],
      {
        cwd: originalRoot,
        env: sandboxEnvironment(originalRoot),
        shell: false,
        windowsHide: true,
        maxBuffer: maxDiffBytes,
      },
    );
    return stdout;
  } catch (error) {
    const commandError = error as { stdout?: string };
    return commandError.stdout ?? "";
  }
}

function normalizePatchPaths(
  patch: string,
  originalRoot: string,
  isolatedRoot: string,
): string {
  const variants = [
    originalRoot,
    isolatedRoot,
    originalRoot.replace(/\\/g, "/"),
    isolatedRoot.replace(/\\/g, "/"),
  ];
  let normalized = patch;
  for (const variant of variants)
    normalized = normalized.split(variant).join("");
  return normalized
    .replace(/a[\\/](?=[\\/])/g, "a/")
    .replace(/b[\\/](?=[\\/])/g, "b/");
}

export async function getWorkspaceDiff(
  originalRoot: string,
  isolatedRoot: string,
  before?: Map<string, WorkspaceFileSnapshot>,
): Promise<WorkspaceDiff> {
  const original = before ?? (await snapshotWorkspace(originalRoot));
  const current = await snapshotWorkspace(isolatedRoot);
  const paths = [...new Set([...original.keys(), ...current.keys()])].sort();
  const files: ChangedWorkspaceFile[] = [];
  for (const relativePath of paths) {
    const oldFile = original.get(relativePath);
    const newFile = current.get(relativePath);
    if (!oldFile && newFile)
      files.push({
        relativePath,
        status: "added",
        oldSize: 0,
        newSize: newFile.size,
      });
    else if (oldFile && !newFile)
      files.push({
        relativePath,
        status: "deleted",
        oldSize: oldFile.size,
        newSize: 0,
      });
    else if (oldFile && newFile && oldFile.sha256 !== newFile.sha256)
      files.push({
        relativePath,
        status: "modified",
        oldSize: oldFile.size,
        newSize: newFile.size,
      });
  }

  let patch = "";
  let truncated = false;
  for (const file of files) {
    if (file.oldSize > maxDiffBytes || file.newSize > maxDiffBytes) {
      truncated = true;
      continue;
    }
    const nextPatch = normalizePatchPaths(
      await diffFile(originalRoot, isolatedRoot, file),
      originalRoot,
      isolatedRoot,
    );
    if (patch.length + nextPatch.length > maxDiffBytes) {
      truncated = true;
      break;
    }
    patch += nextPatch;
  }
  return { files, patch: redactSecrets(patch), truncated };
}

export type SafeTool =
  | { kind: "command"; name: AllowedCommand }
  | { kind: "list_files"; relativeDirectory?: string }
  | { kind: "read_file"; relativePath: string }
  | { kind: "write_file"; relativePath: string; content: string }
  | { kind: "git_status" }
  | { kind: "diff" };

export type SafeToolResult =
  | { kind: "command"; name: AllowedCommand; output: string; exitCode: number }
  | { kind: "list_files"; files: string[] }
  | { kind: "read_file"; relativePath: string; content: string }
  | { kind: "write_file"; relativePath: string; bytes: number }
  | { kind: "git_status"; output: string }
  | { kind: "diff"; diff: WorkspaceDiff };

export interface SafeToolLoopInput {
  workspace: string;
  originalRoot?: string;
  before?: Map<string, WorkspaceFileSnapshot>;
  tools: readonly SafeTool[];
  maxSteps?: number;
  signal?: AbortSignal;
  commandTimeoutMs?: number;
  allowChanges?: boolean;
}

export async function executeSafeTool(
  tool: SafeTool,
  input: Omit<SafeToolLoopInput, "tools">,
): Promise<SafeToolResult> {
  if (!tool || typeof tool !== "object" || !("kind" in tool))
    throw new Error("Invalid Agent tool request");
  if (tool.kind === "command") {
    if (!isAllowedCommand(tool.name))
      throw new Error(`Command is not allowed: ${String(tool.name)}`);
    const result = await runAllowedCommand(
      tool.name,
      input.workspace,
      input.commandTimeoutMs,
      input.signal,
    );
    return {
      kind: "command",
      name: tool.name,
      output: result.output,
      exitCode: result.exitCode,
    };
  }
  if (tool.kind === "list_files")
    return {
      kind: "list_files",
      files: await listFiles(input.workspace, tool.relativeDirectory ?? ""),
    };
  if (tool.kind === "read_file")
    return {
      kind: "read_file",
      relativePath: tool.relativePath,
      content: await readWorkspaceFile(input.workspace, tool.relativePath),
    };
  if (tool.kind === "write_file") {
    if (!input.allowChanges)
      throw new Error("File writes are only allowed for implement_fix runs");
    await writeWorkspaceFile(input.workspace, tool.relativePath, tool.content);
    return {
      kind: "write_file",
      relativePath: tool.relativePath,
      bytes: Buffer.byteLength(tool.content, "utf8"),
    };
  }
  if (tool.kind === "git_status")
    return { kind: "git_status", output: await gitStatus(input.workspace) };
  if (tool.kind === "diff") {
    if (!input.originalRoot)
      throw new Error("Diff tool requires an original repository root");
    return {
      kind: "diff",
      diff: await getWorkspaceDiff(
        input.originalRoot,
        input.workspace,
        input.before,
      ),
    };
  }
  throw new Error(
    `Tool is not allowed: ${String((tool as { kind: string }).kind)}`,
  );
}

export async function runSafeToolLoop(
  input: SafeToolLoopInput,
): Promise<SafeToolResult[]> {
  const maxSteps = Math.min(Math.max(input.maxSteps ?? 8, 1), 32);
  if (input.tools.length > maxSteps)
    throw new Error(`Agent tool loop exceeds ${maxSteps} steps`);
  const results: SafeToolResult[] = [];
  for (const tool of input.tools) {
    if (input.signal?.aborted)
      throw new CodexAbortError("Agent tool loop canceled");
    results.push(await executeSafeTool(tool, input));
  }
  return results;
}

export class CodexCancellationRegistry {
  private readonly controllers = new Map<string, AbortController>();

  register(runId: string, controller = new AbortController()): AbortController {
    if (this.controllers.has(runId))
      throw new Error(`Agent run is already active: ${runId}`);
    this.controllers.set(runId, controller);
    return controller;
  }

  cancel(runId: string): boolean {
    const controller = this.controllers.get(runId);
    if (!controller) return false;
    controller.abort();
    return true;
  }

  unregister(runId: string): void {
    this.controllers.delete(runId);
  }
  has(runId: string): boolean {
    return this.controllers.has(runId);
  }
}

function combineSignals(signals: readonly (AbortSignal | undefined)[]): {
  signal: AbortSignal;
  dispose: () => void;
} {
  const controller = new AbortController();
  const active = signals.filter((signal): signal is AbortSignal =>
    Boolean(signal),
  );
  const listeners = active.map((signal) => {
    const listener = () => controller.abort();
    if (signal.aborted) controller.abort();
    else signal.addEventListener("abort", listener, { once: true });
    return { signal, listener };
  });
  return {
    signal: controller.signal,
    dispose: () =>
      listeners.forEach(({ signal, listener }) =>
        signal.removeEventListener("abort", listener),
      ),
  };
}

async function emitRunEvent(
  store: CodexRunStore,
  sink: CodexEventSink | undefined,
  runId: string,
  input: CodexRunEventInput,
): Promise<CodexRunEvent> {
  const event = await store.appendEvent(runId, input);
  if (sink) await sink.publish(event).catch(() => undefined);
  return event;
}

export interface RunCodexInput {
  runId?: string;
  workspaceId: string;
  issueId: string;
  repositoryId?: string;
  issueIdentifier: string;
  issueTitle: string;
  mode: CodexRunMode;
  stage?: CodingStage;
  researchArtifactId?: string;
  researchArtifact?: ResearchArtifact;
  requestedConfig?: Record<string, unknown>;
  effectiveConfig?: EffectiveRunConfig;
  caseId?: string;
  ticketRevision?: string;
  baseSha?: string;
  repoRoot: string;
  tools?: readonly SafeTool[];
  store: CodexRunStore;
  eventSink?: CodexEventSink;
  cancellation?: CodexCancellationRegistry;
  signal?: AbortSignal;
  maxRuntimeMs?: number;
  commandTimeoutMs?: number;
  createdByUserId?: string;
  allowedCommands?: readonly AllowedCommand[];
  context?: Record<string, unknown>;
  openAiClient?: OpenAiCodexClient;
  openAiOptions?: OpenAiCodexOptions;
  openAiEnabled?: boolean;
  /** The remote base commit observed before the run started. */
  githubBaseSha?: string;
}

export interface RunCodexResult {
  run: CodexRunRecord;
  diff: WorkspaceDiff;
  tools: SafeToolResult[];
  agent?: OpenAiCodexResult;
}

export async function runCodexRun(
  input: RunCodexInput,
): Promise<RunCodexResult> {
  const runId = input.runId ?? randomUUID();
  const branchName = createBranchName(
    input.issueIdentifier,
    input.issueTitle,
    runId,
  );
  const run = await input.store.createRun({
    id: runId,
    workspaceId: input.workspaceId,
    issueId: input.issueId,
    repositoryId: input.repositoryId,
    mode: input.mode,
    branchName,
    createdByUserId: input.createdByUserId,
  });
  const controller =
    input.cancellation?.register(run.id) ?? new AbortController();
  const combined = combineSignals([input.signal, controller.signal]);
  let timeoutTriggered = false;
  const timeout = setTimeout(() => {
    timeoutTriggered = true;
    controller.abort();
  }, input.maxRuntimeMs ?? defaultRunTimeoutMs);
  let currentRun = run;
  let isolatedWorkspace: string | undefined;
  let before: Map<string, WorkspaceFileSnapshot> | undefined;
  let diff: WorkspaceDiff = { files: [], patch: "", truncated: false };
  const tools: SafeToolResult[] = [];

  const updateRun = async (patch: UpdateCodexRunInput) => {
    const updated = await input.store.updateRun(run.id, patch);
    currentRun = updated ?? {
      ...currentRun,
      ...patch,
      updatedAt: new Date().toISOString(),
    };
  };
  const event = (
    eventType: CodexRunEventInput["eventType"],
    message: string,
    metadata?: Record<string, unknown>,
  ) =>
    emitRunEvent(input.store, input.eventSink, run.id, {
      eventType,
      message,
      metadata,
    });

  try {
    await event(
      "run_queued",
      "Run queued with an isolated repository context",
      { branchName },
    );
    const startedAt = new Date().toISOString();
    await updateRun({ status: "running", progress: 1, startedAt });
    if (input.githubBaseSha) {
      await updateRun({
        result: {
          ...currentRun.result,
          githubBaseSha: input.githubBaseSha,
        },
      });
    }
    await event("run_started", "Isolated Agent run started", {
      mode: input.mode,
    });
    if (combined.signal.aborted)
      throw new CodexAbortError("Agent run canceled");
    before = await snapshotWorkspace(input.repoRoot);
    isolatedWorkspace = await createIsolatedWorkspace(input.repoRoot, run.id);
    await event(
      "sandbox_ready",
      "Secrets, dependencies and VCS metadata excluded from sandbox",
    );

    const requestedTools = input.tools ?? [];
    const loopInput: SafeToolLoopInput = {
      workspace: isolatedWorkspace,
      originalRoot: input.repoRoot,
      before,
      tools: requestedTools,
      maxSteps: 32,
      signal: combined.signal,
      commandTimeoutMs: input.commandTimeoutMs,
      allowChanges: input.mode === "implement_fix",
    };
    const executeTool = async (
      tool: SafeTool,
      index: number,
      source: "preflight" | "model",
    ): Promise<SafeToolResult> => {
      if (combined.signal.aborted)
        throw new CodexAbortError("Agent run canceled");
      const toolName = tool.kind === "command" ? tool.name : tool.kind;
      if (source === "preflight")
        await event("tool_started", `Preflight tool ${index + 1} started`, {
          tool: toolName,
          source,
        });
      const result = await executeSafeTool(tool, loopInput);
      tools.push(result);
      const progress = Math.min(90, Math.max(10, 10 + tools.length * 3));
      await updateRun({ progress });
      if (source === "preflight") {
        await event("tool_completed", `Preflight tool ${index + 1} completed`, {
          tool: toolName,
          source,
          progress,
        });
        await event("progress", `Run progress is ${progress}%`, { progress });
      }
      return result;
    };
    for (const [index, tool] of requestedTools.entries())
      await executeTool(tool, index, "preflight");

    let agent: OpenAiCodexResult | undefined;
    if (input.openAiEnabled !== false) {
      agent = await runOpenAiCodexLoop({
        client: input.openAiClient,
        options: input.openAiOptions,
        context: {
          workspaceId: input.workspaceId,
          issueId: input.issueId,
          issueIdentifier: input.issueIdentifier,
          issueTitle: input.issueTitle,
          mode: input.mode,
          context: input.context,
          allowedCommands:
            input.allowedCommands ??
            requestedTools
              .filter(
                (tool): tool is { kind: "command"; name: AllowedCommand } =>
                  tool.kind === "command",
              )
              .map((tool) => tool.name),
        },
        initialResults: tools,
        signal: combined.signal,
        executeTool: (tool) => executeTool(tool, tools.length, "model"),
        callbacks: {
          onModelStart: async ({ turn, model }) => {
            await event("progress", `OpenAI Codex model turn ${turn} started`, {
              phase: "model_request",
              turn,
              model,
            });
          },
          onModelCompleted: async ({ turn, model, toolCalls }) => {
            await event(
              "progress",
              `OpenAI Codex model turn ${turn} completed`,
              { phase: "model_response", turn, model, toolCalls },
            );
          },
          onModelFallback: async ({ from, to, reason }) => {
            await event(
              "progress",
              "Configured Codex model was rejected; explicit fallback selected",
              {
                phase: "model_fallback",
                from,
                to,
                reason: redactSecrets(reason),
              },
            );
          },
          onToolStart: async ({ name, turn }) => {
            await event("tool_started", `OpenAI Codex requested ${name}`, {
              phase: "model_tool",
              name,
              turn,
            });
          },
          onToolCompleted: async ({ name, turn, ok }) => {
            await event(
              "tool_completed",
              `OpenAI Codex ${name} ${ok ? "completed" : "was rejected"}`,
              { phase: "model_tool", name, turn, ok },
            );
          },
        },
      });
      await updateRun({
        progress: 94,
        result: {
          ...currentRun.result,
          agent: { ...agent, finalText: redactSecrets(agent.finalText) },
          tools: tools.map((tool) => tool.kind),
        },
      });
    }
    diff = await getWorkspaceDiff(input.repoRoot, isolatedWorkspace, before);
    const checks = tools
      .filter(
        (tool): tool is Extract<SafeToolResult, { kind: "command" }> =>
          tool.kind === "command",
      )
      .slice(-8)
      .map((tool) => ({
        name: tool.name,
        exitCode: tool.exitCode,
        output: redactSecrets(tool.output).slice(-20_000),
      }));
    await updateRun({
      status: "completed",
      progress: 100,
      finishedAt: new Date().toISOString(),
      result: {
        ...currentRun.result,
        files: diff.files,
        patch: diff.patch,
        checks,
        ...(agent
          ? { agent: { ...agent, finalText: redactSecrets(agent.finalText) } }
          : {}),
        diffTruncated: diff.truncated,
        tools: tools.map((tool) => tool.kind),
        branchLocalOnly: true,
      },
    });
    if (diff.files.length)
      await event(
        "diff_ready",
        `${diff.files.length} changed file(s) ready for review`,
        {
          files: diff.files.map((file) => file.relativePath),
          truncated: diff.truncated,
        },
      );
    await event(
      "run_completed",
      "Run completed; no push, merge or deploy was performed",
      { filesChanged: diff.files.length },
    );
    return { run: currentRun, diff, tools, ...(agent ? { agent } : {}) };
  } catch (error) {
    const canceled = combined.signal.aborted && !timeoutTriggered;
    const message =
      error instanceof Error ? error.message : "Unknown Codex runner error";
    const status: CodexRunStatus = canceled ? "canceled" : "failed";
    await updateRun({
      status,
      finishedAt: new Date().toISOString(),
      result: {
        ...currentRun.result,
        error: redactSecrets(message),
        timedOut: timeoutTriggered,
      },
    });
    await event(
      canceled ? "run_canceled" : "run_failed",
      canceled
        ? "Run canceled before publication"
        : "Run failed inside the isolated sandbox",
      { error: redactSecrets(message), timedOut: timeoutTriggered },
    );
    return { run: currentRun, diff, tools };
  } finally {
    clearTimeout(timeout);
    combined.dispose();
    input.cancellation?.unregister(run.id);
    if (isolatedWorkspace) {
      try {
        await removeIsolatedWorkspace(isolatedWorkspace);
      } catch (error) {
        await event(
          "cleanup_failed",
          "Sandbox cleanup failed; operator action required",
          {
            error: redactSecrets(
              error instanceof Error ? error.message : "Unknown cleanup error",
            ),
          },
        );
      }
    }
  }
}
