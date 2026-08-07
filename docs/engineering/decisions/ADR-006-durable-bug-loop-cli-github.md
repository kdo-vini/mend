# ADR-006 - Loop de bug durável com agentes CLI e GitHub

- **Status:** accepted
- **Data:** 2026-08-07
- **Decisores:** equipe de suporte e plataforma
- **Escopo:** triagem de bugs, Agent runs, repositórios, worker e publicação

## Contexto

Uma reclamação de cliente pode chegar enquanto a IA está pausada, ser triada mais
tarde e exigir investigação de código. O fluxo anterior encerrava o job quando a
conversa estava pausada e iniciava uma correção acoplada ao provider OpenAI sem
um veredito persistido. Isso deixava o processo sem retomada, sem separação entre
investigação e alteração e sem uma autoridade clara para publicar código.

O produto também precisa aceitar ChatGPT, Claude, Gemini e Verboo sem transformar
configuração do workspace em execução arbitrária de shell.

## Decisão

O loop é persistido como um `bug_case` com eventos append-only e transições
idempotentes. A mensagem original é a chave do sinal. Investigação e correção
são `agent_runs` separados e o caso guarda os identificadores de ambos.

As etapas canônicas são:

1. sinal, suspeita, evidência e deduplicação;
2. investigação efêmera e veredito;
3. decisão de notificar, descartar ou corrigir;
4. run separado de correção e checks independentes;
5. pull request, aprovação, merge, deploy e health check;
6. retorno ao cliente e conclusão.

Agentes de código implementam um contrato interno único. O provider é escolhido
de um registro fechado (`openai`, `anthropic`, `google`, `verboo`); argumentos são
montados pelo adapter e nunca aceitos como template vindo do banco ou da UI.
Entrada não é interpolada em shell. Saída, evidências, patch e checks são
normalizados antes de persistir.

O agente executa em diretório efêmero com o menor nível de permissão compatível
com o modo. Investigação é somente leitura. Escrita é permitida apenas no run de
correção. Checks finais são executados fora do processo do agente.

GitHub App é a autoridade de publicação. Tokens de instalação são curtos,
escopados ao repositório e nunca entram no ambiente do agente. O plano de
controle valida o patch e os checks antes de criar branch e pull request draft.
Merge e deploy continuam sendo gates explícitos de produto e política.

Ao reativar uma conversa, a mesma transação que muda o estado agenda a mensagem
inbound mais recente ainda não triada. A chave de deduplicação impede jobs
duplicados.

## Consequências

### Benefícios

- O caso sobrevive a restart e pode ser retomado sem repetir efeitos externos.
- Providers CLI podem evoluir de forma independente sem contaminar o domínio.
- Investigação, correção e publicação têm limites de permissão verificáveis.
- A UI consegue mostrar o loop completo antes mesmo de existir um coding run.

### Custos e riscos

- Cada CLI possui capacidades e formatos diferentes e precisa de testes de
  conformidade.
- Publicação GitHub exige configuração de App e instalação por repositório.
- Merge, deploy e resposta ao cliente precisam reconciliar callbacks e falhas
  parciais com o estado persistido.

### Operação e migração

- Repositórios existentes recebem o plano Dokploy e a seleção GitHub como
  defaults compatíveis.
- Sem CLI ou GitHub configurado, o caso para em `awaiting_human` com diagnóstico
  sanitizado; não faz fallback silencioso para outro provider.
- A migration deve manter RLS, grants explícitos, índices de deduplicação e
  funções com `search_path` fixo.

## Alternativas rejeitadas

- **Um comando configurável por workspace:** amplia a superfície para command
  injection e torna capacidades impossíveis de validar.
- **Iniciar sempre em `implement_fix`:** altera código antes de provar que há um
  bug real.
- **Dar token GitHub ao agente:** mistura raciocínio não confiável com autoridade
  de escrita externa.
- **Guardar tudo em `agent_runs.result_json`:** esconde o caso antes do primeiro
  run e dificulta retomada e deduplicação.

## Evidências

- `server/live-worker.ts`
- `supabase/migrations/20260807135820_durable_bug_loop_and_repository_execution.sql`

## Revisão

Revisitar se todos os providers adotarem um protocolo CLI comum, ou se o plano
de execução migrar integralmente para runners GitHub hospedados pelo cliente.
