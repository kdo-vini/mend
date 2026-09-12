import { describe, expect, it } from "vitest";
import {
  knowledgeRepositorySyncJobPayloadSchema,
  knowledgeSyncDedupeKey,
  sourceFreshness,
} from "./knowledge-sync.js";

describe("knowledge source state", () => {
  it("requires exact workspace-scoped job data", () => {
    const payload = knowledgeRepositorySyncJobPayloadSchema.parse({
      stage: "knowledge_repository_sync",
      workspaceId: "10000000-0000-4000-8000-000000000001",
      sourceId: "10000000-0000-4000-8000-000000000002",
      repositoryId: "10000000-0000-4000-8000-000000000003",
      owner: "techne",
      repo: "zelo",
      installationId: 1,
      requestedSha: "a".repeat(40),
      deliveryId: "delivery",
    });
    expect(knowledgeSyncDedupeKey(payload)).toContain(payload.requestedSha);
    expect(() =>
      knowledgeRepositorySyncJobPayloadSchema.parse({
        ...payload,
        requestedSha: "main",
      }),
    ).toThrow();
  });

  it("derives freshness from observed, indexed, and production revisions", () => {
    const source = {
      id: "s",
      workspaceId: "w",
      repositoryId: "r",
      refName: "main",
      syncMode: "event" as const,
      syncState: "ready" as const,
      indexedSha: "a",
      activeSha: "a",
    };
    expect(sourceFreshness(source)).toBe("current");
    expect(sourceFreshness({ ...source, syncState: "running" })).toBe(
      "current",
    );
    expect(sourceFreshness({ ...source, observedSha: "b" })).toBe("stale");
    expect(sourceFreshness({ ...source, activeSha: "b" })).toBe("stale");
    expect(sourceFreshness({ ...source, activeSha: undefined })).toBe("empty");
  });
});
