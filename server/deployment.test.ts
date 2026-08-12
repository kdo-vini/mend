import { describe, expect, it, vi } from "vitest";
import { DokployDeployment } from "./deployment.js";

describe("Dokploy deployment recovery", () => {
  it("reconciles the deployment created for the same run and commit", async () => {
    const fetcher = vi.fn(async (url: string | URL) => {
      expect(String(url)).toContain(
        "/deployment.all?applicationId=application-1",
      );
      return new Response(
        JSON.stringify([
          {
            deploymentId: "deployment-other",
            title: "Mend Agent other-run",
            description: "Approved main at other-sha",
          },
          {
            deploymentId: "deployment-1",
            title: "Mend Agent run-1",
            description: "Approved main at commit-sha",
            url: "https://app.example.com",
          },
        ]),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    });
    const deployment = new DokployDeployment(
      "https://dokploy.example/api",
      "secret",
      "application-1",
      fetcher as typeof fetch,
    );

    await expect(
      deployment.reconcile({
        workspaceId: "workspace-1",
        runId: "run-1",
        branch: "main",
        commitSha: "commit-sha",
        idempotencyKey: "deploy-1",
      }),
    ).resolves.toEqual({
      provider: "dokploy",
      reference: "deployment-1",
      url: "https://app.example.com",
    });
  });
});
