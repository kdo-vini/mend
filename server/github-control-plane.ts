import crypto from "node:crypto";
import {
  lstat,
  mkdir,
  readFile,
  realpath,
  rm,
  writeFile,
} from "node:fs/promises";
import { promisify } from "node:util";
import { execFile } from "node:child_process";
import path from "node:path";
import { redactSecrets } from "./codex.js";

const githubApiVersion = "2026-03-10";
const maxApiErrorBytes = 4_000;
const maxRepositoryArchiveBytes = 250_000_000;
const execFileAsync = promisify(execFile);

export interface GitHubRepositoryRef {
  owner: string;
  repo: string;
  installationId: number;
}

export type GitHubPermissionLevel = "read" | "write";
export type GitHubPermissions = Readonly<Record<string, GitHubPermissionLevel>>;

export interface GitHubInstallationToken {
  token: string;
  expiresAt: string;
}

export interface GitHubInstallationTokenScope {
  installationId: number;
  repository?: { owner: string; repo: string };
  permissions?: GitHubPermissions;
}

export interface GitHubTokenProvider {
  getToken(
    scope: GitHubInstallationTokenScope,
  ): Promise<GitHubInstallationToken>;
}

export interface GitHubAppAuthConfig {
  appId: string;
  privateKey: string;
  apiBaseUrl?: string;
  apiVersion?: string;
}

export interface GitHubAppSetupConfig {
  slug: string;
  stateSecret: string;
}

export interface GitHubSetupStateInput {
  workspaceId: string;
  userId: string;
  repositoryId?: string;
}

export interface GitHubSetupState extends GitHubSetupStateInput {
  nonce: string;
  expiresAt: string;
}

export interface GitHubSetupCallback extends GitHubSetupState {
  installationId: number;
  setupAction: "install" | "update";
}

export interface GitHubCheckOutput {
  title: string;
  summary: string;
  text?: string;
}

export interface GitHubPullRequest {
  number: number;
  url: string;
  head: string;
  base: string;
  draft: boolean;
}

export interface GitHubCheckRun {
  id: number;
  url: string;
  status: "queued" | "in_progress" | "completed";
  conclusion?: string;
}

export interface GitHubDeployment {
  id: number;
  url: string;
}

export interface GitHubPublishedBranch {
  branch: string;
  commitSha: string;
  baseSha: string;
}

export interface GitHubPublishFile {
  path: string;
  status: "added" | "modified" | "deleted";
  content?: string | Uint8Array;
  contentEncoding?: "base64";
  mode?: "100644" | "100755";
}

export interface GitHubChangedFile {
  relativePath: string;
  status: "added" | "modified" | "deleted";
}

export type GitHubFetch = typeof fetch;

export class GitHubControlPlaneError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code = "github_request_failed",
  ) {
    super(message);
    this.name = "GitHubControlPlaneError";
  }
}

function required(value: string | undefined, label: string): string {
  const normalized = value?.trim();
  if (!normalized) throw new Error(`${label} is required`);
  return normalized;
}

function privateKeyFromEnv(env: NodeJS.ProcessEnv): string | undefined {
  const base64 = env.MEND_GITHUB_APP_PRIVATE_KEY_BASE64?.trim();
  if (base64) return Buffer.from(base64, "base64").toString("utf8");
  return env.MEND_GITHUB_APP_PRIVATE_KEY?.replace(/\\n/g, "\n").trim();
}

export function readGitHubAppAuthConfig(
  env: NodeJS.ProcessEnv = process.env,
): GitHubAppAuthConfig | null {
  const appId = env.MEND_GITHUB_APP_ID?.trim();
  const privateKey = privateKeyFromEnv(env);
  if (!appId || !privateKey) return null;
  return {
    appId,
    privateKey,
    apiBaseUrl: env.MEND_GITHUB_API_URL?.trim() || undefined,
    apiVersion: env.MEND_GITHUB_API_VERSION?.trim() || undefined,
  };
}

export function readGitHubAppSetupConfig(
  env: NodeJS.ProcessEnv = process.env,
): GitHubAppSetupConfig | null {
  const slug = env.MEND_GITHUB_APP_SLUG?.trim();
  const stateSecret = env.MEND_GITHUB_SETUP_STATE_SECRET?.trim();
  if (!slug || !stateSecret) return null;
  return { slug, stateSecret };
}

function base64UrlJson(value: unknown): string {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}

function stateSignature(payload: string, secret: string): string {
  return crypto
    .createHmac("sha256", secret)
    .update(payload)
    .digest()
    .subarray(0, 16)
    .toString("base64url");
}

function safeOpaque(value: string, label: string): string {
  const normalized = value.trim();
  if (
    !normalized ||
    normalized.length > 160 ||
    [...normalized].some((character) => {
      const code = character.charCodeAt(0);
      return code < 32 || code === 127;
    })
  )
    throw new Error(`${label} is invalid`);
  return normalized;
}

export function createGitHubSetupState(
  input: GitHubSetupStateInput,
  secret: string,
  expiresAt = Date.now() + 10 * 60_000,
): { state: string; expiresAt: string; nonce: string } {
  const nonce = crypto.randomBytes(12).toString("base64url");
  const payload = base64UrlJson({
    w: safeOpaque(input.workspaceId, "workspaceId"),
    u: safeOpaque(input.userId, "userId"),
    r: input.repositoryId
      ? safeOpaque(input.repositoryId, "repositoryId")
      : undefined,
    n: nonce,
    e: expiresAt,
  });
  return {
    state: `${payload}.${stateSignature(payload, required(secret, "GitHub setup state secret"))}`,
    expiresAt: new Date(expiresAt).toISOString(),
    nonce,
  };
}

export function verifyGitHubSetupState(
  state: string,
  secret: string,
  expected?: Partial<GitHubSetupStateInput>,
): GitHubSetupState {
  const [payload, signature, extra] = state.split(".");
  if (!payload || !signature || extra)
    throw new GitHubControlPlaneError(
      "GitHub setup state is invalid",
      400,
      "github_state_invalid",
    );
  const expectedSignature = stateSignature(
    payload,
    required(secret, "GitHub setup state secret"),
  );
  const left = Buffer.from(signature);
  const right = Buffer.from(expectedSignature);
  if (left.length !== right.length || !crypto.timingSafeEqual(left, right))
    throw new GitHubControlPlaneError(
      "GitHub setup state is invalid",
      400,
      "github_state_invalid",
    );
  try {
    const value = JSON.parse(
      Buffer.from(payload, "base64url").toString("utf8"),
    ) as Record<string, unknown>;
    if (
      typeof value.w !== "string" ||
      typeof value.u !== "string" ||
      typeof value.n !== "string" ||
      typeof value.e !== "number" ||
      value.e <= Date.now() ||
      (value.r !== undefined && typeof value.r !== "string")
    )
      throw new Error("invalid or expired");
    if (
      (expected?.workspaceId && expected.workspaceId !== value.w) ||
      (expected?.userId && expected.userId !== value.u) ||
      (expected?.repositoryId && expected.repositoryId !== value.r)
    )
      throw new Error("wrong setup principal");
    return {
      workspaceId: value.w,
      userId: value.u,
      repositoryId: value.r as string | undefined,
      nonce: value.n,
      expiresAt: new Date(value.e).toISOString(),
    };
  } catch {
    throw new GitHubControlPlaneError(
      "GitHub setup state is invalid or expired",
      400,
      "github_state_invalid",
    );
  }
}

export function hashGitHubSetupState(state: string): string {
  return crypto.createHash("sha256").update(state).digest("hex");
}

export function githubInstallationUrl(slug: string, state: string): string {
  const safeSlug = validateName(slug, "GitHub App slug");
  const url = new URL(`https://github.com/apps/${safeSlug}/installations/new`);
  url.searchParams.set("state", state);
  return url.toString();
}

export function validateGitHubSetupCallback(
  query: Record<string, unknown>,
  stateSecret: string,
  expected?: Partial<GitHubSetupStateInput>,
): GitHubSetupCallback {
  const setupAction = query.setup_action;
  const installationId = Number(query.installation_id);
  const state = typeof query.state === "string" ? query.state : "";
  if (
    (setupAction !== "install" && setupAction !== "update") ||
    !Number.isSafeInteger(installationId) ||
    installationId < 1
  )
    throw new GitHubControlPlaneError(
      "GitHub setup callback is invalid",
      400,
      "github_callback_invalid",
    );
  return {
    ...verifyGitHubSetupState(state, stateSecret, expected),
    installationId,
    setupAction,
  };
}

export function verifyGitHubWebhookSignature(
  rawBody: Buffer,
  signatureHeader: string | undefined,
  secret: string,
): boolean {
  if (!signatureHeader?.startsWith("sha256=")) return false;
  const expected = `sha256=${crypto.createHmac("sha256", secret).update(rawBody).digest("hex")}`;
  const left = Buffer.from(signatureHeader);
  const right = Buffer.from(expected);
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

function appJwt(config: GitHubAppAuthConfig, now = Date.now()): string {
  const encodedHeader = base64UrlJson({ alg: "RS256", typ: "JWT" });
  const encodedPayload = base64UrlJson({
    iat: Math.floor(now / 1_000) - 60,
    exp: Math.floor(now / 1_000) + 9 * 60,
    iss: config.appId,
  });
  const unsigned = `${encodedHeader}.${encodedPayload}`;
  const signature = crypto
    .sign("RSA-SHA256", Buffer.from(unsigned), config.privateKey)
    .toString("base64url");
  return `${unsigned}.${signature}`;
}

function apiBaseUrl(value?: string): string {
  const url = new URL(value || "https://api.github.com");
  if (
    url.protocol !== "https:" &&
    url.hostname !== "localhost" &&
    url.hostname !== "127.0.0.1"
  )
    throw new Error("GitHub API URL must use HTTPS");
  return url.toString().replace(/\/$/, "");
}

async function githubResponse<T>(
  response: Response,
  extraSecrets: readonly string[] = [],
): Promise<T> {
  if (response.ok) {
    if (response.status === 204) return undefined as T;
    return (await response.json()) as T;
  }
  const message = redactSecrets(
    (await response.text()).slice(0, maxApiErrorBytes),
    extraSecrets,
  );
  throw new GitHubControlPlaneError(
    `GitHub API returned ${response.status}${message ? `: ${message}` : ""}`,
    response.status,
  );
}

export class GitHubAppTokenProvider implements GitHubTokenProvider {
  private readonly cache = new Map<string, GitHubInstallationToken>();

  constructor(
    private readonly config: GitHubAppAuthConfig,
    private readonly fetcher: GitHubFetch = fetch,
  ) {}

  async getToken(
    scope: GitHubInstallationTokenScope,
  ): Promise<GitHubInstallationToken> {
    const installationId = validateInstallationId(scope.installationId);
    const repository = scope.repository
      ? validateRepository({ ...scope.repository, installationId })
      : undefined;
    const permissions = scope.permissions ?? {};
    const cacheKey = JSON.stringify({
      installationId,
      repository: repository
        ? { owner: repository.owner, repo: repository.repo }
        : undefined,
      permissions,
    });
    const cached = this.cache.get(cacheKey);
    if (cached && Date.parse(cached.expiresAt) > Date.now() + 2 * 60_000)
      return cached;
    const jwt = appJwt(this.config);
    const response = await this.fetcher(
      `${apiBaseUrl(this.config.apiBaseUrl)}/app/installations/${installationId}/access_tokens`,
      {
        method: "POST",
        headers: {
          Accept: "application/vnd.github+json",
          Authorization: `Bearer ${jwt}`,
          "Content-Type": "application/json",
          "X-GitHub-Api-Version": this.config.apiVersion || githubApiVersion,
        },
        body: JSON.stringify({
          ...(repository ? { repositories: [repository.repo] } : {}),
          ...(Object.keys(permissions).length ? { permissions } : {}),
        }),
      },
    );
    const value = await githubResponse<{ token: string; expires_at: string }>(
      response,
      [jwt],
    );
    const token = required(value.token, "GitHub installation token");
    const result = { token, expiresAt: value.expires_at };
    this.cache.set(cacheKey, result);
    return result;
  }
}

function validateName(value: string, label: string): string {
  const normalized = value.trim();
  if (!/^[A-Za-z0-9_.-]{1,100}$/.test(normalized))
    throw new Error(`${label} is invalid`);
  return normalized;
}

function validateInstallationId(value: number): number {
  if (!Number.isSafeInteger(value) || value < 1)
    throw new Error("GitHub installation id is invalid");
  return value;
}

function validateRepository(
  repository: GitHubRepositoryRef,
): GitHubRepositoryRef {
  return {
    owner: validateName(repository.owner, "GitHub owner"),
    repo: validateName(repository.repo, "GitHub repository"),
    installationId: validateInstallationId(repository.installationId),
  };
}

function validateNumber(value: number, label: string): number {
  if (!Number.isSafeInteger(value) || value < 1)
    throw new Error(`${label} is invalid`);
  return value;
}

function validateSha(value: string): string {
  if (!/^[a-f0-9]{40,64}$/i.test(value))
    throw new Error("GitHub commit SHA is invalid");
  return value;
}

function validateRef(value: string): string {
  const ref = value.trim();
  if (
    !/^[A-Za-z0-9._/-]{1,255}$/.test(ref) ||
    ref.startsWith("/") ||
    ref.endsWith("/") ||
    ref.includes("..") ||
    ref.includes("//")
  )
    throw new Error("GitHub ref is invalid");
  return ref;
}

function bounded(value: string, label: string, max: number): string {
  const normalized = value.trim();
  if (!normalized || normalized.length > max)
    throw new Error(`${label} is invalid`);
  return normalized;
}

function repoPath(repository: GitHubRepositoryRef): string {
  return `/repos/${encodeURIComponent(repository.owner)}/${encodeURIComponent(repository.repo)}`;
}

export class GitHubControlPlane {
  private readonly apiUrl: string;

  constructor(
    private readonly tokens: GitHubTokenProvider,
    private readonly fetcher: GitHubFetch = fetch,
    apiUrl?: string,
    private readonly apiVersion = githubApiVersion,
  ) {
    this.apiUrl = apiBaseUrl(apiUrl);
  }

  private async request<T>(
    repository: GitHubRepositoryRef,
    method: string,
    pathname: string,
    permissions: GitHubPermissions,
    body?: unknown,
  ): Promise<T> {
    const repo = validateRepository(repository);
    const access = await this.tokens.getToken({
      installationId: repo.installationId,
      repository: { owner: repo.owner, repo: repo.repo },
      permissions,
    });
    const response = await this.fetcher(`${this.apiUrl}${pathname}`, {
      method,
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${access.token}`,
        "Content-Type": "application/json",
        "X-GitHub-Api-Version": this.apiVersion,
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    return githubResponse<T>(response, [access.token]);
  }

  async getBranchSha(
    repository: GitHubRepositoryRef,
    branch: string,
  ): Promise<string> {
    const value = await this.request<{ object: { sha: string } }>(
      repository,
      "GET",
      `${repoPath(validateRepository(repository))}/git/ref/heads/${encodeURIComponent(validateRef(branch))}`,
      { contents: "read" },
    );
    return validateSha(value.object.sha);
  }

  async checkoutRepositoryArchive(
    repository: GitHubRepositoryRef,
    ref: string,
    destination: string,
  ): Promise<void> {
    const repo = validateRepository(repository);
    const access = await this.tokens.getToken({
      installationId: repo.installationId,
      repository: { owner: repo.owner, repo: repo.repo },
      permissions: { contents: "read" },
    });
    const response = await this.fetcher(
      `${this.apiUrl}${repoPath(repo)}/tarball/${encodeURIComponent(validateRef(ref))}`,
      {
        headers: {
          Accept: "application/vnd.github+json",
          Authorization: `Bearer ${access.token}`,
          "X-GitHub-Api-Version": this.apiVersion,
        },
        redirect: "follow",
      },
    );
    if (!response.ok) {
      const message = redactSecrets(
        (await response.text()).slice(0, maxApiErrorBytes),
        [access.token],
      );
      throw new GitHubControlPlaneError(
        `GitHub archive download returned ${response.status}${message ? `: ${message}` : ""}`,
        response.status,
      );
    }
    const advertisedSize = Number.parseInt(
      response.headers.get("content-length") ?? "",
      10,
    );
    if (
      Number.isFinite(advertisedSize) &&
      advertisedSize > maxRepositoryArchiveBytes
    )
      throw new GitHubControlPlaneError(
        "GitHub repository archive exceeds the runner size limit",
        413,
      );
    await mkdir(destination, { recursive: true });
    const archive = path.join(
      path.dirname(destination),
      `${path.basename(destination)}.tar.gz`,
    );
    try {
      const archiveBytes = Buffer.from(await response.arrayBuffer());
      if (archiveBytes.byteLength > maxRepositoryArchiveBytes)
        throw new GitHubControlPlaneError(
          "GitHub repository archive exceeds the runner size limit",
          413,
        );
      await writeFile(archive, archiveBytes, {
        mode: 0o600,
      });
      await execFileAsync("tar", [
        "-xzf",
        archive,
        "-C",
        destination,
        "--strip-components=1",
      ]);
    } finally {
      await rm(archive, { force: true }).catch(() => undefined);
    }
  }

  /**
   * Find an open PR for a branch created by a run.  The head filter is
   * owner-qualified to avoid accidentally reconciling a similarly named fork
   * branch.  This is used after a worker crash between GitHub publication and
   * the database checkpoint.
   */
  async findOpenPullRequest(
    repository: GitHubRepositoryRef,
    input: { head: string; base: string },
  ): Promise<GitHubPullRequest | null> {
    const repo = validateRepository(repository);
    const head = `${repo.owner}:${validateRef(input.head)}`;
    const base = validateRef(input.base);
    const value = await this.request<
      Array<{
        number: number;
        html_url: string;
        head: { ref: string };
        base: { ref: string };
        draft: boolean;
      }>
    >(
      repo,
      "GET",
      `${repoPath(repo)}/pulls?state=open&head=${encodeURIComponent(head)}&base=${encodeURIComponent(base)}&per_page=10`,
      { pull_requests: "read" },
    );
    const valueRow = value[0];
    if (!valueRow) return null;
    return {
      number: valueRow.number,
      url: valueRow.html_url,
      head: valueRow.head.ref,
      base: valueRow.base.ref,
      draft: valueRow.draft,
    };
  }

  async listInstallationRepositories(
    installationId: number,
  ): Promise<GitHubRepositoryRef[]> {
    const id = validateInstallationId(installationId);
    const access = await this.tokens.getToken({
      installationId: id,
      permissions: { metadata: "read" },
    });
    const repositories: Array<{ name: string; owner: { login: string } }> = [];
    for (let page = 1; page <= 100; page += 1) {
      const response = await this.fetcher(
        `${this.apiUrl}/installation/repositories?per_page=100&page=${page}`,
        {
          headers: {
            Accept: "application/vnd.github+json",
            Authorization: `Bearer ${access.token}`,
            "X-GitHub-Api-Version": this.apiVersion,
          },
        },
      );
      const value = await githubResponse<{
        repositories: Array<{ name: string; owner: { login: string } }>;
      }>(response, [access.token]);
      repositories.push(...value.repositories);
      if (value.repositories.length < 100) break;
    }
    return repositories.map((repository) =>
      validateRepository({
        owner: repository.owner.login,
        repo: repository.name,
        installationId: id,
      }),
    );
  }

  async dispatchWorkflow(
    repository: GitHubRepositoryRef,
    workflowId: string | number,
    ref: string,
    runId: string,
  ): Promise<void> {
    const id = String(workflowId);
    if (!/^\d{1,20}$/.test(id) && !/^[A-Za-z0-9_./-]{1,255}\.ya?ml$/.test(id))
      throw new Error("GitHub workflow id is invalid");
    const opaqueRunId = runId.trim();
    if (!/^[A-Za-z0-9_-]{1,128}$/.test(opaqueRunId))
      throw new Error("Workflow run id is invalid");
    await this.request<void>(
      repository,
      "POST",
      `${repoPath(validateRepository(repository))}/actions/workflows/${encodeURIComponent(id)}/dispatches`,
      { actions: "write" },
      { ref: validateRef(ref), inputs: { run_id: opaqueRunId } },
    );
  }

  async publishBranch(
    repository: GitHubRepositoryRef,
    input: {
      base: string;
      branch: string;
      message: string;
      files: readonly GitHubPublishFile[];
      expectedBaseSha?: string;
    },
  ): Promise<GitHubPublishedBranch> {
    const repo = validateRepository(repository);
    const base = validateRef(input.base);
    const branch = validateRef(input.branch);
    if (base === branch)
      throw new Error("Published branch must differ from its base");
    const files = normalizePublishFiles(input.files);
    const baseRef = await this.request<{ object: { sha: string } }>(
      repo,
      "GET",
      `${repoPath(repo)}/git/ref/heads/${encodeURIComponent(base)}`,
      { contents: "read" },
    );
    const baseSha = validateSha(baseRef.object.sha);
    if (input.expectedBaseSha && validateSha(input.expectedBaseSha) !== baseSha)
      throw new GitHubControlPlaneError(
        "Base branch changed before publication",
        409,
        "github_base_changed",
      );
    const baseCommit = await this.request<{ tree: { sha: string } }>(
      repo,
      "GET",
      `${repoPath(repo)}/git/commits/${baseSha}`,
      { contents: "read" },
    );
    const treeEntries: Array<{
      path: string;
      mode: "100644" | "100755";
      type: "blob";
      sha: string | null;
    }> = [];
    for (const file of files) {
      if (file.status === "deleted") {
        treeEntries.push({
          path: file.path,
          mode: file.mode,
          type: "blob",
          sha: null,
        });
        continue;
      }
      const content =
        typeof file.content === "string"
          ? Buffer.from(file.content, "utf8")
          : Buffer.from(file.content as Uint8Array);
      const blob = await this.request<{ sha: string }>(
        repo,
        "POST",
        `${repoPath(repo)}/git/blobs`,
        { contents: "write" },
        { content: content.toString("base64"), encoding: "base64" },
      );
      treeEntries.push({
        path: file.path,
        mode: file.mode,
        type: "blob",
        sha: validateSha(blob.sha),
      });
    }
    const tree = await this.request<{ sha: string }>(
      repo,
      "POST",
      `${repoPath(repo)}/git/trees`,
      { contents: "write" },
      {
        base_tree: validateSha(baseCommit.tree.sha),
        tree: treeEntries,
      },
    );
    const commit = await this.request<{ sha: string }>(
      repo,
      "POST",
      `${repoPath(repo)}/git/commits`,
      { contents: "write" },
      {
        message: bounded(input.message, "Commit message", 1_000),
        tree: validateSha(tree.sha),
        parents: [baseSha],
      },
    );
    const commitSha = validateSha(commit.sha);
    await this.request(
      repo,
      "POST",
      `${repoPath(repo)}/git/refs`,
      { contents: "write" },
      { ref: `refs/heads/${branch}`, sha: commitSha },
    );
    return { branch, commitSha, baseSha };
  }

  async createCheckRun(
    repository: GitHubRepositoryRef,
    input: {
      name: string;
      headSha: string;
      status: "queued" | "in_progress" | "completed";
      conclusion?:
        | "action_required"
        | "cancelled"
        | "failure"
        | "neutral"
        | "success"
        | "skipped"
        | "stale"
        | "timed_out";
      detailsUrl?: string;
      output?: GitHubCheckOutput;
    },
  ): Promise<GitHubCheckRun> {
    if ((input.status === "completed") !== Boolean(input.conclusion))
      throw new Error(
        "Completed GitHub checks require a conclusion, and active checks cannot have one",
      );
    const value = await this.request<{
      id: number;
      html_url: string;
      status: GitHubCheckRun["status"];
      conclusion?: string;
    }>(
      repository,
      "POST",
      `${repoPath(validateRepository(repository))}/check-runs`,
      { checks: "write" },
      {
        name: bounded(input.name, "Check name", 100),
        head_sha: validateSha(input.headSha),
        status: input.status,
        ...(input.conclusion ? { conclusion: input.conclusion } : {}),
        ...(input.detailsUrl
          ? { details_url: safeHttpsUrl(input.detailsUrl) }
          : {}),
        ...(input.output ? { output: normalizeCheckOutput(input.output) } : {}),
      },
    );
    return {
      id: value.id,
      url: value.html_url,
      status: value.status,
      conclusion: value.conclusion ?? undefined,
    };
  }

  async updateCheckRun(
    repository: GitHubRepositoryRef,
    checkRunId: number,
    input: {
      status?: "queued" | "in_progress" | "completed";
      conclusion?:
        | "action_required"
        | "cancelled"
        | "failure"
        | "neutral"
        | "success"
        | "skipped"
        | "stale"
        | "timed_out";
      output?: GitHubCheckOutput;
    },
  ): Promise<GitHubCheckRun> {
    if (input.conclusion && input.status !== "completed")
      throw new Error("A GitHub check conclusion requires completed status");
    const value = await this.request<{
      id: number;
      html_url: string;
      status: GitHubCheckRun["status"];
      conclusion?: string;
    }>(
      repository,
      "PATCH",
      `${repoPath(validateRepository(repository))}/check-runs/${validateNumber(checkRunId, "check run id")}`,
      { checks: "write" },
      {
        ...(input.status ? { status: input.status } : {}),
        ...(input.conclusion ? { conclusion: input.conclusion } : {}),
        ...(input.output ? { output: normalizeCheckOutput(input.output) } : {}),
      },
    );
    return {
      id: value.id,
      url: value.html_url,
      status: value.status,
      conclusion: value.conclusion ?? undefined,
    };
  }

  async createDraftPullRequest(
    repository: GitHubRepositoryRef,
    input: { title: string; body: string; head: string; base: string },
  ): Promise<GitHubPullRequest> {
    const value = await this.request<{
      number: number;
      html_url: string;
      head: { ref: string };
      base: { ref: string };
      draft: boolean;
    }>(
      repository,
      "POST",
      `${repoPath(validateRepository(repository))}/pulls`,
      { pull_requests: "write" },
      {
        title: bounded(input.title, "Pull request title", 256),
        body: bounded(input.body, "Pull request body", 60_000),
        head: validateRef(input.head),
        base: validateRef(input.base),
        draft: true,
        maintainer_can_modify: true,
      },
    );
    return {
      number: value.number,
      url: value.html_url,
      head: value.head.ref,
      base: value.base.ref,
      draft: value.draft,
    };
  }

  async updatePullRequest(
    repository: GitHubRepositoryRef,
    pullNumber: number,
    input: {
      title?: string;
      body?: string;
      state?: "open" | "closed";
      base?: string;
    },
  ): Promise<GitHubPullRequest> {
    const value = await this.request<{
      number: number;
      html_url: string;
      head: { ref: string };
      base: { ref: string };
      draft: boolean;
    }>(
      repository,
      "PATCH",
      `${repoPath(validateRepository(repository))}/pulls/${validateNumber(pullNumber, "pull request number")}`,
      { pull_requests: "write" },
      {
        ...(input.title
          ? { title: bounded(input.title, "Pull request title", 256) }
          : {}),
        ...(input.body
          ? { body: bounded(input.body, "Pull request body", 60_000) }
          : {}),
        ...(input.state ? { state: input.state } : {}),
        ...(input.base ? { base: validateRef(input.base) } : {}),
      },
    );
    return {
      number: value.number,
      url: value.html_url,
      head: value.head.ref,
      base: value.base.ref,
      draft: value.draft,
    };
  }

  async markPullRequestReadyForReview(
    repository: GitHubRepositoryRef,
    pullNumber: number,
  ): Promise<GitHubPullRequest> {
    const repo = validateRepository(repository);
    const number = validateNumber(pullNumber, "pull request number");
    const current = await this.request<{
      number: number;
      html_url: string;
      node_id: string;
      head: { ref: string };
      base: { ref: string };
      draft: boolean;
    }>(repo, "GET", `${repoPath(repo)}/pulls/${number}`, {
      pull_requests: "read",
    });
    if (!current.draft) {
      return {
        number: current.number,
        url: current.html_url,
        head: current.head.ref,
        base: current.base.ref,
        draft: false,
      };
    }

    const access = await this.tokens.getToken({
      installationId: repo.installationId,
      repository: { owner: repo.owner, repo: repo.repo },
      permissions: { pull_requests: "write" },
    });
    const response = await this.fetcher(`${this.apiUrl}/graphql`, {
      method: "POST",
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${access.token}`,
        "Content-Type": "application/json",
        "X-GitHub-Api-Version": this.apiVersion,
      },
      body: JSON.stringify({
        query: [
          "mutation MarkPullRequestReadyForReview($pullRequestId: ID!) {",
          "  markPullRequestReadyForReview(input: { pullRequestId: $pullRequestId }) {",
          "    pullRequest { number url isDraft headRefName baseRefName }",
          "  }",
          "}",
        ].join("\n"),
        variables: {
          pullRequestId: safeOpaque(current.node_id, "pull request node id"),
        },
      }),
    });
    const value = await githubResponse<{
      data?: {
        markPullRequestReadyForReview?: {
          pullRequest?: {
            number: number;
            url: string;
            isDraft: boolean;
            headRefName: string;
            baseRefName: string;
          };
        };
      };
      errors?: Array<{ message?: string }>;
    }>(response, [access.token]);
    const ready = value.data?.markPullRequestReadyForReview?.pullRequest;
    if (!ready || value.errors?.length) {
      const detail = redactSecrets(
        value.errors
          ?.map((error) => error.message)
          .filter(Boolean)
          .join("; ") || "empty GraphQL response",
        [access.token],
      ).slice(0, maxApiErrorBytes);
      throw new GitHubControlPlaneError(
        `GitHub could not mark pull request ready for review: ${detail}`,
        502,
        "github_ready_for_review_failed",
      );
    }
    return {
      number: ready.number,
      url: ready.url,
      head: ready.headRefName,
      base: ready.baseRefName,
      draft: ready.isDraft,
    };
  }

  async createCommitStatus(
    repository: GitHubRepositoryRef,
    input: {
      sha: string;
      state: "error" | "failure" | "pending" | "success";
      context: string;
      description?: string;
      targetUrl?: string;
    },
  ): Promise<{ id: number; url: string; state: string }> {
    const value = await this.request<{
      id: number;
      target_url?: string;
      state: string;
    }>(
      repository,
      "POST",
      `${repoPath(validateRepository(repository))}/statuses/${validateSha(input.sha)}`,
      { statuses: "write" },
      {
        state: input.state,
        context: bounded(input.context, "Status context", 100),
        ...(input.description
          ? {
              description: bounded(
                input.description,
                "Status description",
                140,
              ),
            }
          : {}),
        ...(input.targetUrl
          ? { target_url: safeHttpsUrl(input.targetUrl) }
          : {}),
      },
    );
    return { id: value.id, url: value.target_url ?? "", state: value.state };
  }

  async mergePullRequest(
    repository: GitHubRepositoryRef,
    pullNumber: number,
    expectedHeadSha: string,
    method: "merge" | "squash" | "rebase" = "squash",
  ): Promise<{ merged: boolean; sha?: string; message: string }> {
    const value = await this.request<{
      merged: boolean;
      sha?: string;
      message: string;
    }>(
      repository,
      "PUT",
      `${repoPath(validateRepository(repository))}/pulls/${validateNumber(pullNumber, "pull request number")}/merge`,
      { contents: "write", pull_requests: "write" },
      { sha: validateSha(expectedHeadSha), merge_method: method },
    );
    return { merged: value.merged, sha: value.sha, message: value.message };
  }

  async createDeployment(
    repository: GitHubRepositoryRef,
    input: {
      ref: string;
      environment: string;
      runId: string;
      description?: string;
    },
  ): Promise<GitHubDeployment> {
    const value = await this.request<{ id: number; url: string }>(
      repository,
      "POST",
      `${repoPath(validateRepository(repository))}/deployments`,
      { deployments: "write" },
      {
        ref: validateRef(input.ref),
        environment: bounded(input.environment, "Deployment environment", 255),
        description: input.description
          ? bounded(input.description, "Deployment description", 255)
          : "Mend verified fix",
        payload: { run_id: safeOpaque(input.runId, "runId") },
        auto_merge: false,
      },
    );
    return { id: value.id, url: value.url };
  }

  async updateDeploymentStatus(
    repository: GitHubRepositoryRef,
    deploymentId: number,
    input: {
      state:
        | "error"
        | "failure"
        | "inactive"
        | "in_progress"
        | "queued"
        | "pending"
        | "success";
      description?: string;
      environmentUrl?: string;
      logUrl?: string;
    },
  ): Promise<{ id: number; state: string }> {
    return this.request<{ id: number; state: string }>(
      repository,
      "POST",
      `${repoPath(validateRepository(repository))}/deployments/${validateNumber(deploymentId, "deployment id")}/statuses`,
      { deployments: "write" },
      {
        state: input.state,
        ...(input.description
          ? {
              description: bounded(
                input.description,
                "Deployment status description",
                255,
              ),
            }
          : {}),
        ...(input.environmentUrl
          ? { environment_url: safeHttpsUrl(input.environmentUrl) }
          : {}),
        ...(input.logUrl ? { log_url: safeHttpsUrl(input.logUrl) } : {}),
      },
    );
  }
}

function normalizeCheckOutput(output: GitHubCheckOutput): GitHubCheckOutput {
  return {
    title: bounded(output.title, "Check output title", 255),
    summary: bounded(output.summary, "Check output summary", 60_000),
    ...(output.text
      ? { text: bounded(output.text, "Check output text", 60_000) }
      : {}),
  };
}

function safeRepositoryPath(value: string): string {
  const normalized = value.replace(/\\/g, "/").trim();
  if (
    !normalized ||
    normalized.length > 1_000 ||
    normalized.startsWith("/") ||
    normalized
      .split("/")
      .some((part) => !part || part === "." || part === "..") ||
    normalized
      .split("/")
      .some((part) => part === ".git" || part.startsWith(".env"))
  )
    throw new Error("Published repository path is invalid or sensitive");
  return normalized;
}

function normalizePublishFiles(files: readonly GitHubPublishFile[]): Array<{
  path: string;
  status: GitHubPublishFile["status"];
  content?: string | Uint8Array;
  mode: "100644" | "100755";
}> {
  if (!files.length || files.length > 300)
    throw new Error(
      "A published branch requires between 1 and 300 changed files",
    );
  let totalBytes = 0;
  const paths = new Set<string>();
  return files.map((file) => {
    const filePath = safeRepositoryPath(file.path);
    if (paths.has(filePath))
      throw new Error(`Published repository path is duplicated: ${filePath}`);
    paths.add(filePath);
    if (file.status === "deleted") {
      if (file.content !== undefined)
        throw new Error("Deleted published files cannot include content");
    } else {
      if (file.content === undefined)
        throw new Error("Added and modified published files require content");
      const content =
        file.contentEncoding === "base64"
          ? Buffer.from(
              typeof file.content === "string"
                ? file.content
                : Buffer.from(file.content).toString("base64"),
              "base64",
            )
          : file.content;
      const bytes =
        typeof content === "string"
          ? Buffer.byteLength(content, "utf8")
          : content.byteLength;
      if (bytes > 5_000_000)
        throw new Error(`Published file is too large: ${filePath}`);
      totalBytes += bytes;
      if (totalBytes > 20_000_000)
        throw new Error("Published branch content exceeds 20 MB");
    }
    return {
      path: filePath,
      status: file.status,
      ...(file.status === "deleted" || file.content === undefined
        ? {}
        : {
            content:
              file.contentEncoding === "base64"
                ? Buffer.from(
                    typeof file.content === "string"
                      ? file.content
                      : Buffer.from(file.content).toString("base64"),
                    "base64",
                  )
                : file.content,
          }),
      mode: file.mode ?? "100644",
    };
  });
}

export async function collectGitHubPublishFiles(
  repositoryRoot: string,
  changes: readonly GitHubChangedFile[],
): Promise<GitHubPublishFile[]> {
  const root = await realpath(repositoryRoot);
  return Promise.all(
    changes.map(async (change) => {
      const relativePath = safeRepositoryPath(change.relativePath);
      if (change.status === "deleted")
        return { path: relativePath, status: change.status };
      const absolutePath = path.resolve(root, relativePath);
      const relative = path.relative(root, absolutePath);
      if (
        relative === ".." ||
        relative.startsWith(`..${path.sep}`) ||
        path.isAbsolute(relative)
      )
        throw new Error("Published repository path is outside the repository");
      const file = await lstat(absolutePath);
      if (!file.isFile() || file.isSymbolicLink())
        throw new Error(
          `Published path is not a regular file: ${relativePath}`,
        );
      if (file.size > 5_000_000)
        throw new Error(`Published file is too large: ${relativePath}`);
      return {
        path: relativePath,
        status: change.status,
        content: await readFile(absolutePath),
        mode: file.mode & 0o111 ? "100755" : "100644",
      };
    }),
  );
}

function safeHttpsUrl(value: string): string {
  const url = new URL(value);
  if (url.protocol !== "https:") throw new Error("External URL must use HTTPS");
  if (url.username || url.password)
    throw new Error("External URL cannot contain credentials");
  return url.toString();
}

export interface DeploymentHealthResult {
  healthy: boolean;
  status: number;
  durationMs: number;
}

export async function probeDeploymentHealth(input: {
  url: string;
  allowedOrigins: readonly string[];
  timeoutMs?: number;
  expectedStatuses?: readonly number[];
  fetcher?: GitHubFetch;
}): Promise<DeploymentHealthResult> {
  const url = new URL(input.url);
  if (url.protocol !== "https:" || url.username || url.password)
    throw new Error("Health URL must be credential-free HTTPS");
  const allowed = new Set(
    input.allowedOrigins.map((origin) => new URL(origin).origin),
  );
  if (!allowed.has(url.origin))
    throw new Error("Health URL origin is not allowlisted");
  const controller = new AbortController();
  const started = Date.now();
  const timeout = setTimeout(
    () => controller.abort(),
    Math.min(Math.max(input.timeoutMs ?? 15_000, 1_000), 60_000),
  );
  try {
    const response = await (input.fetcher ?? fetch)(url, {
      method: "GET",
      redirect: "manual",
      signal: controller.signal,
      headers: { Accept: "application/json,text/plain;q=0.9,*/*;q=0.1" },
    });
    const expected = input.expectedStatuses ?? [200];
    return {
      healthy: expected.includes(response.status),
      status: response.status,
      durationMs: Date.now() - started,
    };
  } finally {
    clearTimeout(timeout);
  }
}

export function createGitHubControlPlaneFromEnv(
  env: NodeJS.ProcessEnv = process.env,
  fetcher: GitHubFetch = fetch,
): GitHubControlPlane | null {
  const config = readGitHubAppAuthConfig(env);
  if (!config) return null;
  return new GitHubControlPlane(
    new GitHubAppTokenProvider(config, fetcher),
    fetcher,
    config.apiBaseUrl,
    config.apiVersion || githubApiVersion,
  );
}
