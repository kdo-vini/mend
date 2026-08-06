# ADR-001 — Criptografia compartilhada para segredos de conexão

- **Status:** accepted
- **Data:** 2026-08-06
- **Decisores:** equipe de plataforma
- **Escopo:** conexões Google, MCP e futuras integrações server-side

## Contexto

Tokens OAuth, headers secretos e client secrets precisam do mesmo tratamento
criptográfico. Manter uma implementação por integração aumenta o risco de
formatos incompatíveis e dificulta rotação e auditoria.

## Decisão

Usar `encryptConnectionSecret` e `decryptConnectionSecret` em
`server/connection-crypto.ts`. O helper não conhece ambiente nem domínio; o
módulo de integração resolve a chave. MCP usa `CONNECTION_ENCRYPTION_KEY` e
aceita `GOOGLE_TOKEN_ENCRYPTION_KEY` como fallback de compatibilidade.

## Consequências

- Integrações novas reutilizam um único formato AES-256-GCM versionado.
- Google mantém aliases legados durante a migração, sem duplicar a lógica.
- A chave e todo ciphertext permanecem no backend.

## Alternativas rejeitadas

- Criar um módulo criptográfico por integração: duplicaria código sensível.
- Resolver `process.env` dentro do helper: misturaria configuração com uma
  função pura e dificultaria testes.

## Evidências

- `server/connection-crypto.ts`
- `server/google-calendar.ts`
- `server/mcp.ts`
- Testes de Google e MCP

## Revisão

Revisitar ao remover o fallback da chave Google ou ao adotar um KMS externo.
