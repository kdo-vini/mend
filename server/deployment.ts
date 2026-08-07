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
}

export class DokployDeployment implements CodexDeploymentPort {
  constructor(
    private readonly baseUrl: string,
    private readonly apiKey: string,
    private readonly applicationId: string,
  ) {}

  async deploy(input: CodexDeploymentInput): Promise<CodexDeploymentResult> {
    const response = await fetch(`${this.baseUrl}/application.deploy`, {
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
        title: `Mend Codex ${input.runId}`,
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
