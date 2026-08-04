import { describe, expect, it, vi } from "vitest";
import {
  resolveCodexModelConfig,
  runOpenAiCodexLoop,
  type OpenAiCodexClient,
} from "./codex-openai.js";

function context(
  mode: "investigate" | "propose_fix" | "implement_fix" = "investigate",
) {
  return {
    workspaceId: "workspace-1",
    issueId: "issue-1",
    issueIdentifier: "TEC-1",
    issueTitle: "Checkout fails",
    mode,
    context: { issue: { id: "issue-1", title: "Checkout fails" } },
    allowedCommands: ["test" as const],
  };
}

describe("OpenAI Codex agent", () => {
  it("runs the Responses function-call loop with only the safe tool contract", async () => {
    const calls: Array<{
      model: string;
      tools: string[];
      input: readonly unknown[];
    }> = [];
    const client: OpenAiCodexClient = {
      responses: {
        async create(input) {
          calls.push({
            model: input.model,
            tools: input.tools.map((tool) => tool.name),
            input: input.input,
          });
          if (calls.length === 1)
            return {
              output: [
                {
                  type: "function_call",
                  name: "run_command",
                  call_id: "call-1",
                  arguments: '{"name":"test"}',
                },
              ],
            };
          return { output: [], output_text: "Investigation complete." };
        },
      },
    };
    const executeTool = vi.fn(async () => ({
      kind: "command" as const,
      name: "test" as const,
      output: "passed",
      exitCode: 0,
    }));

    const result = await runOpenAiCodexLoop({
      client,
      context: context(),
      executeTool,
    });

    expect(result).toMatchObject({
      provider: "openai",
      resolvedModel: "gpt-5.6-luna",
      fallbackUsed: false,
      turns: 2,
      finalText: "Investigation complete.",
    });
    expect(result.tools).toEqual([
      { kind: "command", name: "test", output: "passed", exitCode: 0 },
    ]);
    expect(executeTool).toHaveBeenCalledWith({ kind: "command", name: "test" });
    expect(calls[0]?.tools).toEqual([
      "list_files",
      "read_file",
      "git_status",
      "get_diff",
      "run_command",
    ]);
    expect(
      calls[1]?.input.some(
        (item) =>
          typeof item === "object" &&
          item !== null &&
          "type" in item &&
          item.type === "function_call_output",
      ),
    ).toBe(true);
  });

  it("allows writes only in implement_fix and exposes no write tool otherwise", async () => {
    const client: OpenAiCodexClient = {
      responses: {
        async create(input) {
          return {
            output: [],
            output_text: input.tools.map((tool) => tool.name).join(","),
          };
        },
      },
    };
    const investigate = await runOpenAiCodexLoop({
      client,
      context: context("investigate"),
      executeTool: vi.fn(),
    });
    const implement = await runOpenAiCodexLoop({
      client,
      context: context("implement_fix"),
      executeTool: vi.fn(),
    });
    expect(investigate.finalText).not.toContain("write_file");
    expect(implement.finalText).toContain("write_file");
  });

  it("retries once with the explicit env fallback when the configured model is rejected", async () => {
    const calls: string[] = [];
    const client: OpenAiCodexClient = {
      responses: {
        async create(input) {
          calls.push(input.model);
          if (calls.length === 1)
            throw Object.assign(new Error("The model does not exist"), {
              status: 400,
              code: "model_not_found",
            });
          return { output: [], output_text: "fallback complete" };
        },
      },
    };
    const fallback = vi.fn();
    const result = await runOpenAiCodexLoop({
      client,
      context: context(),
      options: {
        model: "private-or-unsupported",
        fallbackModel: "gpt-5",
        reasoningEffort: "xhigh",
        fallbackReasoningEffort: "high",
      },
      executeTool: vi.fn(),
      callbacks: { onModelFallback: fallback },
    });

    expect(calls).toEqual(["private-or-unsupported", "gpt-5"]);
    expect(fallback).toHaveBeenCalledWith(
      expect.objectContaining({ from: "private-or-unsupported", to: "gpt-5" }),
    );
    expect(result).toMatchObject({
      resolvedModel: "gpt-5",
      fallbackUsed: true,
      reasoningEffort: "high",
    });
  });

  it("forwards cancellation to the SDK request instead of waiting for the model timeout", async () => {
    const controller = new AbortController();
    let markStarted!: () => void;
    const started = new Promise<void>((resolve) => {
      markStarted = resolve;
    });
    const client: OpenAiCodexClient = {
      responses: {
        async create(_input, options) {
          markStarted();
          return new Promise((_resolve, reject) => {
            options?.signal?.addEventListener(
              "abort",
              () => reject(new Error("request aborted")),
              { once: true },
            );
          });
        },
      },
    };
    const pending = runOpenAiCodexLoop({
      client,
      context: context(),
      executeTool: vi.fn(),
      signal: controller.signal,
    });
    await started;
    controller.abort();
    await expect(pending).rejects.toThrow("request aborted");
  });

  it("keeps the model and fallback settings explicit and bounded when read from env", () => {
    expect(
      resolveCodexModelConfig({
        CODEX_MODEL: "custom-codex",
        CODEX_FALLBACK_MODEL: "gpt-5",
        CODEX_REASONING_EFFORT: "high",
        CODEX_FALLBACK_REASONING_EFFORT: "medium",
        CODEX_MAX_TURNS: "99",
      }),
    ).toEqual({
      configuredModel: "custom-codex",
      fallbackModel: "gpt-5",
      fallbackEnabled: true,
      reasoningEffort: "high",
      fallbackReasoningEffort: "medium",
      maxTurns: 32,
    });
  });
});
