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
  openai: process.env.OPENAI_API_KEY,
  anthropic: process.env.ANTHROPIC_API_KEY,
  google: process.env.GEMINI_API_KEY,
  verboo: process.env.VERBOO_API_KEY,
};

afterEach(() => {
  if (originalGitHubKey === undefined)
    delete process.env.MEND_GITHUB_APP_PRIVATE_KEY;
  else process.env.MEND_GITHUB_APP_PRIVATE_KEY = originalGitHubKey;
  if (originalGitHubToken === undefined) delete process.env.GITHUB_TOKEN;
  else process.env.GITHUB_TOKEN = originalGitHubToken;
  for (const [key, value] of Object.entries(originalProviderKeys)) {
    const envKey =
      key === "openai"
        ? "OPENAI_API_KEY"
        : key === "anthropic"
          ? "ANTHROPIC_API_KEY"
          : key === "google"
            ? "GEMINI_API_KEY"
            : "VERBOO_API_KEY";
    if (value === undefined) delete process.env[envKey];
    else process.env[envKey] = value;
  }
});

describe("coding agent CLI boundary", () => {
  it("builds fixed argv and capability policies for every supported CLI", () => {
    process.env.MEND_GITHUB_APP_PRIVATE_KEY = "write-private-key";
    process.env.GITHUB_TOKEN = "ghs_write_token";
    process.env.OPENAI_API_KEY = "openai-secret";
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
        },
        { schema: "/fixed/schema.json", result: "/fixed/result.json" },
      );
      expect(invocation.args.join(" ")).not.toContain("Complaint");
      expect(invocation.stdin).toContain("Complaint with ; rm -rf");
      expect(invocation.env.MEND_GITHUB_APP_PRIVATE_KEY).toBeUndefined();
      expect(invocation.env.GITHUB_TOKEN).toBeUndefined();
      if (provider === "verboo") {
        expect(invocation.env.VERBOO_API_KEY).toBe("verboo-secret");
        expect(invocation.env.OPENAI_API_KEY).toBeUndefined();
        expect(invocation.env.ANTHROPIC_API_KEY).toBeUndefined();
        expect(invocation.env.GEMINI_API_KEY).toBeUndefined();
      }
      expect(
        getCodingAgentDefinition(provider).capabilities.structuredOutput,
      ).toBe(true);
      if (provider === "openai") expect(invocation.args).toContain("read-only");
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

  it("runs in a disposable repository copy and returns normalized evidence and patch", async () => {
    const repo = await mkdtemp(path.join(os.tmpdir(), "mend-agent-test-"));
    let workspace = "";
    const runner: CliProcessRunner = async (invocation) => {
      if (invocation.args.includes("--version"))
        return { stdout: "claude 9.9.9", stderr: "", exitCode: 0 };
      workspace = invocation.cwd;
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
