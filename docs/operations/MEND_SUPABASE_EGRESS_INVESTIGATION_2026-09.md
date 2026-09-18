# Investigação de egress Supabase do Mend — setembro de 2026

**Status:** investigação somente leitura; nenhuma configuração, migration, objeto ou dado de produção foi alterado  
**Data da coleta:** 18 de setembro de 2026  
**Ciclo:** 01/09/2026–01/10/2026  
**Projeto:** `mend` (`uwhugsimhtjtrnuotuki`)  
**Organização:** plano Free

**Implementação:** o plano executável e o runbook de rollout estão em
[`2026-09-18-mend-minimum-egress-plan.md`](../superpowers/plans/2026-09-18-mend-minimum-egress-plan.md)
e [`MEND_EGRESS_ROLLOUT_RUNBOOK.md`](MEND_EGRESS_ROLLOUT_RUNBOOK.md).

## Resumo executivo

O Mend é responsável por **16,124 GB de egress não cacheado**, ou **86,43%** dos 18,656 GB da organização. Somando 0,434 GB cacheados, o Mend transferiu aproximadamente **16,558 GB** no período. O ZeloPDV responde pelos 2,532 GB não cacheados restantes.

A causa dominante é Database/PostgREST, com aproximadamente **12,942 GB (78,2%)** do egress total do Mend. Storage vem em segundo, com **3,563 GB (21,5%)**. Auth, Realtime, Edge Functions e Pooler são materialmente irrelevantes para o excesso observado.

O incidente está concentrado: **14,460 GB (87,3%)** foram transferidos em 11–12/09, e **12,343 GB (74,5%)** somente em 12/09. O pico de 12/09 coincide com o rollout de conhecimento multirrepositório e com uma correção explícita, commit `b2d6e63`, intitulada `perf: omit repository bodies from workspace bootstrap`. Antes dessa correção, cada bootstrap do frontend lia `knowledge_articles.select("*")`, incluindo os corpos de cerca de 1.024 artigos. Esse snapshot largo era amplificado por reconciliações integrais disparadas por Realtime, polling a cada cinco segundos durante runs e fallback a cada cinco segundos quando Realtime estava degradado.

Esta triangulação comprova a classe da causa raiz e explica o pico de 12/09. A retenção de logs do Free é de apenas um dia; portanto, não é mais possível atribuir retroativamente os bytes de 11–12/09 a cada path, IP ou user-agent. Rankings por endpoint e objeto abaixo distinguem claramente dados medidos de proxies por frequência/tamanho.

## Evidências e método

### Confirmação do projeto

Antes das consultas, `supabase projects list` e `supabase/.temp/project-ref` confirmaram que o diretório estava vinculado ao projeto `mend`, ref `uwhugsimhtjtrnuotuki`; o ZeloPDV (`xnnjyrblpvsqrtsshawa`) apareceu como não vinculado. CLI utilizada: 2.109.1.

### Origem dos números

- Totais de organização e projeto: Usage do Supabase Dashboard, filtro do ciclo e do projeto.
- Serviço e dia: proporção/altura das barras SVG do gráfico Recharts do Dashboard. A legenda foi mapeada pelo próprio Dashboard (Database verde, Storage azul etc.). São aproximações visuais, não exportação contábil.
- Frequência de queries: estatísticas acumuladas expostas pelo Postgres/CLI; frequência não equivale a bytes enviados.
- Tamanhos/contagens: `supabase inspect db table-sizes --linked` (comando agora denominado `table-stats`).
- Storage: inventário do Dashboard, 98 objetos.
- Código e deploys: árvore atual e `git log`/`git show` locais.

A série diária soma **16,557 GB**, apenas 0,001 GB abaixo do total de 16,558 GB, diferença compatível com arredondamento da leitura do gráfico.

## Quantitativos

### Egress por projeto

| Projeto         |  Não cacheado | Participação do não cacheado da organização | Cacheado conhecido |
| --------------- | ------------: | ------------------------------------------: | -----------------: |
| Mend            | **16,124 GB** |                                  **86,43%** |           0,434 GB |
| ZeloPDV         |      2,532 GB |                                      13,57% |       não coletado |
| **Organização** | **18,656 GB** |                                        100% |                  — |

O overage não cacheado da organização é aproximadamente **13,656 GB** sobre a cota de 5 GB. Egress já servido não pode ser desfeito; as medidas reduzem apenas o restante deste ciclo e ciclos futuros.

### Ranking por serviço do Mend

| Rank | Serviço                         | Egress aprox. (inclui cached) |  % do Mend | Conclusão                                                            |
| ---: | ------------------------------- | ----------------------------: | ---------: | -------------------------------------------------------------------- |
|    1 | Database / Data API / PostgREST |                 **12,942 GB** | **78,16%** | causa dominante                                                      |
|    2 | Storage                         |                  **3,563 GB** | **21,52%** | segunda causa; repetição, não volume armazenado                      |
|    3 | Realtime                        |                      0,045 GB |      0,27% | mensagens pequenas; amplifica Database por refetch no cliente        |
|    4 | Auth                            |                      0,008 GB |      0,05% | irrelevante para o excesso                                           |
|    5 | Edge Functions                  |                         ~0 GB |        ~0% | 515 invocações; irrelevante                                          |
|    6 | Pooler/conexões diretas         |                         ~0 GB |        ~0% | não aparece materialmente no gráfico                                 |
|    — | Log drains                      |              não identificado |          — | nenhum egress material separado; confirmar configuração no Dashboard |

O Dashboard classifica PostgREST como Database Egress e Supavisor como Shared Pooler Egress. Logo, o primeiro item representa principalmente respostas da Data API, não tráfego direto/pooler.

### Série diária aproximada do Mend

Valores incluem egress cacheado.

| Data (set/2026) |         GB | Observação                                                                           |
| --------------: | ---------: | ------------------------------------------------------------------------------------ |
|              01 |      0,005 | baseline                                                                             |
|              02 |      0,122 | baseline                                                                             |
|              03 |      0,121 | baseline                                                                             |
|              04 |      0,121 | baseline                                                                             |
|              05 |      0,121 | baseline                                                                             |
|              06 |      0,121 | baseline                                                                             |
|              07 |      0,121 | baseline                                                                             |
|              08 |      0,120 | baseline                                                                             |
|              09 |      0,116 | baseline                                                                             |
|              10 |      0,116 | baseline                                                                             |
|          **11** |  **2,117** | primeiro pico; deploy de refresh live do WhatsApp às 17:59 BRT, correlação a validar |
|          **12** | **12,343** | pico principal; rollout multirrepositório e correções de conhecimento                |
|              13 |      0,227 | pós-pico                                                                             |
|              14 |      0,126 | baseline                                                                             |
|              15 |      0,189 | elevado                                                                              |
|              16 |      0,129 | baseline                                                                             |
|              17 |      0,327 | elevado                                                                              |
|              18 |      0,015 | dia parcial                                                                          |
|       **Total** | **16,557** | arredondado; Dashboard totaliza 16,558 GB                                            |

Os dias 11 e 12 representam **87,3%** do total. Excluindo-os, os outros 16 pontos somam 2,097 GB, média de **131 MB/dia** (18/09 é parcial). O padrão demonstra uma combinação de um incidente concentrado com desperdício recorrente: não são milhões de respostas pequenas apenas, nem poucos arquivos grandes apenas.

## Causa raiz

### 1. Bootstrap integral de Database, amplificado por reconciliação e polling

`loadLiveWorkspace` executa em paralelo consultas sem paginação sobre contatos, canais, conversas, **todas as mensagens**, issues, runs, **todos os eventos de runs**, estado de IA, drafts, bug cases e seus eventos. Quase todas usam `.select("*")`. Depois busca ainda labels e vínculos. Pontos auditáveis:

- `src/api/live-actions.ts:283-430`: snapshot integral; em especial mensagens em `:331-337` e eventos em `:352-357`.
- `src/App.tsx:427-469`: `hydrate()` chama novamente o snapshot e notificações.
- `src/App.tsx:485-512`: qualquer evento das tabelas não tratado especificamente cai em `hydrate(false)`.
- `src/App.tsx:564-577`: enquanto há run ativo, snapshot integral a cada **5 s** — até 720 snapshots/hora/aba.
- `src/api/workspace-data.ts:46-64` e `src/App.tsx:546-563`: quando Realtime não está saudável, outro snapshot integral a cada **5 s**.
- `src/api/workspace-data.ts:19-38`: uma assinatura observa 19 tabelas; várias delas geram reconciliação integral.
- `src/api/workspace-data.ts:139-163`: reconexão bem-sucedida dispara um evento sintético `table="*"`, que provoca outro snapshot integral.

Essa arquitetura transforma mudanças pequenas e estados transitórios de conexão em dezenas de respostas PostgREST largas. Realtime em si enviou só 45 MB; seu papel causal é provocar Database egress no cliente.

### 2. Corpos de conhecimento no pico de 12/09

O commit `b2d6e63` de 12/09 17:26 BRT substituiu uma única consulta `knowledge_articles.select("*")` por duas: artigos manuais completos e artigos sincronizados com seleção resumida que **omite `body`**. O próprio assunto do commit documenta a intenção: `perf: omit repository bodies from workspace bootstrap`.

No mesmo dia, entre 13:46 e 17:27 BRT, o histórico contém o rollout completo de conhecimento multirrepositório, indexação e sucessivas correções de batching/limites. O estado atual mostra:

- `knowledge_articles`: cerca de **1.024 linhas**, 5,8 MB de tabela e **42.460 scans**;
- `knowledge_chunks`: **12.593 linhas**, 122 MB de tabela + 121 MB de índice;
- o pico diário: **12,343 GB**.

Assim, a causa mais bem suportada do pico é: criação/sincronização do corpus seguida de downloads repetidos do corpo integral dos artigos pelo bootstrap. A correção das 17:26 reduziu a largura dos snapshots posteriores, compatível com a queda de 12,343 GB para 0,227 GB no dia seguinte. Não é possível calcular os bytes exatos por path porque os logs daquele dia expiraram.

### 3. Pollers server-side extremamente frequentes

Ranking por chamadas acumuladas, usado como proxy de consumidor de Database (não como ranking por bytes):

| Rank | Operação                      |      Chamadas | Interpretação                                                               |
| ---: | ----------------------------- | ------------: | --------------------------------------------------------------------------- |
|    1 | `claim_next_job`              | **2.701.979** | polling de fila; respostas provavelmente pequenas, mas frequência excessiva |
|    2 | upsert de heartbeat do runner | **2.183.923** | telemetria de alta frequência                                               |
|    3 | `realtime.list_changes`       | **1.388.134** | consumo interno/frequência; não atribuir diretamente ao Realtime Egress     |
|    4 | lookup em `storage.objects`   | **1.078.680** | forte sinal de acesso repetido a Storage/metadados                          |

Uma medição direta repetiu `supabase inspect db calls --linked` com intervalo de 10 segundos: `claim_next_job` aumentou em 10 e o upsert de `runner_heartbeats` aumentou em 10, enquanto `realtime.list_changes` não mudou. Portanto, um runner ocioso em produção faz **exatamente 1 claim/s + 1 heartbeat/s**, ou **172.800 requests/dia** combinados. O loop está em `server/live-worker.ts:303`, `:338-341` e `:439`, com inicialização em `server/index.ts:746`. Essa prova separa polling atual do contador histórico.

Outros sinais acumulados: `workspaces` 137.287 scans, `channel_connections` 104.603, `runner_heartbeats` 98.765, `ai_drafts` 80.946, `conversations` 67.334 e `messages` 63.985. Como `pg_stat` é acumulado e não traz bytes por resposta, esses números provam frequência, não participação exata nos 12,942 GB.

### 4. Storage: muitos downloads repetidos de um conjunto pequeno

O Storage contém 98 objetos e cerca de **0,034 GB** no total, mas serviu aproximadamente **3,563 GB**: mais de 100 vezes o corpus armazenado. Os seis maiores objetos têm 8.149.304, 8.149.304, 7.690.042, 6.460.111, 2.697.516 e 2.042.894 bytes. Logo, o consumo não pode ser explicado apenas por armazenar arquivos grandes; exige downloads repetidos.

O código contém três caminhos relevantes:

- `src/api/live-actions.ts:65-126`: gera URLs assinadas para toda mensagem com mídia durante o bootstrap. Há cache em memória de 15 min e deduplicação in-flight, portanto a geração de URL não baixa o objeto, mas recarregamentos/novas abas renovam o acesso.
- `server/media-pipeline.ts:410-433`: escolhe variante browser/preview antes do original, comportamento correto quando variantes existem.
- `server/media-pipeline.ts:436-453`, `server/inbox-service.ts:918-930` e `server/workers/automation.ts:1492`: downloads server-to-server para processamento/transcrição/automação.

Apenas 0,434 GB do Mend foi cacheado, enquanto Storage totalizou ~3,563 GB; no máximo 12,2% do Storage foi servido como cache hit, e possivelmente menos se parte do cacheado pertencer a outro recorte. URLs privadas/assinadas e processamento server-side são candidatos fortes. O ranking por caminho/objeto não é recuperável para 11–12/09 com a retenção atual.

### 5. Fatores secundários

- `src/features/settings/pages/SettingsWhatsAppPage.tsx:98-128`: status live a cada **3 s** enquanto a página está aberta; entrou em 11/09 17:59 BRT. É uma correlação plausível com o primeiro pico, não causa quantitativamente provada.
- `src/features/settings/pages/SettingsEngineeringPages.tsx:685-718`: polling de login a cada **2 s**, mas apenas durante login pendente.
- Não foi encontrado service worker de aplicação nem estratégia própria de prefetch/cache responsável pelo pico.
- Não há evidência disponível de crawler/bot. O tráfego dominante exige autenticação/RLS, há somente 2 MAU e o pico coincide com deploy interno; isso favorece cliente/runner em loop sobre bot público, mas IP/user-agent expiraram.
- 515 invocações de Edge Functions e 8.768 mensagens Realtime são pequenas demais para explicar o volume.

## Ranking operacional de endpoints, buckets e consumidores

Sem response bytes nos logs históricos, não é honesto produzir um ranking exato por endpoint. A prioridade auditável é:

| Prioridade | Endpoint/consumidor provável                                                                    | Evidência                                                 | Confiança                                |
| ---------: | ----------------------------------------------------------------------------------------------- | --------------------------------------------------------- | ---------------------------------------- |
|          1 | `/rest/v1/knowledge_articles` no bootstrap                                                      | pico no rollout + commit que omite bodies + 1.024 artigos | alta para 12/09                          |
|          2 | conjunto `/rest/v1/messages`, conversations, ai_drafts, runs/events etc. em `loadLiveWorkspace` | código sem paginação + refetch integral a cada evento/5 s | alta para desperdício recorrente         |
|          3 | RPC `claim_next_job`                                                                            | 2,70 milhões de chamadas                                  | alta em frequência; bytes desconhecidos  |
|          4 | upsert `runner_heartbeats`                                                                      | 2,18 milhões de chamadas                                  | alta em frequência; bytes desconhecidos  |
|          5 | Storage `private-media` / objetos de mídia                                                      | 3,563 GB para apenas 34 MB/98 objetos                     | alta para repetição; paths desconhecidos |
|          6 | refresh de canal WhatsApp                                                                       | polling a cada 3 s desde 11/09                            | média/baixa para bytes                   |

Não foi possível dividir Storage por bucket porque o inventário coletado não exportou bytes transferidos por bucket/path. O bucket explicitamente referenciado pelo frontend é `private-media`; o pipeline usa seu bucket constante. Confirmar nomes e paths no relatório `Storage Egress Requests` do Dashboard.

## Orçamento sustentável no Free

A cota de 5 GB não cacheados é da organização, não por projeto. O plano operacional recomendado é deliberadamente conservador:

| Reserva mensal     |        Teto | Média diária em ciclo de 30 dias |
| ------------------ | ----------: | -------------------------------: |
| ZeloPDV            |     4,25 GB |                       142 MB/dia |
| Mend               | **0,50 GB** |                  **16,7 MB/dia** |
| Margem operacional |     0,25 GB |                       8,3 MB/dia |
| **Organização**    |  **5,0 GB** |                   **167 MB/dia** |

ZeloPDV já consumiu 2,532 GB; projetado linearmente de 18 para 30 dias, chegaria a aproximadamente 4,22 GB. Por isso, a reserva de 4,25 GB acompanha o consumo observado em vez de pressupor uma redução ainda não demonstrada. Até medir um ciclo limpo, Mend deve operar com alerta diário em 12 MB e hard budget em 16,7 MB/dia.

O Mend consumiu em média ~896 MB/dia não cacheados até 18/09; precisa reduzir **pelo menos 98,1%** para 16,7 MB/dia. Mesmo sem os picos, a média observada de 131 MB/dia (inclui cache) é quase oito vezes o teto.

## Plano mínimo proposto, sem implementação

Estimativas são intervalos e **não devem ser somadas diretamente**, pois as ações se sobrepõem.

| Ordem | Mudança proposta                                                                                                                                          |                          Economia estimada no componente | Como estimar/validar                              |
| ----: | --------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------: | ------------------------------------------------- |
|     1 | Substituir `loadLiveWorkspace` por endpoints paginados e seleções explícitas; carregar mensagens apenas da conversa aberta e eventos sob demanda          |                          **70–90% do Database baseline** | comparar bytes e requests por sessão antes/depois |
|     2 | Reconciliação incremental por tabela/row; nunca fazer snapshot integral em evento genérico; debounce/coalescing                                           |             **50–90% adicional dos refetches restantes** | contar hydrates e requests por evento Realtime    |
|     3 | Remover polling integral de runs/fallback a cada 5 s; usar query mínima de status com backoff (5 s → 15 s → 60 s) e pausar aba oculta                     |                       **>95% das chamadas desses loops** | uma hora com run e uma hora degradada             |
|     4 | Manter corpos de repositório fora do bootstrap; paginação também para artigos manuais                                                                     | evita repetição do pico; **ordem de 10+ GB** neste ciclo | teste de contrato e payload máximo do bootstrap   |
|     5 | Reduzir `claim_next_job` e heartbeat: blocking/listen ou backoff com jitter; heartbeat em 30–60 s                                                         |       **90–99% das 4,89 milhões de chamadas combinadas** | calls/min do `pg_stat_statements`                 |
|     6 | Storage: impedir download automático, persistir/reusar variantes pequenas, cachear no cliente, deduplicar transcrição/processamento por hash/idempotência |                                  **70–90% dos 3,563 GB** | bytes por path + cache status                     |
|     7 | Aplicar limites/rate limit aos endpoints públicos e bloquear bots somente após identificar IP/UA                                                          |            contingência; economia não quantificável hoje | Top Paths/IP/UA nas próximas 24 h                 |
|     8 | Instrumentar tamanho e contagem de resposta por endpoint no app/API                                                                                       |         não reduz sozinho; torna o orçamento verificável | dashboard diário p50/p95/soma de bytes            |

Compressão HTTP ajuda respostas JSON, mas não corrige consultas desnecessárias. Thumbnails são úteis para imagem; áudio/vídeo requer variantes compatíveis. No Free, Image Transformations do Supabase não está incluído, então thumbnails devem ser gerados pelo pipeline existente ou os arquivos públicos pesados podem migrar para armazenamento/CDN apropriado **somente se** a medição confirmar que Storage continua dominante após eliminar downloads repetidos. Upgrade não é ação recomendada nesta etapa.

## Validação, rollout e rollback

1. **Baseline:** registrar por 24 h requests, payload bytes, cache status, path, consumidor e motivo do refresh. Preservar logs externamente, sem conteúdo sensível.
2. **Teste de contrato:** garantir que inbox, issues, runs e knowledge continuam completos por carregamento progressivo; incluir limite máximo de payload e número máximo de requests por navegação.
3. **Canário:** habilitar paginação/reconciliação incremental para o workspace interno ou um único usuário por feature flag.
4. **Critérios de avanço:** <16,7 MB/dia no Mend; nenhuma sessão com bootstrap >1 MB; nenhuma aba ociosa fazendo snapshots; erro/reconnect e latência sem regressão; Storage sem download até interação explícita.
5. **Ramp-up:** 10% → 50% → 100%, com pelo menos 24 h por etapa e inspeção do gráfico diário.
6. **Rollback:** desligar a flag e voltar ao snapshot atual. Manter o commit de omissão dos corpos; não reverter essa proteção. Se o fallback antigo precisar ser reativado, limitar temporariamente frequência e duração.
7. **Guardrail:** alerta em 12 MB/dia e investigação imediata em 16,7 MB/dia; congelar sync/media automático se o consumo superar o budget por duas horas, usando kill switch próprio e reversível.

## O que precisa ser observado no Dashboard

Devido à retenção de **um dia** do Free, os dados abaixo não podem mais responder pelo pico de 11–12/09. Devem ser capturados nas próximas 24 h e em qualquer reprodução controlada:

- Usage → Mend → hover por hora/dia e exportação dos valores exatos por serviço;
- Observability/Logs Explorer → Top Paths de API Gateway, separados por `/rest/v1`, `/storage/v1`, `/auth/v1`, `/realtime/v1` e `/functions/v1`;
- `Storage Egress Requests` e `Storage Top Cache Misses`: path, método, cache hit/miss e contagem;
- IP, user-agent, status, token role/claims quando disponível, preservando privacidade;
- tráfego `anon` versus `authenticated`/`service_role`;
- bytes de resposta por path — a documentação oficial alerta que os logs de API Gateway atualmente podem não incluir esse campo;
- Log Drains configurados e volume enviado;
- conexões diretas/Supavisor e backups manuais;
- horários exatos de deploy do frontend/backend/runner e de cada knowledge sync;
- número de instâncias/abas e estado do Realtime durante picos;
- bucket e objeto dos 98 arquivos, correlacionados com downloads e jobs.

Para evitar nova perda de evidência, criar relatório diário exportável ou log drain com amostragem/metadados e compressão, após avaliar o próprio custo de egress do drain.

## Limitações e grau de certeza

- **Confirmado:** Mend 16,124 GB não cacheados; Database e Storage dominam; concentração em 11–12/09; padrões de bootstrap/polling; commit corretivo; frequência de queries; pequeno volume armazenado versus egress.
- **Inferência forte:** corpos de artigos + snapshots repetidos produziram a maior parte do pico de 12/09.
- **Não demonstrado retroativamente:** bytes por endpoint/query/objeto, IP/UA, humano versus bot e causa exata do pico de 11/09.
- Estatísticas de scans/chamadas são acumuladas e podem cobrir período anterior ao ciclo.
- Tabela diária e divisão por serviço foram extraídas das barras SVG e estão arredondadas.

## Fontes oficiais Supabase

- [Manage Egress usage](https://supabase.com/docs/guides/platform/manage-your-usage/egress): definição por serviço, quota, Dashboard, investigação e otimizações.
- [Bandwidth & Storage Egress](https://supabase.com/docs/guides/storage/serving/bandwidth): cálculo por objeto e queries de Storage Egress Requests.
- [Billing on Supabase](https://supabase.com/docs/guides/platform/billing-on-supabase): a quota é aplicada à organização inteira.
- [Pricing](https://supabase.com/pricing): Free inclui 5 GB de egress não cacheado e 5 GB cacheado, separadamente.
- [All about Supabase Egress](https://supabase.com/docs/guides/troubleshooting/all-about-supabase-egress-a_Sg_e): Top Paths e distinção cacheado/não cacheado.
- [Log retention by plan](https://supabase.com/docs/guides/troubleshooting/check-usage-for-monthly-active-users-mau-MwZaBs): acesso a logs no Free limitado ao último dia.
- [Realtime Egress FAQ](https://supabase.com/docs/guides/troubleshooting/realtime-egress-faq): somente bytes enviados ao cliente contam como Realtime Egress; replicação interna não conta.
