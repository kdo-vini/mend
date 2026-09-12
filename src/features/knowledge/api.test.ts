import { beforeEach, describe, expect, it, vi } from "vitest";

const { apiRequest } = vi.hoisted(() => ({
  apiRequest: vi.fn(),
}));

vi.mock("../../api/transport", () => ({ apiRequest }));

import { loadKnowledgeArticles } from "./api";

describe("knowledge API", () => {
  beforeEach(() => {
    apiRequest.mockReset();
    apiRequest.mockResolvedValue({ data: [] });
  });

  it("requests only customer-facing manual articles for the content view", async () => {
    await loadKnowledgeArticles("workspace-1");

    expect(apiRequest).toHaveBeenCalledWith(
      "/api/knowledge?limit=200&managedBySync=false",
      {},
      "workspace-1",
    );
  });
});
