# ADR-007 - Coding Control Plane V2 por etapa e artefato de pesquisa

- **Status:** accepted
- **Data:** 2026-08-09
- **Decisores:** equipe de produto, suporte e plataforma
- **Escopo:** agent connections, routing, agent runs, pesquisa, catálogo, workers e settings

## Contexto

O fluxo atual inicia runs com provider, mas não congela modelo nem effort. Além
disso, `investigate` e `propose_fix` dividem uma mesma intenção em chamadas
separadas e deixam a implementação dependente de contexto proprietário do
provider. API keys existentes são por workspace/provedor e não representam
proprietário, método de autenticação ou consentimento para automação.

O Mend precisa combinar providers por etapa, aceitar API key e assinatura pessoal
com limites claros, e preservar evidência suficiente para que a implementação,
revisão e verificação sejam trocáveis e auditáveis.

## Decisão

Adotamos um control plane V2 provider-neutral com quatro etapas canônicas:
`research`, `implement`, `review` e `verify`. `research` substitui as chamadas
separadas de investigação/proposta e produz um `ResearchArtifact` versionado,
content-addressed por caso, revisão do chamado e base SHA.

A rota é resolvida com a precedência override autorizado da run → política do
repositório → política do workspace. A resolução gera um `EffectiveRunConfig`
imutável persistido no `agent_runs` antes de chamar o runner. Cada tentativa,
inclusive fallback, vira `agent_run_attempts` com conexão, provider, modelo,
effort, cobrança, usage, custo/quota e erro sanitizado.

Conexões são entidades próprias. `api_key` continua criptografada com o helper
de conexão existente; `subscription` guarda apenas o bundle allowlisted
criptografado, pertence ao usuário e exige `automationConsent` antes de uma run
automática. A UI não recebe segredo. A opção Claude.ai fica desabilitada por
compliance enquanto o login de assinatura não for autorizado pela Anthropic.

Catálogos são capability-driven e cacheados por conexão + versão do CLI. Sem um
catálogo validado, uma nova run não é criada. Presets são snapshots editáveis;
alterá-los não muda uma run já congelada.

O banco é aditivo: novas tabelas e colunas convivem com `agent_runs` legadas,
que recebem `unknown_legacy` na ausência de modelo histórico confiável. As flags
V2 permitem voltar ao fluxo anterior sem apagar dados novos.

## Consequências

### Benefícios

- Troca de provider entre etapas sem repetir pesquisa nem transportar conversa bruta.
- Modelo, effort, cobrança, custo e fallback ficam auditáveis por tentativa.
- Assinaturas pessoais não viram BYOK implícito do workspace.
- Catálogo bloqueia configurações que o runner não consegue comprovar.
- Migração incremental preserva runs e autenticação existentes.

### Custos e riscos

- Cada provider precisa de adapter de catálogo e normalização de usage.
- Jobs de login, refresh token e lease exigem operação de estado e expiração.
- Snapshots aumentam volume persistido e exigem redaction rigorosa.
- Capacidades podem mudar entre versões de CLI e precisam de refresh explícito.

### Operação e migração

- Criar tabelas RLS e grants service-role-only para segredos e tentativas brutas.
- Migrar credenciais existentes para `agent_connections` sem devolver o segredo.
- Preencher runs antigas com `unknown_legacy`; não inferir modelo a partir de texto.
- Habilitar por workspace via feature flags e executar o E2E misto antes do default.

## Alternativas rejeitadas

- **Uma única política provider/modelo para toda a run:** impede combinações por etapa e torna custo/qualidade menos controláveis.
- **Continuar com `investigate` + `propose_fix`:** repete leitura e mantém o artefato preso ao provider.
- **Guardar configuração apenas em JSON de workspace:** não preserva snapshots nem permite auditoria por tentativa.
- **Usar assinatura pessoal automaticamente:** viola ownership e consentimento explícito.
- **Expor login Claude.ai:** a restrição de compliance da Anthropic impede o Mend hospedado de intermediar credenciais Pro/Max.

## Evidências

- [PRD do Coding Control Plane V2](../../product/MEND_CODING_CONTROL_PLANE_V2_PRD.md)
- `server/coding-agent-cli.ts`
- `server/contracts/api-ports.ts`
- `supabase/migrations/20260807211716_agent_runtime_and_byok.sql`

## Revisão

Revisitar quando a política oficial dos providers mudar, quando o runner pessoal
autorizado estiver disponível para assinaturas Anthropic, ou quando métricas de
artefatos mostrarem que a pesquisa precisa de uma etapa adicional.
