import {
  decryptConnectionSecret,
  encryptConnectionSecret,
} from "../../connection-crypto.js";
import {
  type AgentCredentialPort,
  type AgentCredentialRecord,
  type AgentCredentialTask,
  type AgentProvider,
  type RequestContext,
} from "../../contracts/api-ports.js";
import { connectionEncryptionKey } from "../../mcp.js";
import type { AnySupabaseClient } from "./types.js";
import { checked, row, rows, str } from "../supabase-mappers.js";
export class SupabaseAgentCredentialAdapter implements AgentCredentialPort {
  constructor(private readonly privilegedClient: AnySupabaseClient) {}

  private record(value: Record<string, unknown>): AgentCredentialRecord {
    return {
      task: String(value.task) as AgentCredentialTask,
      provider: String(value.provider) as AgentProvider,
      configured: true,
      updatedAt: String(value.updated_at ?? ""),
    };
  }

  async list(context: RequestContext): Promise<AgentCredentialRecord[]> {
    const result = await this.privilegedClient
      .from("workspace_agent_credentials")
      .select("task, provider, updated_at")
      .eq("workspace_id", context.workspaceId)
      .order("task", { ascending: true });
    return rows(checked("agent_credentials.list", result)).map((value) =>
      this.record(row(value)),
    );
  }

  async save(
    context: RequestContext,
    input: {
      task: AgentCredentialTask;
      provider: AgentProvider;
      apiKey: string;
      config?: Record<string, unknown>;
    },
  ): Promise<AgentCredentialRecord> {
    const apiKey = input.apiKey.trim();
    if (!apiKey) throw new Error("agent_credential_key_required");
    const result = await this.privilegedClient
      .from("workspace_agent_credentials")
      .upsert(
        {
          workspace_id: context.workspaceId,
          task: input.task,
          provider: input.provider,
          encrypted_api_key: encryptConnectionSecret(
            apiKey,
            connectionEncryptionKey(),
          ),
          config_json: input.config ?? {},
          updated_at: new Date().toISOString(),
        },
        { onConflict: "workspace_id,task,provider" },
      )
      .select("task, provider, updated_at")
      .single();
    return this.record(row(checked("agent_credentials.save", result)));
  }

  async remove(
    context: RequestContext,
    task: AgentCredentialTask,
    provider: AgentProvider,
  ): Promise<boolean> {
    const result = await this.privilegedClient
      .from("workspace_agent_credentials")
      .delete()
      .eq("workspace_id", context.workspaceId)
      .eq("task", task)
      .eq("provider", provider)
      .select("id");
    const data = checked("agent_credentials.remove", result);
    return rows(data).length > 0;
  }

  async resolve(
    workspaceId: string,
    task: AgentCredentialTask,
    provider: AgentProvider,
  ): Promise<{ apiKey: string; config: Record<string, unknown> } | null> {
    if (task === "support") {
      const connectionResult = await this.privilegedClient
        .from("agent_connections")
        .select("id, metadata_json")
        .eq("workspace_id", workspaceId)
        .eq("purpose", "support")
        .eq("provider", provider)
        .eq("auth_method", "api_key")
        .eq("status", "connected")
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      const connection = checked(
        "agent_credentials.support_connection",
        connectionResult,
      );
      if (connection) {
        const connectionRow = row(connection);
        const secretResult = await this.privilegedClient
          .from("agent_connection_secrets")
          .select("encrypted_bundle")
          .eq("connection_id", str(connectionRow.id))
          .maybeSingle();
        const secret = checked(
          "agent_credentials.support_connection_secret",
          secretResult,
        );
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
          // Legacy connection payloads stored the API key directly.
        }
        return { apiKey, config: row(connectionRow.metadata_json) };
      }
    }
    const result = await this.privilegedClient
      .from("workspace_agent_credentials")
      .select("encrypted_api_key, config_json")
      .eq("workspace_id", workspaceId)
      .eq("task", task)
      .eq("provider", provider)
      .maybeSingle();
    const data = checked("agent_credentials.resolve", result);
    if (!data) return null;
    const value = row(data);
    return {
      apiKey: decryptConnectionSecret(
        String(value.encrypted_api_key),
        connectionEncryptionKey(),
      ),
      config: row(value.config_json),
    };
  }
}
