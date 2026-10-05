# Financeiro Diagium V1

Entrega da ficha de 05/10/2026, autorizada por Vinicius junto à implementação do dashboard interno. A home exibe os mesmos indicadores mensais da página `/financeiro` para operadores financeiros autorizados.

## Comportamento

- Receita e despesa pertencem ao mês de competência. Recebimentos e pagamentos são registros separados, com data efetiva e suporte a valores parciais. Receber em outubro uma receita de setembro altera o caixa de outubro e preserva a competência de setembro.
- Resultado gerencial é receita menos despesa por competência. Transferências internas ficam fora dos indicadores; resultado não representa saldo bancário.
- Valor desconhecido permanece ausente, com pendência visível. Estimativas são identificadas. Fontes, despesas e impostos começam sem confirmação; o operador registra a revisão do mês antes de considerar sua cobertura completa.
- Lucas Ops e Hostinger são fontes da operação Diagium. Não há valores iniciais inventados nem importação automática do Zelo. Supabase exige identificar o projeto atendido. O campo de rateio documenta a regra usada para qualquer custo compartilhado.
- Recorrências geram despesas do mês por ação manual, sem worker. Repetir a geração não duplica a despesa e não registra pagamento.
- Pagamento e conciliação começam pelo lançamento escolhido. Conciliação adiciona evidências ao registro econômico existente: gateway e banco referenciam a mesma receita/pagamento, sem criar duas receitas. A origem e o identificador externo são únicos por fonte no workspace. As referências são consultadas pela competência do lançamento; o caixa é consultado pela data efetiva.
- Alterações exigem a versão atual do registro. Conflitos pedem recarregar, preservando a edição concorrente. Cancelamento exige motivo; não há exclusão física pela API.
- Auditoria registra autor, data e conteúdo antes/depois na mesma transação, com leitura restrita ao financeiro.

## Acesso e ativação

`finance_access` é uma permissão separada das roles de suporte. Owner/admin, bridge e contas novas não recebem financeiro automaticamente. A API e RLS verificam a permissão em cada consulta; retirar membership também elimina o grant financeiro.

A migration `20261005220515_diagium_finance.sql` cria tabelas, RLS e funções, sem operadores nem lançamentos iniciais. Antes do merge/deploy, aplicar somente essa migration no projeto hospedado verificado, com autorização de ativação, e registrar sua versão no histórico. Não usar `db reset` nem aplicar outras migrations pendentes por conveniência. Conferir os grants iniciais por e-mail autorizado e membership ativa no workspace canônico. Nenhum segredo pertence aos artefatos de ativação.

O frontend/backend deve ser publicado depois do schema. Sem grants, o módulo fica restrito. Para rollback, voltar o app ao SHA anterior; conservar os registros financeiros e não remover schema/dados.

## Verificação

- `npm run test:finance-db`: executa a migration real no PostgreSQL embarcado PGlite, sem Docker, com roles, RLS, auditoria, revogação, recorrência e indicadores. Não substitui o smoke de Auth/PostgREST do projeto hospedado após ativação.
- Testes HTTP cobrem autenticação, acesso financeiro separado, revogação com sessão ativa, rejeição de workspace divergente e entradas forjadas.
- Playwright cobre a interface em desktop/mobile, resumo na home, troca de mês e restrição em ambos os idiomas. O armazenamento desses testes de interface é simulado; a persistência e as regras reais são verificadas pelo teste de banco.

Integrações bancárias, pagamentos externos, consolidação com Zelo, saldo bancário e importação de documentos ficam fora desta versão. Convites/aceite continuam um fluxo geral do app, com a ressalva de QA do PR #15: não foram exercidos por e-mail real.
