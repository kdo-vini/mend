# Catálogo de helpers e padrões

Este documento é a referência rápida para reutilizar helpers e padrões antes de
criar um novo adapter, integração ou fluxo de autorização. Decisões
arquiteturais completas ficam em [decisions](decisions/); este
catálogo não substitui os ADRs.

## Regra principal

Antes de escrever código novo:

1. Procure um helper existente com `rg` pelo comportamento, não apenas pelo
   nome (`encrypt`, `normalize`, `validate`, `map`, `audit`, `idempotency`).
2. Se o comportamento for igual em dois domínios, generalize o helper e
   preserve aliases de compatibilidade quando houver chamadas existentes.
3. Mantenha regras de domínio no adapter/serviço; o helper genérico não deve
   conhecer workspace, HTTP, Supabase ou componentes React.
4. Registre uma decisão nesta página quando uma abstração nova for necessária.
5. Adicione um teste do comportamento reutilizado antes de copiar a lógica.

## Catálogo de helpers genéricos

| Helper                                                                     | Local                                                           | Uso obrigatório                                                                                                                                                                                                                                                                     |
| -------------------------------------------------------------------------- | --------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `encryptConnectionSecret` / `decryptConnectionSecret`                      | `server/connection-crypto.ts`                                   | Criptografar tokens, headers, client secrets, refresh tokens e qualquer segredo de conexão. O helper é agnóstico à chave; o MCP resolve `CONNECTION_ENCRYPTION_KEY` com fallback legado `GOOGLE_TOKEN_ENCRYPTION_KEY`. Não criar outro AES-GCM.                                     |
| `connectionEncryptionKey`                                                  | `server/mcp.ts`                                                 | Resolver e validar a chave de criptografia no backend. Nunca chamar essa lógica no navegador.                                                                                                                                                                                       |
| `mcpConnectionRecordFromRow`                                               | `server/mcp.ts`                                                 | Converter uma linha sanitizada de `mcp_connections` para o contrato de domínio. Worker e adapters devem reutilizar o mapper.                                                                                                                                                        |
| Supabase MCP URL scope                                                     | `server/mcp.ts`                                                 | Usar `buildSupabaseMcpServerUrl` / `parseSupabaseMcpServerUrl` para conexões oficiais do Supabase sempre com `project_ref` obrigatório e grupos allowlisted. Não montar query params do Supabase na UI nem aceitar modo account-wide no preset.                                     |
| `SupabaseMcpConnectionAdapter.runtimeList` / OAuth DCR                     | `server/supabase-api-adapters.ts`                               | Carregar conexões MCP prontas para o worker e registrar clientes OAuth dinamicamente pelo `registration_endpoint`, persistindo client ID/secret criptografados. Workers não devem consultar ou descriptografar `mcp_connection_secrets` diretamente.                                |
| `normalizePhoneNumber`                                                     | `server/whatsmiau.ts`                                           | Normalizar telefone antes de procurar o contato em qualquer MCP ou integração de atendimento.                                                                                                                                                                                       |
| `apiRequest`                                                               | `src/api/transport.ts`                                          | Toda chamada HTTP autenticada do navegador. Componentes não devem montar `fetch` próprio.                                                                                                                                                                                           |
| `consumeAuthAttempt` / `AUTH_RATE_LIMIT_POLICY`                            | `src/shared/auth-rate-limit.ts`                                 | Barreira local de UX para login e cadastro por senha. Não substitui o limite autoritativo do Supabase Auth; reutilize a mesma política para evitar contadores divergentes.                                                                                                          |
| `validateSignupEmail` / `isGmailAddress`                                   | `src/shared/email-validation.ts`                                | Validar formato e domínios descartáveis antes do cadastro e reconhecer Gmail para o atalho de confirmação. A confirmação do provedor continua sendo a prova de posse da caixa.                                                                                                      |
| `isAuthEmailDeliveryReady` / `isAuthEmailDeliveryError`                    | `src/shared/auth-email-delivery.ts`                             | Gate de readiness e classificação dos erros de entrega do Supabase Auth. Só habilitar após SMTP Resend verificado; nunca tratar `session: null` sozinho como prova de envio.                                                                                                        |
| `checked`, `row`, `rows`, `str`                                            | `server/adapters/supabase-mappers.ts`                           | Validar resultados Supabase e converter dados no limite do backend. Não duplicar casts espalhados nos serviços.                                                                                                                                                                     |
| `policyDecision` / `normalizeWorkspaceAiPolicy`                            | `server/automation/decision.ts` e `src/ai-policy.ts`            | Toda decisão de draft, Auto-reply, escalonamento e política de falha. A UI apenas edita a política; não reimplementa os gates.                                                                                                                                                      |
| `conversationReplyInput`                                                   | `server/automation/decision.ts`                                 | Montar o contexto de rascunho com histórico limitado, papéis inbound/outbound explícitos e um único alvo de resposta. Reutilizar nos fluxos automático e manual.                                                                                                                    |
| `useConfirmation` / `ConfirmDialog`                                        | `src/shared/ui/`                                                | Confirmações destrutivas ou que autorizam escrita externa. Não usar `window.confirm`.                                                                                                                                                                                               |
| `MembersPanel` / workspace invitation API                                  | `src/features/settings/components/` + `src/api/live-actions.ts` | Gestão de membros e convites sempre passa pela API workspace-scoped. A UI usa apenas os DTOs sanitizados; envio, recuperação, expiração, aceite e auditoria ficam no adapter/RPC protegido.                                                                                         |
| `SupabaseBugLoopStore`                                                     | `server/bug-loop.ts`                                            | Criar, deduplicar e avançar casos de bug duráveis. Worker e rotas não devem escrever `bug_cases` ou `bug_case_events` diretamente.                                                                                                                                                  |
| `CodingAgentCli`                                                           | `server/coding-agent-cli.ts`                                    | Executar ChatGPT, Claude, Gemini ou Verboo pelo registro fechado de adapters. Não aceitar executável, argv ou template de comando da UI ou do banco.                                                                                                                                |
| `resolveEffectiveRunConfig` / `ResearchArtifact` / `assertRunContinuation` | `server/coding-control-plane.ts`                                | Resolver precedência de rota, validar catálogo/capabilities, congelar a configuração da run, content-addressar a pesquisa e validar transições Investigate → Propose/Implement e Propose → Implement. Implementações devem referenciar o artefato; não duplicar pesquisa repo-wide. |
| `SupabaseCodingControlPlaneAdapter`                                        | `server/supabase-api-adapters.ts`                               | Persistir conexões, segredos service-role, catálogos, políticas por etapa, jobs de login e tentativas. Rotas não devem consultar as tabelas V2 diretamente.                                                                                                                         |
| `GitHubControlPlane` / `GitHubAppTokenProvider`                            | `server/github-control-plane.ts`                                | Toda escrita GitHub usa token curto e escopado da instalação. Tokens não entram no ambiente do agente e chamadas REST não devem ser duplicadas fora deste limite.                                                                                                                   |
| `SupabaseGitHubConnectionAdapter`                                          | `server/supabase-api-adapters.ts`                               | A instalação GitHub pertence ao workspace; o adapter valida o state one-shot, lista repositórios da instalação e só expõe owner/repositórios sanitizados ao navegador.                                                                                                              |

Aliases antigos, como `encryptGoogleToken` e `decryptGoogleToken`, existem
somente para compatibilidade com chamadas legadas. Código novo deve usar os
nomes genéricos.

### Rate limiting de autenticação

Login e cadastro por senha compartilham uma política de rate limit em duas
camadas:

- o Supabase Auth é a barreira autoritativa, aplicada por IP e configurada em
  `supabase/config.toml` com limites conservadores para sign-in/sign-up e
  envio de e-mail;
- `consumeAuthAttempt` reduz spam acidental e cliques repetidos no navegador,
  mas funciona em modo fail-open quando o storage não está disponível e nunca
  é tratado como uma fronteira de segurança;
- respostas `429` do provedor continuam sendo mapeadas para uma mensagem calma
  de limite excedido, sem marcar e-mail ou senha como incorretos.
- a política de senha também é do Supabase Auth: o baseline usa oito
  caracteres em `supabase/config.toml`; o frontend não tenta duplicar a regra,
  apenas traduz `AuthWeakPasswordError.reasons` (`length`, `characters` e
  `pwned`) para copy acionável.

Alterações nos limites de produção devem ser aplicadas também no projeto
Supabase remoto pela configuração de Auth/Management API. Não use o
`supabase config push` deste repositório sem revisar os demais valores do
`config.toml`, pois ele inclui URLs locais de desenvolvimento.

## Padrões de arquitetura

### Ports and adapters

Contratos de integração ficam em `server/contracts/` ou no módulo de domínio
da integração. A implementação Supabase fica em
`server/supabase-api-adapters.ts`. Rotas recebem a porta por
`ApiRouterDependencies`; elas não consultam Supabase diretamente.

Fluxo esperado:

```text
React/API client -> route schema -> port -> Supabase adapter -> mapper/helper
```

Uma porta com uma implementação ainda é aceitável quando ela protege o limite
HTTP, facilita testes e mantém a implementação de banco fora da UI. Não criar
interfaces genéricas para utilitários puros ou para uma função usada uma única
vez.

### Mappers no limite

Linhas Supabase são convertidas uma vez, no limite do backend. O mapper deve:

- remover nomes de coluna do contrato de domínio;
- aplicar defaults e classificações conservadoras;
- excluir segredos e payloads brutos;
- ser reutilizado por listagem, worker e rotas.

Não faça um segundo `map` equivalente em worker, página ou adapter diferente.

### Membros e convites

O fluxo de membros é separado em duas fases: a API cria um convite aberto e o
Supabase Auth entrega o link; somente `accept_workspace_invitation` pode inserir
`workspace_members`. A função de listagem segura agrega nome/e-mail de
`auth.users` após validar a associação à workspace, sem expor essa tabela ao
navegador. Mudanças de função, revogação, reenvio, aceite e remoção devem passar
pelas funções protegidas e gerar evento no audit log. A tabela de Settings usa
`MembersPanel` e os primitives shadcn, mantendo busca local e overflow horizontal
para telas estreitas.

### Provider-shaped AI

`SupportAiProvider` é o limite para OpenAI. O worker decide quando chamar o
provider e quais dados podem entrar no contexto. O provider decide como montar a
requisição Responses API/MCP. Nenhum componente React ou serviço de domínio
deve conhecer o formato `mcp`, `mcp_call` ou `mcp_approval_request`.

### Complaint-to-fix durável

`bug_cases` é o checkpoint do produto e `bug_case_events` é o histórico
append-only. O sinal usa a mensagem inbound como chave; investigação e correção
são `agent_runs` separados. Retomadas devem usar chaves idempotentes e nunca
repetir publicação, merge, deploy ou resposta externa por inferência de estado.

O provider de suporte continua atrás de `SupportAiProvider`. Agentes de código
ficam atrás de `CodingAgentCli`; um não substitui silenciosamente o outro.
Providers CLI são selecionados pelo registro interno, e a configuração pública
expõe apenas nomes e capacidades sanitizadas.

GitHub é o plano de controle para publicação. O agente só produz relatório,
evidência e patch no workspace efêmero. O backend executa checks independentes,
valida o resultado e usa `GitHubControlPlane` para efeitos externos.

### Segredos e integrações

- Segredos ficam apenas em tabelas backend-only e são lidos pelo service role.
- Resumos sanitizados podem ir para o navegador; headers, tokens, client
  secrets, argumentos e resultados brutos nunca vão.
- OAuth deve usar o SDK oficial, PKCE, state one-shot, expiração e validação
  de issuer/resource.
- A Responses API recebe somente as tools allowlisted e as credenciais
  necessárias para aquele workspace.

### Idempotência de escrita

Toda escrita MCP autorizada precisa de uma chave derivada da mensagem,
workspace/plugin, tool e argumentos. Grave o HMAC antes da execução. Se já
existir uma execução aprovada, concluída ou incerta, não execute novamente;
encaminhe para revisão humana. Falha depois de uma possível mutação não deve
ser automaticamente repetida.

### Hardening de automação

- `selectExactChannelBinding` é a única regra aceita para associar um webhook
  WhatsApp a uma workspace. Instância ausente ou desconhecida vai para uma
  quarentena service-role com hashes; não existe fallback por canal aberto.
- `resolveSupportAiProvider` resolve chave e modelo da conexão de suporte da
  workspace. Completion, transcrição e embeddings não podem consultar uma
  chave global do processo.
- `chunkPublishedArticle`, `KnowledgeRetriever` e
  `OpenAiKnowledgeEmbeddings` formam o limite reutilizável de RAG. O banco
  conserva chunks, scores e versão da citação; draft nunca é indexado.
- `executeRecoverableOperation` envolve merge e deploy com intent durável,
  digest da requisição, chave idempotente e reconciliação antes de retry.
- `computeImpactSummary` agrega somente `workflow_facts` append-only e sempre
  retorna numerador, denominador, amostra e período exato. Touch obrigatório
  por política não é classificado como intervenção do fundador.
- `runner_heartbeats` é backend-only; readiness expõe apenas o booleano de
  atividade recente, nunca o payload ou identificador do job.

Novos adapters ou processors desses domínios devem ir para `server/adapters/`
ou `server/workers/`. `server/supabase-api-adapters.ts` e
`server/live-worker.ts` permanecem compositores de compatibilidade durante a
extração por domínio, sem criar serviços distribuídos.

## Checklist para uma mudança nova

- [ ] Pesquisei helpers existentes com `rg` antes de implementar.
- [ ] A lógica nova é realmente genérica ou é regra do domínio?
- [ ] Há um único mapper para o mesmo row/DTO?
- [ ] Segredos permanecem no backend e não aparecem no contrato público?
- [ ] A operação é workspace-scoped e coberta por RLS/role check?
- [ ] Escrita externa tem confirmação, HMAC, estado idempotente e auditoria?
- [ ] O novo helper tem teste unitário e nome orientado ao comportamento?
- [ ] Atualizei este catálogo se criei um helper reutilizável?
- [ ] Rodei `npm run typecheck`, `npm test`, `npm run lint` e
      `npm run format:check`?

Para uma decisão que afeta arquitetura, segurança, dados ou operação, use o
[template de ADR](templates/ADR.md) e registre o documento no
[índice de decisões](decisions/).
