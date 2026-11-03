---
name: registrar-no-mend
description: Resume o trabalho feito na sessão (ou no dia) e publica no Diário do Mend para a equipe ler. Use quando a pessoa pedir para "registrar no Mend", "colocar no diário", "mandar o resumo pro Mend" ou invocar /registrar-no-mend.
---

# Registrar no Diário do Mend

O Diário do Mend (`/diario`) mostra para toda a equipe Diagium o que cada pessoa
fez nos últimos dias. Cada registro some sozinho 7 dias depois. Esta skill
escreve o resumo e o publica com o token pessoal de quem está usando o Claude.

## Pré-requisitos

- `MEND_DIARIO_TOKEN`: token pessoal gerado no Mend em **Diário → Conectar o
  Claude**. Nunca imprima, ecoe ou repita esse valor.
- `MEND_DIARIO_URL`: endereço da API do Mend (sem barra no final). Se não
  estiver definido, use `http://localhost:8787`.

Confira só se as variáveis existem, sem mostrar o valor:

```bash
test -n "$MEND_DIARIO_TOKEN" && echo "token ok" || echo "token ausente"
```

Se o token estiver ausente, explique como gerar e salvar (no Windows:
`setx MEND_DIARIO_TOKEN "<token>"` e reabrir o Claude) e pare.

## Passos

1. **Reúna o que foi feito.** Use o que aconteceu nesta conversa e, se estiver
   num repositório git, os commits e mudanças do dia:
   `git log --since=midnight --oneline` e `git status --short`. Se a pessoa
   indicar outro período ou outros itens, siga o que ela disse.
2. **Escreva o registro em pt-BR**, curto e para quem não acompanhou a sessão:
   - `title`: uma frase com o resultado (até 120 caracteres), por exemplo
     "Correção de arredondamento no PDV".
   - `body`: texto simples (sem Markdown pesado), até ~1500 caracteres, com
     **o que foi feito**, **o que mudou** (arquivos, telas ou comportamentos,
     em linguagem de produto) e, se houver, **o que falta**. Não inclua
     segredos, tokens, senhas, dados de clientes nem trechos grandes de código.
   - `project` (opcional): o produto afetado, por exemplo "Zelo" ou "PDV".
3. **Mostre o rascunho e peça confirmação.** Publicar deixa o texto visível
   para toda a equipe; só envie depois de um "sim" explícito. Ajuste o texto
   se a pessoa pedir.
4. **Publique.** Grave o JSON num arquivo temporário do scratchpad (assim as
   aspas e quebras de linha ficam corretas) e envie:

   ```bash
   curl -sS -X POST "${MEND_DIARIO_URL:-http://localhost:8787}/internal/work-log" \
     -H "Authorization: Bearer $MEND_DIARIO_TOKEN" \
     -H "Content-Type: application/json" \
     --data-binary @"<arquivo>.json"
   ```

   O corpo aceita só `title`, `body` e `project`; autor e validade são
   definidos pelo Mend.

5. **Confirme o resultado.** `201` significa publicado: avise que o registro
   está no Diário e some em 7 dias. `401` é token inválido ou revogado (gerar
   outro no Mend); `400` é texto vazio ou longo demais; `503` é o Mend
   indisponível. Não tente de novo em loop.
