# Servidor MCP do Mend para agentes

O Mend expõe um servidor MCP em `POST /mcp` para que agentes externos (os bots do agentes.chat, como a Maria e o Rafa) usem as ferramentas do Mend sem guardar chaves em arquivo nem chamar rotas `/internal/*` pelo terminal.

## Como funciona

- **Transporte:** Streamable HTTP sem sessão (`sessionIdGenerator: undefined`, resposta JSON). Cada requisição monta um servidor novo com as ferramentas daquela chave. `GET` e `DELETE` respondem 405.
- **Autenticação:** chave de agente `mend_agent_…` em `Authorization: Bearer …` ou `x-api-key`. Só o hash SHA-256 fica em `agent_api_keys`. Sem a chave, ou com a chave revogada, a resposta é 401. Sem o cliente service-role, 503.
- **Permissões em duas camadas:**
  1. **No Mend:** cada chave tem escopos. A chave só **vê** as ferramentas dos seus escopos (`tools/list` já vem filtrado) e não consegue chamar as outras.
  2. **No agentes.chat:** em "Conectores e MCPs", a conexão define quais agentes usam o MCP e quais ferramentas cada um usa.
- **Quem pode criar:** só owner e admin do workspace (`/api/agent-keys`). A chave age em nome de quem a criou e deixa de valer se essa pessoa perder o papel de admin.
- **Limite:** 120 chamadas por minuto em `/mcp`, além do limite global por IP.

## Escopos e ferramentas

| Escopo              | Ferramenta                | O que faz                                                                                                                                                                                                           |
| ------------------- | ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `suporte:ler`       | `suporte_listar_eventos`  | Mesmo feed de `GET /internal/support/events` (cursor, texto, mídia, `aiMode`, `replyAllowed`).                                                                                                                      |
| `suporte:responder` | `suporte_enviar_resposta` | Mesmo contrato de `POST /internal/support/send` via `executeSupportSend`: recusa com `reply_not_allowed`, `group_conversation` ou `superseded`, e repetir a mesma resposta para a mesma mensagem não envia de novo. |
| `diario:escrever`   | `diario_registrar`        | Publica no Diário por 7 dias. O autor exibido é o nome da chave (ex.: "Rafa"); o `author_id` é quem criou a chave.                                                                                                  |

O financeiro não tem escopo: o bridge dos bots não concede acesso financeiro ([direção interna](../product/MEND_INTERNAL_PRODUCT_DIRECTION.md)).

## O que o MCP não substitui

O MCP é chamado pelo agente; ele não acorda o agente. O aviso de mensagem nova (webhook `MEND_SUPPORT_WEBHOOK_URL`) continua sendo o gatilho da Maria. O que sai do caminho antigo é a parte de **ler e responder**: a chave `x-mend-support-key` em arquivo no computador dos agentes e as chamadas `curl` para `/internal/support/send`.

## Ativação

1. Aplicar a migration `20261104120000_agent_api_keys.sql` e publicar o servidor.
2. Um admin cria a chave em Configurações → Integrações → Agentes (MCP do Mend) (`/settings/integrations/agentes`), com o nome do agente e as permissões. A chave aparece uma vez, junto com o endereço do MCP. A tela usa `GET/POST/DELETE /api/agent-keys`.
3. No agentes.chat: Configurações → Conectores e MCPs → Adicionar MCP → endereço `https://<mend>/mcp` → "Conectar com uma chave de API".
4. No passo "Quem pode usar", liberar só os agentes e ferramentas desejados.

## Adicionar uma ferramenta

1. Acrescentar o escopo em `agentScopes` (`server/agent-keys.ts`).
2. Acrescentar a definição em `mcpTools` (`server/mcp-server.ts`), reaproveitando o serviço da rota que já existe em vez de duplicar regra.
3. Cobrir em `server/mcp-server.test.ts`: aparece só com o escopo, mantém o contrato da rota e recusa fora do escopo.
