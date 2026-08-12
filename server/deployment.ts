import { redactSecrets } from "./codex.js";

export interface CodexDeploymentInput {
  workspaceId: string;
  runId: string;
  branch: string;
  commitSha?: string;
  /** Stable key providers can use to de-duplicate retries after a crash. */
  idempotencyKey?: string;
}

export interface CodexDeploymentResult {
  provider: "dokploy";
  reference?: string;
  url?: string;
}

export interface CodexDeploymentPort {
  deploy(input: CodexDeploymentInput): Promise<CodexDeploymentResult>;
  reconcile?(
    input: CodexDeploymentInput,
  ): Promise<CodexDeploymentResult | null>;
}

export class DokployDeployment implements CodexDeploymentPort {
  constructor(
    private readonly baseUrl: string,
    private readonly apiKey: string,
    private readonly applicationId: string,
    private readonly fetcher: typeof fetch = fetch,
  ) {}

  async deploy(input: CodexDeploymentInput): Promise<CodexDeploymentResult> {
    const response = await this.fetcher(`${this.baseUrl}/application.deploy`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": this.apiKey,
        ...(input.idempotencyKey
          ? { "idempotency-key": input.idempotencyKey }
          : {}),
      },
      body: JSON.stringify({
        applicationId: this.applicationId,
        title: `Mend Agent ${input.runId}`,
        description: `Approved ${input.branch}${input.commitSha ? ` at ${input.commitSha}` : ""}`,
        branch: input.branch,
        ...(input.commitSha ? { commitSha: input.commitSha } : {}),
      }),
    });
    const body = (await response.json().catch(() => ({}))) as Record<
      string,
      unknown
    >;
    if (!response.ok) {
      const message =
        typeof body.message === "string" ? body.message : response.statusText;
      throw new Error(`Dokploy deploy failed: ${redactSecrets(message)}`);
    }
    return {
      provider: "dokploy",
      ...(typeof body.id === "string" ? { reference: body.id } : {}),
      ...(typeof body.url === "string" ? { url: body.url } : {}),
    };
  }

  async reconcile(
    input: CodexDeploymentInput,
  ): Promise<CodexDeploymentResult | null> {
    const url = new URL(`${this.baseUrl}/deployment.all`);
    url.searchParams.set("applicationId", this.applicationId);
    const response = await this.fetcher(url, {
      method: "GET",
      headers: { accept: "application/json", "x-api-key": this.apiKey },
      redirect: "error",
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) {
      if (response.status === 404) return null;
      throw new Error(`Dokploy reconciliation failed: HTTP ${response.status}`);
    }
    const body = (await response.json().catch(() => [])) as unknown;
    const bodyRecord =
      body && typeof body === "object" && !Array.isArray(body)
        ? (body as Record<string, unknown>)
        : {};
    const candidates = Array.isArray(body)
      ? body
      : Array.isArray(bodyRecord.deployments)
        ? bodyRecord.deployments
        : Array.isArray(bodyRecord.data)
          ? bodyRecord.data
          : [];
    const title = `Mend Agent ${input.runId}`;
    const expectedSource = input.commitSha ?? input.branch;
    const match = candidates.find((candidate) => {
      if (!candidate || typeof candidate !== "object") return false;
      const value = candidate as Record<string, unknown>;
      return (
        value.title === title &&
        String(value.description ?? "").includes(expectedSource)
      );
    }) as Record<string, unknown> | undefined;
    if (!match) return null;
    const reference =
      typeof match.deploymentId === "string"
        ? match.deploymentId
        : typeof match.id === "string"
          ? match.id
          : undefined;
    return {
      provider: "dokploy",
      ...(reference ? { reference } : {}),
      ...(typeof match.url === "string" ? { url: match.url } : {}),
    };
  }
}

export function createDokployDeploymentFromEnv():
  | CodexDeploymentPort
  | undefined {
  const baseUrl = (
    process.env.DOKPLOY_API_URL ??
    (process.env.DOKPLOY_URL
      ? `${process.env.DOKPLOY_URL.replace(/\/$/, "")}/api`
      : "")
  ).replace(/\/$/, "");
  const apiKey = process.env.DOKPLOY_API_KEY?.trim();
  const applicationId = process.env.DOKPLOY_APPLICATION_ID?.trim();
  if (!baseUrl || !apiKey || !applicationId) return undefined;
  return new DokployDeployment(baseUrl, apiKey, applicationId);
}
