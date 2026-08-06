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
  return {
    id: String(row.id ?? ""),
    workspaceId: String(row.workspace_id ?? ""),
    name: String(row.name ?? ""),
    description: typeof row.description === "string" ? row.description : "",
    serverUrl: String(row.server_url ?? ""),
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

export interface McpConnectionPort {
  list(context: { workspaceId: string }): Promise<McpConnectionRecord[]>;
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
