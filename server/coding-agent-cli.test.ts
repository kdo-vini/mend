import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  CodingAgentCli,
  buildCodingAgentInvocation,
  codingAgentNames,
  getCodingAgentDefinition,
  normalizeCodingAgentReport,
  runCliProcess,
  type CliProcessRunner,
  type CodingAgentInvocation,
} from "./coding-agent-cli.js";

const report = {
  verdict: "confirmed",
  summary: "The complaint reproduces.",
  rootCause: "A missing guard.",
  recommendedAction: "fix",
  evidence: [
    {
      kind: "reproduction",
      label: "Reproduced in the isolated copy",
      detail: null,
    },
  ],
};

const originalGitHubKey = process.env.MEND_GITHUB_APP_PRIVATE_KEY;
const originalGitHubToken = process.env.GITHUB_TOKEN;
const originalProviderKeys = {
  CODEX_API_KEY: process.env.CODEX_API_KEY,
  OPENAI_API_KEY: process.env.OPENAI_API_KEY,
  ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
  GEMINI_API_KEY: process.env.GEMINI_API_KEY,
  VERBOO_API_KEY: process.env.VERBOO_API_KEY,
};
const originalCodexSandboxMode = process.env.MEND_CODEX_SANDBOX_MODE;

afterEach(() => {
  if (originalGitHubKey === undefined)
    delete process.env.MEND_GITHUB_APP_PRIVATE_KEY;
  else process.env.MEND_GITHUB_APP_PRIVATE_KEY = originalGitHubKey;
  if (originalGitHubToken === undefined) delete process.env.GITHUB_TOKEN;
  else process.env.GITHUB_TOKEN = originalGitHubToken;
  for (const [envKey, value] of Object.entries(originalProviderKeys)) {
    if (value === undefined) delete process.env[envKey];
    else process.env[envKey] = value;
  }
  if (originalCodexSandboxMode === undefined)
    delete process.env.MEND_CODEX_SANDBOX_MODE;
  else process.env.MEND_CODEX_SANDBOX_MODE = originalCodexSandboxMode;
});

describe("coding agent CLI boundary", () => {
  it("builds fixed argv and capability policies for every supported CLI", () => {
    process.env.MEND_GITHUB_APP_PRIVATE_KEY = "write-private-key";
    process.env.GITHUB_TOKEN = "ghs_write_token";
    process.env.OPENAI_API_KEY = "openai-secret";
    process.env.CODEX_API_KEY = "stale-codex-secret";
    process.env.ANTHROPIC_API_KEY = "anthropic-secret";
    process.env.GEMINI_API_KEY = "gemini-secret";
    process.env.VERBOO_API_KEY = "verboo-secret";
    for (const provider of codingAgentNames) {
      const invocation = buildCodingAgentInvocation(
        provider,
        { command: provider, argsPrefix: [] },
        {
          mode: "investigate",
          workspace: os.tmpdir(),
          prompt: "Complaint with ; rm -rf and $(whoami)",
          apiKey: `${provider}-byok-secret`,
        },
        { schema: "/fixed/schema.json", result: "/fixed/result.json" },
      );
      expect(invocation.args.join(" ")).not.toContain("Complaint");
      expect(invocation.stdin).toContain("Complaint with ; rm -rf");
      expect(invocation.env.MEND_GITHUB_APP_PRIVATE_KEY).toBeUndefined();
      expect(invocation.env.GITHUB_TOKEN).toBeUndefined();
      expect(invocation.env.HOME).toBe(path.dirname("/fixed/schema.json"));
      expect(invocation.env.HOME).not.toBe(invocation.cwd);
      if (provider === "verboo") {
        expect(invocation.env.VERBOO_API_KEY).toBe("verboo-byok-secret");
        expect(invocation.env.OPENAI_API_KEY).toBeUndefined();
        expect(invocation.env.CODEX_API_KEY).toBeUndefined();
        expect(invocation.env.ANTHROPIC_API_KEY).toBeUndefined();
        expect(invocation.env.GEMINI_API_KEY).toBeUndefined();
      }
      expect(
        getCodingAgentDefinition(provider).capabilities.structuredOutput,
      ).toBe(true);
      if (provider === "openai") {
        expect(invocation.env.CODEX_API_KEY).toBe("openai-byok-secret");
        expect(invocation.env.OPENAI_API_KEY).toBeUndefined();
        expect(invocation.args).toContain("read-only");
        expect(invocation.args).toContain("--skip-git-repo-check");
        expect(
          invocation.args.indexOf("--skip-git-repo-check"),
        ).toBeGreaterThan(invocation.args.indexOf("exec"));
      }
      if (provider === "google") expect(invocation.args).toContain("plan");
      if (provider === "anthropic" || provider === "verboo")
        expect(invocation.args).toContain("--tools=Read,Glob,Grep");
    }
  });

  it("normalizes direct, Claude/Verboo and Gemini structured envelopes", () => {
    const expected = {
      verdict: "confirmed",
      rootCause: "A missing guard.",
      evidence: [
        { kind: "reproduction", label: "Reproduced in the isolated copy" },
      ],
    };
    expect(normalizeCodingAgentReport(JSON.stringify(report))).toMatchObject(
      expected,
    );
    expect(
      normalizeCodingAgentReport(
        JSON.stringify({ structured_output: report, total_cost_usd: 0.01 }),
      ),
    ).toMatchObject(expected);
    expect(
      normalizeCodingAgentReport(
        JSON.stringify({ response: JSON.stringify(report) }),
      ),
    ).toMatchObject(expected);
    expect(() =>
      normalizeCodingAgentReport('{"summary":"missing verdict"}'),
    ).toThrow("structured report");
  });

  it("delegates Codex command isolation to the dedicated runner container", () => {
    process.env.MEND_CODEX_SANDBOX_MODE = "external";
    const invocation = buildCodingAgentInvocation(
      "openai",
      { command: "codex", argsPrefix: [] },
      {
        mode: "investigate",
        workspace: os.tmpdir(),
        prompt: "Inspect the repository.",
      },
      { schema: "/fixed/schema.json", result: "/fixed/result.json" },
    );

    expect(invocation.args).toContain("danger-full-access");
    expect(invocation.args).not.toContain("read-only");
  });

  it("runs in a disposable repository copy and returns normalized evidence and patch", async () => {
    const repo = await mkdtemp(path.join(os.tmpdir(), "mend-agent-test-"));
    let workspace = "";
    const runner: CliProcessRunner = async (invocation) => {
      if (invocation.args.includes("--version"))
        return { stdout: "claude 9.9.9", stderr: "", exitCode: 0 };
      workspace = invocation.cwd;
      expect(existsSync(invocation.env.CODEX_HOME!)).toBe(true);
      await writeFile(path.join(workspace, "README.md"), "after\n", "utf8");
      return {
        stdout: JSON.stringify({ structured_output: report, num_turns: 2 }),
        stderr: "",
        exitCode: 0,
      };
    };
    try {
      await writeFile(path.join(repo, "README.md"), "before\n", "utf8");
      const cli = new CodingAgentCli(runner, async () => ({
        command: "claude",
        argsPrefix: [],
      }));
      const result = await cli.run({
        provider: "anthropic",
        mode: "implement_fix",
        repoRoot: repo,
        prompt: "Investigate and fix the complaint.",
      });
      expect(result.provider).toBe("anthropic");
      expect(result.version).toBe("claude 9.9.9");
      expect(result.report.verdict).toBe("confirmed");
      expect(result.patch.files).toEqual([
        expect.objectContaining({
          relativePath: "README.md",
          status: "modified",
        }),
      ]);
      expect(result.metadata.num_turns).toBe(2);
      expect(await readFile(path.join(repo, "README.md"), "utf8")).toBe(
        "before\n",
      );
      expect(existsSync(workspace)).toBe(false);
    } finally {
      await rm(repo, { recursive: true, force: true });
    }
  });

  it("finishes verify deterministically when allowlisted checks pass", async () => {
    const repo = await mkdtemp(path.join(os.tmpdir(), "mend-verify-test-"));
    let agentCalled = false;
    try {
      await writeFile(
        path.join(repo, "package.json"),
        JSON.stringify({ scripts: { test: 'node -e "process.exit(0)"' } }),
        "utf8",
      );
      const cli = new CodingAgentCli(
        async () => {
          agentCalled = true;
          throw new Error("verify should not invoke the provider");
        },
        async () => ({ command: "claude", argsPrefix: [] }),
      );
      const result = await cli.run({
        provider: "anthropic",
        mode: "propose_fix",
        stage: "verify",
        repoRoot: repo,
        prompt: "Interpret the verification state.",
        checks: ["test"],
      });
      expect(agentCalled).toBe(false);
      expect(result.realModel).toBe("deterministic_checks");
      expect(result.metadata).toMatchObject({
        verification: "deterministic_checks",
        checksPassed: true,
      });
      expect(result.checks).toEqual([
        expect.objectContaining({ name: "test", passed: true }),
      ]);
    } finally {
      await rm(repo, { recursive: true, force: true });
    }
  });

  it("honors pre-cancellation without spawning a process", async () => {
    const controller = new AbortController();
    controller.abort();
    const invocation: CodingAgentInvocation = {
      command: process.execPath,
      argsPrefix: [],
      args: ["--version"],
      cwd: os.tmpdir(),
      env: process.env,
      stdin: "",
      timeoutMs: 1_000,
      signal: controller.signal,
    };
    await expect(runCliProcess(invocation)).rejects.toMatchObject({
      name: "AbortError",
    });
  });
});
