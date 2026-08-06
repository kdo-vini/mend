import { apiRequest } from "./transport";

export interface McpToolRecord {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  readOnly: boolean;
}

export interface McpConnection {
  id: string;
  workspaceId: string;
  name: string;
  description: string;
  serverUrl: string;
  authMode: "none" | "headers" | "oauth";
  status: "pending" | "connected" | "error" | "disconnected";
  tools: McpToolRecord[];
  allowedToolNames: string[];
  writeModes: Array<"draft" | "safe_auto">;
  lastError: string | null;
  lastTestedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export async function listLiveMcpConnections(workspaceId: string) {
  const response = await apiRequest<{ data: McpConnection[] }>(
    "/api/mcp/connections",
    {},
    workspaceId,
  );
  return response.data;
}

export async function createLiveMcpConnection(
  workspaceId: string,
  input: {
    name: string;
    description?: string;
    serverUrl: string;
    authMode: McpConnection["authMode"];
    headers?: Record<string, string>;
    clientId?: string;
    clientSecret?: string;
  },
) {
  const response = await apiRequest<{ connection: McpConnection }>(
    "/api/mcp/connections",
    { method: "POST", body: JSON.stringify(input) },
    workspaceId,
  );
  return response.connection;
}

export async function updateLiveMcpConnection(
  workspaceId: string,
  connectionId: string,
  input: Pick<
    McpConnection,
    "name" | "description" | "allowedToolNames" | "writeModes"
  >,
) {
  const response = await apiRequest<McpConnection>(
    `/api/mcp/connections/${connectionId}`,
    { method: "PATCH", body: JSON.stringify(input) },
    workspaceId,
  );
  return response;
}

export async function testLiveMcpConnection(
  workspaceId: string,
  connectionId: string,
) {
  const response = await apiRequest<McpConnection>(
    `/api/mcp/connections/${connectionId}/test`,
    { method: "POST", body: "{}" },
    workspaceId,
  );
  return response;
}

export function startLiveMcpOAuth(workspaceId: string, connectionId: string) {
  return apiRequest<{ oauthUrl: string }>(
    `/api/mcp/connections/${connectionId}/oauth/start`,
    { method: "POST", body: "{}" },
    workspaceId,
  );
}

export async function disconnectLiveMcpConnection(
  workspaceId: string,
  connectionId: string,
) {
  const response = await apiRequest<McpConnection>(
    `/api/mcp/connections/${connectionId}`,
    { method: "DELETE" },
    workspaceId,
  );
  return response;
}
