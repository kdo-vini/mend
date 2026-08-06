# ADR-004 — Evidência MCP participa do gate de automação

- **Status:** accepted
- **Data:** 2026-08-06
- **Decisores:** equipe de suporte e plataforma
- **Escopo:** rascunhos, Auto-reply e consultas MCP de leitura

## Contexto

Uma resposta operacional pode exigir dados privados do cliente que não existem
na base de conhecimento publicada. O telefone do WhatsApp permite consultar o
cliente no MCP do workspace, mas ausência ou ambiguidade não prova identidade.

## Decisão

Uma leitura MCP bem-sucedida, única e exata conta como evidência confiável para
o gate de Auto-reply. O agente recebe apenas telefone normalizado, mensagem,
conhecimento relevante e tools allowlisted. Sem correspondência única, não usa
o registro e não inventa vínculo.

## Consequências

- O agente pode reconhecer Zelo PDV/Zelo Chat sem perguntar novamente o produto.
- A evidência não autoriza escrita por si só; escrita segue o ADR-003.
- O worker precisa distinguir ausência, ambiguidade e sucesso no diagnóstico.

## Alternativas rejeitadas

- Confiar somente no artigo publicado: impede respostas personalizadas.
- Aceitar o primeiro resultado: pode revelar dados de outro cliente.

## Evidências

- `server/live-worker.ts`
- `server/automation/decision.ts`
- Testes de worker e decisão de automação

## Revisão

Revisitar quando houver um identificador de cliente verificado além do telefone.
