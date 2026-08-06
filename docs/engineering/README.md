# Engenharia: documentação de referência

Este é o índice da documentação de engenharia do Mend. O conteúdo é versionado
junto com o código e deve ser atualizado na mesma mudança que altera um contrato,
um padrão ou uma decisão arquitetural.

## Padrão adotado

Usamos uma combinação pequena de padrões consolidados:

- **Diátaxis** organiza a intenção do leitor: tutoriais para aprender, how-tos
  para executar uma tarefa, referência para consultar contratos e explicações
  para entender decisões.
- **ADR (Architecture Decision Record)** registra decisões irreversíveis ou
  caras de reverter. Cada ADR tem contexto, decisão, consequências e
  alternativas rejeitadas.
- **Docs-as-code** mantém Markdown no repositório, revisão por pull request,
  links relativos e validação automática de formato.
- **C4 leve** é usado quando um desenho de contexto, contêineres ou limites
  torna a arquitetura mais clara que uma descrição textual.

Não criamos uma página para cada função. Helpers pequenos ficam no catálogo; um
ADR só é criado quando a decisão afeta mais de um módulo, segurança, dados,
operações ou compatibilidade.

## Navegação por intenção

| Necessidade                                  | Documento                                       |
| -------------------------------------------- | ----------------------------------------------- |
| Encontrar um helper ou padrão antes de codar | [Catálogo de helpers e padrões](catalog.md)     |
| Entender por que uma decisão foi tomada      | [Decisões arquiteturais](decisions/)            |
| Copiar o formato de uma nova decisão         | [Template de ADR](templates/ADR.md)             |
| Operar ou diagnosticar produção              | [Runbook operacional](../OPERATIONS_RUNBOOK.md) |
| Entender regras visuais e componentes        | [Sistema de design](../../DESIGN.md)            |
| Consultar segurança e exceções conhecidas    | [Segurança](../SECURITY.md)                     |

## Regras de manutenção

1. Comece pelo índice e pelo catálogo antes de criar um helper, adapter,
   integração ou fluxo de autorização.
2. Documente o contrato público, não a implementação linha a linha.
3. Prefira links para a fonte de verdade em vez de copiar listas que podem
   divergir.
4. Marque documentos obsoletos com `Status: superseded` e aponte para o novo
   documento; não apague histórico arquitetural.
5. Toda mudança de padrão deve incluir teste, exemplo mínimo ou evidência de
   validação adequada ao risco.

## Definition of Done para documentação

- [ ] O documento tem público e objetivo explícitos.
- [ ] O conteúdo está no tipo correto (tutorial, how-to, referência ou
      explicação/ADR).
- [ ] Contratos citam os arquivos ou comandos que são a fonte de verdade.
- [ ] Segredos, tokens, argumentos de usuário e dados pessoais não aparecem.
- [ ] Links relativos foram conferidos e o Markdown está formatado.
- [ ] A mudança foi revisada junto com o código que ela documenta.
