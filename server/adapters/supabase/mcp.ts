import {
  discoverOAuthServerInfo,
  exchangeAuthorization,
  refreshAuthorization,
  registerClient,
  startAuthorization,
} from "@modelcontextprotocol/sdk/client/auth.js";
import type {
  AuthorizationServerMetadata,
  OAuthClientInformationMixed,
  OAuthTokens,
} from "@modelcontextprotocol/sdk/shared/auth.js";
import crypto from "node:crypto";
import {
  buildSupabaseMcpServerUrl,
  connectionEncryptionKey,
  decryptMcpSecret,
  discoverMcpTools,
  encryptMcpSecret,
  McpConnectionError,
  mcpConnectionRecordFromRow,
  parseSupabaseMcpServerUrl,
  sanitizeMcpError,
  validateMcpHeaders,
  validateMcpServerUrl,
  type McpAiMode,
  type McpAuthMode,
  type McpConnectionInput,
  type McpConnectionPatch,
  type McpConnectionPort,
  type McpConnectionRecord,
} from "../../mcp.js";
import type { AnySupabaseClient } from "./types.js";
import { checked, row, rows, str, type Row } from "../supabase-mappers.js";
const mcpConnectionSelect =
  "id, workspace_id, name, description, server_url, auth_mode, status, tools_json, allowed_tool_names_json, write_modes_json, last_error, last_tested_at, created_at, updated_at";
export class SupabaseMcpConnectionAdapter implements McpConnectionPort {
  constructor(
    private readonly client: AnySupabaseClient,
    private readonly privilegedClient: AnySupabaseClient = client,
  ) {}

  async list(context: { workspaceId: string }) {
    const result = await this.client
      .from("mcp_connections")
      .select(mcpConnectionSelect)
      .eq("workspace_id", context.workspaceId)
      .order("updated_at", { ascending: false });
    return rows(checked("mcp_connections.list", result)).map((value) =>
      mcpConnectionRecordFromRow(value),
    );
  }

  async runtimeList(context: { workspaceId: string }) {
    const connections = await this.list(context);
    const runtime: import("../../mcp.js").McpRuntimeConnection[] = [];
    for (const connection of connections) {
      if (
        connection.status !== "connected" ||
        !connection.allowedToolNames.length
      )
        continue;
      runtime.push({
        ...connection,
        headers: await this.headersFor(connection.id, connection.authMode),
      });
    }
    return runtime;
  }

  async create(
    context: { workspaceId: string; userId: string },
    input: McpConnectionInput,
  ) {
    const serverUrl = validateMcpServerUrl(
      input.provider === "supabase" && input.supabase
        ? buildSupabaseMcpServerUrl(input.supabase)
        : input.serverUrl,
    );
    if (
      new URL(serverUrl).hostname.toLowerCase() === "mcp.supabase.com" &&
      !parseSupabaseMcpServerUrl(serverUrl)
    )
      throw new McpConnectionError(
        400,
        "supabase_mcp_scope_required",
        "Supabase MCP connections must be scoped to one project and an explicit feature allowlist.",
      );
    const authMode =
      input.provider === "supabase" ? "oauth" : (input.authMode ?? "none");
    if (!["none", "headers", "oauth"].includes(authMode))
      throw new McpConnectionError(
        400,
        "mcp_auth_mode_invalid",
        "MCP authentication mode is invalid.",
      );
    const headers = validateMcpHeaders(input.headers);
    if (authMode === "headers" && !Object.keys(headers).length)
      throw new McpConnectionError(
        400,
        "mcp_headers_required",
        "At least one MCP header is required.",
      );
    if (authMode === "oauth" && headers && Object.keys(headers).length)
      throw new McpConnectionError(
        400,
        "mcp_oauth_headers_conflict",
        "OAuth connections cannot also define manual headers.",
      );
    const result = await this.privilegedClient
      .from("mcp_connections")
      .insert({
        workspace_id: context.workspaceId,
        name: input.name.trim(),
        description: input.description?.trim() ?? "",
        server_url: serverUrl,
        auth_mode: authMode,
        status: authMode === "oauth" ? "pending" : "connected",
        created_by_user_id: context.userId,
      })
      .select(mcpConnectionSelect)
      .single();
    const connection = mcpConnectionRecordFromRow(
      row(checked("mcp_connections.create", result)),
    );
    if (authMode === "headers") {
      await this.privilegedClient.from("mcp_connection_secrets").upsert(
        {
          connection_id: connection.id,
          headers_encrypted: encryptMcpSecret(
            JSON.stringify(headers),
            connectionEncryptionKey(),
          ),
          updated_at: new Date().toISOString(),
        },
        { onConflict: "connection_id" },
      );
    }
    if (authMode === "oauth" && (input.clientId || input.clientSecret)) {
      await this.privilegedClient.from("mcp_connection_secrets").upsert(
        {
          connection_id: connection.id,
          ...(input.clientId
            ? {
                client_id_encrypted: encryptMcpSecret(
                  input.clientId,
                  connectionEncryptionKey(),
                ),
              }
            : {}),
          ...(input.clientSecret
            ? {
                client_secret_encrypted: encryptMcpSecret(
                  input.clientSecret,
                  connectionEncryptionKey(),
                ),
              }
            : {}),
          updated_at: new Date().toISOString(),
        },
        { onConflict: "connection_id" },
      );
    }
    await this.audit(context, "mcp.connection_created", connection.id, {
      authMode,
      serverHost: new URL(serverUrl).host,
    });
    const tested =
      authMode === "oauth"
        ? connection
        : await this.test(context, connection.id);
    return { connection: tested ?? connection };
  }

  async update(
    context: { workspaceId: string; userId: string },
    connectionId: string,
    input: McpConnectionPatch,
  ) {
    const current = await this.get(context.workspaceId, connectionId);
    if (!current) return null;
    const allowed = input.allowedToolNames
      ? [...new Set(input.allowedToolNames)].filter((name) =>
          current.tools.some((tool) => tool.name === name),
        )
      : undefined;
    const writeModes = input.writeModes
      ? [...new Set(input.writeModes)].filter(
          (mode): mode is McpAiMode => mode === "draft" || mode === "safe_auto",
        )
      : undefined;
    const result = await this.client
      .from("mcp_connections")
      .update({
        ...(input.name !== undefined ? { name: input.name.trim() } : {}),
        ...(input.description !== undefined
          ? { description: input.description.trim() }
          : {}),
        ...(allowed !== undefined ? { allowed_tool_names_json: allowed } : {}),
        ...(writeModes !== undefined ? { write_modes_json: writeModes } : {}),
        updated_at: new Date().toISOString(),
      })
      .eq("id", connectionId)
      .eq("workspace_id", context.workspaceId)
      .select(mcpConnectionSelect)
      .maybeSingle();
    const updated = checked("mcp_connections.update", result);
    if (!updated) return null;
    await this.audit(context, "mcp.connection_updated", connectionId, {
      allowedToolCount: allowed?.length,
      writeModes,
    });
    return mcpConnectionRecordFromRow(row(updated));
  }

  async test(
    context: { workspaceId: string; userId: string },
    connectionId: string,
  ) {
    const current = await this.get(context.workspaceId, connectionId);
    if (!current) return null;
    try {
      const headers = await this.headersFor(connectionId, current.authMode);
      const tools = await discoverMcpTools(current.serverUrl, headers);
      const result = await this.client
        .from("mcp_connections")
        .update({
          status: "connected",
          tools_json: tools,
          last_error: null,
          last_tested_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", connectionId)
        .eq("workspace_id", context.workspaceId)
        .select(mcpConnectionSelect)
        .maybeSingle();
      const updated = checked("mcp_connections.test", result);
      if (!updated) return null;
      await this.audit(context, "mcp.connection_tested", connectionId, {
        toolCount: tools.length,
      });
      return mcpConnectionRecordFromRow(row(updated));
    } catch (error) {
      const message = sanitizeMcpError(error);
      await this.client
        .from("mcp_connections")
        .update({
          status: "error",
          last_error: message,
          last_tested_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", connectionId)
        .eq("workspace_id", context.workspaceId);
      throw new McpConnectionError(
        502,
        "mcp_connection_failed",
        "MCP connection test failed.",
      );
    }
  }

  async startOAuth(
    context: { workspaceId: string; userId: string },
    connectionId: string,
  ): Promise<{ oauthUrl: string }> {
    const connection = await this.get(context.workspaceId, connectionId);
    if (!connection)
      throw new McpConnectionError(
        404,
        "mcp_connection_not_found",
        "MCP connection not found.",
      );
    if (connection.authMode !== "oauth")
      throw new McpConnectionError(
        400,
        "mcp_oauth_mode_required",
        "This connection does not use OAuth.",
      );
    const info = await discoverOAuthServerInfo(connection.serverUrl);
    const baseUrl =
      process.env.APP_BASE_URL?.trim() || process.env.PUBLIC_APP_URL?.trim();
    if (!baseUrl)
      throw new McpConnectionError(
        503,
        "mcp_oauth_base_url_missing",
        "APP_BASE_URL is required for MCP OAuth.",
      );
    const redirectUrl = new URL(
      "/api/mcp/connections/oauth/callback",
      baseUrl,
    ).toString();
    const clientInformation = await this.oauthClientInformation(
      connectionId,
      redirectUrl,
      {
        authorizationServerUrl: info.authorizationServerUrl,
        metadata: info.authorizationServerMetadata,
        scope: info.resourceMetadata?.scopes_supported?.join(" "),
      },
    );
    const state = crypto.randomBytes(24).toString("base64url");
    const started = await startAuthorization(info.authorizationServerUrl, {
      metadata: info.authorizationServerMetadata,
      clientInformation,
      redirectUrl,
      scope: info.resourceMetadata?.scopes_supported?.join(" "),
      state,
      resource: info.resourceMetadata?.resource
        ? new URL(info.resourceMetadata.resource)
        : new URL(connection.serverUrl),
    });
    await this.privilegedClient.from("mcp_oauth_states").insert({
      state_hash: crypto.createHash("sha256").update(state).digest("hex"),
      connection_id: connectionId,
      workspace_id: context.workspaceId,
      user_id: context.userId,
      verifier_encrypted: encryptMcpSecret(
        started.codeVerifier,
        connectionEncryptionKey(),
      ),
      issuer:
        info.authorizationServerMetadata?.issuer ??
        String(info.authorizationServerUrl),
      expires_at: new Date(Date.now() + 10 * 60_000).toISOString(),
    });
    await this.audit(context, "mcp.oauth_started", connectionId, {
      issuer:
        info.authorizationServerMetadata?.issuer ??
        String(info.authorizationServerUrl),
    });
    return { oauthUrl: started.authorizationUrl.toString() };
  }

  async completeOAuth(
    code: string,
    state: string,
  ): Promise<McpConnectionRecord> {
    const stateHash = crypto.createHash("sha256").update(state).digest("hex");
    const stateResult = await this.privilegedClient
      .from("mcp_oauth_states")
      .select("*")
      .eq("state_hash", stateHash)
      .maybeSingle();
    const stateRow = checked("mcp_oauth_states.get", stateResult);
    if (
      !stateRow ||
      new Date(str(row(stateRow).expires_at)).getTime() < Date.now() ||
      row(stateRow).consumed_at
    )
      throw new McpConnectionError(
        400,
        "mcp_oauth_state_invalid",
        "MCP OAuth state is invalid or expired.",
      );
    const stateValue = row(stateRow);
    const connectionResult = await this.privilegedClient
      .from("mcp_connections")
      .select(mcpConnectionSelect)
      .eq("id", str(stateValue.connection_id))
      .eq("workspace_id", str(stateValue.workspace_id))
      .maybeSingle();
    const connectionData = checked("mcp_connections.oauth", connectionResult);
    if (!connectionData)
      throw new McpConnectionError(
        404,
        "mcp_connection_not_found",
        "MCP connection not found.",
      );
    const connection = mcpConnectionRecordFromRow(row(connectionData));
    const baseUrl =
      process.env.APP_BASE_URL?.trim() || process.env.PUBLIC_APP_URL?.trim();
    if (!baseUrl)
      throw new McpConnectionError(
        503,
        "mcp_oauth_base_url_missing",
        "APP_BASE_URL is required for MCP OAuth.",
      );
    const redirectUrl = new URL(
      "/api/mcp/connections/oauth/callback",
      baseUrl,
    ).toString();
    const info = await discoverOAuthServerInfo(connection.serverUrl);
    const discoveredIssuer =
      info.authorizationServerMetadata?.issuer ??
      String(info.authorizationServerUrl);
    if (str(stateValue.issuer) && str(stateValue.issuer) !== discoveredIssuer)
      throw new McpConnectionError(
        400,
        "mcp_oauth_issuer_invalid",
        "MCP OAuth issuer changed during authorization.",
      );
    const clientInformation = await this.oauthClientInformation(
      connection.id,
      redirectUrl,
    );
    const verifier = decryptMcpSecret(
      str(stateValue.verifier_encrypted),
      connectionEncryptionKey(),
    );
    const tokens = await exchangeAuthorization(info.authorizationServerUrl, {
      metadata: info.authorizationServerMetadata,
      clientInformation,
      authorizationCode: code,
      codeVerifier: verifier,
      redirectUri: redirectUrl,
      resource: info.resourceMetadata?.resource
        ? new URL(info.resourceMetadata.resource)
        : new URL(connection.serverUrl),
    });
    await this.saveOAuthTokens(connection.id, tokens);
    await this.privilegedClient
      .from("mcp_oauth_states")
      .update({ consumed_at: new Date().toISOString() })
      .eq("state_hash", stateHash);
    const tools = await discoverMcpTools(connection.serverUrl, {
      Authorization: `Bearer ${tokens.access_token}`,
    });
    const updated = await this.privilegedClient
      .from("mcp_connections")
      .update({
        status: "connected",
        tools_json: tools,
        last_error: null,
        last_tested_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", connection.id)
      .select(mcpConnectionSelect)
      .maybeSingle();
    const result = checked("mcp_connections.oauth_complete", updated);
    if (!result)
      throw new McpConnectionError(
        500,
        "mcp_oauth_connection_missing",
        "MCP connection disappeared during OAuth.",
      );
    return mcpConnectionRecordFromRow(row(result));
  }

  async disconnect(
    context: { workspaceId: string; userId: string },
    connectionId: string,
  ) {
    const result = await this.client
      .from("mcp_connections")
      .update({
        status: "disconnected",
        allowed_tool_names_json: [],
        write_modes_json: [],
        last_error: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", connectionId)
      .eq("workspace_id", context.workspaceId)
      .select(mcpConnectionSelect)
      .maybeSingle();
    const updated = checked("mcp_connections.disconnect", result);
    if (!updated) return null;
    await this.privilegedClient
      .from("mcp_connection_secrets")
      .delete()
      .eq("connection_id", connectionId);
    await this.audit(context, "mcp.connection_disconnected", connectionId, {});
    return mcpConnectionRecordFromRow(row(updated));
  }

  private async get(workspaceId: string, connectionId: string) {
    const result = await this.client
      .from("mcp_connections")
      .select(mcpConnectionSelect)
      .eq("id", connectionId)
      .eq("workspace_id", workspaceId)
      .maybeSingle();
    const value = checked("mcp_connections.get", result);
    return value ? mcpConnectionRecordFromRow(row(value)) : null;
  }

  private async headersFor(connectionId: string, authMode: McpAuthMode) {
    if (authMode === "oauth") {
      const result = await this.privilegedClient
        .from("mcp_connection_secrets")
        .select(
          "access_token_encrypted, refresh_token_encrypted, token_expires_at",
        )
        .eq("connection_id", connectionId)
        .maybeSingle();
      const secret = checked("mcp_connection_secrets.oauth", result);
      const encrypted =
        secret && typeof secret === "object"
          ? (secret as Row).access_token_encrypted
          : null;
      if (typeof encrypted !== "string") return {};
      const expiresAt = str((secret as Row).token_expires_at);
      if (!expiresAt || new Date(expiresAt).getTime() > Date.now() + 60_000)
        return {
          Authorization: `Bearer ${decryptMcpSecret(encrypted, connectionEncryptionKey())}`,
        };
      const refreshEncrypted = (secret as Row).refresh_token_encrypted;
      if (typeof refreshEncrypted !== "string")
        return {
          Authorization: `Bearer ${decryptMcpSecret(encrypted, connectionEncryptionKey())}`,
        };
      const connectionResult = await this.privilegedClient
        .from("mcp_connections")
        .select("server_url")
        .eq("id", connectionId)
        .maybeSingle();
      const connectionRow = checked(
        "mcp_connections.oauth_refresh",
        connectionResult,
      );
      if (!connectionRow) return {};
      const serverUrl = str(row(connectionRow).server_url);
      const info = await discoverOAuthServerInfo(serverUrl);
      const baseUrl =
        process.env.APP_BASE_URL?.trim() || process.env.PUBLIC_APP_URL?.trim();
      if (!baseUrl) return {};
      const redirectUrl = new URL(
        "/api/mcp/connections/oauth/callback",
        baseUrl,
      ).toString();
      const clientInformation = await this.oauthClientInformation(
        connectionId,
        redirectUrl,
      );
      const tokens = await refreshAuthorization(info.authorizationServerUrl, {
        metadata: info.authorizationServerMetadata,
        clientInformation,
        refreshToken: decryptMcpSecret(
          refreshEncrypted,
          connectionEncryptionKey(),
        ),
        resource: info.resourceMetadata?.resource
          ? new URL(info.resourceMetadata.resource)
          : new URL(serverUrl),
      });
      await this.saveOAuthTokens(connectionId, tokens);
      return { Authorization: `Bearer ${tokens.access_token}` };
    }
    if (authMode !== "headers") return {};
    const result = await this.privilegedClient
      .from("mcp_connection_secrets")
      .select("headers_encrypted")
      .eq("connection_id", connectionId)
      .maybeSingle();
    const secret = checked("mcp_connection_secrets.get", result);
    const encrypted =
      secret && typeof secret === "object"
        ? (secret as Row).headers_encrypted
        : null;
    if (typeof encrypted !== "string") return {};
    const value = JSON.parse(
      decryptMcpSecret(encrypted, connectionEncryptionKey()),
    ) as unknown;
    return validateMcpHeaders(value as Record<string, string>);
  }

  private async oauthClientInformation(
    connectionId: string,
    redirectUrl: string,
    registration?: {
      authorizationServerUrl: string;
      metadata?: AuthorizationServerMetadata;
      scope?: string;
    },
  ): Promise<OAuthClientInformationMixed> {
    const result = await this.privilegedClient
      .from("mcp_connection_secrets")
      .select("client_id_encrypted, client_secret_encrypted")
      .eq("connection_id", connectionId)
      .maybeSingle();
    const value = checked("mcp_connection_secrets.oauth_client", result);
    const rowValue = value && typeof value === "object" ? (value as Row) : {};
    const clientId =
      typeof rowValue.client_id_encrypted === "string"
        ? decryptMcpSecret(
            rowValue.client_id_encrypted,
            connectionEncryptionKey(),
          )
        : undefined;
    const clientSecret =
      typeof rowValue.client_secret_encrypted === "string"
        ? decryptMcpSecret(
            rowValue.client_secret_encrypted,
            connectionEncryptionKey(),
          )
        : undefined;
    if (!clientId) {
      if (!registration)
        throw new McpConnectionError(
          409,
          "mcp_oauth_client_missing",
          "MCP OAuth client registration is missing. Start authorization again.",
        );
      const registered = await registerClient(
        registration.authorizationServerUrl,
        {
          metadata: registration.metadata,
          scope: registration.scope,
          clientMetadata: {
            client_name: "Mend workspace MCP connector",
            redirect_uris: [redirectUrl],
            grant_types: ["authorization_code", "refresh_token"],
            response_types: ["code"],
            token_endpoint_auth_method: "client_secret_basic",
          },
        },
      );
      await this.privilegedClient.from("mcp_connection_secrets").upsert({
        connection_id: connectionId,
        client_id_encrypted: encryptMcpSecret(
          registered.client_id,
          connectionEncryptionKey(),
        ),
        ...(registered.client_secret
          ? {
              client_secret_encrypted: encryptMcpSecret(
                registered.client_secret,
                connectionEncryptionKey(),
              ),
            }
          : {}),
        updated_at: new Date().toISOString(),
      });
      return registered;
    }
    return {
      client_id: clientId,
      ...(clientSecret ? { client_secret: clientSecret } : {}),
      redirect_uris: [new URL(redirectUrl)],
    } as OAuthClientInformationMixed;
  }

  private async saveOAuthTokens(
    connectionId: string,
    tokens: OAuthTokens,
  ): Promise<void> {
    await this.privilegedClient.from("mcp_connection_secrets").upsert(
      {
        connection_id: connectionId,
        access_token_encrypted: encryptMcpSecret(
          tokens.access_token,
          connectionEncryptionKey(),
        ),
        ...(tokens.refresh_token
          ? {
              refresh_token_encrypted: encryptMcpSecret(
                tokens.refresh_token,
                connectionEncryptionKey(),
              ),
            }
          : {}),
        token_expires_at: tokens.expires_in
          ? new Date(Date.now() + tokens.expires_in * 1000).toISOString()
          : null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "connection_id" },
    );
  }

  private async audit(
    context: { workspaceId: string; userId: string },
    action: string,
    connectionId: string,
    metadata: Record<string, unknown>,
  ) {
    const result = await this.client.from("audit_log").insert({
      workspace_id: context.workspaceId,
      actor_user_id: context.userId,
      action,
      entity_type: "mcp_connection",
      entity_id: connectionId,
      metadata_json: metadata,
    });
    checked(`audit_log.${action}`, result);
  }
}
