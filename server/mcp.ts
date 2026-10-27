import crypto from "node:crypto";
import { lookup as dnsLookup } from "node:dns/promises";
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

export interface NetworkAddress {
  address: string;
  family: 4 | 6;
}

export type NetworkLookup = (
  hostname: string,
) => Promise<readonly NetworkAddress[]>;

const nonPublicV4 = new net.BlockList();
const nonPublicV6 = new net.BlockList();
for (const [network, prefix] of [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.0.2.0", 24],
  ["192.168.0.0", 16],
  ["198.18.0.0", 15],
  ["198.51.100.0", 24],
  ["203.0.113.0", 24],
  ["224.0.0.0", 4],
  ["240.0.0.0", 4],
] as const)
  nonPublicV4.addSubnet(network, prefix, "ipv4");
for (const [network, prefix] of [
  ["::", 96], // unspecified, loopback and deprecated IPv4-compatible
  ["::ffff:0:0", 96], // IPv4-mapped
  ["64:ff9b::", 96], // NAT64
  ["64:ff9b:1::", 48], // local-use NAT64
  ["100::", 64], // discard-only
  ["2001::", 32], // Teredo
  ["2001:db8::", 32], // documentation
  ["2002::", 16], // 6to4
  ["fc00::", 7], // unique local
  ["fe80::", 10], // link local
  ["ff00::", 8], // multicast
] as const)
  nonPublicV6.addSubnet(network, prefix, "ipv6");

/** True for any non-public IP literal (brackets and zone ids are tolerated). */
export function isNonPublicAddress(value: string): boolean {
  const address = value.replace(/^\[|\]$/g, "").split("%")[0] ?? "";
  const family = net.isIP(address);
  if (family === 0) return true;
  // IPv4 is checked against its own list: a v6 list would treat every v4
  // address as ::ffff:0:0/96 (mapped) and block public targets.
  return family === 4
    ? nonPublicV4.check(address, "ipv4")
    : nonPublicV6.check(address, "ipv6");
}

const defaultNetworkLookup: NetworkLookup = async (hostname) => {
  const records = await dnsLookup(hostname, { all: true, verbatim: true });
  return records.map((record) => ({
    address: record.address,
    family: record.family as 4 | 6,
  }));
};

/** Resolves every A/AAAA record and rejects the target if any answer is non-public. */
export async function resolvePublicNetworkTarget(
  value: string | URL,
  lookup: NetworkLookup = defaultNetworkLookup,
  lookupTimeoutMs = 3_000,
): Promise<URL> {
  const url = new URL(value);
  if (url.protocol !== "https:")
    throw new McpConnectionError(
      400,
      "mcp_server_url_insecure",
      "MCP servers must use HTTPS.",
    );
  const literal = url.hostname.replace(/^\[|\]$/g, "");
  let timeout: NodeJS.Timeout | undefined;
  const records = net.isIP(literal)
    ? [{ address: literal, family: net.isIP(literal) as 4 | 6 }]
    : await Promise.race([
        lookup(url.hostname),
        new Promise<never>((_resolve, reject) => {
          timeout = setTimeout(
            () =>
              reject(
                new McpConnectionError(
                  504,
                  "mcp_dns_timeout",
                  "MCP server DNS lookup timed out.",
                ),
              ),
            lookupTimeoutMs,
          );
        }),
      ]).finally(() => {
        if (timeout) clearTimeout(timeout);
      });
  if (
    !records.length ||
    records.some((record) => isNonPublicAddress(record.address))
  )
    throw new McpConnectionError(
      400,
      "mcp_server_url_private",
      "Private or reserved MCP network targets are not allowed.",
    );
  return url;
}

export interface SafeExternalFetchOptions extends RequestInit {
  fetchImpl?: typeof fetch;
  lookup?: NetworkLookup;
  maxRedirects?: number;
  timeoutMs?: number;
}

/** Fetches an external HTTPS resource while validating every redirect hop. */
export async function safeExternalFetch(
  value: string | URL,
  options: SafeExternalFetchOptions = {},
): Promise<Response> {
  const {
    fetchImpl = fetch,
    lookup = defaultNetworkLookup,
    maxRedirects = 3,
    timeoutMs = 10_000,
    ...requestInit
  } = options;
  let current = new URL(value);
  for (let redirect = 0; redirect <= maxRedirects; redirect += 1) {
    current = await resolvePublicNetworkTarget(
      current,
      lookup,
      Math.min(timeoutMs, 3_000),
    );
    const response = await fetchImpl(current, {
      ...requestInit,
      redirect: "manual",
      signal: requestInit.signal ?? AbortSignal.timeout(timeoutMs),
    });
    if (![301, 302, 303, 307, 308].includes(response.status)) return response;
    const location = response.headers.get("location");
    if (!location)
      throw new McpConnectionError(
        502,
        "mcp_redirect_invalid",
        "MCP redirect has no target.",
      );
    if (redirect === maxRedirects)
      throw new McpConnectionError(
        502,
        "mcp_redirect_limit",
        "MCP redirect limit exceeded.",
      );
    current = new URL(location, current);
  }
  throw new McpConnectionError(
    502,
    "mcp_redirect_limit",
    "MCP redirect limit exceeded.",
  );
}

/** Fetch used for every MCP OAuth discovery, registration and token call. */
export const guardedOAuthFetch = (
  url: string | URL,
  init?: RequestInit,
): Promise<Response> => safeExternalFetch(url, init);

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
  const hostname = url.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (
    !allowLocal &&
    (hostname === "localhost" ||
      hostname.endsWith(".localhost") ||
      hostname.endsWith(".local") ||
      (net.isIP(hostname) !== 0 && isNonPublicAddress(hostname)))
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
  if (process.env.NODE_ENV === "production")
    await resolvePublicNetworkTarget(serverUrl);
  else validateMcpServerUrl(serverUrl);
  const client = new Client({ name: "mend", version: "0.1.0" });
  const transport = new StreamableHTTPClientTransport(new URL(serverUrl), {
    requestInit: {
      headers,
      redirect: "error",
      signal: AbortSignal.timeout(10_000),
    },
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
