# Instalar o Diário do Mend no Claude Code

> **Para a pessoa:** arraste este arquivo para o Claude Code e escreva
> "executa as instruções deste arquivo". O Claude faz o resto e te avisa do
> único passo manual (colar o seu token no terminal).

---

## Instruções para o Claude

Você vai preparar este computador (Windows) para publicar no Diário do Mend.
Siga os passos na ordem e, no fim, resuma o que foi feito.

### 1. Instalar a skill `registrar-no-mend`

Crie o arquivo `%USERPROFILE%\.claude\skills\registrar-no-mend\SKILL.md`
(no Git Bash: `~/.claude/skills/registrar-no-mend/SKILL.md`), criando as
pastas se faltarem, com **exatamente** o conteúdo entre as linhas
`=====INICIO=====` e `=====FIM=====` abaixo (sem incluir essas duas linhas).
Se o arquivo já existir, substitua.

=====INICIO=====
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
=====FIM=====

### 2. Definir o endereço do Mend

Rode no terminal:

```bash
setx MEND_DIARIO_URL "https://app.techneia.com.br"
```

### 3. Conferir se o token já existe (sem mostrar o valor)

```bash
powershell -NoProfile -Command "if ([Environment]::GetEnvironmentVariable('MEND_DIARIO_TOKEN','User')) { 'token ok' } else { 'token ausente' }"
```

### 4. Se o token estiver ausente, peça para a pessoa fazer isto

**Não peça para colar o token no chat e não o digite você.** Explique:

1. Abrir https://app.techneia.com.br/diario, clicar em **Conectar o Claude**,
   dar um nome ao computador e clicar em **Gerar token**. Copiar na hora,
   porque ele aparece só uma vez.
2. Abrir um terminal (PowerShell ou Prompt de Comando) e rodar, colando o
   token no lugar indicado:

   ```bash
   setx MEND_DIARIO_TOKEN "cole-o-token-aqui"
   ```

### 5. Finalizar

Diga para a pessoa fechar e abrir o Claude Code de novo (as variáveis só
valem em janelas novas). Depois disso, quando terminar uma tarefa, é só pedir
"registra no Mend" ou rodar `/registrar-no-mend`: o Claude escreve o resumo,
mostra antes e só publica depois da confirmação.
