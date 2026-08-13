# Handoff — Mend Workspace UI/UX Refactor

Data: 2026-08-13
Status: implementacao pausada durante o Task 7
Branch: codex/workspace-ui-ux-refactor
Worktree: C:\Users\Vinicius\Documents\techneOS\.worktrees\workspace-ui-refactor
Base de implementacao: 1b99072820692c936508fdc8edc352a446861558
Ultimo commit revisado: 79e42a4b032708a231c31402a9cd9810df5e6c44

Este documento e o ponto de retomada do refactor aprovado em:

- docs/superpowers/specs/2026-08-13-workspace-ui-ux-refactor-design.md
- docs/superpowers/plans/2026-08-13-workspace-ui-ux-refactor.md

O objetivo continua sendo tornar o loop suporte -> caso -> investigacao ->
correcao verificada -> resposta compreensivel, mantendo desktop denso, mobile
funcional para o solo founder, dark/light, PT-BR/en-US e todos os contratos
backend/API.

## Estado atual

Os Tasks 0-6 estao implementados e aprovados em revisao independente. O Task 7
tem alteracoes locais ainda nao commitadas e precisa ser terminado, testado e
revisado antes de iniciar o playback da landing, a integracao cross-feature e
o release em producao.

Nao houve push do branch de feature para origin/main e nenhum deploy foi feito.

## Como retomar

Execute a partir da worktree de implementacao, nunca do checkout main:

    Set-Location C:\Users\Vinicius\Documents\techneOS\.worktrees\workspace-ui-refactor
    git status --short --branch
    git log -5 --oneline --decorate

O checkout original esta em:

    C:\Users\Vinicius\Documents\techneOS

Ele continua em main, separado da worktree. Nao faca reset --hard, clean
destrutivo, rebase destrutivo ou remocao da worktree: ha mudancas locais do
Task 7 que ainda nao foram commitadas.

## Progresso aprovado

| Task | Resultado                                                                | Commits principais        | Evidencia                                           |
| ---- | ------------------------------------------------------------------------ | ------------------------- | --------------------------------------------------- |
| 0    | Plano/spec congelados, branch/worktree isolada e baseline                | 1b99072                   | npm test 60 arquivos/323 testes; typecheck          |
| 1    | Shell, rotas canonicas, More mobile, ViewTabs, alias /kanban             | 29e3132, a28dc13          | review limpa; touch targets reais de 44px           |
| 2    | Issues List/Board, My work, filtros progressivos, Board adaptativo       | 11756d0, 33a4110, ab93cfe | review limpa; Customer/Canceled/PT-BR               |
| 3    | Inbox com contexto persistente/drawer mobile/composer sticky             | 0ac4ad3, 50f3b9b          | review limpa; Radix Dialog, foco, Escape e restore  |
| 4    | Runs com deep link, resumo mobile, acoes autorizadas e eventos ordenados | 6abdd86, 37bf182, b2875dd | review limpa; caseOnly, pending e retry preservados |
| 5    | Knowledge scan-first, preview/detail, selecao filtrada e CRUD live       | c54df6f, cd6ff93          | review limpa; live CRUD, no-match e foco pos-delete |
| 6    | Taxonomia Settings, aliases legados e selecao acessivel                  | 606936b, 79e42a4          | review limpa; 18/18 Settings E2E, aria-current      |

Os relatorios dos Tasks 1-5 permanecem no workspace SDD ignorado. O relatorio
do Task 6 foi removido do indice Git de proposito, mas o arquivo fisico deve
continuar em:

    .superpowers/sdd/2026-08-13-workspace-ui-ux-refactor/task-6-report.md

Nao force-track relatorios SDD. O ledger de retomada esta em:

    .superpowers/sdd/2026-08-13-workspace-ui-ux-refactor/progress.md

## Task 7 — estado parcial

O Task 7 e o unico trabalho iniciado e nao concluido. Ainda nao existe
task-7-report.md, commit do Task 7 nem revisao independente.

### Alteracoes locais atuais

O git status no momento deste handoff mostra:

    e2e/settings.spec.ts
    src/features/settings/pages/SettingsAutomationPage.tsx
    src/features/settings/pages/SettingsEngineeringPages.tsx
    src/features/settings/pages/SettingsIntegrationPages.tsx
    src/features/settings/pages/SettingsWorkspacePage.tsx
    src/i18n/locales/en-US/settings.json
    src/i18n/locales/pt-BR/settings.json
    src/styles/features/settings.css
    vitest.config.ts
    e2e/settings-content-refactor.spec.ts (novo)
    src/features/settings/pages/SettingsEngineeringPages.test.tsx (novo)

Essas alteracoes sao trabalho em andamento. Inspecione o diff antes de editar;
nao assuma que o estado local ja cumpre o plano.

### Entregaveis do Task 7

- SettingsAutomationPage com header unico e tabs Replies/Intake. Os corpos
  existentes devem permanecer intactos: saves, confirmacoes, policy state, flow
  state e callbacks nao podem ser duplicados nem trocados.
- SettingsAgentsPage como wrapper Providers/Run policy, reutilizando os corpos
  existentes sem duplicar fetch, mutations, pending state ou autorizacao.
- Providers em tabela semantica desktop e comparison rows mobile. Cada conexao
  continua sendo uma linha independente por id, inclusive rotulos iguais.
- Cada linha preserva authentication, catalog count, automation consent, status,
  Verify, Catalog, Revoke, confirmacao, pending/disabled e segredo server-side.
- Integrations continua como diretorio de status Connected, Needs attention e
  Not configured, com links para GitHub, Google Calendar e MCP. Esses providers
  nao voltam para a sidebar principal.
- Todas as strings novas, headings, labels, menus, tooltips, aria labels e
  estados existem em en-US e pt-BR via i18n.
- Dark/light usa tokens; nenhuma feature CSS deve depender de superficie dark
  hardcoded.
- Acoes criticas mobile tem pelo menos 44px; nenhuma rota cria overflow de pagina.

### Verificacoes antes do commit do Task 7

    npx playwright test e2e/settings-content-refactor.spec.ts --project=desktop --project=mobile
    npx playwright test e2e/settings.spec.ts --project=desktop --project=mobile
    npm test
    npm run i18n:check
    npm run typecheck
    npm run lint
    npm run build
    npx prettier --check <todos-os-arquivos-alterados>
    git diff --check

Inspecione em 1440x900 e 390x844, dark e light:

    /settings/automation/replies?demo=1
    /settings/automation/intake?demo=1
    /settings/engineering/agents/providers?demo=1
    /settings/engineering/agents/run-policy?demo=1
    /settings/integrations?demo=1

Repita Providers, Run policy e Integrations em pt-BR.

### Ponto de atencao: vitest.config.ts

O estado local adiciona alias @ no vitest.config.ts para suportar o teste TSX.
Confirme se isso e realmente necessario. Se o teste puder usar diretiva de
arquivo jsdom e imports relativos, prefira remover a alteracao global. Se o
alias for necessario, documente por que ele nao muda a resolucao dos testes
existentes e inclua o arquivo no review package.

### Criterio de conclusao do Task 7

So marque o Task 7 como completo depois de:

1. E2E de Automation, Agents e Integrations passar nos dois projetos.
2. Tabela/rows terem teste com duas conexoes distintas, inclusive labels
   duplicados, e acoes por id.
3. Mudancas de locale/theme e estados pending/disabled serem verificadas.
4. Todos os gates acima passarem.
5. Commit convencional criado.
6. Review package enviado a reviewer independente.
7. Todos os Critical/Important findings corrigidos e re-review aprovado.
8. Ledger atualizado com Task 7: complete.

## Task 8 — playback interativo da landing

Ainda nao iniciado. Deve transformar ProductWindow estatico em uma maquina de
estados pequena e semanticamente legivel, sem video ou dependencia nova.

Entregaveis:

- quatro cenas do loop real: sinal/conversa, triagem/issue, investigacao/run e
  verificacao/resposta;
- autoplay a cada 3,2s com um unico timer de baixa frequencia;
- pausa durante hover/foco/interacao e controles manuais com aria-current;
- reduced motion desativa autoplay e pointer travel, deixando selecao manual;
- textos e aria labels em PT-BR/en-US;
- dark/light, foco de teclado e responsividade 1440x900/390x844;
- Vitest para metadata/scene transitions e Playwright para selecao, pause/resume
  e reduced motion;
- ProductWindow nao recebe dados externos nem cria loop de animacao permanente.

## Task 9 — integracao cross-feature e QA completo

Ainda nao iniciado. Deve fechar o caminho do solo founder:

    notification -> issue -> run -> decisao/resultado -> conversa do cliente

Itens obrigatorios:

- helper puro para resolver notification destinations;
- conversation -> /inbox?conversation=...;
- issue -> identificador da issue quando carregado, fallback /issues;
- agent run -> /agent-runs?run=... com encoding;
- issue run rows abrindo o deep link correto de Runs;
- Runs Open issue mantendo callback existente;
- E2E mobile usando run-204/TEC-24, sem fallback permissivo;
- revisao React/Vercel: lazy loading, requests independentes paralelas, sem
  inline components, sem efeitos para estado derivado, sem memoizacao
  especulativa e listeners limpos;
- gate completo e matriz visual dark/light en-US/pt-BR.

Rotas da matriz final:

    /
    /inbox?demo=1
    /issues?demo=1
    /issues?view=board&demo=1
    /my-work?demo=1
    /agent-runs?demo=1
    /knowledge?demo=1
    /settings?demo=1
    /settings/automation/replies?demo=1
    /settings/engineering/agents/providers?demo=1

Em mobile, status/proxima acao vem antes do detalhe bruto; nenhuma rota pode
ter body.scrollWidth maior que window.innerWidth.

## Task 10 — release em Dokploy e smoke de producao

Ainda nao iniciado. Nenhum commit foi enviado a origin/main e nenhum deploy foi
feito.

### Pre-release

- Criar e2e/production-smoke.spec.ts gated por MEND_PRODUCTION_BASE_URL.
- Sem a variavel, o suite deve ser skipped e nao fazer request.
- Usar somente os projetos existentes desktop e mobile; chromium nao existe.
- Testes de producao sao read-only: sem login real, reply, aprovacao, mudanca de
  Settings, migration ou secrets.
- Commitar smoke test e rodar gate completo no SHA final.

### Entrega

1. git fetch origin e verificar se origin/main avancou.
2. Se avancou, integrar sem reescrever historico; rerodar gates e review.
3. Confirmar checkout original limpo e em main.
4. Fast-forward do checkout original para o branch revisado.
5. Push explicito de main para origin, sem force-push.
6. Registrar SHA pushed e confirmar que corresponde ao SHA revisado.

### Dokploy

- Publicar somente mend-control-plane neste refactor de UI.
- Nao redeployar mend-agent-runner sem motivo independente.
- Nao alterar secrets, build args, Supabase, migrations ou autorizacao.
- Confirmar rollout do SHA exato no control plane.
- Verificar:
  https://app.techneia.com.br/api/health
  https://app.techneia.com.br/api/ready

### Smoke e navegador em producao

    $env:MEND_PRODUCTION_BASE_URL='https://app.techneia.com.br'
    npx playwright test e2e/production-smoke.spec.ts --project=desktop --project=mobile
    Remove-Item Env:MEND_PRODUCTION_BASE_URL

Depois, inspecionar no navegador real:

- landing playback e reduced motion;
- Inbox list -> conversation -> context -> composer no mobile;
- Issues List/Board, Runs, Knowledge e Settings em 1440x900 e 390x844;
- dark/light sem reset de rota, filtros, selecao ou draft;
- PT-BR/en-US sem raw translation keys;
- /kanban?demo=1 redirecionando para Board;
- ausencia de overflow e controles clicaveis.

Se health/readiness ou smoke falhar, parar o rollout e usar rollback recoverable
do control plane para o ultimo deployment saudavel antes de diagnosticar.

## Gates conhecidos e riscos residuais

- npm run lint passa com dois warnings preexistentes de Fast Refresh em
  src/components/ui/badge.tsx e src/components/ui/button.tsx.
- npm run format:check global reporta briefs SDD ignorados em .superpowers/sdd/.
  Isso nao deve ser corrigido reformatando scratch fora do escopo. Use Prettier
  targeted nos arquivos de producao e registre a excecao.
- A primeira instalacao deixou fdir ESM vazio porque npm install expirou na
  extracao. npm ci corrigiu node_modules sem mudar os manifests; repetir npm ci
  se o erro fdir/tinyglobby voltar.
- O checkout original main esta em 1b99072 e ainda nao recebeu o branch. A
  worktree feature esta deliberadamente dirty neste handoff.
- Nao confundir .superpowers/sdd/\*\* com mudancas de produto; o ledger e evidencia
  de processo, nao artefato para push.

## Checklist de retomada

- [ ] Ler este handoff, o brief Task 7 e o diff local.
- [ ] Decidir se vitest.config.ts e necessario; remover alias se nao for.
- [ ] Terminar Task 7, incluindo tabela/rows, acoes, i18n e testes.
- [ ] Rodar gates e review independente do Task 7.
- [ ] Atualizar ledger com Task 7: complete somente apos review limpo.
- [ ] Executar Task 8 e revisar playback/reduced motion.
- [ ] Executar Task 9: integracao, React review, gate completo e matriz visual.
- [ ] Criar e validar smoke de producao do Task 10.
- [ ] Fazer review whole-branch da base ate HEAD.
- [ ] Corrigir Critical/Important em uma unica fix wave e fazer scoped re-review.
- [ ] Fast-forward main, push, observar Dokploy e testar producao.
- [ ] Registrar SHA final, endpoints, smoke, screenshots e riscos.

## Comandos uteis

    git status --short --branch
    git log --oneline --decorate -20
    npm ci
    npm test
    npm run typecheck
    npm run i18n:check
    Get-Item node_modules/tinyglobby/node_modules/fdir/dist/index.mjs | Select-Object Length
    git check-ignore -v .superpowers/sdd/2026-08-13-workspace-ui-ux-refactor/task-7-report.md
    git fetch origin
    git merge-base --is-ancestor origin/main HEAD
    git diff --check

## Regra de ouro

Nao marcar o refactor como concluido por os Tasks 0-6 estarem verdes. O produto
so esta pronto quando Task 7, playback da landing, integracao founder, QA
dark/light PT/EN, build/test completo, review whole-branch, deploy Dokploy e
smoke no dominio publicado estiverem registrados com o mesmo SHA revisado.
