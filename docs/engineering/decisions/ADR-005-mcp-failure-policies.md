# ADR-005 — Falhas MCP seguem política explícita

- **Status:** accepted
- **Data:** 2026-08-06
- **Decisores:** equipe de suporte e plataforma
- **Escopo:** falhas de descoberta, leitura, OAuth e execução MCP

## Contexto

Um MCP pode estar indisponível, expirar autenticação ou falhar depois de uma
possível mutação. O produto precisa de um comportamento previsível por
workspace, sem repetir uma escrita incerta.

## Decisão

O workspace escolhe uma política:

- `review`: rebaixar para humano;
- `generic_reply`: responder apenas com conhecimento publicado;
- `retry_then_review`: repetir falhas transitórias duas vezes e depois
  rebaixar.

Falhas após uma possível escrita nunca são repetidas automaticamente.

## Consequências

- A política é salva na AI policy e auditada junto da chamada.
- O modo sem plugins preserva o comportamento anterior.
- Diagnóstico de conexão deve registrar status sanitizado e última falha, sem
  tokens, argumentos ou resultado bruto.

## Alternativas rejeitadas

- Sempre responder com erro técnico: expõe detalhes internos ao cliente.
- Repetir toda falha: pode duplicar uma mutação externa.

## Evidências

- `src/ai-policy.ts`
- `server/live-worker.ts`
- `server/providers.ts`

## Revisão

Revisitar se o servidor MCP oferecer confirmação transacional ou idempotência
externa verificável.
