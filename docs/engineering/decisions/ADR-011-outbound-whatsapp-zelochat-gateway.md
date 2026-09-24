# ADR-011 — Outbound WhatsApp passa por Mend, não por uma segunda chave no ZeloChat

- **Status:** accepted
- **Data:** 2026-09-24
- **Decisores:** Vinicius / plataforma
- **Escopo:** `POST /internal/whatsapp/send-text` no control plane Mend; client
  server-side para a instância Techne do ZeloChat

## Contexto

Outbound/Grok Bot precisa enviar texto simples no WhatsApp Techne (mesmo efeito
de `POST /internal/whatsapp/send-text` no ZeloChat: texto plano para um número,
sem HSM da Meta). Colocar uma segunda chave no ZeloChat para o bot misturaria
segredos e forçaria rotação no Chat/PDV.

Mend já é o control plane público (`app.techneia.com.br`) e já autentica rotas
machine-to-machine com compare timing-safe. A chave interna do ZeloChat
(`ZELOCHAT_INTERNAL_API_KEY` / legado `TECHNE_INTERNAL_API_KEY`, header
`x-zelochat-internal-key`) já existe. Mend **não** tinha essa chave no código
nem no `.env.example`.

## Decisão

1. Mend expõe `POST /internal/whatsapp/send-text` fora de `/api`, para não
   exigir JWT de workspace.
2. O bot autentica só com `x-mend-outbound-key`, comparado de forma
   timing-safe a `MEND_OUTBOUND_WHATSAPP_API_KEY`. Sem env → 503 fail-closed.
   Essa chave é nova e pertence ao Mend; vai no secret card do Outbound.
3. Com auth ok, Mend encaminha `{ to, message }` para
   `{ZELOCHAT_BASE_URL}/internal/whatsapp/send-text` usando a chave **já
   existente** do Chat. Sem URL/chave do Chat → 503
   `zelochat_forward_not_configured` (endpoint e client ficam wired; Staff
   Eng só seta env).
4. 401 do Chat vira 503 `zelochat_forward_unauthorized` para o bot não
   confundir a chave Mend com a chave Chat.
5. Não rotacionar nem remover a chave PDV do ZeloChat. Não criar segunda
   chave no Chat. Não reutilizar `MEND_API_TOKEN`. Zero envio real em testes.

## Consequências

### Benefícios

- O bot fala só com Mend. Uma chave Chat fica server-side no control plane.
- O contrato `{ to, message }` e o path são os mesmos do ZeloChat.

### Custos e riscos

- Envio depende de dois deploys/env: Mend (chave nova + cópia da chave Chat)
  e o secret card do Outbound (só a chave Mend).
- Sem `ZELOCHAT_*` o endpoint autentica mas não encaminha.

### Operação e migração

Setar no Dokploy app **Mend** (não no Agent Runner):
`MEND_OUTBOUND_WHATSAPP_API_KEY`, `ZELOCHAT_BASE_URL`,
`ZELOCHAT_INTERNAL_API_KEY`. Redeploy do control plane. Apontar o bot para
`https://app.techneia.com.br/internal/whatsapp/send-text`.

## Alternativas rejeitadas

- **Segunda chave no ZeloChat para o bot:** viola o pivot; risco de rotacionar
  a chave PDV.
- **Reusar `MEND_API_TOKEN`:** mistura admin de instâncias Whatsmiau com envio
  Outbound.
- **Enviar pelo Whatsmiau do próprio Mend:** canal de Inbox/suporte, não a
  instância Techne do ZeloChat.

## Evidências

- `server/zelochat-internal-send.ts`
- `server/internal-whatsapp.ts`
- `server/zelochat-internal-send.test.ts`
- `server/internal-whatsapp.test.ts`

## Revisão

Revisar se o Outbound passar a precisar de mídia, HSM ou outro canal.
