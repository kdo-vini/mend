# ADR-002 — MCP com isolamento por workspace

- **Status:** accepted
- **Data:** 2026-08-06
- **Decisores:** equipe de plataforma
- **Escopo:** conexões, catálogo de tools, OAuth, execução e auditoria MCP

## Contexto

Cada empresa conecta seu próprio servidor MCP. Uma conexão global poderia
misturar credenciais, clientes e dados operacionais entre empresas.

## Decisão

Toda conexão, allowlist, modo de escrita, segredo, estado OAuth e execução é
associada a `workspace_id`. RLS expõe somente resumos sanitizados aos membros;
segredos e execuções ficam disponíveis apenas ao backend com escopo explícito.

## Consequências

- O worker deve carregar plugins pelo workspace da conversa.
- Rotas administrativas exigem owner/admin para mutações.
- Auditoria registra workspace, plugin, tool, modo e status, nunca o segredo ou
  o resultado bruto.

## Alternativas rejeitadas

- Singleton de MCP no processo: não oferece isolamento multi-tenant.
- Filtrar apenas na UI: não protege chamadas diretas à API.

## Evidências

- `supabase/migrations/20260806175311_add_mcp_workspace_connections.sql`
- `server/routes/mcp-connection-routes.ts`
- `server/live-worker.ts`

## Revisão

Revisitar se a plataforma passar a oferecer um broker MCP centralizado com
isolamento criptográfico independente.
