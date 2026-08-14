import { decryptConnectionSecret } from "../../connection-crypto.js";
import {
  type AgentCredentialPort,
  type AgentCredentialRecord,
  type AgentCredentialTask,
  type AgentProvider,
  type RequestContext,
} from "../../contracts/api-ports.js";
import { connectionEncryptionKey } from "../../mcp.js";
import type { SupportModelConfig } from "../../coding-control-plane.js";
import type { AnySupabaseClient } from "./types.js";
import { checked, row, rows, str } from "../supabase-mappers.js";

/**
 * Compatibility port backed exclusively by the V2 connection plane.
 *
 * The old workspace_agent_credentials table is intentionally not queried here:
 * all runtime consumers must resolve through agent_connections and its secret.
 */
export class SupabaseAgentCredentialAdapter implements AgentCredentialPort {
  constructor(private readonly privilegedClient: AnySupabaseClient) {}

  private record(value: Record<string, unknown>): AgentCredentialRecord {
    return {
      task: String(value.purpose) === "support" ? "support" : "agent",
      provider: String(value.provider) as AgentProvider,
      configured: String(value.status) === "connected",
      updatedAt: String(value.updated_at ?? ""),
    };
  }

  async list(context: RequestContext): Promise<AgentCredentialRecord[]> {
    const result = await this.privilegedClient
      .from("agent_connections")
      .select("purpose, provider, status, updated_at")
      .eq("workspace_id", context.workspaceId)
      .in("purpose", ["coding", "support"])
      .order("updated_at", { ascending: true });
    return rows(checked("agent_credentials.list", result)).map((value) =>
      this.record(row(value)),
    );
  }

  async save(
    _context: RequestContext,
    _input: {
      task: AgentCredentialTask;
      provider: AgentProvider;
      apiKey: string;
      config?: Record<string, unknown>;
    },
  ): Promise<AgentCredentialRecord> {
    throw new Error("agent_credentials_v2_only");
  }

  async remove(
    context: RequestContext,
    task: AgentCredentialTask,
    provider: AgentProvider,
  ): Promise<boolean> {
    const purpose = task === "support" ? "support" : "coding";
    const connections = await this.privilegedClient
      .from("agent_connections")
      .select("id")
      .eq("workspace_id", context.workspaceId)
      .eq("purpose", purpose)
      .eq("provider", provider)
      .eq("status", "connected");
    const data = rows(checked("agent_credentials.remove.list", connections));
    if (!data.length) return false;
    const ids = data.map((value) => str(row(value).id));
    const secretResult = await this.privilegedClient
      .from("agent_connection_secrets")
      .delete()
      .in("connection_id", ids);
    checked("agent_credentials.remove.secrets", secretResult);
    const result = await this.privilegedClient
      .from("agent_connections")
      .update({
        status: "revoked",
        automation_consent: false,
        updated_at: new Date().toISOString(),
      })
      .in("id", ids)
      .select("id");
    return rows(checked("agent_credentials.remove", result)).length > 0;
  }

  async resolve(
    workspaceId: string,
    task: AgentCredentialTask,
    provider: AgentProvider,
  ): Promise<{ apiKey: string; config: Record<string, unknown> } | null> {
    const purpose = task === "support" ? "support" : "coding";
    const connectionResult = await this.privilegedClient
      .from("agent_connections")
      .select("id, metadata_json, support_config_json")
      .eq("workspace_id", workspaceId)
      .eq("purpose", purpose)
      .eq("provider", provider)
      .eq("auth_method", "api_key")
      .eq("status", "connected")
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    const connection = checked(
      "agent_credentials.connection",
      connectionResult,
    );
    if (!connection) return null;
    const connectionRow = row(connection);
    const secretResult = await this.privilegedClient
      .from("agent_connection_secrets")
      .select("encrypted_bundle")
      .eq("connection_id", str(connectionRow.id))
      .maybeSingle();
    const secret = checked("agent_credentials.connection_secret", secretResult);
    if (!secret) return null;
    const decrypted = decryptConnectionSecret(
      str(row(secret).encrypted_bundle),
      connectionEncryptionKey(),
    );
    let apiKey = decrypted;
    try {
      const bundle = JSON.parse(decrypted) as Record<string, unknown>;
      if (typeof bundle.apiKey === "string") apiKey = bundle.apiKey;
    } catch {
      // Older V2 rows stored the API key directly in the encrypted bundle.
    }
    const supportConfig = row(
      connectionRow.support_config_json,
    ) as Partial<SupportModelConfig>;
    return {
      apiKey,
      config: {
        ...row(connectionRow.metadata_json),
        ...(purpose === "support" ? supportConfig : {}),
      },
    };
  }
}
