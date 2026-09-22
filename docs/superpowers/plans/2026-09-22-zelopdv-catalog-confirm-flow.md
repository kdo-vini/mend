# Plano: Knowledge + leitura segura + mutações de catálogo com confirmação (estilo Zelinho)

> **Para agentes:** implementar fase a fase com checkboxes. Cada fase termina com testes focados e commit Conventional Commit separado. Não expandir escopo além deste plano.

**Data:** 2026-09-22  
**Status:** aprovado para planejamento (aguardando execução)  
**Repos:** `docs/product/MEND_PRODUCT_STRATEGY_V1.md` §6.7 (mudanças destrutivas exigem aprovação humana)  
**Referência ZeloPDV:** fluxo Zelinho Gerente (`prepararExclusao` → pendente → sim/não → `gerente_excluir_catalogo`)

---

## Goal

Permitir que o Mend, no workspace Techne/Zelo:

1. Responda dúvidas de atendimento com o **playbook de Knowledge publicado** (mesma base RAG do auto-reply — não um silo separado de “docs do app”).
2. Consulte catálogo/estado com **leitura only** (sem mutar).
3. Altere/exclua produtos **somente** pelo padrão Zelinho: proposta → confirmação explícita do dono (`sim`/`não`) → RPC owner-scoped.

**Não** abrir SQL/delete livre via Supabase MCP em `safe_auto`.

### Clarificação: Knowledge = playbook de atendimento

No Mend, artigos `published` em Knowledge **já são** o playbook que groundinga respostas ao cliente (`how_to` / `question` / `status`).  
“Como cadastrar produto”, “o que acontece se excluir”, tom de suporte e passos oficiais entram **nessa** base — não em um segundo repositório paralelo.  
A Fase 1 deste plano é **completar/publicar** esse playbook, não criar outro sistema.

---

## Architecture (decisão fechada)

```text
Cliente / founder no canal Mend
        │
        ▼
LiveWorker (Mend)
  ├─ Playbook Knowledge (RAG publicado) → respostas de atendimento
  ├─ Read tools (allowlist) → listar/buscar produto (sem write)
  └─ Write path (só dono)
        │
        ├─ 1) preparar exclusão/alteração (prévia, sem mutar)
        ├─ 2) gravar ação pendente (expira ~10 min)
        ├─ 3) mensagem: Confirma excluir "Mini pizza"? [[opcoes: Sim | Não]]
        ├─ 4) sim/não resolvido SEM LLM (confirm words)
        └─ 5) executar RPC gerente_* no ZeloPDV (HTTP interno ou adapter)
```

**Fonte da verdade das mutações:** ZeloPDV (`gerente_*` RPCs + regras de arquivar vs excluir).  
**Mend:** orquestra, confirma, audita. Não reimplementa regra de catálogo.

---

## Non-goals (explícito)

- [ ] Cliente final pedindo apagar produto no suporte → **não** executar; handoff ou orientação.
- [ ] Supabase MCP `database` sem `read_only` para delete/update genérico.
- [ ] Confirmação só em prosa da IA sem `pending_action` durável.
- [ ] Subusuário ou telefone não pareado executando escrita.
- [ ] Pagamentos, auth, permissões, caixa, fiado, assinatura.

---

## Princípios (iguais à recomendação prática)

| Camada | Capacidade | Mecanismo |
| --- | --- | --- |
| A — Playbook (Knowledge) | Respostas de atendimento groundingadas | Artigos `published` + fontes de repo no mesmo retrieval do support worker |
| B — Leitura | Diagnóstico / achar produto | Tools read-only ou MCP Supabase `read_only=true` no **projeto ZeloPDV** |
| C — Escrita | Alterar/excluir com confirmação | Reutilizar contrato Zelinho (pendente + sim/não + RPC) |

Aprovação humana = **mensagem `sim`/`não` do dono** (ou botões equivalentes), não founder no Inbox Mend a cada item.

---

## Contrato com ZeloPDV (não reinventar)

Reutilizar o comportamento já existente:

1. `analisar_exclusao_catalogo` / `prepararExclusaoCatalogo` — prévia.
2. Ação `pending` com `expires_at` (~10 min), uma por sessão/conversa.
3. `YES_WORDS` / `NO_WORDS` (mesma semântica: sim/s/ok/confirmar… e não/cancelar…).
4. `excluir_catalogo` → RPC `gerente_excluir_catalogo` (exclui sem histórico; arquiva com vendas/comandas).
5. Mesmo padrão para outras escritas allowlisted depois: preço, pausa, criar produto (fase 2+).

**Integração preferida:** adapter HTTP interno Mend → `POST /api/gerente/...` (ou endpoint dedicado `mend`-scoped) com chave de serviço + `owner_user_id` resolvido pelo vínculo WhatsApp/empresa.  
**Alternativa aceitável:** MCP custom “ZeloPDV Gerente” com as mesmas tools; ainda assim a execução real passa pelas RPCs, não por SQL.

---

## Fases

### Fase 0 — Pré-requisitos e limites de política

- [ ] Confirmar no workspace Techne: produto knowledge `ZeloPDV` (+ Chat/Menu se aplicável) e playbook de atendimento publicado (cadastro/edição/exclusão etc.).
- [ ] Política AI: `delete` permanece em `humanApprovalActions` (confirmação do dono conta como aprovação).
- [ ] Bloquear rota `safe_auto` de qualquer tool MCP com `readOnlyHint !== true` para catálogo, **exceto** o caminho de pending confirm deste plano.
- [ ] Documentar no Settings: “Mutações de catálogo exigem confirmação Sim/Não do dono”.
- [ ] Testes de política: escrita sem pending → rejeitada; delete sem confirm words → não executa.

**Done when:** política e docs deixam explícito que SQL aberto não é o caminho.

---

### Fase 1 — Playbook de atendimento (Knowledge publicado)

- [ ] Completar/seed **artigos de atendimento** `published` (playbook) cobrindo: cadastro de produto, edição, exclusão/arquivamento, pausa cardápio vs ocultar PDV, categorias, custos, tom e próximos passos para o cliente.
- [ ] Tratar esses artigos como o mesmo corpus do auto-reply — categoria/produto Knowledge do workspace, sem base paralela “só docs internos”.
- [ ] Garantir retrieval no `safe_auto` para intents `how_to` / `question` / `status` (já alinhado às rotas reply-first).
- [ ] Critério de qualidade: resposta groundingada no playbook publicado; sem inventar passos.
- [ ] Testes: retrieval encontra artigos; reply grounding com `knowledgeArticleIds`.
- [ ] `npm run i18n:check` se houver copy nova na UI de knowledge.

**Done when:** perguntas de atendimento (“como cadastrar”, “o que acontece se excluir”, funcionamento no uso) saem do playbook Knowledge, sem tool de escrita.

---

### Fase 2 — Leitura only (diagnóstico)

- [ ] Adapter `ZeloPdvGerentePort` (ou MCP Gerente read tools): `buscar_produto`, `listar_catalogo`, `listar_categorias` (e só isso nesta fase).
- [ ] Credencial: secret server-side (`ZELOPDV_GERENTE_CHANNEL_KEY` ou OAuth MCP), nunca no browser.
- [ ] Allowlist de tools no workspace; `writeModes` vazios ou só draft para reads.
- [ ] Se usar Supabase MCP oficial: **somente** `read_only=true` + features mínimas (`database`/`docs`); project_ref do **ZeloPDV**, não do Mend.
- [ ] Ambiguous product match → pedir esclarecimento (lista numerada), nunca escolher sozinho (igual Zelinho).
- [ ] Testes: mock HTTP/RPC; tenant scoping; zero mutação.

**Done when:** a IA localiza “mini pizza” e resume estado sem alterar banco.

---

### Fase 3 — Escrita com confirmação (exclusão primeiro)

Espelhar Zelinho Gerente no worker Mend:

#### 3.1 Estado pendente

- [ ] Tabela ou reuso de store workspace-scoped, ex.: `conversation_pending_actions`:
  - `workspace_id`, `conversation_id`, `owner_ref`, `tool_name`, `arguments_json`
  - `status`: `pending` | `executed` | `cancelled` | `expired` | `failed`
  - `summary`, `expires_at`, `result_json`, `idempotency_key`
- [ ] Uma ação `pending` por conversa; nova proposta cancela a anterior.
- [ ] Expiração 10 minutos (igual Zelinho).

#### 3.2 Fluxo de exclusão

- [ ] Tool/orquestração `analisar_exclusao_catalogo` → monta prévia (excluir vs arquivar).
- [ ] Persiste pending; responde ao cliente/dono:
  - Ex.: `Confirma excluir o produto "Mini pizza"?` + opções Sim | Não  
  - (WhatsApp markup / botões conforme canal Mend já suportar.)
- [ ] No próximo inbound, **antes** da triagem LLM: `resolveTextConfirmation` com `YES_WORDS` / `NO_WORDS`.
  - `sim` → chama execução `excluir_catalogo` no ZeloPDV → reply determinístico (“Excluído…” / “Arquivado…”).
  - `não` → cancela → “Cancelado. Nada foi alterado.”
  - sem pending → segue fluxo normal.
- [ ] Notificar workspace em falha de execução (`ai.agent_failed` ou kind dedicado); sucesso opcional em audit only.
- [ ] Idempotência: HMAC/chave por `conversation_id + tool + args + message_id` (catálogo Mend de escritas MCP).

#### 3.3 Autorização

- [ ] Resolver **owner** do ZeloPDV a partir do vínculo (telefone pareado / membership). Sem owner → não prepara escrita; responde orientação ou handoff.
- [ ] Cliente de suporte sem vínculo de dono → **nunca** entra no fluxo de exclusão.

#### 3.4 Testes

- [ ] Unit: confirm words; expire; cancel previous pending.
- [ ] Unit/integration: preparar → sim → RPC chamada uma vez; preparar → não → RPC zero vezes.
- [ ] Regression: mensagem “sim” sem pending não dispara exclusão.
- [ ] Produto com histórico → arquivar; sem histórico → excluir (contrato do ZeloPDV).

**Done when:** no canal autorizado, “exclui mini pizza” → confirmação → sim → efeito real no catálogo ZeloPDV.

---

### Fase 4 — Outras mutações allowlisted (mesmo padrão)

Só depois da Fase 3 estável, na mesma máquina de pending:

- [ ] `alterar_preco`, `editar_produto`, `pausar_no_cardapio`, `ocultar_no_pdv`, `criar_produto` / lote (subset).
- [ ] Uma escrita por confirmação (ou lote consolidado se o ZeloPDV já devolver prévia única).
- [ ] Sem expandir para caixa, fiado, assinatura, permissões.

**Done when:** cada tool write passa pelo mesmo pending + sim/não.

---

### Fase 5 — Operação e observação

- [ ] Runbook: como parear dono, rodar seeds de knowledge, verificar pending expirado.
- [ ] Atualizar `docs/engineering/catalog.md` com o port `ZeloPdvGerentePort` e o helper de confirm words.
- [ ] Métricas: pending criados, confirmados, cancelados, expirados, falhas RPC.
- [ ] Gate: `typecheck`, `test`, `lint`, `format:check`, `i18n:check`, `i18n:frontend`.

---

## File map (previsto)

### Mend (novos)

- `server/integrations/zelopdv-gerente/` — client HTTP, types, confirm-words (espelho)
- `server/adapters/supabase/pending-actions.ts` — persistência
- `server/workers/pending-confirmation.ts` — resolve sim/não pré-LLM
- `server/workers/automation.ts` — hook pré-triagem + tools prepare/execute
- `supabase/migrations/YYYYMMDDHHMMSS_conversation_pending_actions.sql`
- Testes espelhando os contratos acima
- i18n: strings de confirmação / cancelado / expirado (`pt-BR` + `en-US`)

### ZeloPDV (mínimo)

- [ ] Endpoint estável documentado para Mend **ou** reuso de `/api/gerente/channel` com auth de serviço + `owner` resolvido.
- [ ] Não duplicar RPCs; só expor contrato se faltar chamada machine-to-machine.

### Proibido neste file map

- Novas queries SQL de delete no Mend.
- Tools Supabase MCP write no allowlist de `safe_auto`.

---

## Sequência de commits sugerida

1. `docs: plan catalog confirm-flow with Zelinho semantics`
2. `feat: seed/publish ZeloPDV support playbook knowledge for catalog flows`
3. `feat: add read-only ZeloPDV gerente adapter`
4. `feat: conversation pending actions for catalog writes`
5. `feat: confirm-words gate before AI triage for pending deletes`
6. `feat: execute gerente_excluir_catalogo after owner confirmation`
7. `test: pending confirmation and catalog delete regression`
8. `docs: catalog + runbook for ZeloPDV gerente integration`

---

## Acceptance checklist (produto)

- [ ] Dúvida de atendimento/funcionamento → resposta do playbook Knowledge, sem pending.
- [ ] “Onde está o produto X?” → leitura only.
- [ ] “Exclui mini pizza” (dono) → prévia + Sim/Não → efeito no ZeloPDV.
- [ ] “Não” → zero mutação.
- [ ] Pending expirado → pede para solicitar de novo.
- [ ] Cliente sem vínculo de dono → sem exclusão.
- [ ] Nenhuma tool SQL destrutiva no auto-reply.

---

## Riscos e mitigações

| Risco | Mitigação |
| --- | --- |
| Mend e Zelinho divergirem nas confirm words | Compartilhar lista/espelhar testes; documentar paridade |
| Dupla execução | Idempotency key + status `executed` |
| Credencial ZeloPDV vazada | Secret só server-side; rotate; sem `VITE_*` |
| Founder achar que cliente pode apagar | Copy + policy + testes de auth |
| Ambiguity de nome (“pizza”) | Listar matches; não escolher sozinho |

---

## Ordem de execução obrigatória

Fase 0 → 1 → 2 → 3 → 4 → 5.  
Não iniciar Fase 3 sem Knowledge (1) e leitura (2) verdes.  
Não iniciar Fase 4 sem exclusão confirmada em staging.

---

## Próximo passo após aprovação deste plano

Implementar **Fase 0 + Fase 1** no repositório Mend (política + knowledge), em paralelo alinhar com ZeloPDV o contrato HTTP mínimo para prepare/confirm/execute.
