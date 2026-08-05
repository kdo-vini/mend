import { describe, expect, it, vi } from "vitest";

const { apiRequest } = vi.hoisted(() => ({
  apiRequest: vi.fn().mockResolvedValue({}),
}));

vi.mock("./transport", async () => ({
  ...(await vi.importActual<typeof import("./transport")>("./transport")),
  apiRequest,
  mendApiBaseUrl: "https://mend.test",
}));

import { updateLiveCodexRun } from "./live-actions";

describe("live Codex run actions", () => {
  it.each(["cancel", "approve", "reject", "publish", "deploy"] as const)(
    "uses the backend coding-runs route for %s",
    async (action) => {
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
    },
  );
});
