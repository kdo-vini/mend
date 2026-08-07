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
  disconnectLiveGitHub,
  getLiveGitHubConnection,
  listLiveGitHubRepositories,
  removeLiveRepository,
  startLiveGitHubSetup,
  startLiveGitHubWorkspaceSetup,
  updateLiveRepository,
  updateLiveAgentRun,
} from "./live-actions";

describe("live Agent run actions", () => {
  it.each([
    "cancel",
    "approve",
    "reject",
    "publish",
    "merge",
    "deploy",
    "health",
  ] as const)("uses the backend agent-runs route for %s", async (action) => {
    apiRequest.mockClear();

    await updateLiveAgentRun({
      workspaceId: "workspace-1",
      runId: "run-1",
      action,
    });

    expect(apiRequest).toHaveBeenCalledWith(
      `/api/agent-runs/run-1/${action}`,
      { method: "POST", body: JSON.stringify({}) },
      "workspace-1",
    );
  });
});

describe("repository execution settings", () => {
  it("sends the selected Agent provider and GitHub target", async () => {
    apiRequest.mockResolvedValueOnce({
      id: "repo-1",
      name: "Support app",
      defaultBranch: "main",
      agentProvider: "verboo",
      executionPlane: "dokploy",
      githubOwner: "mend",
      githubRepo: "support",
    });

    await createLiveRepository({
      workspaceId: "workspace-1",
      name: "Support app",
      defaultBranch: "main",
      agentProvider: "verboo",
      executionPlane: "dokploy",
      githubOwner: "mend",
      githubRepo: "support",
    });

    expect(apiRequest).toHaveBeenCalledWith(
      "/api/repositories",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          name: "Support app",
          defaultBranch: "main",
          agentProvider: "verboo",
          executionPlane: "dokploy",
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

  it("supports repository edits and removal through workspace-scoped routes", async () => {
    apiRequest.mockResolvedValueOnce({
      id: "repo-1",
      name: "Updated app",
      defaultBranch: "main",
      agentProvider: "openai",
      executionPlane: "dokploy",
    });
    await updateLiveRepository({
      workspaceId: "workspace-1",
      repositoryId: "repo-1",
      name: "Updated app",
    });
    expect(apiRequest).toHaveBeenCalledWith(
      "/api/repositories/repo-1",
      expect.objectContaining({ method: "PATCH" }),
      "workspace-1",
    );

    await removeLiveRepository({
      workspaceId: "workspace-1",
      repositoryId: "repo-1",
    });
    expect(apiRequest).toHaveBeenCalledWith(
      "/api/repositories/repo-1",
      { method: "DELETE" },
      "workspace-1",
    );
  });

  it("loads the workspace GitHub account and starts or ends its connection", async () => {
    apiRequest
      .mockResolvedValueOnce({ connected: true, owner: "kdo-vini" })
      .mockResolvedValueOnce({
        data: [{ owner: "kdo-vini", repo: "mend", defaultBranch: "main" }],
      })
      .mockResolvedValueOnce({
        installationUrl: "https://github.com/apps/mend/installations/new",
      })
      .mockResolvedValueOnce({ disconnected: true });

    await expect(getLiveGitHubConnection("workspace-1")).resolves.toEqual({
      connected: true,
      owner: "kdo-vini",
    });
    await expect(listLiveGitHubRepositories("workspace-1")).resolves.toEqual([
      { owner: "kdo-vini", repo: "mend", defaultBranch: "main" },
    ]);
    await expect(startLiveGitHubWorkspaceSetup("workspace-1")).resolves.toEqual(
      expect.objectContaining({ installationUrl: expect.any(String) }),
    );
    await expect(disconnectLiveGitHub("workspace-1")).resolves.toBeUndefined();
    expect(apiRequest).toHaveBeenLastCalledWith(
      "/api/github/connection",
      { method: "DELETE" },
      "workspace-1",
    );
  });
});
