# Tarefa: Mend interno — workspace único e acessos

Autorização: Vinicius pediu em 05/10/2026 para começar a implementação e assumir a engenharia do Mend. A direção de produto é dashboard interno Diagium, workspace único e múltiplas contas por e-mail, preservando o bridge WhatsApp.

Objetivo: operar o Mend em um único espaço interno, com identidades individuais e sem interromper os bots de WhatsApp.

Critérios de aceite:

1. Dadas duas contas convidadas, ao entrar ambas acessam o mesmo espaço Diagium, com identidade e permissões próprias, sem seleção/criação de workspace.
2. Dada uma conta autenticada sem membership, ao abrir o app ela vê acesso restrito e não cria um workspace.
3. Dado o espaço interno configurado, quando o cliente informa outro workspace por header, rota ou consulta, a API rejeita a operação.
4. Dado qualquer usuário, quando solicita criação de workspace pela API ou RPC pública, a operação é negada.
5. Dado um convite válido para o espaço interno, quando aceito o usuário mantém o fluxo de definir senha e entrar. Convites de espaços legados não concedem acesso ao app interno.
6. Dado o bridge autenticado, quando consulta eventos/envia no workspace interno mantém endpoints, IDs, cursor, idempotência, canal exato e regras de resposta. Workspace divergente não permite leitura/envio.
7. Dado login bem-sucedido, quando abre a home encontra Dashboard Diagium e navegação para WhatsApp e os acessos existentes; não vê marketing/cadastro público.
8. Dado workspace interno não configurado, a interface e os endpoints protegidos falham com mensagem clara; nunca escolhem o primeiro workspace disponível.
9. Dados desktop/mobile e pt-BR/en-US, as ações permanecem acessíveis, sem overflow e com strings traduzidas.

Telas e tamanhos: desktop 1366×768 e 1440×900; mobile 390×844.
Smoke Mend: login de teste, home, Inbox/conversa, issue e Settings; convite/aceite e bridge em provider simulado. A regra de caixa/venda do ZeloPDV é adaptada porque essas telas não existem no Mend.
Fora de escopo desta etapa: financeiro V1 (próximo PR da ficha financeira), remoção de colunas/dados legados, credenciais, env/DNS/host, envio WhatsApp real e deploy de produção.
Orçamento: no máximo 3 rodadas de QA. Mesmo erro duas vezes ou terceira rodada reprovada interrompe o ciclo.
Pronto = critérios e smoke aprovados + typecheck/test/build/lint/format/i18n/e2e verdes + aprovação QA antes de merge.

Handoff: a consulta aos peers em 05/10/2026 retornou nenhum bot alcançável. Ficha salva no repo para revisão; o início da implementação foi autorizado diretamente pelo Vinicius. QA humano/teammate permanece necessário para merge.
