import { redactSecrets } from "../../codex.js";
import {
  cancelSubscriptionLogin,
  pollSubscriptionLogin,
  startSubscriptionLogin,
} from "../../coding-agent-auth.js";
import {
  catalogProviderFor,
  type CatalogSecret,
  type CodingCatalogProvider,
} from "../../coding-agent-catalog.js";
import {
  resolveRoutingPolicy,
  resolveEffectiveRunConfig,
  snapshotRoutingPolicy,
  type AgentConnection,
  type CatalogSnapshot,
  type CodingStage,
  type StageRoutingPolicy,
  type StageRoutingPolicyOverride,
} from "../../coding-control-plane.js";
import {
  decryptConnectionSecret,
  encryptConnectionSecret,
} from "../../connection-crypto.js";
import {
  type AgentConnectionCreateInput,
  type AgentConnectionPatchInput,
  type AgentLoginJob,
  type AgentLoginStartInput,
  type AgentProvider,
  type AgentRoutingPolicyInput,
  type CodingControlPlanePort,
  type RequestContext,
} from "../../contracts/api-ports.js";
import { connectionEncryptionKey } from "../../mcp.js";
import type { AnySupabaseClient } from "./types.js";
import { checked, row, rows, str, type Row } from "../supabase-mappers.js";
function subscriptionLoginErrorCode(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error);
  if (raw === "google_subscription_login_requires_interactive_runner")
    return raw;
  if (/^(?:login|codex)_[a-z0-9_]+$/i.test(raw)) return raw.slice(0, 120);
  return "login_start_failed";
}

export type CatalogRefreshErrorCode =
  | "agent_catalog_credential_missing"
  | "agent_catalog_credential_invalid"
  | "agent_catalog_empty"
  | "agent_catalog_provider_not_supported"
  | "agent_catalog_provider_unavailable";

export function classifyCatalogRefreshError(
  error: unknown,
): CatalogRefreshErrorCode {
  const raw = error instanceof Error ? error.message : String(error);
  if (
    /^(agent_api_key_missing|agent_credential_missing|agent_connection_secret_missing)$/.test(
      raw,
    )
  )
    return "agent_catalog_credential_missing";
  if (/^catalog_http_(401|403)$/.test(raw))
    return "agent_catalog_credential_invalid";
  if (raw === "agent_catalog_empty") return "agent_catalog_empty";
  if (raw === "agent_catalog_provider_not_supported")
    return "agent_catalog_provider_not_supported";
  return "agent_catalog_provider_unavailable";
}

export class SupabaseCodingControlPlaneAdapter
  implements CodingControlPlanePort
{
  constructor(
    private readonly privilegedClient: AnySupabaseClient,
    private readonly catalogProviderFactory: (
      provider: AgentProvider,
    ) => CodingCatalogProvider = catalogProviderFor,
    private readonly subscriptionLogin = {
      start: startSubscriptionLogin,
      poll: pollSubscriptionLogin,
      cancel: cancelSubscriptionLogin,
    },
  ) {}

  async resolveConnectionSecret(
    workspaceId: string,
    connectionId: string,
  ): Promise<{ apiKey?: string; bundle?: Record<string, string> } | null> {
    if (!(await this.getConnection(connectionId, workspaceId))) return null;
    const secret = await this.secret(connectionId);
    if (!secret) return null;
    const bundle = secret.bundle
      ? Object.fromEntries(
          Object.entries(secret.bundle).filter(
            (entry): entry is [string, string] => typeof entry[1] === "string",
          ),
        )
      : undefined;
    return {
      ...(secret.apiKey ? { apiKey: secret.apiKey } : {}),
      ...(bundle && Object.keys(bundle).length ? { bundle } : {}),
    };
  }

  private connection(value: Record<string, unknown>): AgentConnection {
    const catalogValue = value.catalog_json;
    const catalog =
      catalogValue &&
      typeof catalogValue === "object" &&
      !Array.isArray(catalogValue)
        ? (catalogValue as CatalogSnapshot)
        : undefined;
    return {
      id: str(value.id),
      workspaceId: str(value.workspace_id),
      ...(value.owner_user_id ? { ownerUserId: str(value.owner_user_id) } : {}),
      label: str(value.label),
      provider: str(value.provider) as AgentProvider,
      authMethod: str(value.auth_method) as "api_key" | "subscription",
      purpose:
        str(value.purpose, "coding") === "support" ? "support" : "coding",
      status: str(value.status, "pending") as AgentConnection["status"],
      automationConsent: value.automation_consent === true,
      ...(value.consent_updated_at
        ? { consentUpdatedAt: str(value.consent_updated_at) }
        : {}),
      ...(value.cli_version ? { cliVersion: str(value.cli_version) } : {}),
      ...(value.last_validated_at
        ? { lastValidatedAt: str(value.last_validated_at) }
        : {}),
      quota: row(value.quota_json),
      catalog,
      metadata: row(value.metadata_json),
      createdAt: str(value.created_at),
      updatedAt: str(value.updated_at),
    };
  }

  private async getConnection(
    connectionId: string,
    workspaceId: string,
  ): Promise<AgentConnection | null> {
    const result = await this.privilegedClient
      .from("agent_connections")
      .select("*")
      .eq("id", connectionId)
      .eq("workspace_id", workspaceId)
      .maybeSingle();
    const data = checked("agent_connections.get", result);
    return data ? this.connection(row(data)) : null;
  }

  private async secret(
    connectionId: string,
  ): Promise<CatalogSecret | undefined> {
    const result = await this.privilegedClient
      .from("agent_connection_secrets")
      .select("encrypted_bundle")
      .eq("connection_id", connectionId)
      .maybeSingle();
    const data = checked("agent_connections.secret", result);
    if (!data) return undefined;
    const decrypted = decryptConnectionSecret(
      str(row(data).encrypted_bundle),
      connectionEncryptionKey(),
    );
    try {
      const parsed = JSON.parse(decrypted) as Record<string, unknown>;
      if (typeof parsed.apiKey === "string") return { apiKey: parsed.apiKey };
      return { bundle: parsed };
    } catch {
      return { apiKey: decrypted };
    }
  }

  private async listWorkspaceConnections(
    workspaceId: string,
  ): Promise<AgentConnection[]> {
    const result = await this.privilegedClient
      .from("agent_connections")
      .select("*")
      .eq("workspace_id", workspaceId)
      .order("updated_at", { ascending: false });
    return rows(checked("agent_connections.workspace_list", result)).map(
      (value) => this.connection(row(value)),
    );
  }

  async listConnections(context: RequestContext): Promise<AgentConnection[]> {
    const connections = await this.listWorkspaceConnections(
      context.workspaceId,
    );
    const visible = connections.filter(
      (connection) =>
        !["pending", "revoked", "canceled"].includes(connection.status),
    );
    return context.role === "owner" || context.role === "admin"
      ? visible
      : visible.filter(
          (connection) => connection.ownerUserId === context.userId,
        );
  }

  async createConnection(
    context: RequestContext,
    input: AgentConnectionCreateInput,
  ): Promise<AgentConnection> {
    if (input.authMethod === "subscription")
      throw new Error("subscription_connection_requires_login");
    if (!input.apiKey?.trim()) throw new Error("agent_api_key_required");
    const result = await this.privilegedClient
      .from("agent_connections")
      .insert({
        workspace_id: context.workspaceId,
        owner_user_id: context.userId,
        label: input.label.trim(),
        purpose: input.purpose ?? "coding",
        provider: input.provider,
        auth_method: input.authMethod,
        status: "connected",
        metadata_json: input.metadata ?? {},
      })
      .select("*")
      .single();
    const created = this.connection(
      row(checked("agent_connections.create", result)),
    );
    const secret = await this.privilegedClient
      .from("agent_connection_secrets")
      .insert({
        connection_id: created.id,
        encrypted_bundle: encryptConnectionSecret(
          JSON.stringify({ apiKey: input.apiKey.trim() }),
          connectionEncryptionKey(),
        ),
      });
    if (secret.error) {
      await this.privilegedClient
        .from("agent_connections")
        .delete()
        .eq("id", created.id);
      throw new Error(`agent_connection_secret:${secret.error.message}`);
    }
    return created;
  }

  async updateConnection(
    context: RequestContext,
    connectionId: string,
    input: AgentConnectionPatchInput,
  ): Promise<AgentConnection | null> {
    const current = await this.getConnection(connectionId, context.workspaceId);
    if (!current) return null;
    if (
      current.ownerUserId !== context.userId &&
      context.role !== "owner" &&
      context.role !== "admin"
    )
      throw new Error("agent_connection_forbidden");
    if (
      input.automationConsent !== undefined &&
      current.ownerUserId !== context.userId &&
      context.role !== "owner"
    )
      throw new Error("agent_subscription_consent_owner_only");
    if (
      input.automationConsent === true &&
      (current.authMethod !== "subscription" ||
        current.status !== "connected" ||
        !current.catalog)
    )
      throw new Error(
        "agent_subscription_consent_requires_verified_connection",
      );
    const result = await this.privilegedClient
      .from("agent_connections")
      .update({
        ...(input.label !== undefined ? { label: input.label.trim() } : {}),
        ...(input.automationConsent !== undefined
          ? {
              automation_consent: input.automationConsent,
              consent_updated_at: new Date().toISOString(),
            }
          : {}),
        updated_at: new Date().toISOString(),
      })
      .eq("id", connectionId)
      .eq("workspace_id", context.workspaceId)
      .select("*")
      .maybeSingle();
    const data = checked("agent_connections.update", result);
    return data ? this.connection(row(data)) : null;
  }

  async removeConnection(
    context: RequestContext,
    connectionId: string,
  ): Promise<boolean> {
    const current = await this.getConnection(connectionId, context.workspaceId);
    if (!current) return false;
    if (
      current.ownerUserId !== context.userId &&
      context.role !== "owner" &&
      context.role !== "admin"
    )
      throw new Error("agent_connection_forbidden");
    const result = await this.privilegedClient
      .from("agent_connections")
      .update({
        status: "revoked",
        automation_consent: false,
        updated_at: new Date().toISOString(),
      })
      .eq("id", connectionId)
      .eq("workspace_id", context.workspaceId)
      .select("id");
    const removed =
      rows(checked("agent_connections.revoke", result)).length > 0;
    if (removed) {
      const pendingJobs = await this.privilegedClient
        .from("agent_connection_auth_jobs")
        .select("id")
        .eq("connection_id", connectionId)
        .eq("workspace_id", context.workspaceId)
        .in("status", ["pending", "awaiting_user"]);
      for (const job of rows(
        checked("agent_connections.revoke_login_lookup", pendingJobs),
      )) {
        const jobId = str(job.id);
        const canceled = await this.privilegedClient
          .from("agent_connection_auth_jobs")
          .update({
            status: "canceled",
            error_code: "connection_revoked",
            updated_at: new Date().toISOString(),
          })
          .eq("id", jobId)
          .eq("workspace_id", context.workspaceId)
          .in("status", ["pending", "awaiting_user"]);
        checked("agent_connections.revoke_login_cancel", canceled);
        await this.subscriptionLogin.cancel(jobId);
      }
      await this.privilegedClient
        .from("agent_connection_secrets")
        .delete()
        .eq("connection_id", connectionId);
    }
    return removed;
  }

  async listModels(
    context: RequestContext,
    connectionId: string,
    refresh = false,
  ): Promise<CatalogSnapshot | null> {
    const connection = await this.getConnection(
      connectionId,
      context.workspaceId,
    );
    if (!connection) return null;
    if (connection.status === "revoked")
      throw new Error("agent_connection_revoked");
    const current = connection.catalog;
    if (!refresh && current && Date.parse(current.expiresAt) > Date.now())
      return current;
    let catalog: CatalogSnapshot;
    try {
      catalog = await this.catalogProviderFactory(connection.provider).list(
        connection,
        await this.secret(connection.id),
      );
    } catch (error) {
      await this.privilegedClient
        .from("agent_connections")
        .update({
          status: "error",
          metadata_json: {
            ...(connection.metadata ?? {}),
            lastCatalogError: redactSecrets(
              String(error instanceof Error ? error.message : error),
            )
              .replace(/\r?\n/g, " ")
              .slice(0, 200),
          },
          updated_at: new Date().toISOString(),
        })
        .eq("id", connectionId)
        .eq("workspace_id", context.workspaceId);
      const code = classifyCatalogRefreshError(error);
      throw new Error(code, { cause: error });
    }
    await this.privilegedClient
      .from("agent_connections")
      .update({
        status: "connected",
        cli_version: catalog.cliVersion,
        catalog_json: catalog,
        catalog_source: catalog.source,
        catalog_expires_at: catalog.expiresAt,
        last_validated_at: catalog.lastVerifiedAt,
        updated_at: new Date().toISOString(),
      })
      .eq("id", connectionId)
      .eq("workspace_id", context.workspaceId);
    return catalog;
  }

  async verifyConnection(
    context: RequestContext,
    connectionId: string,
  ): Promise<AgentConnection | null> {
    const current = await this.getConnection(connectionId, context.workspaceId);
    if (!current) return null;
    try {
      await this.listModels(context, connectionId, true);
    } catch (error) {
      await this.privilegedClient
        .from("agent_connections")
        .update({
          status: "error",
          metadata_json: {
            ...(current.metadata ?? {}),
            lastVerificationError: redactSecrets(
              String(error instanceof Error ? error.message : error),
            )
              .replace(/\r?\n/g, " ")
              .slice(0, 200),
          },
          updated_at: new Date().toISOString(),
        })
        .eq("id", connectionId)
        .eq("workspace_id", context.workspaceId);
    }
    return this.getConnection(connectionId, context.workspaceId);
  }

  private loginJob(value: Record<string, unknown>): AgentLoginJob {
    return {
      id: str(value.id),
      ...(value.connection_id
        ? { connectionId: str(value.connection_id) }
        : {}),
      provider: str(value.provider) as AgentProvider,
      status: str(value.status) as AgentLoginJob["status"],
      ...(value.url ? { url: str(value.url) } : {}),
      ...(value.code ? { code: str(value.code) } : {}),
      expiresAt: str(value.expires_at),
      ...(value.error_code ? { errorCode: str(value.error_code) } : {}),
    };
  }

  private async activeLoginRows(
    context: RequestContext,
    provider?: AgentProvider,
  ): Promise<Row[]> {
    const expired = await this.privilegedClient
      .from("agent_connection_auth_jobs")
      .select("id, connection_id")
      .eq("workspace_id", context.workspaceId)
      .eq("user_id", context.userId)
      .in("status", ["pending", "awaiting_user"])
      .lt("expires_at", new Date().toISOString());
    for (const value of rows(
      checked("agent_connections.login_expired_lookup", expired),
    )) {
      const jobId = str(value.id);
      const updated = await this.privilegedClient
        .from("agent_connection_auth_jobs")
        .update({
          status: "expired",
          error_code: "login_expired",
          updated_at: new Date().toISOString(),
        })
        .eq("id", jobId)
        .eq("workspace_id", context.workspaceId)
        .in("status", ["pending", "awaiting_user"]);
      checked("agent_connections.login_expired_update", updated);
      if (value.connection_id)
        await this.markLoginConnection(
          str(value.connection_id),
          context.workspaceId,
          "expired",
        );
    }
    let request = this.privilegedClient
      .from("agent_connection_auth_jobs")
      .select("*")
      .eq("workspace_id", context.workspaceId)
      .eq("user_id", context.userId)
      .in("status", ["pending", "awaiting_user"])
      .order("created_at", { ascending: true })
      .limit(20);
    if (provider) request = request.eq("provider", provider);
    return rows(checked("agent_connections.login_active", await request));
  }

  private async markLoginTerminal(
    value: Row,
    context: RequestContext,
    status: "failed" | "expired",
    errorCode: "login_runner_unavailable" | "login_expired",
  ): Promise<AgentLoginJob> {
    const jobId = str(value.id);
    const updated = await this.privilegedClient
      .from("agent_connection_auth_jobs")
      .update({
        status,
        error_code: errorCode,
        updated_at: new Date().toISOString(),
      })
      .eq("id", jobId)
      .eq("workspace_id", context.workspaceId)
      .in("status", ["pending", "awaiting_user"])
      .select("*")
      .maybeSingle();
    const data = checked("agent_connections.login_terminal", updated);
    if (value.connection_id)
      await this.markLoginConnection(
        str(value.connection_id),
        context.workspaceId,
        status === "expired" ? "expired" : "error",
      );
    return this.loginJob(
      row(data ?? { ...value, status, error_code: errorCode }),
    );
  }

  private runnerHeartbeatFresh(value: Row): boolean {
    const updatedAt = Date.parse(str(value.updated_at, str(value.created_at)));
    return Number.isFinite(updatedAt) && Date.now() - updatedAt < 30_000;
  }

  private async loginJobWithRunnerFallback(
    value: Row,
    context: RequestContext,
  ): Promise<AgentLoginJob> {
    return this.runnerHeartbeatFresh(value)
      ? this.loginJob(value)
      : this.markLoginTerminal(
          value,
          context,
          "failed",
          "login_runner_unavailable",
        );
  }

  private async markLoginConnection(
    connectionId: string,
    workspaceId: string,
    status: "error" | "expired" | "canceled",
  ): Promise<void> {
    const result = await this.privilegedClient
      .from("agent_connections")
      .update({
        status,
        automation_consent: false,
        updated_at: new Date().toISOString(),
      })
      .eq("id", connectionId)
      .eq("workspace_id", workspaceId)
      .eq("status", "pending");
    checked("agent_connections.login_connection_status", result);
  }

  private async markLoginPersistenceFailure(
    jobId: string,
    connectionId: string,
    workspaceId: string,
  ): Promise<void> {
    await Promise.allSettled([
      (async () => {
        const result = await this.privilegedClient
          .from("agent_connection_auth_jobs")
          .update({
            status: "failed",
            error_code: "login_persistence_failed",
            updated_at: new Date().toISOString(),
          })
          .eq("id", jobId)
          .eq("workspace_id", workspaceId)
          .in("status", ["pending", "awaiting_user"]);
        checked("agent_connections.login_persistence_job", result);
      })(),
      this.markLoginConnection(connectionId, workspaceId, "error"),
    ]);
  }

  async startLogin(
    context: RequestContext,
    input: AgentLoginStartInput,
  ): Promise<AgentLoginJob> {
    if (input.provider !== "openai")
      throw new Error("google_subscription_login_requires_interactive_runner");
    const existing = (await this.activeLoginRows(context, input.provider))[0];
    if (existing) {
      const active = this.subscriptionLogin.poll(str(existing.id));
      return {
        ...(active
          ? this.loginJob(existing)
          : await this.loginJobWithRunnerFallback(existing, context)),
        ...(active
          ? {
              status: active.status,
              ...(active.challenge.url ? { url: active.challenge.url } : {}),
              ...(active.challenge.code ? { code: active.challenge.code } : {}),
              ...(active.errorCode ? { errorCode: active.errorCode } : {}),
            }
          : {}),
      };
    }
    const expiresAt = new Date(Date.now() + 10 * 60_000).toISOString();
    const connectionResult = await this.privilegedClient
      .from("agent_connections")
      .insert({
        workspace_id: context.workspaceId,
        owner_user_id: context.userId,
        label: input.label.trim(),
        purpose: "coding",
        provider: input.provider,
        auth_method: "subscription",
        status: "pending",
      })
      .select("id")
      .single();
    const connectionId = str(
      row(checked("agent_connections.login_connection", connectionResult)).id,
    );
    const result = await this.privilegedClient
      .from("agent_connection_auth_jobs")
      .insert({
        connection_id: connectionId,
        workspace_id: context.workspaceId,
        user_id: context.userId,
        provider: input.provider,
        auth_method: "subscription",
        status: "pending",
        expires_at: expiresAt,
      })
      .select("*")
      .single();
    if (result.error) {
      await this.privilegedClient
        .from("agent_connections")
        .delete()
        .eq("id", connectionId)
        .eq("workspace_id", context.workspaceId);
      const active = (await this.activeLoginRows(context, input.provider))[0];
      if (active) return this.loginJobWithRunnerFallback(active, context);
      throw new Error(`agent_connections.login_job:${result.error.message}`);
    }
    const job = this.loginJob(
      row(checked("agent_connections.login_job", result)),
    );
    try {
      const challenge = await this.subscriptionLogin.start(
        job.id,
        input.provider,
        async (login) => {
          try {
            const update: Record<string, unknown> = {
              status: login.status,
              ...(login.challenge.url ? { url: login.challenge.url } : {}),
              ...(login.challenge.code ? { code: login.challenge.code } : {}),
              ...(login.errorCode ? { error_code: login.errorCode } : {}),
              updated_at: new Date().toISOString(),
            };
            if (login.status === "completed" && login.bundle) {
              const completed = await this.privilegedClient.rpc(
                "complete_agent_subscription_login",
                {
                  p_job_id: job.id,
                  p_connection_id: connectionId,
                  p_encrypted_bundle: encryptConnectionSecret(
                    JSON.stringify(login.bundle),
                    connectionEncryptionKey(),
                  ),
                },
              );
              if (completed.error) throw completed.error;
              return;
            }
            const updated = await this.privilegedClient
              .from("agent_connection_auth_jobs")
              .update(update)
              .eq("id", job.id)
              .eq("workspace_id", context.workspaceId)
              .in("status", ["pending", "awaiting_user"]);
            if (updated.error) throw updated.error;
            if (login.status === "failed")
              await this.markLoginConnection(
                connectionId,
                context.workspaceId,
                "error",
              );
            else if (login.status === "expired")
              await this.markLoginConnection(
                connectionId,
                context.workspaceId,
                "expired",
              );
            else if (login.status === "canceled")
              await this.markLoginConnection(
                connectionId,
                context.workspaceId,
                "canceled",
              );
          } catch (error) {
            await this.markLoginPersistenceFailure(
              job.id,
              connectionId,
              context.workspaceId,
            );
            throw error;
          }
        },
      );
      const updated = await this.privilegedClient
        .from("agent_connection_auth_jobs")
        .update({
          status: "awaiting_user",
          ...(challenge.url ? { url: challenge.url } : {}),
          ...(challenge.code ? { code: challenge.code } : {}),
          updated_at: new Date().toISOString(),
        })
        .eq("id", job.id)
        .eq("workspace_id", context.workspaceId)
        .eq("status", "pending")
        .select("*")
        .maybeSingle();
      const updatedData = checked("agent_connections.login_challenge", updated);
      if (updatedData) return this.loginJob(row(updatedData));
      const current = await this.privilegedClient
        .from("agent_connection_auth_jobs")
        .select("*")
        .eq("id", job.id)
        .eq("workspace_id", context.workspaceId)
        .single();
      return this.loginJob(
        row(checked("agent_connections.login_challenge_current", current)),
      );
    } catch (error) {
      await this.privilegedClient
        .from("agent_connection_auth_jobs")
        .update({
          status: "failed",
          error_code: subscriptionLoginErrorCode(error),
          updated_at: new Date().toISOString(),
        })
        .eq("id", job.id)
        .eq("workspace_id", context.workspaceId)
        .in("status", ["pending", "awaiting_user"]);
      await this.privilegedClient
        .from("agent_connections")
        .update({
          status: "error",
          automation_consent: false,
          updated_at: new Date().toISOString(),
        })
        .eq("id", connectionId)
        .eq("workspace_id", context.workspaceId)
        .eq("status", "pending");
      const failed = await this.privilegedClient
        .from("agent_connection_auth_jobs")
        .select("*")
        .eq("id", job.id)
        .single();
      return this.loginJob(
        row(checked("agent_connections.login_failed", failed)),
      );
    }
  }

  async listLoginJobs(context: RequestContext): Promise<AgentLoginJob[]> {
    const jobs = await this.activeLoginRows(context);
    const result: AgentLoginJob[] = [];
    for (const value of jobs) {
      const job = this.loginJob(value);
      const active = this.subscriptionLogin.poll(job.id);
      result.push(
        active
          ? {
              ...job,
              status: active.status,
              ...(active.challenge.url ? { url: active.challenge.url } : {}),
              ...(active.challenge.code ? { code: active.challenge.code } : {}),
              ...(active.errorCode ? { errorCode: active.errorCode } : {}),
            }
          : await this.loginJobWithRunnerFallback(value, context),
      );
    }
    return result;
  }

  async pollLogin(
    context: RequestContext,
    jobId: string,
  ): Promise<AgentLoginJob | null> {
    const active = this.subscriptionLogin.poll(jobId);
    if (active) {
      const current = await this.privilegedClient
        .from("agent_connection_auth_jobs")
        .select("*")
        .eq("id", jobId)
        .eq("workspace_id", context.workspaceId)
        .maybeSingle();
      const data = checked("agent_connections.login_poll", current);
      if (!data) return null;
      if (!["pending", "awaiting_user"].includes(str(row(data).status)))
        return this.loginJob(row(data));
      const heartbeat = await this.privilegedClient
        .from("agent_connection_auth_jobs")
        .update({ updated_at: new Date().toISOString() })
        .eq("id", jobId)
        .eq("workspace_id", context.workspaceId);
      checked("agent_connections.login_poll_heartbeat", heartbeat);
      return {
        ...this.loginJob(row(data)),
        status: active.status,
        ...(active.challenge.url ? { url: active.challenge.url } : {}),
        ...(active.challenge.code ? { code: active.challenge.code } : {}),
        ...(active.errorCode ? { errorCode: active.errorCode } : {}),
      };
    }
    const result = await this.privilegedClient
      .from("agent_connection_auth_jobs")
      .select("*")
      .eq("id", jobId)
      .eq("workspace_id", context.workspaceId)
      .maybeSingle();
    const data = checked("agent_connections.login_poll_db", result);
    if (!data) return null;
    const job = this.loginJob(row(data));
    if (
      Date.parse(job.expiresAt) <= Date.now() &&
      ["pending", "awaiting_user"].includes(job.status)
    ) {
      return this.markLoginTerminal(
        { ...row(data), error_code: "login_expired" },
        context,
        "expired",
        "login_expired",
      );
    }
    if (["pending", "awaiting_user"].includes(job.status))
      return this.loginJobWithRunnerFallback(row(data), context);
    return job;
  }

  async cancelLogin(
    context: RequestContext,
    jobId: string,
  ): Promise<AgentLoginJob | null> {
    const result = await this.privilegedClient
      .from("agent_connection_auth_jobs")
      .select("*")
      .eq("id", jobId)
      .eq("workspace_id", context.workspaceId)
      .maybeSingle();
    const current = checked("agent_connections.login_cancel_lookup", result);
    if (!current) return null;
    const currentRow = row(current);
    if (!["pending", "awaiting_user"].includes(str(currentRow.status)))
      return this.loginJob(currentRow);
    const canceled = await this.privilegedClient
      .from("agent_connection_auth_jobs")
      .update({ status: "canceled", updated_at: new Date().toISOString() })
      .eq("id", jobId)
      .eq("workspace_id", context.workspaceId)
      .in("status", ["pending", "awaiting_user"]);
    checked("agent_connections.login_cancel", canceled);
    await this.subscriptionLogin.cancel(jobId);
    if (currentRow.connection_id)
      await this.markLoginConnection(
        str(currentRow.connection_id),
        context.workspaceId,
        "canceled",
      );
    const canceledResult = await this.privilegedClient
      .from("agent_connection_auth_jobs")
      .select("*")
      .eq("id", jobId)
      .eq("workspace_id", context.workspaceId)
      .maybeSingle();
    const data = checked("agent_connections.login_cancel", canceledResult);
    return data ? this.loginJob(row(data)) : null;
  }

  private policy(value: Record<string, unknown>): StageRoutingPolicy {
    const fallback = Array.isArray(value.fallback_connection_ids_json)
      ? value.fallback_connection_ids_json.filter(
          (item): item is string => typeof item === "string",
        )
      : [];
    return {
      stage: str(value.stage) as CodingStage,
      ...(value.connection_id
        ? { connectionId: str(value.connection_id) }
        : {}),
      ...(value.model ? { model: str(value.model) } : {}),
      ...(value.effort ? { effort: str(value.effort) } : {}),
      budget: row(value.budget_json),
      fallbackEnabled: value.fallback_enabled === true,
      fallbackConnectionIds: fallback,
      preset: str(value.preset, "Custom") as StageRoutingPolicy["preset"],
      ...(value.repository_id
        ? { repositoryId: str(value.repository_id) }
        : {}),
      snapshot: row(value.snapshot_json),
    };
  }

  async getPolicies(
    context: RequestContext,
    repositoryId?: string,
  ): Promise<StageRoutingPolicy[]> {
    let request = this.privilegedClient
      .from("agent_routing_policies")
      .select("*")
      .eq("workspace_id", context.workspaceId);
    if (repositoryId)
      request = request.or(
        `repository_id.is.null,repository_id.eq.${repositoryId}`,
      );
    const result = await request.order("stage", { ascending: true });
    return rows(checked("agent_routing_policies.list", result)).map((value) =>
      this.policy(row(value)),
    );
  }

  async putPolicy(
    context: RequestContext,
    input: AgentRoutingPolicyInput,
  ): Promise<StageRoutingPolicy> {
    if (input.connectionId) {
      const connection = await this.getConnection(
        input.connectionId,
        context.workspaceId,
      );
      if (!connection) throw new Error("agent_connection_not_found");
    }
    for (const fallbackId of input.fallbackConnectionIds ?? []) {
      if (!(await this.getConnection(fallbackId, context.workspaceId)))
        throw new Error(`agent_fallback_connection_not_found:${fallbackId}`);
    }
    let existingRequest = this.privilegedClient
      .from("agent_routing_policies")
      .select("id")
      .eq("workspace_id", context.workspaceId)
      .eq("stage", input.stage);
    existingRequest = input.repositoryId
      ? existingRequest.eq("repository_id", input.repositoryId)
      : existingRequest.is("repository_id", null);
    const existing = await existingRequest.maybeSingle();
    const existingData = checked("agent_routing_policies.existing", existing);
    const payload = {
      workspace_id: context.workspaceId,
      repository_id: input.repositoryId ?? null,
      stage: input.stage,
      connection_id: input.connectionId ?? null,
      model: input.model?.trim() || null,
      effort: input.effort?.trim() || null,
      budget_json: input.budget ?? {},
      fallback_enabled: input.fallbackEnabled === true,
      fallback_connection_ids_json: input.fallbackConnectionIds ?? [],
      preset: input.preset ?? "Custom",
      snapshot_json: snapshotRoutingPolicy({
        stage: input.stage,
        ...(input.repositoryId ? { repositoryId: input.repositoryId } : {}),
        ...(input.connectionId ? { connectionId: input.connectionId } : {}),
        ...(input.model ? { model: input.model } : {}),
        ...(input.effort ? { effort: input.effort } : {}),
        budget: input.budget,
        fallbackEnabled: input.fallbackEnabled,
        fallbackConnectionIds: input.fallbackConnectionIds,
        preset: input.preset ?? "Custom",
      }),
      created_by_user_id: context.userId,
      updated_at: new Date().toISOString(),
    };
    const result = existingData
      ? await this.privilegedClient
          .from("agent_routing_policies")
          .update(payload)
          .eq("id", str(row(existingData).id))
          .select("*")
          .single()
      : await this.privilegedClient
          .from("agent_routing_policies")
          .insert(payload)
          .select("*")
          .single();
    return this.policy(row(checked("agent_routing_policies.save", result)));
  }

  async resolveRunConfig(input: {
    context: RequestContext;
    stage: CodingStage;
    repositoryId?: string;
    override?: StageRoutingPolicyOverride;
    automation: boolean;
  }) {
    const policies = await this.getPolicies(input.context, input.repositoryId);
    const repositoryPolicy = policies.find(
      (policy) =>
        policy.stage === input.stage &&
        input.repositoryId &&
        policy.repositoryId === input.repositoryId,
    );
    const workspacePolicy = policies.find(
      (policy) => policy.stage === input.stage && !policy.repositoryId,
    );
    const connections = await this.listWorkspaceConnections(
      input.context.workspaceId,
    );
    if (input.context.role !== "owner" && input.context.role !== "admin") {
      const selectedIds = [
        input.override?.connectionId,
        ...(input.override?.fallbackConnectionIds ?? []),
      ].filter((id): id is string => Boolean(id));
      if (
        selectedIds.some(
          (id) =>
            connections.find((connection) => connection.id === id)
              ?.ownerUserId !== input.context.userId,
        )
      )
        throw new Error("agent_connection_forbidden");
    }
    const { policy } = resolveRoutingPolicy({
      stage: input.stage,
      override: input.override,
      repositoryPolicy,
      workspacePolicy,
    });
    const catalogs = Object.fromEntries(
      connections.map((connection) => [connection.id, connection.catalog]),
    ) as Record<string, CatalogSnapshot | undefined>;
    const selectedConnectionIds = [
      policy.connectionId,
      ...(policy.fallbackEnabled ? (policy.fallbackConnectionIds ?? []) : []),
    ].filter((id): id is string => Boolean(id));
    for (const connectionId of new Set(selectedConnectionIds)) {
      const connection = connections.find((item) => item.id === connectionId);
      if (!connection || connection.status !== "connected") continue;
      const catalog = await this.listModels(input.context, connectionId);
      if (catalog) catalogs[connectionId] = catalog;
    }
    return resolveEffectiveRunConfig({
      stage: input.stage,
      override: input.override,
      repositoryPolicy,
      workspacePolicy,
      connections: Object.fromEntries(
        connections.map((connection) => [connection.id, connection]),
      ),
      catalogs,
      automation: input.automation,
    });
  }
}
