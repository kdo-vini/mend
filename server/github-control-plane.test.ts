import crypto from "node:crypto";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  GitHubAppTokenProvider,
  GitHubControlPlane,
  collectGitHubPublishFiles,
  createGitHubSetupState,
  githubInstallationUrl,
  probeDeploymentHealth,
  validateGitHubSetupCallback,
  verifyGitHubSetupState,
  verifyGitHubWebhookSignature,
  type GitHubFetch,
  type GitHubTokenProvider,
} from "./github-control-plane.js";

const repository = { owner: "mend-org", repo: "product", installationId: 42 };
const sha = (character: string) => character.repeat(40);

function jsonResponse(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("GitHub App control plane", () => {
  it("round-trips a short-lived setup state and validates the setup callback", () => {
    const secret = "a-long-random-setup-secret";
    const created = createGitHubSetupState(
      { workspaceId: "workspace-1", userId: "user-1", repositoryId: "repo-1" },
      secret,
    );
    expect(verifyGitHubSetupState(created.state, secret)).toMatchObject({
      workspaceId: "workspace-1",
      userId: "user-1",
      repositoryId: "repo-1",
      nonce: created.nonce,
    });
    expect(
      validateGitHubSetupCallback(
        {
          setup_action: "install",
          installation_id: "42",
          state: created.state,
        },
        secret,
        { workspaceId: "workspace-1", userId: "user-1" },
      ),
    ).toMatchObject({ installationId: 42, setupAction: "install" });
    expect(githubInstallationUrl("mend-fix", created.state)).toContain(
      "github.com/apps/mend-fix/installations/new",
    );
    expect(() => verifyGitHubSetupState(`${created.state}x`, secret)).toThrow(
      "invalid",
    );
    const expired = createGitHubSetupState(
      { workspaceId: "workspace-1", userId: "user-1" },
      secret,
      Date.now() - 1,
    );
    expect(() => verifyGitHubSetupState(expired.state, secret)).toThrow(
      "expired",
    );
  });

  it("verifies GitHub webhook signatures against the raw request body", () => {
    const body = Buffer.from('{"installation":{"id":42}}');
    const secret = "webhook-secret";
    const signature = `sha256=${crypto.createHmac("sha256", secret).update(body).digest("hex")}`;
    expect(verifyGitHubWebhookSignature(body, signature, secret)).toBe(true);
    expect(
      verifyGitHubWebhookSignature(Buffer.from("tampered"), signature, secret),
    ).toBe(false);
  });

  it("mints a repository- and permission-scoped installation token", async () => {
    const { privateKey } = crypto.generateKeyPairSync("rsa", {
      modulusLength: 2048,
      privateKeyEncoding: { type: "pkcs8", format: "pem" },
      publicKeyEncoding: { type: "spki", format: "pem" },
    });
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    const fetcher = (async (
      url: string | URL | Request,
      init?: RequestInit,
    ) => {
      calls.push({ url: String(url), init });
      return jsonResponse({
        token: "ghs_installation_only",
        expires_at: "2099-01-01T00:00:00Z",
      });
    }) as GitHubFetch;
    const provider = new GitHubAppTokenProvider(
      { appId: "123", privateKey, apiBaseUrl: "https://api.github.test" },
      fetcher,
    );
    const token = await provider.getToken({
      installationId: 42,
      repository: { owner: "mend-org", repo: "product" },
      permissions: { contents: "write", pull_requests: "write" },
    });
    expect(token.token).toBe("ghs_installation_only");
    expect(calls[0]?.url.endsWith("/app/installations/42/access_tokens")).toBe(
      true,
    );
    const headers = new Headers(calls[0]?.init?.headers);
    expect(headers.get("authorization")).toMatch(/^Bearer eyJ/);
    expect(headers.get("x-github-api-version")).toBe("2026-03-10");
    expect(JSON.parse(String(calls[0]?.init?.body))).toEqual({
      repositories: ["product"],
      permissions: { contents: "write", pull_requests: "write" },
    });
  });

  it("does not reuse a cached token between repositories with the same name", async () => {
    const { privateKey } = crypto.generateKeyPairSync("rsa", {
      modulusLength: 2048,
      privateKeyEncoding: { type: "pkcs8", format: "pem" },
      publicKeyEncoding: { type: "spki", format: "pem" },
    });
    const calls: string[] = [];
    const fetcher = (async (url: string | URL | Request) => {
      calls.push(String(url));
      return jsonResponse({
        token: `ghs_${calls.length}`,
        expires_at: "2099-01-01T00:00:00Z",
      });
    }) as GitHubFetch;
    const provider = new GitHubAppTokenProvider(
      { appId: "123", privateKey, apiBaseUrl: "https://api.github.test" },
      fetcher,
    );
    const first = await provider.getToken({
      installationId: 42,
      repository: { owner: "mend-org", repo: "product" },
      permissions: { contents: "read" },
    });
    const second = await provider.getToken({
      installationId: 42,
      repository: { owner: "other-org", repo: "product" },
      permissions: { contents: "read" },
    });
    expect(first.token).toBe("ghs_1");
    expect(second.token).toBe("ghs_2");
    expect(calls).toHaveLength(2);
  });

  it("publishes file content through Git Data before opening a draft PR", async () => {
    const tokenScopes: unknown[] = [];
    const tokens: GitHubTokenProvider = {
      async getToken(scope) {
        tokenScopes.push(scope);
        return {
          token: "ghs_control_plane",
          expiresAt: "2099-01-01T00:00:00Z",
        };
      },
    };
    const calls: Array<{
      url: string;
      method: string;
      body?: unknown;
      authorization: string | null;
    }> = [];
    const fetcher = (async (
      url: string | URL | Request,
      init?: RequestInit,
    ) => {
      const pathname = new URL(String(url)).pathname;
      const method = init?.method ?? "GET";
      calls.push({
        url: pathname,
        method,
        body: init?.body ? JSON.parse(String(init.body)) : undefined,
        authorization: new Headers(init?.headers).get("authorization"),
      });
      if (pathname.endsWith("/git/ref/heads/main"))
        return jsonResponse({ object: { sha: sha("a") } });
      if (pathname.endsWith(`/git/commits/${sha("a")}`))
        return jsonResponse({ tree: { sha: sha("b") } });
      if (pathname.endsWith("/git/blobs"))
        return jsonResponse({ sha: sha("c") }, 201);
      if (pathname.endsWith("/git/trees"))
        return jsonResponse({ sha: sha("d") }, 201);
      if (pathname.endsWith("/git/commits"))
        return jsonResponse({ sha: sha("e") }, 201);
      if (pathname.endsWith("/git/refs")) return jsonResponse({}, 201);
      if (pathname.endsWith("/pulls"))
        return jsonResponse(
          {
            number: 7,
            html_url: "https://github.com/mend-org/product/pull/7",
            head: { ref: "mend/run-1" },
            base: { ref: "main" },
            draft: true,
          },
          201,
        );
      if (pathname.endsWith("/pulls/7"))
        return jsonResponse({
          number: 7,
          html_url: "https://github.com/mend-org/product/pull/7",
          node_id: "PR_kwDOReadyForReview",
          head: { ref: "mend/run-1" },
          base: { ref: "main" },
          draft: true,
        });
      if (pathname === "/graphql")
        return jsonResponse({
          data: {
            markPullRequestReadyForReview: {
              pullRequest: {
                number: 7,
                url: "https://github.com/mend-org/product/pull/7",
                isDraft: false,
                headRefName: "mend/run-1",
                baseRefName: "main",
              },
            },
          },
        });
      throw new Error(`Unexpected GitHub request: ${method} ${pathname}`);
    }) as GitHubFetch;
    const github = new GitHubControlPlane(
      tokens,
      fetcher,
      "https://api.github.test",
    );
    const published = await github.publishBranch(repository, {
      base: "main",
      branch: "mend/run-1",
      expectedBaseSha: sha("a"),
      message: "fix: guard missing input",
      files: [
        {
          path: "src/fix.ts",
          status: "added",
          content: Buffer.from("export const fixed = true;\n").toString(
            "base64",
          ),
          contentEncoding: "base64",
        },
        { path: "src/old.ts", status: "deleted" },
      ],
    });
    const pull = await github.createDraftPullRequest(repository, {
      title: "Fix missing input guard",
      body: "Evidence and independent checks attached.",
      head: published.branch,
      base: "main",
    });
    const ready = await github.markPullRequestReadyForReview(
      repository,
      pull.number,
    );
    expect(published).toEqual({
      branch: "mend/run-1",
      commitSha: sha("e"),
      baseSha: sha("a"),
    });
    expect(pull).toMatchObject({ number: 7, draft: true });
    expect(ready).toMatchObject({ number: 7, draft: false });
    expect(calls.map((call) => call.url)).toEqual([
      "/repos/mend-org/product/git/ref/heads/main",
      `/repos/mend-org/product/git/commits/${sha("a")}`,
      "/repos/mend-org/product/git/blobs",
      "/repos/mend-org/product/git/trees",
      "/repos/mend-org/product/git/commits",
      "/repos/mend-org/product/git/refs",
      "/repos/mend-org/product/pulls",
      "/repos/mend-org/product/pulls/7",
      "/graphql",
    ]);
    expect(
      calls.every((call) => call.authorization === "Bearer ghs_control_plane"),
    ).toBe(true);
    expect(JSON.stringify(calls)).not.toContain("private-key");
    expect(tokenScopes).toContainEqual(
      expect.objectContaining({ permissions: { contents: "write" } }),
    );
  });

  it("collects approved local files for control-plane publication", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "mend-publish-test-"));
    try {
      await mkdir(path.join(root, "src"));
      await writeFile(
        path.join(root, "src", "fixed.ts"),
        "export const fixed = true;\n",
      );
      const files = await collectGitHubPublishFiles(root, [
        { relativePath: "src/fixed.ts", status: "modified" },
        { relativePath: "src/removed.ts", status: "deleted" },
      ]);
      expect(files[0]).toMatchObject({
        path: "src/fixed.ts",
        status: "modified",
        mode: "100644",
      });
      expect(
        Buffer.from(files[0]?.content as Uint8Array).toString("utf8"),
      ).toContain("fixed = true");
      expect(files[1]).toEqual({ path: "src/removed.ts", status: "deleted" });
      await expect(
        collectGitHubPublishFiles(root, [
          { relativePath: "../secret", status: "modified" },
        ]),
      ).rejects.toThrow("invalid");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("reconciles an existing open pull request by its owner-qualified head", async () => {
    let requested = "";
    const github = new GitHubControlPlane(
      {
        async getToken() {
          return {
            token: "ghs_control_plane",
            expiresAt: "2099-01-01T00:00:00Z",
          };
        },
      },
      (async (url: string | URL | Request) => {
        requested = String(url);
        return jsonResponse([
          {
            number: 12,
            html_url: "https://github.com/mend-org/product/pull/12",
            head: { ref: "ops/run-12" },
            base: { ref: "main" },
            draft: true,
          },
        ]);
      }) as GitHubFetch,
      "https://api.github.test",
    );
    await expect(
      github.findOpenPullRequest(repository, {
        head: "ops/run-12",
        base: "main",
      }),
    ).resolves.toEqual({
      number: 12,
      url: "https://github.com/mend-org/product/pull/12",
      head: "ops/run-12",
      base: "main",
      draft: true,
    });
    expect(requested).toContain(
      "/pulls?state=open&head=mend-org%3Aops%2Frun-12&base=main&per_page=10",
    );
  });

  it("dispatches only an opaque run id and allowlists deployment health origins", async () => {
    const tokens: GitHubTokenProvider = {
      async getToken() {
        return {
          token: "ghs_control_plane",
          expiresAt: "2099-01-01T00:00:00Z",
        };
      },
    };
    const github = new GitHubControlPlane(
      tokens,
      vi.fn(async () => new Response(null, { status: 204 })) as GitHubFetch,
      "https://api.github.test",
    );
    await expect(
      github.dispatchWorkflow(
        repository,
        "mend.yml",
        "main",
        "complaint; curl evil",
      ),
    ).rejects.toThrow("run id");
    const healthFetcher = vi.fn(
      async () => new Response("ok", { status: 200 }),
    );
    await expect(
      probeDeploymentHealth({
        url: "https://app.example.com/health",
        allowedOrigins: ["https://app.example.com"],
        fetcher: healthFetcher as GitHubFetch,
      }),
    ).resolves.toMatchObject({ healthy: true, status: 200 });
    expect(healthFetcher.mock.calls[0]?.[1]).toMatchObject({
      redirect: "manual",
    });
    await expect(
      probeDeploymentHealth({
        url: "https://metadata.internal/health",
        allowedOrigins: ["https://app.example.com"],
        fetcher: healthFetcher as GitHubFetch,
      }),
    ).rejects.toThrow("allowlisted");
  });
});
