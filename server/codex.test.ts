import { describe, expect, it } from "vitest";
import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  CodexCancellationRegistry,
  InMemoryCodexRunStore,
  createIsolatedWorkspace,
  getWorkspaceDiff,
  listFiles,
  readWorkspaceFile,
  redactSecrets,
  removeIsolatedWorkspace,
  runCodexRun,
  runSafeToolLoop,
  writeWorkspaceFile,
  type SafeTool,
} from "./codex.js";
import { createCodexEventHub } from "./codex-events.js";
import type { OpenAiCodexClient } from "./codex-openai.js";

async function tempDirectory(): Promise<string> {
  return mkdtemp(path.join(os.tmpdir(), "mend-codex-test-"));
}

describe("Codex runner security boundary", () => {
  it("copies only safe repository content and rejects traversal", async () => {
    const root = await tempDirectory();
    const outside = await tempDirectory();
    try {
      await mkdir(path.join(root, "src"));
      await mkdir(path.join(root, "node_modules"));
      await mkdir(path.join(root, ".git"));
      await writeFile(
        path.join(root, "src", "main.ts"),
        "export const ok = true;",
      );
      await writeFile(path.join(root, ".env"), "OPENAI_API_KEY=secret");
      await writeFile(path.join(root, "node_modules", "ignored.js"), "ignored");
      await writeFile(path.join(root, ".git", "config"), "secret");
      try {
        await symlink(outside, path.join(root, "linked-outside"));
      } catch {
        /* symlinks require elevated Windows privileges */
      }
      const isolated = await createIsolatedWorkspace(root, "RUN-1");
      try {
        expect(await listFiles(isolated)).toEqual(["src/main.ts"]);
        await expect(listFiles(isolated, "..")).rejects.toThrow("outside");
      } finally {
        await removeIsolatedWorkspace(isolated);
      }
    } finally {
      await rm(root, { recursive: true, force: true });
      await rm(outside, { recursive: true, force: true });
    }
  });

  it("redacts configured and common token formats", () => {
    const output = redactSecrets(
      "Authorization: Bearer abc-123 and sk-test-secret-value",
      ["abc-123"],
    );
    expect(output).not.toContain("abc-123");
    expect(output).not.toContain("sk-test-secret-value");
    expect(output).toContain("[REDACTED]");
  });

  it("keeps the tool loop to named safe tools and enforces its step budget", async () => {
    const root = await tempDirectory();
    try {
      await writeFile(path.join(root, "README.md"), "Mend");
      const tools: SafeTool[] = [{ kind: "list_files" }];
      const results = await runSafeToolLoop({ workspace: root, tools });
      expect(results).toEqual([{ kind: "list_files", files: ["README.md"] }]);
      await expect(
        runSafeToolLoop({
          workspace: root,
          tools: [...tools, ...tools],
          maxSteps: 1,
        }),
      ).rejects.toThrow("exceeds");
      await expect(
        runSafeToolLoop({
          workspace: root,
          tools: [{ kind: "unknown" } as unknown as SafeTool],
        }),
      ).rejects.toThrow("not allowed");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("produces a reviewable diff without exposing absolute sandbox paths", async () => {
    const root = await tempDirectory();
    try {
      await writeFile(path.join(root, "README.md"), "before\n");
      const isolated = await createIsolatedWorkspace(root, "RUN-2");
      try {
        const before = new Map([
          [
            "README.md",
            { relativePath: "README.md", size: 7, sha256: "before" },
          ],
        ]);
        await writeFile(path.join(isolated, "README.md"), "after\n");
        const diff = await getWorkspaceDiff(root, isolated, before);
        expect(diff.files).toEqual([
          {
            relativePath: "README.md",
            status: "modified",
            oldSize: 7,
            newSize: 6,
          },
        ]);
        expect(diff.patch).toContain("after");
        expect(diff.patch).not.toContain(isolated);
      } finally {
        await removeIsolatedWorkspace(isolated);
      }
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("lets the real runner use a fake Responses client to write, test, diff and persist model events", async () => {
    const root = await tempDirectory();
    try {
      await writeFile(path.join(root, "README.md"), "before\n");
      await writeFile(
        path.join(root, "package.json"),
        JSON.stringify({ scripts: { test: 'node -e "console.log(1)"' } }),
      );
      const calls: string[] = [];
      const client: OpenAiCodexClient = {
        responses: {
          async create(input) {
            calls.push(input.model);
            if (calls.length === 1)
              return {
                output: [
                  {
                    type: "function_call",
                    name: "write_file",
                    call_id: "write-1",
                    arguments: JSON.stringify({
                      relativePath: "README.md",
                      content: "after\n",
                    }),
                  },
                ],
              };
            return { output: [], output_text: "Changed README safely." };
          },
        },
      };
      const store = new InMemoryCodexRunStore();
      const result = await runCodexRun({
        workspaceId: "workspace-1",
        issueId: "issue-1",
        issueIdentifier: "TEC-2",
        issueTitle: "Update README",
        mode: "implement_fix",
        repoRoot: root,
        allowedCommands: ["test"],
        tools: [{ kind: "command", name: "test" }],
        store,
        openAiClient: client,
      });
      expect(store.runs.get(result.run.id)?.result).not.toHaveProperty("error");
      expect(result.run.status).toBe("completed");
      expect(result.diff.files).toEqual([
        {
          relativePath: "README.md",
          status: "modified",
          oldSize: 7,
          newSize: 6,
        },
      ]);
      expect(result.agent?.finalText).toBe("Changed README safely.");
      expect(store.runs.get(result.run.id)?.result.checks).toEqual([
        expect.objectContaining({
          name: "test",
          exitCode: 0,
          output: expect.stringContaining("1"),
        }),
      ]);
      expect(store.events.map((event) => event.eventType)).toContain(
        "progress",
      );
      expect(
        store.events.some((event) => event.metadata.phase === "model_request"),
      ).toBe(true);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("refuses sensitive and traversal file operations inside the sandbox", async () => {
    const root = await tempDirectory();
    try {
      await writeFile(path.join(root, "README.md"), "safe");
      await expect(readWorkspaceFile(root, "../outside.txt")).rejects.toThrow(
        "traversal",
      );
      await expect(readWorkspaceFile(root, ".env")).rejects.toThrow(
        "Sensitive",
      );
      await expect(
        writeWorkspaceFile(
          root,
          "README.md",
          "Authorization: Bearer secret-value",
        ),
      ).rejects.toThrow("secrets");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("persists run and event transitions and honors pre-cancel", async () => {
    const root = await tempDirectory();
    try {
      await writeFile(path.join(root, "README.md"), "Mend");
      const store = new InMemoryCodexRunStore();
      const hub = createCodexEventHub();
      const observed: string[] = [];
      hub.subscribe((event) => {
        observed.push(event.eventType);
      });
      const cancellation = new CodexCancellationRegistry();
      const signalController = new AbortController();
      signalController.abort();
      const result = await runCodexRun({
        workspaceId: "workspace-1",
        issueId: "issue-1",
        issueIdentifier: "TEC-1",
        issueTitle: "Safe runner",
        mode: "investigate",
        repoRoot: root,
        tools: [],
        store,
        eventSink: hub,
        cancellation,
        signal: signalController.signal,
      });
      expect(result.run.status).toBe("canceled");
      expect(store.runs.get(result.run.id)?.status).toBe("canceled");
      expect(store.events.map((event) => event.eventType)).toContain(
        "run_canceled",
      );
      expect(observed).toContain("run_queued");
      expect(cancellation.has(result.run.id)).toBe(false);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
