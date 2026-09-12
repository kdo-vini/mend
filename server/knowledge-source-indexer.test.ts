import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  KnowledgeSourceIndexer,
  type KnowledgeSourceIndexStore,
} from "./knowledge-source-indexer.js";
import type { KnowledgeRepositorySyncJobPayload } from "./knowledge-sync.js";

const payload: KnowledgeRepositorySyncJobPayload = {
  stage: "knowledge_repository_sync",
  workspaceId: "10000000-0000-4000-8000-000000000001",
  sourceId: "10000000-0000-4000-8000-000000000002",
  repositoryId: "10000000-0000-4000-8000-000000000003",
  owner: "techne",
  repo: "pdv",
  installationId: 4,
  requestedSha: "a".repeat(40),
  deliveryId: "delivery",
};

describe("knowledge source indexer", () => {
  it("checks out and persists the exact requested revision", async () => {
    const store: KnowledgeSourceIndexStore = {
      begin: vi.fn(async () => ({
        includePatterns: ["docs/**/*.md"],
        excludePatterns: [],
      })),
      writeDocument: vi.fn(async () => undefined),
      complete: vi.fn(async () => undefined),
      fail: vi.fn(async () => undefined),
    };
    const github = {
      checkoutRepositoryArchive: vi.fn(
        async (_repository, ref: string, destination: string) => {
          expect(ref).toBe(payload.requestedSha);
          await mkdir(path.join(destination, "docs"), { recursive: true });
          await writeFile(
            path.join(destination, "docs", "guide.md"),
            "# Guide\n\nOpen settings.",
          );
        },
      ),
    };
    const embeddings = {
      embed: vi.fn(async () => [1]),
      embedMany: vi.fn(async (values: readonly string[]) =>
        values.map(() => [1]),
      ),
    };
    await new KnowledgeSourceIndexer(github, store, embeddings).process(
      payload,
    );
    expect(store.writeDocument).toHaveBeenCalledWith(
      payload,
      expect.objectContaining({
        relativePath: "docs/guide.md",
        chunks: expect.any(Array),
      }),
    );
    expect(store.complete).toHaveBeenCalledOnce();
    expect(store.fail).not.toHaveBeenCalled();
  });

  it("records a stable failure and never completes a partial revision", async () => {
    const store: KnowledgeSourceIndexStore = {
      begin: async () => ({ includePatterns: [], excludePatterns: [] }),
      writeDocument: async () => undefined,
      complete: vi.fn(async () => undefined),
      fail: vi.fn(async () => undefined),
    };
    const github = {
      checkoutRepositoryArchive: vi.fn(async () => {
        throw new Error("github_archive_failed: token=secret");
      }),
    };
    await expect(
      new KnowledgeSourceIndexer(github, store).process(payload),
    ).rejects.toThrow("github_archive_failed");
    expect(store.fail).toHaveBeenCalledWith(payload, "github_archive_failed");
    expect(store.complete).not.toHaveBeenCalled();
  });
});
