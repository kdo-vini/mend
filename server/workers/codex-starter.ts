import { agentMaxRuntimeMs } from "../agent-runtime.js";
import { CodexService } from "../codex-service.js";
import type { SafeTool } from "../codex.js";
import type { AgentCredentialPort } from "../contracts/api-ports.js";
import type {
  LiveWorkerCodexStarter,
  LiveWorkerCodexStarterInput,
  LiveWorkerSupabaseClient,
} from "../live-worker.js";
import { SupabaseCodexRunStore } from "../adapters/supabase/coding-runs.js";
import { SupabaseRepositoryAdapter } from "../adapters/supabase/repositories.js";
import { delay } from "./live-worker-shared.js";
export function repositorySafeTools(
  allowedCommands: readonly string[] = [],
): SafeTool[] {
  return (["lint", "test", "build"] as const)
    .filter((name) => allowedCommands.includes(name))
    .map((name) => ({ kind: "command", name }));
}

export class SupabaseCodexStarter implements LiveWorkerCodexStarter {
  constructor(
    private readonly client: LiveWorkerSupabaseClient,
    private readonly agentCredentials?: AgentCredentialPort,
  ) {}

  private async findExistingRun(
    workspaceId: string,
    issueId: string,
    mode: NonNullable<LiveWorkerCodexStarterInput["mode"]>,
  ) {
    return this.client
      .from("agent_runs")
      .select("id, status")
      .eq("workspace_id", workspaceId)
      .eq("issue_id", issueId)
      .eq("mode", mode)
      .in("status", ["queued", "running", "completed", "approved"])
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
  }

  private async waitForTerminalRun(
    store: SupabaseCodexRunStore,
    runId: string,
  ): Promise<{
    run: NonNullable<Awaited<ReturnType<SupabaseCodexRunStore["getRun"]>>>;
  }> {
    for (let attempt = 0; attempt < 240; attempt += 1) {
      const persisted = await store.getRun(runId);
      if (!persisted) throw new Error("Existing coding run disappeared");
      if (persisted.status !== "queued" && persisted.status !== "running")
        return { run: persisted };
      await delay(5_000);
    }
    throw new Error("Existing coding run did not reach a terminal state");
  }

  async start(input: LiveWorkerCodexStarterInput) {
    const mode = input.mode ?? "investigate";
    const store = new SupabaseCodexRunStore(this.client);
    const existing = await this.findExistingRun(
      input.workspaceId,
      input.issueId,
      mode,
    );
    if (existing.error)
      throw new Error(`supabase:agent_runs:existing:${existing.error.message}`);
    const recoverExisting = async (candidate: typeof existing.data) => {
      if (!candidate) return undefined;
      const runId = String(candidate.id);
      if (candidate.status === "completed" || candidate.status === "approved") {
        const persisted = await store.getRun(runId);
        if (!persisted)
          throw new Error("Existing coding run could not be recovered");
        return {
          runId,
          completion: Promise.resolve({ run: persisted }),
        };
      }
      return {
        runId,
        completion: this.waitForTerminalRun(store, runId),
      };
    };
    const recovered = await recoverExisting(existing.data);
    if (recovered) return recovered;

    const repositoryRow = await this.client
      .from("repositories")
      .select("id")
      .eq("workspace_id", input.workspaceId)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    if (repositoryRow.error)
      throw new Error(
        `supabase:repositories:auto_fix:${repositoryRow.error.message}`,
      );
    const repositoryId = repositoryRow.data?.id;
    if (!repositoryId)
      throw new Error("No repository is configured for this workspace");

    const repositories = new SupabaseRepositoryAdapter(this.client);
    const repository = await repositories.getRepository(
      input.workspaceId,
      String(repositoryId),
    );
    if (!repository) throw new Error("Repository is unavailable");
    if (repository.executionPlane === "github_actions")
      throw new Error(
        "github_actions_execution_not_configured: use dokploy until the GitHub Actions runner is connected",
      );
    const commands = repositorySafeTools(repository.allowedCommands);
    const service = new CodexService({
      repositories,
      runs: store,
      ...(this.agentCredentials
        ? {
            agentCredentialResolver: async (
              workspaceId: string,
              requestedProvider: Parameters<
                NonNullable<AgentCredentialPort["resolve"]>
              >[2],
            ) =>
              (
                await this.agentCredentials!.resolve(
                  workspaceId,
                  "agent",
                  requestedProvider,
                )
              )?.apiKey ?? null,
          }
        : {}),
    });
    try {
      const handle = await service.start({
        workspaceId: input.workspaceId,
        issueId: input.issueId,
        repositoryId: String(repositoryId),
        issueIdentifier: input.issueIdentifier,
        issueTitle: input.issueTitle,
        mode,
        maxRuntimeMs: agentMaxRuntimeMs(),
        tools: commands,
        context: {
          issue: {
            id: input.issueId,
            identifier: input.issueIdentifier,
            title: input.issueTitle,
            summary: input.summary,
            description: `Customer report:\n${input.customerMessage}`,
          },
          conversation: {
            summary: input.summary,
            messages: [{ direction: "inbound", text: input.customerMessage }],
          },
        },
      });
      return { runId: handle.runId, completion: handle.completion };
    } catch (error) {
      // The partial unique index protects the check-then-insert race between
      // workers. Recover the winner instead of surfacing a duplicate-run
      // error to the customer loop.
      if (
        !/duplicate|unique|agent_runs_active_issue_mode_idx/i.test(
          String(error),
        )
      )
        throw error;
      const retry = await this.findExistingRun(
        input.workspaceId,
        input.issueId,
        mode,
      );
      if (retry.error)
        throw new Error(
          `supabase:agent_runs:existing_retry:${retry.error.message}`,
        );
      const winner = await recoverExisting(retry.data);
      if (winner) return winner;
      throw error;
    }
  }
}
