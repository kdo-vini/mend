import { describe, expect, it, vi } from "vitest";

const { apiRequest } = vi.hoisted(() => ({
  apiRequest: vi.fn().mockResolvedValue({}),
}));

vi.mock("./transport", async () => ({
  ...(await vi.importActual<typeof import("./transport")>("./transport")),
  apiRequest,
  mendApiBaseUrl: "https://mend.test",
}));

import {
  createLiveRepository,
  startLiveGitHubSetup,
  updateLiveCodexRun,
} from "./live-actions";

describe("live Codex run actions", () => {
  it.each([
    "cancel",
    "approve",
    "reject",
    "publish",
    "merge",
    "deploy",
    "health",
  ] as const)("uses the backend coding-runs route for %s", async (action) => {
    apiRequest.mockClear();

    await updateLiveCodexRun({
      workspaceId: "workspace-1",
      runId: "run-1",
      action,
    });

    expect(apiRequest).toHaveBeenCalledWith(
      `/api/coding-runs/run-1/${action}`,
      { method: "POST", body: JSON.stringify({}) },
      "workspace-1",
    );
  });
});

describe("repository execution settings", () => {
  it("sends the selected CLI agent, local execution and GitHub target", async () => {
    apiRequest.mockResolvedValueOnce({
      id: "repo-1",
      name: "Support app",
      defaultBranch: "main",
      agentProvider: "verboo",
      executionPlane: "local_cli",
      githubOwner: "mend",
      githubRepo: "support",
    });

    await createLiveRepository({
      workspaceId: "workspace-1",
      name: "Support app",
      localPath: "C:\\work\\support",
      defaultBranch: "main",
      agentProvider: "verboo",
      executionPlane: "local_cli",
      githubOwner: "mend",
      githubRepo: "support",
    });

    expect(apiRequest).toHaveBeenCalledWith(
      "/api/repositories",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          name: "Support app",
          localPath: "C:\\work\\support",
          defaultBranch: "main",
          agentProvider: "verboo",
          executionPlane: "local_cli",
          githubOwner: "mend",
          githubRepo: "support",
        }),
      }),
      "workspace-1",
    );
  });

  it("starts the signed GitHub App installation flow after repository creation", async () => {
    apiRequest.mockResolvedValueOnce({
      installationUrl: "https://github.com/apps/mend/installations/new",
    });
    await expect(
      startLiveGitHubSetup({
        workspaceId: "workspace-1",
        repositoryId: "repo-1",
      }),
    ).resolves.toMatchObject({
      installationUrl: expect.stringContaining("github.com"),
    });
    expect(apiRequest).toHaveBeenCalledWith(
      "/api/repositories/repo-1/github/setup",
      { method: "POST", body: JSON.stringify({}) },
      "workspace-1",
    );
  });
});
