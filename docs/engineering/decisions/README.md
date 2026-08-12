# Decisões arquiteturais

Estas decisões usam o formato ADR. Elas registram limites que precisam ser
consistentes entre backend, frontend, banco, workers e operação.

| ADR                                                | Decisão                                                | Status   |
| -------------------------------------------------- | ------------------------------------------------------ | -------- |
| [ADR-001](ADR-001-shared-connection-encryption.md) | Criptografia compartilhada para segredos de conexão    | accepted |
| [ADR-002](ADR-002-workspace-scoped-mcp.md)         | MCP com isolamento por workspace                       | accepted |
| [ADR-003](ADR-003-mcp-tools-opt-in.md)             | Tools MCP são opt-in e classificadas conservadoramente | accepted |
| [ADR-004](ADR-004-mcp-evidence-automation.md)      | Evidência MCP participa do gate de automação           | accepted |
| [ADR-005](ADR-005-mcp-failure-policies.md)         | Falhas MCP seguem política explícita                   | accepted |
| [ADR-006](ADR-006-durable-bug-loop-cli-github.md)  | Loop de bug durável com agentes CLI e GitHub           | accepted |
| [ADR-007](ADR-007-coding-control-plane-v2.md)      | Control plane por etapa e artefato de pesquisa         | accepted |
| [ADR-008](ADR-008-auth-rate-limits.md)             | Rate limits em camadas para autenticação               | accepted |

Novas decisões devem copiar o [template de ADR](../templates/ADR.md), receber o
próximo número e ser adicionadas a esta tabela.
