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
      writeDocuments: vi.fn(async () => undefined),
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
    expect(store.writeDocuments).toHaveBeenCalledWith(payload, [
      expect.objectContaining({
        relativePath: "docs/guide.md",
        chunks: expect.any(Array),
      }),
    ]);
    expect(store.complete).toHaveBeenCalledOnce();
    expect(store.fail).not.toHaveBeenCalled();
  });

  it("batches embeddings across repository documents", async () => {
    const store: KnowledgeSourceIndexStore = {
      begin: vi.fn(async () => ({
        includePatterns: ["docs/**/*.md"],
        excludePatterns: [],
      })),
      writeDocuments: vi.fn(async () => undefined),
      complete: vi.fn(async () => undefined),
      fail: vi.fn(async () => undefined),
    };
    const github = {
      checkoutRepositoryArchive: vi.fn(
        async (_repository, _ref: string, destination: string) => {
          await mkdir(path.join(destination, "docs"), { recursive: true });
          await writeFile(path.join(destination, "docs", "one.md"), "One");
          await writeFile(path.join(destination, "docs", "two.md"), "Two");
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

    expect(embeddings.embedMany).toHaveBeenCalledTimes(1);
    expect(embeddings.embedMany).toHaveBeenCalledWith(["One", "Two"]);
    expect(store.writeDocuments).toHaveBeenCalledTimes(1);
    expect(store.writeDocuments).toHaveBeenCalledWith(
      payload,
      expect.arrayContaining([
        expect.objectContaining({ relativePath: "docs/one.md" }),
        expect.objectContaining({ relativePath: "docs/two.md" }),
      ]),
    );
  });

  it("reuses unchanged chunk embeddings without another provider call", async () => {
    const reused = [0.5];
    const store: KnowledgeSourceIndexStore = {
      begin: vi.fn(async () => ({
        includePatterns: ["docs/**/*.md"],
        excludePatterns: [],
      })),
      findReusableEmbeddings: vi.fn(
        async (_payload, hashes) => new Map([[hashes[0]!, reused]]),
      ),
      writeDocuments: vi.fn(async () => undefined),
      complete: vi.fn(async () => undefined),
      fail: vi.fn(async () => undefined),
    };
    const github = {
      checkoutRepositoryArchive: vi.fn(
        async (_repository, _ref: string, destination: string) => {
          await mkdir(path.join(destination, "docs"), { recursive: true });
          await writeFile(path.join(destination, "docs", "same.md"), "Same");
        },
      ),
    };
    const embeddings = {
      embed: vi.fn(async () => [1]),
      embedMany: vi.fn(async () => [[1]]),
    };

    await new KnowledgeSourceIndexer(github, store, embeddings).process(
      payload,
    );

    expect(embeddings.embedMany).not.toHaveBeenCalled();
    expect(store.writeDocuments).toHaveBeenCalledWith(payload, [
      expect.objectContaining({
        chunks: [expect.objectContaining({ embedding: reused })],
      }),
    ]);
    expect(store.complete).toHaveBeenCalledWith(
      payload,
      expect.objectContaining({ chunksReused: 1, embeddingInputCount: 0 }),
    );
  });

  it("embeds each new content hash once, including duplicates in later batches", async () => {
    const store: KnowledgeSourceIndexStore = {
      begin: vi.fn(async () => ({
        includePatterns: ["docs/**/*.md"],
        excludePatterns: [],
      })),
      findReusableEmbeddings: vi.fn(async () => new Map()),
      writeDocuments: vi.fn(async () => undefined),
      complete: vi.fn(async () => undefined),
      fail: vi.fn(async () => undefined),
    };
    const github = {
      checkoutRepositoryArchive: vi.fn(
        async (_repository, _ref: string, destination: string) => {
          await mkdir(path.join(destination, "docs"), { recursive: true });
          await Promise.all(
            Array.from({ length: 258 }, (_, index) =>
              writeFile(
                path.join(
                  destination,
                  "docs",
                  `${String(index).padStart(3, "0")}.md`,
                ),
                index === 257 ? "Repeated" : `Document ${index}`,
              ),
            ),
          );
          await writeFile(path.join(destination, "docs", "000.md"), "Repeated");
        },
      ),
    };
    let activeCalls = 0;
    let maximumConcurrency = 0;
    const embeddedInputs: string[] = [];
    const embeddings = {
      embed: vi.fn(async () => [1]),
      embedMany: vi.fn(async (values: readonly string[]) => {
        activeCalls += 1;
        maximumConcurrency = Math.max(maximumConcurrency, activeCalls);
        embeddedInputs.push(...values);
        await new Promise((resolve) => setTimeout(resolve, 5));
        activeCalls -= 1;
        return values.map((value) => [value.length]);
      }),
    };

    await new KnowledgeSourceIndexer(github, store, embeddings).process(
      payload,
    );

    expect(maximumConcurrency).toBeGreaterThan(1);
    expect(embeddedInputs.filter((value) => value === "Repeated")).toHaveLength(
      1,
    );
    expect(store.complete).toHaveBeenCalledWith(
      payload,
      expect.objectContaining({
        chunksWritten: 258,
        chunksReused: 1,
        embeddingInputCount: 257,
      }),
    );
  });

  it("records a stable failure and never completes a partial revision", async () => {
    const store: KnowledgeSourceIndexStore = {
      begin: async () => ({ includePatterns: [], excludePatterns: [] }),
      writeDocuments: async () => undefined,
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
