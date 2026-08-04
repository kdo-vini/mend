import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";
import {
  InMemoryCodexRunStore,
  type RunCodexResult,
  type SafeToolResult,
} from "./codex.js";
import {
  CodexService,
  InMemoryCodexContextPort,
  type CodexRunExecutor,
  type RepositoryConfig,
  type RepositoryConfigPort,
  type StartCodexRunInput,
} from "./codex-service.js";
import {
  LocalGit,
  type GitLocalPort,
  type GitRepositoryState,
} from "./git-local.js";

const execFileAsync = promisify(execFile);

async function tempDirectory(): Promise<string> {
  return mkdtemp(path.join(os.tmpdir(), "mend-codex-service-test-"));
}

async function withWorkspaceRoot<T>(
  root: string,
  callback: () => Promise<T>,
): Promise<T> {
  const previous = process.env.CODEX_WORKSPACE_ROOT;
  process.env.CODEX_WORKSPACE_ROOT = root;
  try {
    return await callback();
  } finally {
    if (previous === undefined) delete process.env.CODEX_WORKSPACE_ROOT;
    else process.env.CODEX_WORKSPACE_ROOT = previous;
  }
}

class FakeRepositoryPort implements RepositoryConfigPort {
  constructor(private readonly repository: RepositoryConfig) {}

  async getRepository(
    workspaceId: string,
    repositoryId: string,
  ): Promise<RepositoryConfig | null> {
    return this.repository.workspaceId === workspaceId &&
      this.repository.id === repositoryId
      ? this.repository
      : null;
  }
}

class FakeRunStore extends InMemoryCodexRunStore {
  async getRun(runId: string) {
    return this.runs.get(runId) ?? null;
  }
}

class FakeGit implements GitLocalPort {
  readonly calls: string[] = [];

  constructor(private readonly root: string) {}

  async inspect(repositoryRoot: string): Promise<GitRepositoryState> {
    this.calls.push(`inspect:${repositoryRoot}`);
    return {
      root: repositoryRoot,
      branch: "main",
      head: "base-sha",
      clean: true,
      status: "",
    };
  }

  async createBranch(
    repositoryRoot: string,
    branchName: string,
    baseBranch: string,
  ): Promise<GitRepositoryState> {
    this.calls.push(`branch:${branchName}:${baseBranch}`);
    return {
      root: this.root,
      branch: branchName,
      head: "base-sha",
      clean: true,
      status: "",
    };
  }

  async applyPatch(repositoryRoot: string, patch: string): Promise<void> {
    this.calls.push(`patch:${repositoryRoot}:${patch}`);
  }

  async commit(
    repositoryRoot: string,
    paths: readonly string[],
    message: string,
  ) {
    this.calls.push(`commit:${repositoryRoot}:${paths.join(",")}:${message}`);
    return {
      sha: "local-commit-sha",
      branch: "ops/TEC-2-fix",
      paths: [...paths],
    };
  }
}

function repository(root: string, localPath = "repo"): RepositoryConfig {
  return {
    id: "repo-1",
    workspaceId: "workspace-1",
    name: "Mend repository",
    localPath: path.isAbsolute(localPath)
      ? localPath
      : path.join(root, localPath),
    defaultBranch: "main",
    allowedCommands: ["lint", "test"],
  };
}

function resultFor(
  input: Parameters<CodexRunExecutor>[0],
  diff: RunCodexResult["diff"],
  tools: SafeToolResult[] = [],
): Promise<RunCodexResult> {
  return input.store
    .createRun({
      workspaceId: input.workspaceId,
      issueId: input.issueId,
      repositoryId: input.repositoryId,
      mode: input.mode,
      branchName: "ops/TEC-2-fix",
      createdByUserId: input.createdByUserId,
    })
    .then(async (run) => {
      const updated = await input.store.updateRun(run.id, {
        status: "completed",
        progress: 100,
        result: {
          files: diff.files,
          patch: diff.patch,
          diffTruncated: diff.truncated,
        },
      });
      return { run: updated ?? run, diff, tools };
    });
}

function startInput(
  mode: StartCodexRunInput["mode"] = "investigate",
): StartCodexRunInput {
  return {
    workspaceId: "workspace-1",
    issueId: "issue-1",
    repositoryId: "repo-1",
    issueIdentifier: "TEC-2",
    issueTitle: "Fix checkout timeout",
    mode,
    context: {
      issue: {
        id: "issue-1",
        identifier: "TEC-2",
        title: "Fix checkout timeout",
        summary: "Checkout stops during the last step.",
      },
      conversation: {
        summary: "Customer reported a timeout.",
        messages: [
          {
            text: "Bearer abc-123 and sk-test-secret-value",
            direction: "inbound",
          },
        ],
      },
    },
    tools: [{ kind: "command", name: "test" as const }],
  };
}

describe("Codex application service", () => {
  it("mounts a minimal redacted context, persists command results and retrieves the patch", async () => {
    const root = await tempDirectory();
    try {
      await mkdir(path.join(root, "repo"));
      const store = new FakeRunStore();
      const contextPort = new InMemoryCodexContextPort();
      const executor: CodexRunExecutor = async (input) =>
        resultFor(
          input,
          {
            files: [
              {
                relativePath: "README.md",
                status: "modified",
                oldSize: 7,
                newSize: 6,
              },
            ],
            patch: "diff --git a/README.md b/README.md\n-before\n+after\n",
            truncated: false,
          },
          [{ kind: "command", name: "test", output: "passed", exitCode: 0 }],
        );
      const service = new CodexService({
        repositories: new FakeRepositoryPort(repository(root)),
        runs: store,
        context: contextPort,
        execute: executor,
      });

      const handle = await withWorkspaceRoot(root, () =>
        service.start(startInput()),
      );
      const completed = await handle.completion;
      expect(completed.run.status).toBe("completed");
      expect(completed.commandResults).toEqual([
        { name: "test", output: "passed", exitCode: 0, passed: true },
      ]);
      expect(completed.testResults).toHaveLength(1);
      expect(
        contextPort.mounted[0].conversation?.messages[0]?.text,
      ).not.toContain("abc-123");
      expect(
        contextPort.mounted[0].conversation?.messages[0]?.text,
      ).not.toContain("sk-test-secret-value");
      expect(await service.getPatch(handle.runId)).toContain("+after");
      expect(store.runs.get(handle.runId)?.result).toMatchObject({
        testResults: [{ name: "test", passed: true }],
      });
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("rejects a repository outside CODEX_WORKSPACE_ROOT and commands outside repository policy", async () => {
    const root = await tempDirectory();
    const outside = await tempDirectory();
    try {
      await mkdir(path.join(root, "repo"));
      const store = new FakeRunStore();
      const service = new CodexService({
        repositories: new FakeRepositoryPort(repository(outside, outside)),
        runs: store,
        execute: async () => {
          throw new Error("must not execute");
        },
      });
      await expect(
        withWorkspaceRoot(root, () => service.start(startInput())),
      ).rejects.toThrow("outside CODEX_WORKSPACE_ROOT");

      const policyService = new CodexService({
        repositories: new FakeRepositoryPort(repository(root)),
        runs: store,
        execute: async () => {
          throw new Error("must not execute");
        },
      });
      await expect(
        withWorkspaceRoot(root, () =>
          policyService.start({
            ...startInput(),
            tools: [{ kind: "command", name: "build" }],
          }),
        ),
      ).rejects.toThrow("not enabled");
    } finally {
      await rm(root, { recursive: true, force: true });
      await rm(outside, { recursive: true, force: true });
    }
  });

  it("creates only a local branch and commit for implement_fix", async () => {
    const root = await tempDirectory();
    try {
      await mkdir(path.join(root, "repo"));
      const store = new FakeRunStore();
      const git = new FakeGit(path.join(root, "repo"));
      const executor: CodexRunExecutor = async (input) =>
        resultFor(input, {
          files: [
            {
              relativePath: "README.md",
              status: "modified",
              oldSize: 7,
              newSize: 6,
            },
          ],
          patch: "safe patch",
          truncated: false,
        });
      const service = new CodexService({
        repositories: new FakeRepositoryPort(repository(root)),
        runs: store,
        git,
        execute: executor,
      });
      const handle = await withWorkspaceRoot(root, () =>
        service.start(startInput("implement_fix")),
      );
      const result = await handle.completion;
      expect(result.run.status).toBe("completed");
      expect(result.run.commitSha).toBe("local-commit-sha");
      expect(result.run.branchName).toBe("ops/TEC-2-fix");
      expect(git.calls.some((call) => call.startsWith("branch:"))).toBe(true);
      expect(git.calls.some((call) => call.startsWith("patch:"))).toBe(true);
      expect(git.calls.some((call) => call.startsWith("commit:"))).toBe(true);
      expect(git.calls.some((call) => /push|merge|deploy/i.test(call))).toBe(
        false,
      );
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("withholds the local commit when an approved check fails", async () => {
    const root = await tempDirectory();
    try {
      await mkdir(path.join(root, "repo"));
      const store = new FakeRunStore();
      const git = new FakeGit(path.join(root, "repo"));
      const executor: CodexRunExecutor = async (input) =>
        resultFor(
          input,
          {
            files: [
              {
                relativePath: "README.md",
                status: "modified",
                oldSize: 7,
                newSize: 6,
              },
            ],
            patch: "safe patch",
            truncated: false,
          },
          [{ kind: "command", name: "test", output: "failed", exitCode: 1 }],
        );
      const service = new CodexService({
        repositories: new FakeRepositoryPort(repository(root)),
        runs: store,
        git,
        execute: executor,
      });
      const handle = await withWorkspaceRoot(root, () =>
        service.start(startInput("implement_fix")),
      );
      const result = await handle.completion;
      expect(result.run.status).toBe("completed");
      expect(result.run.commitSha).toBeUndefined();
      expect(result.run.result).toMatchObject({
        localCommit: { status: "not_created", reason: "checks_failed" },
      });
      expect(git.calls.some((call) => call.startsWith("commit:"))).toBe(false);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("supports cancellation and approval/rejection decisions", async () => {
    const root = await tempDirectory();
    try {
      await mkdir(path.join(root, "repo"));
      const store = new FakeRunStore();
      const executor: CodexRunExecutor = async (input) => {
        const run = await input.store.createRun({
          workspaceId: input.workspaceId,
          issueId: input.issueId,
          repositoryId: input.repositoryId,
          mode: input.mode,
        });
        await new Promise<void>((resolve) =>
          input.signal?.addEventListener("abort", () => resolve(), {
            once: true,
          }),
        );
        const updated = await input.store.updateRun(run.id, {
          status: "canceled",
          finishedAt: new Date().toISOString(),
        });
        return {
          run: updated ?? run,
          diff: { files: [], patch: "", truncated: false },
          tools: [],
        };
      };
      const service = new CodexService({
        repositories: new FakeRepositoryPort(repository(root)),
        runs: store,
        execute: executor,
      });
      const handle = await withWorkspaceRoot(root, () =>
        service.start(startInput()),
      );
      await service.cancel(handle.runId);
      expect((await handle.completion).run.status).toBe("canceled");

      const completedExecutor: CodexRunExecutor = async (input) =>
        resultFor(input, { files: [], patch: "", truncated: false });
      const approvalService = new CodexService({
        repositories: new FakeRepositoryPort(repository(root)),
        runs: new FakeRunStore(),
        execute: completedExecutor,
      });
      const approvedHandle = await withWorkspaceRoot(root, () =>
        approvalService.start(startInput()),
      );
      await approvedHandle.completion;
      expect((await approvalService.approve(approvedHandle.runId)).status).toBe(
        "approved",
      );

      const rejectionService = new CodexService({
        repositories: new FakeRepositoryPort(repository(root)),
        runs: new FakeRunStore(),
        execute: completedExecutor,
      });
      const rejectedHandle = await withWorkspaceRoot(root, () =>
        rejectionService.start(startInput()),
      );
      await rejectedHandle.completion;
      expect(
        (
          await rejectionService.reject(
            rejectedHandle.runId,
            "Needs another approach",
          )
        ).status,
      ).toBe("rejected");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("uses the real local Git adapter to apply and commit without remote operations", async () => {
    const root = await tempDirectory();
    try {
      await execFileAsync(
        process.platform === "win32" ? "git.exe" : "git",
        ["init", "-b", "main"],
        { cwd: root },
      );
      await execFileAsync(
        process.platform === "win32" ? "git.exe" : "git",
        ["config", "user.name", "Mend Test"],
        { cwd: root },
      );
      await execFileAsync(
        process.platform === "win32" ? "git.exe" : "git",
        ["config", "user.email", "mend-test@example.com"],
        { cwd: root },
      );
      await writeFile(path.join(root, "README.md"), "before\n");
      await execFileAsync(
        process.platform === "win32" ? "git.exe" : "git",
        ["add", "--", "README.md"],
        { cwd: root },
      );
      await execFileAsync(
        process.platform === "win32" ? "git.exe" : "git",
        ["commit", "-m", "initial"],
        { cwd: root },
      );
      const git = new LocalGit();
      const branch = await git.createBranch(root, "ops/TEC-3-fix", "main");
      await git.applyPatch(
        root,
        "--- a/README.md\n+++ b/README.md\n@@ -1 +1 @@\n-before\n+after\n",
      );
      const commit = await git.commit(
        root,
        ["README.md"],
        "Fix TEC-3: local change",
      );
      expect(branch.branch).toBe("ops/TEC-3-fix");
      expect(commit.branch).toBe("ops/TEC-3-fix");
      expect(commit.sha).toMatch(/^[0-9a-f]{40}$/);
      expect(await readFile(path.join(root, "README.md"), "utf8")).toBe(
        "after\n",
      );
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
