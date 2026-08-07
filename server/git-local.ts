import { spawn } from "node:child_process";
import { realpath, stat } from "node:fs/promises";
import path from "node:path";
import { redactSecrets } from "./codex.js";

const maxGitOutputBytes = 1_000_000;
const gitTimeoutMs = 120_000;

const environmentKeys = new Set([
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
  "HOME",
  "USERPROFILE",
  "GIT_AUTHOR_NAME",
  "GIT_AUTHOR_EMAIL",
  "GIT_COMMITTER_NAME",
  "GIT_COMMITTER_EMAIL",
]);

export interface GitRepositoryState {
  root: string;
  branch?: string;
  head?: string;
  clean: boolean;
  status: string;
}

export interface GitCommitResult {
  sha: string;
  branch: string;
  paths: string[];
}

export interface GitPushResult {
  remote: string;
  branch: string;
}

export interface GitLocalPort {
  inspect(repositoryRoot: string): Promise<GitRepositoryState>;
  /** Switch a clean checkout back to the configured base branch. */
  switchBranch?(
    repositoryRoot: string,
    branchName: string,
  ): Promise<GitRepositoryState>;
  createBranch(
    repositoryRoot: string,
    branchName: string,
    baseBranch: string,
  ): Promise<GitRepositoryState>;
  applyPatch(repositoryRoot: string, patch: string): Promise<void>;
  commit(
    repositoryRoot: string,
    paths: readonly string[],
    message: string,
  ): Promise<GitCommitResult>;
  push?(
    repositoryRoot: string,
    remote: string,
    branch: string,
  ): Promise<GitPushResult>;
}

export class GitLocalError extends Error {
  readonly exitCode?: number;

  constructor(message: string, exitCode?: number) {
    super(message);
    this.name = "GitLocalError";
    this.exitCode = exitCode;
  }
}

function appendOutput(current: string, chunk: string): string {
  const next = `${current}${chunk}`;
  return next.length > maxGitOutputBytes
    ? next.slice(-maxGitOutputBytes)
    : next;
}

function gitEnvironment(): NodeJS.ProcessEnv {
  const environment: NodeJS.ProcessEnv = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (value !== undefined && environmentKeys.has(key.toUpperCase()))
      environment[key] = value;
  }
  environment.GIT_TERMINAL_PROMPT = "0";
  environment.GIT_CONFIG_NOSYSTEM = "1";
  return environment;
}

interface GitCommandOptions {
  input?: string;
  allowFailure?: boolean;
}

interface GitCommandResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

function runGit(
  repositoryRoot: string,
  args: readonly string[],
  options: GitCommandOptions = {},
): Promise<GitCommandResult> {
  const executable = process.platform === "win32" ? "git.exe" : "git";
  return new Promise((resolve, reject) => {
    const child = spawn(executable, [...args], {
      cwd: repositoryRoot,
      env: gitEnvironment(),
      shell: false,
      windowsHide: true,
      stdio: ["pipe", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      child.kill("SIGTERM");
      reject(
        new GitLocalError(`Git command timed out after ${gitTimeoutMs}ms`),
      );
      settled = true;
    }, gitTimeoutMs);
    const finish = (callback: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      callback();
    };
    child.stdout?.on("data", (chunk: Buffer) => {
      stdout = appendOutput(stdout, redactSecrets(chunk.toString()));
    });
    child.stderr?.on("data", (chunk: Buffer) => {
      stderr = appendOutput(stderr, redactSecrets(chunk.toString()));
    });
    child.on("error", (error) =>
      finish(() => reject(new GitLocalError(redactSecrets(error.message)))),
    );
    child.on("close", (code) =>
      finish(() => {
        const exitCode = code ?? 1;
        const result = { stdout, stderr, exitCode };
        if (exitCode !== 0 && !options.allowFailure) {
          const detail =
            redactSecrets(`${stderr || stdout}`.trim()) ||
            `exit code ${exitCode}`;
          reject(new GitLocalError(`Git command failed: ${detail}`, exitCode));
          return;
        }
        resolve(result);
      }),
    );
    if (options.input !== undefined) child.stdin?.end(options.input);
    else child.stdin?.end();
  });
}

async function resolvedDirectory(repositoryRoot: string): Promise<string> {
  const resolved = await realpath(repositoryRoot);
  if (!(await stat(resolved)).isDirectory())
    throw new GitLocalError("Repository root must be a directory");
  return resolved;
}

function samePath(left: string, right: string): boolean {
  const normalizedLeft = path.resolve(left);
  const normalizedRight = path.resolve(right);
  return process.platform === "win32"
    ? normalizedLeft.toLowerCase() === normalizedRight.toLowerCase()
    : normalizedLeft === normalizedRight;
}

function validRef(ref: string, label: string): string {
  const value = ref.trim();
  if (
    !/^[A-Za-z0-9][A-Za-z0-9._/-]{0,100}$/.test(value) ||
    value.includes("..") ||
    value.includes("@{") ||
    value.includes("//") ||
    value.endsWith("/") ||
    value.endsWith(".") ||
    value.endsWith(".lock")
  ) {
    throw new GitLocalError(`Invalid ${label}`);
  }
  return value;
}

export function validateGitRelativePath(input: string): string {
  if (typeof input !== "string" || input.length === 0 || input.includes("\0"))
    throw new GitLocalError("Invalid Git path");
  const normalized = input.replace(/\\/g, "/");
  if (normalized.startsWith("/") || /^[A-Za-z]:\//.test(normalized))
    throw new GitLocalError("Git path must be relative");
  const parts = normalized.split("/");
  if (parts.some((part) => !part || part === "." || part === ".."))
    throw new GitLocalError("Git path traversal is not allowed");
  const lowerParts = parts.map((part) => part.toLowerCase());
  if (
    lowerParts[0] === ".git" ||
    lowerParts.some((part) => part.startsWith(".env")) ||
    lowerParts.some((part) => part === ".npmrc")
  ) {
    throw new GitLocalError("Sensitive Git paths are not allowed");
  }
  return parts.join("/");
}

function parseNulSeparatedPaths(output: string): string[] {
  return output.split("\0").filter(Boolean).map(validateGitRelativePath);
}

export class LocalGit implements GitLocalPort {
  async inspect(repositoryRoot: string): Promise<GitRepositoryState> {
    const root = await resolvedDirectory(repositoryRoot);
    const topLevelResult = await runGit(root, ["rev-parse", "--show-toplevel"]);
    const topLevel = await realpath(topLevelResult.stdout.trim());
    if (!samePath(topLevel, root))
      throw new GitLocalError(
        "Git repository root does not match configured path",
      );

    const branchResult = await runGit(
      root,
      ["symbolic-ref", "--quiet", "--short", "HEAD"],
      { allowFailure: true },
    );
    const headResult = await runGit(root, ["rev-parse", "--verify", "HEAD"], {
      allowFailure: true,
    });
    const status = (
      await runGit(root, ["status", "--porcelain=v1", "--untracked-files=all"])
    ).stdout;
    return {
      root,
      ...(branchResult.exitCode === 0 && branchResult.stdout.trim()
        ? { branch: branchResult.stdout.trim() }
        : {}),
      ...(headResult.exitCode === 0 && headResult.stdout.trim()
        ? { head: headResult.stdout.trim() }
        : {}),
      clean: status.trim().length === 0,
      status,
    };
  }

  async createBranch(
    repositoryRoot: string,
    branchName: string,
    baseBranch: string,
  ): Promise<GitRepositoryState> {
    const branch = validRef(branchName, "branch name");
    const base = validRef(baseBranch, "base branch");
    const state = await this.inspect(repositoryRoot);
    if (!state.clean)
      throw new GitLocalError(
        "Repository must be clean before creating a Codex branch",
      );
    if (state.branch !== base)
      throw new GitLocalError(
        `Repository must be on configured base branch: ${base}`,
      );

    const existing = await runGit(
      state.root,
      ["show-ref", "--verify", "--quiet", `refs/heads/${branch}`],
      { allowFailure: true },
    );
    if (existing.exitCode === 0)
      throw new GitLocalError(`Branch already exists: ${branch}`);
    await runGit(state.root, [
      "switch",
      "--no-guess",
      "--create",
      branch,
      base,
    ]);
    return this.inspect(state.root);
  }

  async switchBranch(
    repositoryRoot: string,
    branchName: string,
  ): Promise<GitRepositoryState> {
    const branch = validRef(branchName, "branch name");
    const state = await this.inspect(repositoryRoot);
    if (!state.clean)
      throw new GitLocalError(
        "Repository must be clean before switching a Codex checkout",
      );
    if (state.branch === branch) return state;
    await runGit(state.root, ["switch", "--no-guess", branch]);
    return this.inspect(state.root);
  }

  async applyPatch(repositoryRoot: string, patch: string): Promise<void> {
    const root = await resolvedDirectory(repositoryRoot);
    const safePatch = redactSecrets(patch);
    if (!safePatch.trim())
      throw new GitLocalError("Cannot apply an empty patch");
    if (safePatch.includes("[REDACTED"))
      throw new GitLocalError("Refusing to apply a redacted patch");
    if (safePatch.includes("\0"))
      throw new GitLocalError("Patch contains an invalid NUL byte");
    await runGit(root, ["apply", "--check", "--whitespace=nowarn", "-"], {
      input: safePatch,
    });
    await runGit(root, ["apply", "--whitespace=nowarn", "-"], {
      input: safePatch,
    });
  }

  async commit(
    repositoryRoot: string,
    paths: readonly string[],
    message: string,
  ): Promise<GitCommitResult> {
    const root = await resolvedDirectory(repositoryRoot);
    const expectedPaths = [
      ...new Set(paths.map(validateGitRelativePath)),
    ].sort();
    if (!expectedPaths.length)
      throw new GitLocalError("Cannot create an empty Codex commit");
    const commitMessage = redactSecrets(message)
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 160);
    if (!commitMessage) throw new GitLocalError("Commit message is empty");

    await runGit(root, ["add", "--all", "--", ...expectedPaths]);
    const staged = parseNulSeparatedPaths(
      (await runGit(root, ["diff", "--cached", "--name-only", "-z", "--"]))
        .stdout,
    ).sort();
    if (
      staged.length !== expectedPaths.length ||
      staged.some((value, index) => value !== expectedPaths[index])
    ) {
      throw new GitLocalError("Staged paths do not match the Codex patch");
    }
    await runGit(root, [
      "-c",
      "commit.gpgSign=false",
      "commit",
      "--no-verify",
      "-m",
      commitMessage,
    ]);
    const after = await this.inspect(root);
    if (!after.head || !after.branch)
      throw new GitLocalError(
        "Local commit did not produce a branch and commit SHA",
      );
    return { sha: after.head, branch: after.branch, paths: expectedPaths };
  }

  async push(
    repositoryRoot: string,
    remote: string,
    branch: string,
  ): Promise<GitPushResult> {
    const root = await resolvedDirectory(repositoryRoot);
    const safeRemote = validRef(remote, "Git remote");
    const safeBranch = validRef(branch, "Git branch");
    await runGit(root, ["push", "--set-upstream", safeRemote, safeBranch]);
    return { remote: safeRemote, branch: safeBranch };
  }
}

export function createLocalGit(): GitLocalPort {
  return new LocalGit();
}
