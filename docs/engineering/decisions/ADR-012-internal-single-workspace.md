# ADR-012 — Mend interno com workspace único

Status: accepted — direção solicitada por Vinicius em 05/10/2026; rollout ainda pendente.

## Contexto

Mend passa de SaaS de suporte para dashboard interno da Diagium, com várias contas individuais e preservação do bridge de WhatsApp. O código existente usa UUIDs de workspace em canais, conversas, convites, eventos e integrações.

## Decisão

Resolver o workspace por uma tabela singleton `internal_workspace`. Manter o UUID operacional e as referências existentes, bloqueando seleção/provisionamento de outro workspace na interface, API e banco. Não usar o primeiro workspace disponível nem derivar o espaço do e-mail do usuário.

A migration cria a estrutura sem preencher o singleton. Antes de ativá-la, identificar o UUID usado pelos bindings WhatsApp e preparar a inserção desse UUID por um operador autorizado. Não apagar workspaces ou memberships legados como parte desta entrega. Triggers impedem criação de espaços e novas memberships/convites fora do espaço canônico.

Reutilizar Supabase Auth, membership, roles, convites e checagem autoritativa por requisição. O lookup RLS de role só considera o singleton; isso bloqueia dados legados mesmo quando o usuário possuía membership anterior. A tabela singleton pode ser lida por usuários autenticados: seu UUID não é segredo e não concede membership.

O feed e envio de Support sempre resolvem o singleton antes de acessar dados, aceitam o mesmo UUID explícito por compatibilidade e rejeitam UUID divergente. O resolver inbound mantém a seleção exata de instância, limitada ao espaço interno. O gateway Outbound → ZeloChat, que não possui parâmetro de workspace, mantém o contrato existente.

Jobs de processamento inbound e envio de resposta já enfileirados resolvem novamente a instância antes de executar. Workspace, canal e instância precisam coincidir com o binding atual; um job legado divergente não processa nem envia.

Cadastro público deixa de ser superfície do app; magic link não cria novas contas. `supabase/config.toml` desabilita signup para ambiente local. Essa configuração não é automaticamente aplicada em produção; não fazer config push indiscriminado.

## Consequências e rollout

- Nenhum novo serviço, chave ou variável de ambiente é necessário.
- Migração e configuração do singleton precisam ser coordenadas antes do rollout do app/worker. Aplicar somente a migration sem configurar o UUID bloqueia o acesso e o inbound; não aplicar isoladamente em produção.
- Sem remoção de dados; a reversão exige restaurar também os objetos de autorização que mudaram. Fazer apenas rollback do app não restaura o multi-tenant anterior, e esse não é o objetivo do produto.
- Financeiro virá no PR seguinte, com permissão própria; as roles de suporte não o concedem implicitamente.
- Testes devem cobrir duas identidades no mesmo espaço, revogação, ausência de configuração, tentativas de provisionamento e feed/envio compatíveis, sem WhatsApp real.
