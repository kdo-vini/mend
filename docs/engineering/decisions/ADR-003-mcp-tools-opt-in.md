# ADR-003 — Tools MCP são opt-in e classificadas conservadoramente

- **Status:** accepted
- **Data:** 2026-08-06
- **Decisores:** equipe de plataforma
- **Escopo:** descoberta, seleção e autorização de tools MCP

## Contexto

Um catálogo remoto pode conter leitura, escrita, SQL genérico ou operações com
efeitos colaterais. Habilitar tudo por padrão transferiria risco para o agente.

## Decisão

Nenhuma tool é habilitada após a descoberta. Apenas `readOnlyHint: true` é
classificada como leitura; qualquer outra é tratada como escrita. O owner/admin
seleciona tools e confirma explicitamente os modos Copilot e Auto-reply.

## Consequências

- SQL e tools genéricas continuam permitidas, mas nunca implícitas.
- Leitura pode ter aprovação automática; escrita passa pelo gate técnico e pela
  política persistida.
- O catálogo descoberto é informação de configuração, não autorização.

## Alternativas rejeitadas

- Inferir risco pelo nome da tool: nomes não são uma fronteira de segurança.
- Habilitar somente tools com prefixos conhecidos: quebraria servidores válidos.

## Evidências

- `server/mcp.ts`
- `src/features/settings/pages/SettingsPage.tsx`
- `docs/engineering/catalog.md`

## Revisão

Revisitar se o protocolo passar a oferecer uma classificação verificável e
assinada de efeitos colaterais.
