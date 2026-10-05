# Plano — Mend como dashboard interno Diagium e financeiro V1

Data: 05/10/2026. Status: planejamento concluído; implementação da base interna autorizada diretamente pelo Vinicius e em revisão. Financeiro V1 permanece no próximo PR; produção e merge não foram autorizados por esse início.
Entrada: `ficha-painel-diagium.md`, recebida nesta conversa.
Direção atualizada pelo Vinicius nesta conversa em 05/10/2026: Mend será um dashboard interno da Diagium, com um único workspace e múltiplos usuários por e-mails distintos, preservando o bridge dos bots para WhatsApp. Essa decisão substitui o posicionamento anterior neste planejamento.
Repositório examinado: `C:\Users\Vinicius\Documents\code\mend`, branch `main`, commit `b6d960a`. Working tree sem alterações no momento da inspeção.

## Problema

Dar à Diagium uma visão mensal de faturamento, recebimentos, despesas e resultado, preservando a separação do Zelo e a diferença entre competência e caixa. O produto entrega informação gerencial; não executa pagamentos.

## Causa e evidência técnica

- O Mend é React/Vite/TypeScript com backend Express e Supabase. Não transplantar padrões de SvelteKit do Zelo.
- `AGENTS.md` exige seguir a estratégia, design, catálogo de arquitetura e contrato bilíngue.
- `docs/product/MEND_PRODUCT_STRATEGY_V1.md` ainda posiciona o Mend como AI Support Engineer multi-tenant. O Vinicius substituiu explicitamente essa direção: dashboard interno Diagium, workspace único e múltiplos acessos. A implementação deverá atualizar esse documento e registrar a transição em ADR; não requer reconfirmar a decisão de produto já tomada.
- `src/app/routes/WorkspaceRoutes.tsx` e `src/app/shell/navigation.ts` são os pontos de rota e navegação. A navegação atual não representa autorização financeira.
- `server/api-router.ts` já valida membership e hierarquia `owner/admin/agent/viewer`; `server/contracts/api-ports.ts` define os contratos. Ser admin do suporte não deve conceder acesso financeiro implicitamente.
- `docs/engineering/catalog.md` exige rotas → porta → adapter Supabase e um único mapper. O histórico geral pode ser consultado por admins (`server/routes/workspace-routes.ts`); não colocar dados financeiros sensíveis nesse histórico sem a mesma restrição de acesso.
- Na busca local não foi identificado um módulo de livro financeiro a reaproveitar. As referências a billing existentes tratam suporte/cobrança de clientes, não esta operação gerencial.
- Supabase CLI disponível: consultados `supabase --help` e `supabase migration --help`. Nenhuma operação remota, migration ou consulta de dados foi executada. Estado do banco remoto, vínculo e acessos de produção ainda não verificados.

## Solução proposta

### Fundação: um workspace, várias identidades

- Manter Supabase Auth, contas individuais, convites por e-mail e autoria por usuário. Login não cria workspace. Cadastro público e onboarding de criação de workspace deixam de ser caminhos do produto.
- Reaproveitar o workspace existente que contém o bridge e o histórico operacional, após identificar seu UUID real. Não criar um workspace novo por padrão nem migrar conversas por suposição.
- Remover seletor/listagem de workspaces da experiência; o backend resolve o workspace canônico. Validar ou rejeitar parâmetros/headers legados divergentes, sem permitir que o cliente selecione outro workspace.
- Bloquear criação de workspace tanto nas rotas quanto nos caminhos diretos de banco/RPC usados pelo onboarding. Ter um só item no seletor ou ocultar o botão não implementa single workspace.
- Conservar inicialmente `workspace_id`, constraints, RLS e bindings como identificador interno do espaço Diagium. Isso reduz a mudança e preserva referências do bridge; não significa continuar oferecendo multi-tenancy. Remover colunas/tabelas e apagar dados antigos não faz parte da primeira entrega.
- Usuários podem compartilhar o mesmo workspace com permissões diferentes: administrar acessos, operar WhatsApp e acessar financeiro. Reaproveitar roles e convites existentes; adicionar permissão financeira explícita. Acesso por outro e-mail não autoriza automaticamente todos os módulos.
- Somente gestor autorizado pode convidar, revogar ou conceder financeiro. Revogação precisa bloquear próximas requisições, mesmo com sessão ainda válida. Cadastro por e-mail sem convite/autorização não dá acesso ao dashboard.
- Proposta de home: visão mensal financeira e pendências de cobertura, reutilizando o resumo; Inbox/WhatsApp e acessos ficam na navegação. Não inventar outros módulos de dashboard nesta entrega.

### Bridge WhatsApp: contrato preservado

Evidência local: `server/support-events.ts`, `server/support-send.ts` e `server/zelochat-internal-send.ts`, com testes dedicados. Inventariar os consumidores ativos antes da transição, pois existência de código não comprova uso em produção.

- Preservar endpoints, autenticação das integrações, cursor do feed, IDs de conversas/mensagens, idempotência e regras de `replyAllowed`/`aiMode` existentes.
- Resolver os eventos/envios no workspace canônico. Requests legados que informam esse mesmo UUID continuam compatíveis; UUID divergente é rejeitado. Ausência de workspace não pode liberar leitura/envio de registros de outro espaço legado.
- Manter o vínculo exato de canal/instância; workspace único não autoriza fallback para qualquer instância WhatsApp.
- Testar inbound → persistência → evento para bot e pedido de envio → canal correto, inclusive bloqueio por regra de resposta, cursor/retry e conversa desconhecida.
- Bot não ganha acesso ao financeiro por usar o bridge. Não alterar credenciais nem enviar WhatsApp real durante QA; usar provider simulado/canal de teste autorizado.

### Escopo da V1

Uma página “Financeiro Diagium”, rota proposta `/financeiro`, no workspace único, para operadores explicitamente autorizados. Usar o shell atual; home proposta reaproveita esse resumo e a navegação mantém o Inbox/WhatsApp.

- Seletor de mês; BRL como moeda única nesta versão.
- Indicadores: faturamento por competência, recebido no mês, despesas por competência, pago no mês e resultado gerencial.
- Aviso de cobertura: fontes, despesas e impostos pendentes. Mostrar totais registrados como parciais enquanto houver lacunas.
- Lista com duas visões claramente nomeadas: competência e movimentações de caixa. Cada visão usa a mesma base temporal do indicador correspondente.
- Cadastro/edição de receita, despesa e transferência interna; registro de recebimento/pagamento e respectivas fontes.
- Despesas recorrentes mensais: modelo e ação explícita “Gerar despesas do mês”. Sem agendamento novo.
- Conciliação manual: associar evidências de banco/gateway ao mesmo recebimento, sem criar outra receita.
- Histórico do registro visível apenas ao operador financeiro autorizado.

Fora de escopo: novos módulos internos além do financeiro/acessos/WhatsApp, integrações bancárias/gateways, importação em massa, exportação, anexos/documentos armazenados, consolidação com Zelo, câmbio, saldo bancário, faturamento fiscal, apuração automática de impostos, novas métricas de burn, pagamentos/Pix/payouts e automação por IA. Origem pode ser referência textual a documento; não guardar credenciais nela.

### Regras financeiras

1. **Competência:** receita e despesa pertencem a um mês explícito (`YYYY-MM`), independente da data do dinheiro. Resultado = receitas de competência − despesas de competência. Transferências internas e registros cancelados não entram.
2. **Caixa:** recebido/pago usam a data efetiva da liquidação; não a competência. Receita de setembro recebida em outubro entra no faturamento de setembro e no recebido de outubro. Movimento de caixa não equivale a saldo bancário.
3. **Liquidações:** separar o lançamento da liquidação. Isso permite registrar pagamento parcial ou em outro mês sem duplicar faturamento. Campos de data de recebimento/pagamento da ficha passam a ser exibidos a partir dessas liquidações.
4. **Taxas:** faturamento é bruto; recebimento registra o dinheiro efetivo. Taxa conhecida vira despesa vinculada. Não presumir que diferença entre bruto e líquido é taxa nem que entrada bancária é nova receita.
5. **Conciliação:** uma ocorrência econômica canônica, várias evidências. Chave única por workspace + fonte + identificador externo, quando presente. IDs de banco e gateway diferentes precisam de associação manual ao mesmo recebimento. Sem ID, exigir fonte e indicação de revisão pendente; valor/data iguais geram aviso, não deduplicação automática. Após conciliar, totais permanecem iguais.
6. **Recorrência:** gerar no máximo uma despesa por modelo/mês; repetir a ação não duplica. Alterar modelo afeta futuras gerações, não meses já registrados. Copiar valor como estimativa quando ainda não houver confirmação; gerar não significa pagar. Encerrar recorrência interrompe futuras gerações.
7. **Estimativas e ausências:** valor estimado tem marcador e participa de um resultado explicitamente provisório. Valor desconhecido permanece ausente; não criar despesa de R$0. Cobertura por mês começa pendente e pode ser confirmada por operador, com autor/data. Não afirmar que o sistema descobriu todas as despesas.
8. **Separação:** Lucas Ops e Hostinger classificados como Diagium, sem valores pré-carregados. Supabase só entra mediante projeto atendido identificado. Custo compartilhado exige referência à regra e à parcela atribuída; não criar motor de rateio nem buscar valores no Zelo Admin.
9. **Correções:** editar com controle de versão para impedir perda de atualização concorrente. Cancelar lançamento com motivo, preservando histórico; evitar exclusão física. Correção de liquidação também auditada e refletida nos totais.

### Persistência e segurança

Modelo lógico proposto, a ajustar ao schema atual antes da migration:

| Entidade                      | Responsabilidade                                                                                                                                                              |
| ----------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `finance_access`              | Habilitação interna e operadores autorizados por workspace; nenhuma concessão automática por role de suporte                                                                  |
| `finance_entries`             | Tipo, descrição, competência, valor em centavos, BRL, categoria, fonte, confirmação/estimativa, classificação Diagium, rateio documentado, recorrência, versão e cancelamento |
| `finance_settlements`         | Lançamento vinculado, data efetiva, valor recebido/pago e versão; transferência identificada separadamente                                                                    |
| `finance_references`          | Evidência/origem/ID externo ligada ao lançamento ou liquidação, com unicidade por fonte/workspace/ID                                                                          |
| `finance_recurring_templates` | Modelo mensal, período de validade, valor e confirmação; chave única modelo + competência nas despesas geradas                                                                |
| `finance_period_reviews`      | Cobertura mensal de fontes, despesas e impostos: pendente/confirmada, observação, autor/data                                                                                  |
| `finance_events`              | Histórico imutável de criação, edição, cancelamento, conciliação e cobertura; acesso financeiro restrito                                                                      |

Usar valores inteiros em centavos, datas civis para liquidação, timestamps UTC para auditoria e timezone do workspace para limites de mês. Validar valores e precisão no backend e no banco. Garantir vínculos do mesmo workspace com constraints; não confiar em IDs enviados pela UI.

Aplicar RLS, grants mínimos e validação de autorização no backend. A capability pública serve só para mostrar a navegação. Todas as leituras, agregações e mutações precisam verificar membership ativa, workspace interno habilitado e permissão financeira. Não criar token novo nem usar service role como atalho para ignorar isolamento. Se uma RPC protegida for necessária, usar search_path fixo e grants restritos.

Escrita e evento de auditoria na mesma transação. Autor vem da identidade autenticada, nunca de campo fornecido pelo navegador. Idempotência de criação/geração/liquidação protege retries e duplo clique. Permissões financeiras não podem ser autoconcedidas pelas rotas de administração genéricas. A lista inicial de operadores e o workspace exato precisam ser confirmados antes da ativação; não conceder acesso só por nome/e-mail escrito neste plano.

### Pontos de implementação

- `src/features/finance/`: página, formulário, lista, visão de caixa, recorrência e `api.ts` local à feature.
- `src/App.tsx`, `src/api/auth.ts`, `src/app/onboarding/WorkspaceOnboarding.tsx`, shell e rotas: substituir seleção/criação de workspace pelo acesso ao espaço canônico, manter convites e contas individuais, montar home/financeiro com capability.
- `server/api-router.ts`, `server/routes/workspace-routes.ts` e funções/policies de criação de workspace: resolver e impor workspace único, bloquear provisionamento público e restringir gestão de acessos.
- `server/support-events.ts`, `server/support-send.ts` e bridge ZeloChat: compatibilidade com o UUID canônico, sem ampliar permissões ou alterar contrato externo sem necessidade.
- `server/finance-service.ts`: regras de competência, liquidação, conciliação e resumo; módulos puros para cálculo quando fizer sentido.
- `server/routes/finance-routes.ts`: schemas Zod estritos e rotas `GET /api/finance/summary`, CRUD de lançamentos/modelos, liquidações, referências, revisão mensal e histórico.
- `server/contracts/api-ports.ts`, `server/adapters/supabase/finance.ts` e compositores: porta, adapter e mapper sanitizado. Agregar no servidor sobre o conjunto completo; não calcular indicadores a partir da página paginada da lista.
- `supabase/migrations/`: tabelas, índices, constraints, RLS e mutações atômicas. Confirmar projeto via CLI antes de qualquer operação; validar primeiro em desenvolvimento. Nunca aplicar mudanças de produção como parte deste planejamento.
- Catálogos `pt-BR` e `en-US`: todos os estados, valores, datas, confirmações, nomes acessíveis e feedback traduzidos pelo seletor de idioma existente.
- ADR curto para a extensão interna, isolamento financeiro e regras temporais; atualizar catálogo se introduzir capacidade reutilizável.

## Etapas de entrega

1. **Fechar ficha da transição:** direção single workspace já definida; identificar UUID usado pelo bridge e operadores iniciais. Registrar home/permissões, BRL e recorrência mensal como propostas detalhadas. Atualizar estratégia/ADR na implementação. Obter baseline pela CLI sem alterar produção; confirmar valores financeiros separadamente.
2. **PR 1 — dashboard interno e acessos:** workspace canônico, login/convites individuais, navegação/home básica, bloqueio de criação pública e compatibilidade do bridge. Testar os fluxos WhatsApp existentes e a impossibilidade de selecionar outro espaço. Não apagar dados ou remover RLS. A home pode apontar para Inbox até o resumo financeiro existir.
3. **PR 2 — financeiro completo:** dados/domínio, permissões financeiras, auditoria, API, resumo e tela, estimativas/cobertura, recorrência e conciliação. Testar autorização, concorrência e idempotência antes de conectar a UI. Entregar os oito critérios da ficha juntos, sem chamar uma fatia incompleta de V1 pronta.
4. **Verificação e QA por PR:** checks do repo, revisão independente do diff, screenshots e ficha com critérios. Até 3 rodadas; corrigir somente repros reprovadas. Mesmo erro duas vezes ou terceira rodada reprovada interrompe o ciclo. Merge exige QA aprovado e sim correspondente; Roger executa infraestrutura/deploy autorizado.
5. **Ativação:** ativar para usuários confirmados; validar login, resumo/persistência e bridge. Rollback de app deve preservar registros; revisar compatibilidade de schema com a versão anterior. Operação destrutiva/movimentação de dados de produção exige aprovação específica, caso se mostre necessária.

Sem estimativa fechada de prazo antes de conferir o schema remoto e os operadores. A conciliação e os testes de permissão são o principal custo desta entrega; não reduzir esses critérios para acelerar.

## Verificação — cenários binários de aceite

Usar somente dados sintéticos em ambiente de teste. Nenhum valor abaixo representa custo real da Diagium.

| Cenário                                                              | Resultado esperado na tela                                                                                            |
| -------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| Receita de setembro R$1.000 recebida em outubro; selecionar setembro | Faturamento R$1.000; recebido R$0; lançamento listado por competência                                                 |
| Selecionar outubro no mesmo caso                                     | Faturamento R$0 registrado; recebido R$1.000; liquidação listada em caixa; cobertura ainda pendente se não confirmada |
| Despesa de outubro R$200 paga em novembro                            | Outubro: despesa R$200, pago R$0; novembro: pago R$200                                                                |
| Receita R$1.000 com dois recebimentos de R$400 e R$600               | Faturamento conta uma vez; caixa mostra cada valor na data correta                                                    |
| Gateway e banco vinculados ao mesmo recebimento                      | Duas origens visíveis; faturamento e recebido não aumentam após vínculo                                               |
| Repetir ID externo ou reenviar operação                              | Erro claro de duplicata ou retorno idempotente; total permanece igual                                                 |
| Transferência PJ ↔ Vinicius                                         | Movimento identificado; excluído de receita, resultado e totais operacionais usados para burn                         |
| Lucas Ops/Hostinger sem confirmação de valor                         | Classificação Diagium; ausência/estimativa visível; nenhum zero tratado como confirmado                               |
| Faturamento R$1.000 e despesas de competência R$200                  | Resultado R$800 registrado; provisório se cobertura ou estimativa pendente                                            |
| Gerar recorrência duas vezes para o mesmo mês                        | Uma única despesa; sem pagamento presumido; alterar modelo não reescreve lançamento anterior                          |
| Editar/cancelar e recarregar                                         | Estado persiste; autor/data/motivo no histórico; indicadores atualizados                                              |
| Duas edições usando a mesma versão                                   | Segunda recebe conflito e permite recarregar, sem apagar a primeira                                                   |
| Conta não autorizada, mesmo admin; URL/API direta                    | Nenhum dado financeiro ou histórico é retornado; navegação ausente                                                    |
| Dois e-mails convidados entram no dashboard                          | Mesmo espaço Diagium; identidades/autoria e permissões distintas, sem seletor de workspace                            |
| E-mail autenticado sem convite/autorização                           | Sem acesso ao dashboard e sem criação automática de espaço                                                            |
| Usuário revogado mantém sessão válida                                | Próximas leituras/escritas protegidas negadas                                                                         |
| Request tenta workspace legado ou criar outro espaço                 | Leitura/escrita/provisionamento bloqueados, inclusive via banco/RPC                                                   |
| Bot consulta feed e solicita envio no UUID canônico                  | Contratos, cursor, IDs e idempotência preservados; canal correto e regras de resposta respeitadas                     |
| Bot informa UUID divergente ou conversa de espaço legado             | Acesso/envio negado, sem fallback para outra instância                                                                |
| Alternar idioma pelo Profile                                         | Página, formulários e mensagens mudam entre pt-BR/en-US; BRL não muda                                                 |
| Desktop 1366×768 e 1440×900; mobile 390×844                          | Valores completos, formulários operáveis, ações acessíveis, sem overflow de página                                    |

Testes necessários: cálculo temporal, centavos, estimativas, taxas, transferências, conciliação, recorrência, retries, concorrência, atomicidade de auditoria, API e RLS com usuários reais de teste. Verificação visual inclui teclado, foco, contrastes, erro, loading e vazio, usando tokens e primitives existentes.

Gates Mend: `npm run typecheck`, `npm test`, `npm run build`, `npm run lint`, `npm run format:check`, `npm run i18n:check`, `npm run i18n:frontend`, `npm run test:e2e`.

Smoke Mend: login de teste, abrir Inbox/conversa, consultar issue, abrir Settings, abrir financeiro autorizado, salvar e recarregar. O smoke de abrir caixa/venda/fechar caixa da regra geral do time é específico do ZeloPDV; registrar a adaptação para Mend na ficha de QA, sem inventar essas telas no app.

## Risco e limites

Principal risco da transição: interromper o bridge ao mudar o UUID/contexto ou deixar provisionamento público ativo. Preservar o workspace operacional, bloquear os caminhos de criação e testar os consumidores do bridge antes do rollout. No financeiro: números aparentemente completos com despesas/fontes ausentes, dupla contagem banco/gateway e acesso por administradores de suporte. Cobertura explícita, vínculo canônico e permissão financeira independente tratam esses riscos.

Planejamento fundamentado em arquivos locais; nenhuma UI, teste, schema remoto ou credencial de produção foi validado nesta tarefa. Nenhum código de produto foi alterado. Infraestrutura e custos existentes não precisam ser modificados para este desenho; necessidade concreta será verificada na etapa técnica.

Next step: identificar o workspace operacional do bridge e os operadores iniciais; validar a ficha detalhada dos dois PRs para iniciar a implementação em branch isolada. A direção de produto já foi definida pelo Vinicius.
