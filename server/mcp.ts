import crypto from "node:crypto";
import net from "node:net";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import {
  decryptConnectionSecret,
  encryptConnectionSecret,
} from "./connection-crypto.js";

export type McpAuthMode = "none" | "headers" | "oauth";
export type McpConnectionStatus =
  | "pending"
  | "connected"
  | "error"
  | "disconnected";
export type McpAiMode = "draft" | "safe_auto";
export type McpProvider = "custom" | "supabase";
export const supabaseMcpFeatures = [
  "docs",
  "database",
  "debugging",
  "development",
  "functions",
  "branching",
  "storage",
] as const;
export type SupabaseMcpFeature = (typeof supabaseMcpFeatures)[number];

export interface SupabaseMcpScope {
  projectRef: string;
  readOnly: boolean;
  features: SupabaseMcpFeature[];
}

export interface McpToolRecord {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  readOnly: boolean;
}

export interface McpConnectionRecord {
  id: string;
  workspaceId: string;
  name: string;
  description: string;
  serverUrl: string;
  provider: McpProvider;
  supabaseScope: SupabaseMcpScope | null;
  authMode: McpAuthMode;
  status: McpConnectionStatus;
  tools: McpToolRecord[];
  allowedToolNames: string[];
  writeModes: McpAiMode[];
  lastError: string | null;
  lastTestedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface McpRuntimeConnection extends McpConnectionRecord {
  headers: Record<string, string>;
}

export interface McpConnectionInput {
  name: string;
  description?: string;
  serverUrl: string;
  authMode?: McpAuthMode;
  headers?: Record<string, string>;
  clientId?: string;
  clientSecret?: string;
  provider?: McpProvider;
  supabase?: SupabaseMcpScope;
}

export interface McpConnectionPatch {
  name?: string;
  description?: string;
  allowedToolNames?: string[];
  writeModes?: McpAiMode[];
}

function mcpStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

export function mcpConnectionRecordFromRow(
  row: Record<string, unknown>,
): McpConnectionRecord {
  const authMode = row.auth_mode;
  const status = row.status;
  const serverUrl = String(row.server_url ?? "");
  const supabaseScope = parseSupabaseMcpServerUrl(serverUrl);
  return {
    id: String(row.id ?? ""),
    workspaceId: String(row.workspace_id ?? ""),
    name: String(row.name ?? ""),
    description: typeof row.description === "string" ? row.description : "",
    serverUrl,
    provider: supabaseScope ? "supabase" : "custom",
    supabaseScope,
    authMode:
      authMode === "headers" || authMode === "oauth" ? authMode : "none",
    status:
      status === "pending" ||
      status === "connected" ||
      status === "error" ||
      status === "disconnected"
        ? status
        : "error",
    tools: Array.isArray(row.tools_json)
      ? row.tools_json
          .map(mcpToolRecord)
          .filter((tool): tool is McpToolRecord => Boolean(tool))
      : [],
    allowedToolNames: mcpStringArray(row.allowed_tool_names_json),
    writeModes: mcpStringArray(row.write_modes_json).filter(
      (mode): mode is McpAiMode => mode === "draft" || mode === "safe_auto",
    ),
    lastError: typeof row.last_error === "string" ? row.last_error : null,
    lastTestedAt:
      typeof row.last_tested_at === "string" ? row.last_tested_at : null,
    createdAt: String(row.created_at ?? ""),
    updatedAt: String(row.updated_at ?? ""),
  };
}

export function buildSupabaseMcpServerUrl(scope: SupabaseMcpScope): string {
  const projectRef = scope.projectRef.trim().toLowerCase();
  if (!/^[a-z0-9]{6,64}$/.test(projectRef))
    throw new McpConnectionError(
      400,
      "supabase_project_ref_invalid",
      "Supabase project ref is invalid.",
    );
  const features = [...new Set(scope.features)].filter(
    (feature): feature is SupabaseMcpFeature =>
      supabaseMcpFeatures.includes(feature as SupabaseMcpFeature),
  );
  if (!features.length || features.length !== new Set(scope.features).size)
    throw new McpConnectionError(
      400,
      "supabase_mcp_features_invalid",
      "Choose at least one supported Supabase feature group.",
    );
  const url = new URL("https://mcp.supabase.com/mcp");
  url.searchParams.set("project_ref", projectRef);
  if (scope.readOnly) url.searchParams.set("read_only", "true");
  url.searchParams.set("features", features.join(","));
  return url.toString();
}

export function parseSupabaseMcpServerUrl(
  value: string,
): SupabaseMcpScope | null {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  if (
    url.protocol !== "https:" ||
    url.hostname.toLowerCase() !== "mcp.supabase.com" ||
    url.pathname.replace(/\/$/, "") !== "/mcp"
  )
    return null;
  const allowedParameters = new Set(["project_ref", "read_only", "features"]);
  for (const key of url.searchParams.keys()) {
    if (
      !allowedParameters.has(key) ||
      url.searchParams.getAll(key).length !== 1
    )
      return null;
  }
  const readOnlyValue = url.searchParams.get("read_only");
  if (readOnlyValue !== null && readOnlyValue !== "true") return null;
  const projectRef = url.searchParams.get("project_ref")?.trim() ?? "";
  if (!/^[a-z0-9]{6,64}$/.test(projectRef)) return null;
  const requestedFeatures = (url.searchParams.get("features") ?? "")
    .split(",")
    .filter(Boolean);
  if (
    requestedFeatures.some(
      (feature) => !supabaseMcpFeatures.includes(feature as SupabaseMcpFeature),
    )
  )
    return null;
  const features = requestedFeatures as SupabaseMcpFeature[];
  if (!features.length) return null;
  return {
    projectRef,
    readOnly: readOnlyValue === "true",
    features: [...new Set(features)],
  };
}

export interface McpConnectionPort {
  list(context: { workspaceId: string }): Promise<McpConnectionRecord[]>;
  runtimeList(context: {
    workspaceId: string;
  }): Promise<McpRuntimeConnection[]>;
  create(
    context: { workspaceId: string; userId: string },
    input: McpConnectionInput,
  ): Promise<{ connection: McpConnectionRecord }>;
  update(
    context: { workspaceId: string; userId: string },
    connectionId: string,
    input: McpConnectionPatch,
  ): Promise<McpConnectionRecord | null>;
  test(
    context: { workspaceId: string; userId: string },
    connectionId: string,
  ): Promise<McpConnectionRecord | null>;
  startOAuth(
    context: { workspaceId: string; userId: string },
    connectionId: string,
  ): Promise<{ oauthUrl: string }>;
  completeOAuth(code: string, state: string): Promise<McpConnectionRecord>;
  disconnect(
    context: { workspaceId: string; userId: string },
    connectionId: string,
  ): Promise<McpConnectionRecord | null>;
}

export class McpConnectionError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "McpConnectionError";
  }
}

export function validateMcpServerUrl(
  value: string,
  env: NodeJS.ProcessEnv = process.env,
): string {
  let url: URL;
  try {
    url = new URL(value.trim());
  } catch {
    throw new McpConnectionError(
      400,
      "mcp_server_url_invalid",
      "MCP URL is invalid.",
    );
  }
  const allowLocal = env.NODE_ENV !== "production";
  if (url.protocol !== "https:" && !(allowLocal && url.protocol === "http:"))
    throw new McpConnectionError(
      400,
      "mcp_server_url_insecure",
      "MCP servers must use HTTPS in production.",
    );
  const hostname = url.hostname.toLowerCase();
  const ip = net.isIP(hostname.replace(/^\[|\]$/g, ""));
  const privateIpv4 =
    ip === 4 &&
    (hostname.startsWith("10.") ||
      hostname.startsWith("192.168.") ||
      /^172\.(1[6-9]|2\d|3[0-1])\./.test(hostname) ||
      hostname.startsWith("169.254.") ||
      hostname === "0.0.0.0");
  const privateIpv6 =
    ip === 6 &&
    (hostname === "::1" ||
      hostname.startsWith("fc") ||
      hostname.startsWith("fd") ||
      hostname.startsWith("fe8") ||
      hostname.startsWith("fe9") ||
      hostname.startsWith("fea") ||
      hostname.startsWith("feb"));
  if (
    !allowLocal &&
    (hostname === "localhost" ||
      hostname === "127.0.0.1" ||
      hostname === "[::1]" ||
      hostname.endsWith(".localhost") ||
      hostname.endsWith(".local") ||
      privateIpv4 ||
      privateIpv6)
  )
    throw new McpConnectionError(
      400,
      "mcp_server_url_private",
      "Private MCP server URLs are not allowed in production.",
    );
  return url.toString();
}

const forbiddenHeaders = new Set([
  "host",
  "content-length",
  "connection",
  "cookie",
  "set-cookie",
  "transfer-encoding",
]);

export function validateMcpHeaders(
  value: Record<string, string> | undefined,
): Record<string, string> {
  const headers: Record<string, string> = {};
  for (const [name, headerValue] of Object.entries(value ?? {})) {
    const normalized = name.trim();
    if (!normalized || forbiddenHeaders.has(normalized.toLowerCase()))
      throw new McpConnectionError(
        400,
        "mcp_header_invalid",
        "MCP header name is not allowed.",
      );
    if (normalized.length > 120 || headerValue.length > 4_000)
      throw new McpConnectionError(
        400,
        "mcp_header_invalid",
        "MCP header is too long.",
      );
    headers[normalized] = headerValue;
  }
  return headers;
}

export function encryptMcpSecret(value: string, secret: string): string {
  return encryptConnectionSecret(value, secret);
}

export function decryptMcpSecret(value: string, secret: string): string {
  return decryptConnectionSecret(value, secret);
}

export function connectionEncryptionKey(
  env: NodeJS.ProcessEnv = process.env,
): string {
  const key =
    env.MEND_AGENT_CREDENTIAL_ENCRYPTION_KEY?.trim() ||
    env.CONNECTION_ENCRYPTION_KEY?.trim() ||
    env.GOOGLE_TOKEN_ENCRYPTION_KEY?.trim();
  if (!key)
    throw new McpConnectionError(
      503,
      "mcp_encryption_not_configured",
      "Connection encryption is not configured.",
    );
  return key;
}

export function mcpArgumentsHmac(
  argumentsJson: string,
  secret: string,
): string {
  return crypto
    .createHmac("sha256", secret)
    .update(argumentsJson)
    .digest("hex");
}

export function mcpToolRecord(value: unknown): McpToolRecord | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  const name = typeof row.name === "string" ? row.name.trim() : "";
  if (!name || name.length > 200) return null;
  const inputSchema =
    row.inputSchema &&
    typeof row.inputSchema === "object" &&
    !Array.isArray(row.inputSchema)
      ? (row.inputSchema as Record<string, unknown>)
      : { type: "object", properties: {} };
  const annotations = row.annotations;
  const readOnly =
    annotations &&
    typeof annotations === "object" &&
    !Array.isArray(annotations)
      ? (annotations as Record<string, unknown>).readOnlyHint === true
      : false;
  return {
    name,
    description:
      typeof row.description === "string"
        ? row.description.slice(0, 4_000)
        : "",
    inputSchema,
    readOnly,
  };
}

export function sanitizeMcpError(error: unknown): string {
  return (error instanceof Error ? error.message : String(error)).slice(
    0,
    1_000,
  );
}

export async function discoverMcpTools(
  serverUrl: string,
  headers: Record<string, string> = {},
): Promise<McpToolRecord[]> {
  const client = new Client({ name: "mend", version: "0.1.0" });
  const transport = new StreamableHTTPClientTransport(new URL(serverUrl), {
    requestInit: { headers },
    reconnectionOptions: {
      maxRetries: 0,
      initialReconnectionDelay: 100,
      maxReconnectionDelay: 100,
      reconnectionDelayGrowFactor: 1,
    },
  });
  try {
    await client.connect(transport);
    const result = await client.listTools();
    return (result.tools ?? [])
      .map(mcpToolRecord)
      .filter((tool): tool is McpToolRecord => Boolean(tool));
  } finally {
    await transport.close().catch(() => undefined);
  }
}
