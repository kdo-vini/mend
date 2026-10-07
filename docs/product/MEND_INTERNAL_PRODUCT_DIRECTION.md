# Mend — dashboard interno Diagium

Direção definida por Vinicius em 05/10/2026. Substitui a estratégia comercial de agosto de 2026 para o desenvolvimento atual.

Mend é o dashboard interno da Diagium: um único workspace operacional, várias contas individuais por e-mails diferentes e permissões por usuário. O bridge existente entre bots e WhatsApp permanece como responsabilidade central do app.

## Prioridade e escopo

1. Estabelecer o acesso interno, reutilizando o workspace que já contém os canais e o histórico. Não provisionar espaços por conta nem manter onboarding público.
2. Entregar o financeiro Diagium da ficha: faturamento por competência, recebimentos, despesas, resultado, recorrência manual, origem/conciliação e rastreabilidade. Manter a separação do Zelo Admin.
3. Preservar Inbox/WhatsApp, convites e gestão de acessos existentes. Outros módulos internos dependem de pedido concreto; não criar ERP, métricas fictícias ou automações financeiras.

## Limites

Em 06/10/2026, Vinicius esclareceu: Diagium é a empresa; Zelo é seu projeto/produto.
Projetos têm página própria na sidebar, cadastro e vínculo com receitas/despesas
no Financeiro. A visão consolidada inclui os projetos, preservando o detalhe por
origem. Stripe e AbacatePay são somente leitura, com taxas/líquido quando
confirmados e saldos/repasses separados. Não há mudanças de cobrança nem cópia
dos recebimentos automáticos para o ledger manual. Ver
[projetos](../engineering/PROJECT_FINANCE.md) e
[contrato dos provedores](../engineering/ZELO_FINANCE_CONNECTION.md).

- Identidade individual, autorização, RLS e auditoria continuam obrigatórias. Single workspace não significa acesso livre ou senha compartilhada.
- O UUID operacional é preservado nas referências de canais, conversas, mensagens, eventos e credenciais. Colunas legadas não precisam ser removidas para abandonar multi-tenancy.
- Selecionar o UUID canônico exige verificação dos bindings existentes; ausência de configuração falha fechada.
- Bots mantêm os contratos atuais de autenticação, cursor, idempotência, `replyAllowed` e associação exata à instância WhatsApp. O bridge não concede acesso financeiro.
- Credenciais, mudanças de infraestrutura e dados de produção não fazem parte da implementação local.
- Interface bilíngue, responsiva e alinhada ao design existente. QA continua obrigatório para merge de mudanças visíveis.

Referências: [plano](DIAGIUM_DASHBOARD_PLAN.md), [ficha da transição](FICHA_INTERNAL_DASHBOARD.md) e [ADR](../engineering/decisions/ADR-012-internal-single-workspace.md).
