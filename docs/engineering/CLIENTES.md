# Clientes

Painel interno de clientes da Diagium, no lugar do banco "Clientes" do Notion.
Tela em `/clientes` (lista) e `/clientes/:id` (página do cliente); mock em
[`docs/design/mocks/clientes.html`](../design/mocks/clientes.html).

## Modelo (`supabase/migrations/20261105120000_clients.sql`)

| Notion   | Mend (`clients`)                                                                 |
| -------- | -------------------------------------------------------------------------------- |
| Cliente  | `name`                                                                           |
| Contato  | `contact`                                                                        |
| Email    | `email`                                                                          |
| Telefone | `phone` (+ `phone_digits`, gerado, para achar duplicados)                        |
| Site     | `site`                                                                           |
| Estágio  | `stage`: `lead` · `proposta` · `ativo` · `churn`                                 |
| Notas    | `notes` (curto, até 2.000)                                                       |
| Produto  | `products`: lista com `site`, `sistema`, `integracao`                            |
| Reuniões | `client_entries` com `kind = 'reuniao'` (linha do tempo permanente)              |
| (página) | `body`: markdown; cada `## Título` vira uma seção que abre e fecha na tela       |

Todo site já inclui SEO básico (robots.txt, llms.txt); `sistema` e
`integracao` são os projetos que vão além do site.

Origem: `source` (`manual`, `diagnostico_marca`, `agente`, `importacao`),
`area`, `specialty`, `registration` (CRO/CRM…), `referral` (o `ref` da
indicação), `utm` (`source`, `medium`, `campaign`, `term`, `content`) e
`external_id` (id no sistema de origem).

Linha do tempo (`client_entries`): `kind` `nota` · `reuniao` · `diagnostico` ·
`estagio`, com `title`, `body` (markdown), autor e `occurred_at`. É
permanente: o Diário expira em 7 dias e não serve como histórico do cliente.

Chamados: `issues.client_id` (opcional). Apagar o cliente só solta o vínculo.

Acesso: todo membro do workspace lê; agent, admin e owner criam e editam; só
owner e admin arquivam (`archived_at`) ou excluem. O banco garante isso (RLS,
grants por coluna e trigger), não só a API.

## API do app (`/api`, JWT do usuário)

Campos em `snake_case`, como no resto da API.

- `GET /api/clients?archived=1` → `{ data: ClientSummary[], permissions: { canEdit, canArchive } }`. Sem `archived=1`, só os não arquivados. `ClientSummary` é o cliente sem `body`.
- `GET /api/clients/:id` → `{ data: Client & { entries: ClientEntry[], issues: { id, identifier, title, status }[] }, permissions }`
- `POST /api/clients` `{ name, contact?, email?, phone?, site?, stage?, products?, notes?, body?, area?, specialty?, registration?, referral? }` → `201 { data: Client }`
- `PATCH /api/clients/:id` com qualquer campo acima e `archived?: boolean` → `{ data: Client }`. Mudar `stage` registra uma entrada `estagio` na linha do tempo.
- `DELETE /api/clients/:id` → `204` (owner/admin)
- `POST /api/clients/:id/entries` `{ kind: "nota" | "reuniao", title?, body }` → `201 { data: ClientEntry }`
- `DELETE /api/clients/:id/entries/:entryId` → `204` (autor ou owner/admin)
- `POST /api/clients/:id/issues` `{ identifier: "MEND-142" }` liga um chamado; `DELETE /api/clients/:id/issues/:issueId` solta → `204`

## Ingestão do Diagnóstico de marca

O site da Diagium chama este endpoint depois de salvar cada diagnóstico.

```
POST https://<mend>/internal/clients/diagnostico-marca
Authorization: Bearer <MEND_CLIENT_INGEST_TOKEN>
Content-Type: application/json
```

`MEND_CLIENT_INGEST_TOKEN` fica só nas variáveis de ambiente do Mend (Dokploy)
e do site (Vercel); nunca em arquivo versionado. Precisa ter pelo menos 32
caracteres (ex.: `openssl rand -base64 48`). Sem ele configurado, o endpoint
responde `503`.

### Corpo

```json
{
  "externalId": "uuid-do-diagnostico-no-supabase-da-diagium",
  "enviadoEm": "2026-11-04T12:42:00.000Z",
  "submission": {
    "area": "odontologia",
    "areaLabel": "Odontologia",
    "especialidade": "ortodontia",
    "especialidadeLabel": "Ortodontia",
    "nome": "Helena Martins",
    "chamado": "Helena",
    "whatsapp": "(11) 98765-4321",
    "registro": "CRO-SP 123456",
    "rqe": null,
    "ref": "carla-ortodontia",
    "utm": { "source": "instagram", "medium": "bio", "campaign": "diag-nov", "term": "", "content": "" },
    "respostas": [
      {
        "questionId": "como-descrevem",
        "section": "sobre",
        "sectionTitle": "Sobre você",
        "title": "Como os pacientes descrevem você?",
        "answer": "Paciente, didática"
      },
      {
        "questionId": "diferenciais",
        "section": "sobre",
        "sectionTitle": "Sobre você",
        "title": "O que te diferencia?",
        "answer": "Alinhadores, Plano em vídeo",
        "items": ["Alinhadores", "Plano em vídeo"]
      }
    ]
  }
}
```

`submission` é exatamente o objeto `Submission` de `buildSubmission`
(`src/diagnostico-marca/engine.mjs` no repo da Diagium). `externalId` é
opcional, mas recomendado: é o que torna o reenvio seguro. `enviadoEm` é
opcional (padrão: agora). Limite: 256 KB por requisição, 120 respostas.

### O que acontece

1. Já existe entrada `diagnostico` com esse `externalId` → nada muda; `200`, `status: "duplicate"`.
2. O WhatsApp bate com um cliente não arquivado → o diagnóstico entra na linha do tempo dele; `200`, `status: "attached"`.
3. Senão → cria o cliente com Estágio Lead, origem `diagnostico_marca`, área, especialidade, registro, indicação e utm; o corpo recebe o resumo e uma seção `##` por seção do formulário. `201`, `status: "created"`.

### Resposta

```json
{ "data": { "clientId": "8f0c…", "status": "created", "url": "https://<mend>/clientes/8f0c…" } }
```

| Status | Corpo                                         | Quando                                  |
| ------ | --------------------------------------------- | --------------------------------------- |
| 201    | `data` com `status: "created"`                | cliente novo                            |
| 200    | `data` com `status: "attached"`/`"duplicate"` | anexado a cliente existente ou repetido |
| 400    | `{ "error": "invalid_body" }`                 | corpo fora do formato                   |
| 401    | `{ "error": "client_ingest_token_invalid" }`  | sem token ou token errado               |
| 413    | —                                             | corpo maior que 256 KB                  |
| 429    | —                                             | mais de 30 chamadas por minuto          |
| 503    | `{ "error": "client_ingest_unavailable" }`    | token ou banco não configurados, falha  |

Em 5xx o site pode tentar de novo com o mesmo `externalId`.

### Ativação

1. Aplicar a migration (`supabase db push`).
2. Gerar o token e salvar como `MEND_CLIENT_INGEST_TOKEN` no Mend (Dokploy, pela CLI) e no site da Diagium. `APP_BASE_URL` (ou `PUBLIC_APP_URL`, já usados nos convites) monta o `url` da resposta.
3. No site, chamar o endpoint em `lib/diagnostico-envio.mjs` junto com o e-mail.

## MCP

| Escopo             | Ferramenta           | O que faz                                                         |
| ------------------ | -------------------- | ----------------------------------------------------------------- |
| `clientes:ler`     | `clientes_listar`    | Lista clientes (filtros: estágio, área, busca), sem o corpo.      |
| `clientes:ler`     | `clientes_ver`       | Cliente completo: propriedades, corpo, linha do tempo e chamados. |
| `clientes:escrever` | `clientes_criar`     | Cria cliente (origem `agente`).                                  |
| `clientes:escrever` | `clientes_atualizar` | Muda propriedades, estágio ou corpo.                             |
| `clientes:escrever` | `clientes_anotar`    | Anexa nota ou reunião na linha do tempo, com o nome do agente.   |
