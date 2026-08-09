# Mend Coding Control Plane V2 — PRD

- **Status:** approved
- **Data:** 2026-08-09
- **Owner:** Mend / Téchne
- **Escopo:** coding control plane, agent connections, routing por etapa, pesquisa reutilizável e execução de runs

## Objetivo

Permitir que o Mend escolha conexão, modelo e capacidade de raciocínio de forma
independente para `research`, `implement`, `review` e `verify`, preservando o
contexto em um artefato estruturado e auditável. O fluxo deve reduzir custo e
repetição: uma pesquisa válida alimenta a implementação e a revisão, sem uma
segunda leitura repo-wide.

Isso estende a promessa do produto de levar o caso até um resultado verificado,
sem transformar a assinatura pessoal do usuário em uma credencial implícita do
workspace.

## Usuários e permissões

- **Owner/admin:** gerencia políticas do workspace, presets, fallbacks e consentimento de automação.
- **Membro:** pode conectar sua própria credencial e escolhê-la em uma run manual permitida.
- **Automação:** só usa uma assinatura pessoal quando o proprietário deu consentimento explícito, revogável, e a política da etapa permite.
- **Backend:** único limite que lê segredos; o navegador recebe apenas metadados sanitizados.

## Contratos de domínio

- `AuthMethod`: `api_key | subscription`.
- `CodingStage`: `research | implement | review | verify`.
- `AgentConnection`: owner, provider, método, estado, consentimento e metadados sanitizados.
- `StageRoutingPolicy`: conexão, modelo, effort, budgets, fallback explícito e preset snapshot.
- `EffectiveRunConfig`: resolução congelada antes da execução.
- `ResearchArtifact`: diagnóstico, evidências, reprodução, arquivos/linhas, proposta, aceite, checks e hashes.

Runs antigas permanecem legíveis e recebem `model = unknown_legacy` quando não há
informação histórica confiável. Para a MEND-6, o histórico permite afirmar
somente `OpenAI + codex-cli 0.147.0`.

## Jornada principal

1. Admin conecta API key ou assinatura e valida o catálogo disponível.
2. Admin define uma política por etapa ou edita um preset congelado.
3. Research resolve a rota, executa uma leitura única e persiste um `ResearchArtifact` content-addressed pelo caso, revisão do chamado e base SHA.
4. A interface oferece **Implementar correção** somente quando o artefato está atual e acionável; o clique envia obrigatoriamente `researchArtifactId`.
5. Implement recebe o artefato e os critérios, produz o diff e executa checks determinísticos.
6. Review recebe diff, artefato e checks; não faz pesquisa repo-wide.
7. Verify roda primeiro comandos allowlisted. Só chama LLM para interpretar falhas e solicitar reparo limitado.
8. Aprovação, PR, merge e deploy permanecem determinísticos e fora do roteamento de modelos.

## Regras de produto

- Precedência: override autorizado da run → política do repositório → política do workspace.
- O resultado é validado e congelado antes da execução.
- Fallback é desligado por padrão e, quando ligado, lista conexões explicitamente por etapa.
- Fallback só cobre quota, rate limit e indisponibilidade; nunca autenticação, schema ou segurança.
- Esforço é derivado das capabilities do catálogo; a UI não inventa opções.
- Assinatura registra `included_in_subscription`, nunca `$0`; tokens e quota continuam mensuráveis.
- API key registra custo reportado ou calculado com tabela versionada.
- Um reparo após falha de verificação é o padrão máximo inicial.
- Segredos e caches gerais de homes isolados nunca são persistidos.

## Interface e estados

- Configurações terá conexões de coding, estado/última validação/quota, revogação, matriz de etapas e presets `Economy`, `Balanced`, `Quality`, `Custom`.
- Claude login via Claude.ai permanece visível apenas como opção desabilitada com a explicação de compliance; API key segue disponível.
- Nova run mostra a política herdada e permite override autorizado.
- Run details mostra provider, modelo solicitado/real, effort, método de cobrança, tokens, custo/quota e tentativas.
- Catálogo ausente ou vencido bloqueia nova run e oferece **Atualizar catálogo**.

## Critérios de aceitação

- 100% das novas tentativas persistem provider, modelo real ou erro explícito e effort quando suportado.
- 100% das implementações referenciam um artefato de pesquisa.
- Nenhuma segunda pesquisa quando revisão do chamado e base SHA não mudaram.
- Nenhum segredo aparece em API, frontend, logs ou eventos.
- Revogar a conexão impede novas execuções e não altera runs concluídas.
- Desligar as flags V2 restaura o fluxo anterior sem rollback destrutivo.
- Runs legadas continuam visíveis com `unknown_legacy` quando o modelo não é conhecido.

## Fora do escopo desta entrega

- Intermediação de login Claude.ai Pro/Max.
- Marketplace de provedores ou execução de comandos fornecidos pela UI.
- Autonomia irrestrita, merge/deploy automático fora das políticas existentes.
- Catálogo de preço inventado sem dado do provider.

## Rollout

Migration → control plane → runner → frontend. As flags `coding_routing_v2` e
`coding_subscription_auth` começam desativadas, são habilitadas no workspace
dogfood após o E2E misto e só então tornam-se padrão.
