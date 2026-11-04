import { apiRequest, mendApiBaseUrl } from "./transport";

/** Where agentes.chat reaches Mend's MCP server: the same host as the API. */
export function mcpServerUrl(apiBaseUrl = mendApiBaseUrl) {
  return `${apiBaseUrl}/mcp`;
}

/** Mirrors `agentScopes` in server/agent-keys.ts. */
export const agentKeyScopes = [
  "suporte:ler",
  "suporte:responder",
  "suporte:pausar",
  "conhecimento:ler",
  "chamados:ler",
  "chamados:escrever",
  "diario:escrever",
  "clientes:ler",
  "clientes:escrever",
] as const;
export type AgentKeyScope = (typeof agentKeyScopes)[number];

export interface AgentKey {
  id: string;
  label: string;
  scopes: AgentKeyScope[];
  created_by: string;
  created_at: string;
  last_used_at: string | null;
  revoked_at: string | null;
}

export async function listLiveAgentKeys(workspaceId: string) {
  const response = await apiRequest<{ data: AgentKey[] }>(
    "/api/agent-keys",
    {},
    workspaceId,
  );
  return response.data;
}

export async function createLiveAgentKey(
  workspaceId: string,
  input: { label: string; scopes: AgentKeyScope[] },
) {
  return apiRequest<{ secret: string; record: AgentKey }>(
    "/api/agent-keys",
    { method: "POST", body: JSON.stringify(input) },
    workspaceId,
  );
}

export async function revokeLiveAgentKey(workspaceId: string, id: string) {
  await apiRequest(
    `/api/agent-keys/${encodeURIComponent(id)}`,
    { method: "DELETE" },
    workspaceId,
  );
}
