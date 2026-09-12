import { mkdtemp, mkdir, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { extractRepositoryKnowledge } from "./knowledge-source-extractor.js";

describe("repository knowledge extraction", () => {
  it("indexes allowlisted text and excludes secrets, binaries and dependencies", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "mend-knowledge-"));
    await mkdir(path.join(root, "docs"), { recursive: true });
    await mkdir(path.join(root, "node_modules", "pkg"), { recursive: true });
    await writeFile(
      path.join(root, "README.md"),
      "# Product\n\nCustomer instructions.",
    );
    await writeFile(
      path.join(root, "docs", "guide.md"),
      "# Guide\n\nOpen settings.",
    );
    await writeFile(path.join(root, ".env"), "API_KEY=secret");
    await writeFile(
      path.join(root, "node_modules", "pkg", "README.md"),
      "dependency",
    );
    await writeFile(
      path.join(root, "docs", "binary.md"),
      Buffer.from([0, 1, 2]),
    );

    const result = await extractRepositoryKnowledge(root);

    expect(result.documents.map((item) => item.relativePath)).toEqual([
      "docs/guide.md",
      "README.md",
    ]);
    expect(result.documents[0]).toMatchObject({
      title: "Guide",
      contentHash: expect.stringMatching(/^[a-f0-9]{64}$/),
    });
  });

  it("does not follow a symlink outside the checkout", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "mend-knowledge-root-"));
    const outside = await mkdtemp(
      path.join(tmpdir(), "mend-knowledge-outside-"),
    );
    await mkdir(path.join(root, "docs"), { recursive: true });
    await writeFile(path.join(outside, "secret.md"), "private customer export");
    await symlink(
      outside,
      path.join(root, "docs", "external"),
      process.platform === "win32" ? "junction" : "dir",
    );

    await expect(extractRepositoryKnowledge(root)).resolves.toMatchObject({
      documents: [],
    });
  });

  it("enforces file and total byte limits", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "mend-knowledge-limit-"));
    await mkdir(path.join(root, "docs"), { recursive: true });
    await writeFile(path.join(root, "docs", "large.md"), "x".repeat(101));
    const result = await extractRepositoryKnowledge(root, {
      maxFileBytes: 100,
    });
    expect(result.documents).toEqual([]);
    expect(result.filesSkipped).toBe(1);
  });

  it("indexes Svelte product screens selected by a repository source", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "mend-knowledge-svelte-"));
    await mkdir(path.join(root, "src", "routes"), { recursive: true });
    await writeFile(
      path.join(root, "src", "routes", "+page.svelte"),
      "<h1>Caixa</h1>\n<p>Registre uma venda e escolha a forma de pagamento.</p>",
    );

    const result = await extractRepositoryKnowledge(root, {
      includePatterns: ["src/**/*.svelte"],
    });

    expect(result.documents.map((item) => item.relativePath)).toEqual([
      "src/routes/+page.svelte",
    ]);
  });
});
