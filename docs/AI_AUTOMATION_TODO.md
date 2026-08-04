# Mend — AI Automation TODO

## Implementação desta rodada

- [x] Human takeover idempotente em `conversation_ai_state`, com pausa/retomada server-side e auditoria.
- [x] Origem de mensagem (`app`, `whatsapp`, `ai`, `system`) e identificação de mensagens geradas pela IA.
- [x] Pipeline separado para `process_inbound_message` e `send_ai_reply`, com chave de deduplicação.
- [x] Revalidação de takeover imediatamente antes do envio e ledger de envios AI.
- [x] UI por conversa com Manual, Copilot, Auto-reply, Pause AI e Resume AI.
- [x] Testes para takeover, estágio separado de envio e rotas de pausa/retomada.

O envio automático permanece desligado por padrão (`safe_auto_send_enabled: false`). A migration precisa ser aplicada no projeto Supabase antes de ativar o worker em produção.

## Objetivo

Transformar o Mend em um copiloto de suporte para empresas que atendem clientes por WhatsApp e, depois, e-mail.

A IA deve:

- fazer triage de todas as mensagens recebidas quando habilitada;
- consultar apenas artigos de conhecimento publicados;
- criar issues para problemas operacionais;
- sugerir respostas para revisão humana;
- responder automaticamente apenas em cenários explicitamente permitidos;
- parar imediatamente quando um humano assumir a conversa.

O padrão do produto deve priorizar segurança operacional e controle humano. Auto-reply é uma permissão, não o comportamento padrão.

## Acesso de infraestrutura

- **Dokploy:** [http://2.24.66.12:3000/](http://2.24.66.12:3000/)
- **Usuário:** `kdo.vini@gmail.com`
- **Senha:** não armazenar neste arquivo ou no Git; usar somente pelo canal seguro de credenciais.
- **Aplicação Mend:** projeto `Mend`, ambiente `production`.

## Estado atual

- [x] `off`, `draft` e `safe_auto` existem como modos de conversa.
- [x] O modo padrão atual é `draft`.
- [x] Mensagens recebidas passam pelo worker de triage quando a automação está ativa.
- [x] A IA cria issues para intenções operacionais como bug, incidente, feature e cobrança.
- [x] A IA gera drafts usando artigos publicados.
- [x] Os drafts são persistidos em `ai_drafts`.
- [x] Existe política de workspace com threshold e intenções permitidas.
- [x] A política padrão restringe auto-reply a `question`, `how_to` e `status`.
- [x] O worker possui etapa explícita de envio automático, protegida por policy.
- [x] `safe_auto_send_enabled` habilita envio real somente após todos os gates.
- [x] Existe pausa explícita por intervenção humana.
- [x] Existe botão claro de “Resume AI” por conversa.
- [ ] Mensagem humana recebida via WhatsApp precisa ser diferenciada de uma mensagem enviada pela IA.
- [ ] O mesmo contrato de automação ainda não está preparado para e-mail.

## Modelo de produto

### Modos exibidos na interface

Manter os valores atuais no banco para evitar migração desnecessária, mas apresentar nomes mais claros:

| Valor interno | Nome na UI | Comportamento                                                                                             |
| ------------- | ---------- | --------------------------------------------------------------------------------------------------------- |
| `off`         | Manual     | Não gera resposta automática. Pode continuar exibindo triage apenas se isso for habilitado separadamente. |
| `draft`       | Copilot    | Faz triage e gera draft. Um humano revisa e envia.                                                        |
| `safe_auto`   | Auto-reply | Responde sozinho somente quando todos os gates de segurança passam.                                       |

O modo deve ser configurável no workspace e sobrescrito por conversa. O nível da conversa tem prioridade sobre o padrão do workspace.

### Controle de atendimento

Modo de IA e controle humano são conceitos diferentes:

- `ai_mode`: `off`, `draft` ou `safe_auto`;
- `automation_state`: `ai_active` ou `human_paused`;
- `human_takeover_at`;
- `human_takeover_by`;
- `human_takeover_reason`;
- `last_human_message_id`;
- `paused_until`, opcional e somente para uma futura retomada programada.

Uma conversa em `human_paused` nunca pode receber auto-reply, mesmo que `ai_mode = safe_auto`.

## Backlog P0 — necessário antes de auto-reply

### 1. Implementar human takeover

- [x] Criar migration para os campos de controle humano em `conversation_ai_state`.
- [x] Criar funções server-side para pausar e retomar a IA de uma conversa.
- [x] Ao enviar mensagem pelo Mend, marcar a conversa como `human_paused`.
- [x] Ao receber mensagem outbound do WhatsApp com `fromMe`, marcar como intervenção humana, exceto quando a mensagem tiver sido enviada pelo worker da IA.
- [x] Garantir que mensagens com `ai_generated = true` não pausam a IA.
- [ ] Salvar o motivo: `human_message`, `customer_requested_human`, `unsafe_intent`, `low_confidence` ou `manual_pause`.
- [x] Fazer o worker revalidar o estado imediatamente antes de qualquer futuro envio automático.
- [ ] Criar operação idempotente para evitar duas pausas concorrentes.

### 2. Melhorar a representação da origem da mensagem

- [ ] Diferenciar claramente `human`, `ai`, `contact` e `system` nas mensagens outbound.
- [ ] Persistir uma origem auditável: `app`, `whatsapp`, `ai` ou `system`.
- [ ] Guardar o `provider_message_id` da mensagem enviada pela IA para impedir que o webhook de retorno seja interpretado como intervenção humana.
- [ ] Garantir que eventos de receipt, update e delete não acionem triage nem takeover.

### 3. Ajustar o pipeline do worker

Fluxo desejado:

```text
mensagem inbound
  -> persistir com idempotência
  -> triage estruturado
  -> buscar conhecimento publicado
  -> verificar modo da conversa
  -> verificar human takeover
  -> verificar política e segurança
  -> criar issue ou draft
  -> revalidar takeover antes do envio
  -> enviar somente no modo safe_auto aprovado
  -> persistir resposta da IA
```

- [ ] Manter triage, issue e draft separados da etapa de envio.
- [x] Adicionar uma etapa explícita `send_ai_reply` ao job pipeline.
- [ ] Usar chave idempotente por mensagem inbound e tipo de ação.
- [ ] Reconsultar `conversation_ai_state` antes do envio.
- [ ] Se um humano responder durante a geração, descartar o envio automático.
- [ ] Persistir a decisão final: `draft`, `auto_reply`, `blocked` ou `human_paused`.
- [ ] Nunca enviar resposta se não houver conhecimento confiável quando a política exigir conhecimento publicado.

### 4. Interface por conversa

- [x] Adicionar seletor de automação no cabeçalho da conversa:
  - Manual;
  - Copilot;
  - Auto-reply.
- [x] Mostrar estado separado:
  - `AI active`;
  - `Human takeover — AI paused`;
  - `AI blocked — needs human`.
- [x] Adicionar botão `Resume AI` quando a conversa estiver pausada.
- [x] Adicionar botão `Pause AI` para pausa manual.
- [x] Exibir a razão da pausa.
- [ ] Exibir confiança, intenção e artigos usados pelo draft.
- [ ] Permitir editar o draft antes de inserir no composer.
- [ ] Mostrar claramente quando uma mensagem foi gerada pela IA.

## Backlog P1 — Copilot confiável

### 5. Triage independente da resposta

- [ ] Definir se o workspace quer triage mesmo com respostas automáticas desligadas.
- [ ] Classificar intenção, prioridade, sentimento, confiança e necessidade de humano.
- [ ] Criar issue somente quando a intenção realmente for operacional.
- [ ] Evitar duplicar issue para várias mensagens da mesma ocorrência.
- [ ] Mostrar resumo da conversa e motivo da decisão no inbox.

### 6. Base de conhecimento

- [ ] Manter artigos em estados `draft` e `published`.
- [ ] Usar somente artigos `published` nos prompts de produção.
- [ ] Mostrar artigos usados em cada draft ou resposta automática.
- [ ] Bloquear auto-reply quando a política exigir conhecimento e nenhum artigo for encontrado.
- [ ] Adicionar instruções por artigo: quando usar, quando não usar e quando escalar.
- [ ] Adicionar revisão, autor, data e histórico de publicação.
- [ ] Criar artigo inicial de fallback: “não encontrei informação suficiente; vou encaminhar para o time”.

### 7. Política do workspace

- [ ] Configurar modo padrão do workspace.
- [ ] Configurar intenções permitidas no auto-reply.
- [ ] Configurar confiança mínima.
- [ ] Configurar exigência de artigo publicado.
- [ ] Configurar horário de atendimento, se necessário.
- [ ] Configurar limite de respostas automáticas por conversa e por período.
- [ ] Configurar palavras ou assuntos que sempre exigem humano.
- [ ] Exigir confirmação explícita antes de habilitar `safe_auto` no workspace.

### 8. Segurança operacional

- [ ] Bloquear prompt injection vindo de mensagens de clientes ou artigos não publicados.
- [ ] Nunca permitir que a IA altere permissões, faça deploy, reembolse, cancele ou execute ações externas sem confirmação.
- [ ] Redigir dados sensíveis antes de enviar ao provedor quando possível.
- [ ] Aplicar limite de tamanho e frequência por conversa.
- [ ] Criar audit log para cada triage, draft, bloqueio, takeover e auto-reply.
- [x] Garantir que retries não enviem a mesma resposta duas vezes.
- [ ] Implementar dead-letter/erro visível quando o envio automático falhar.

## Regras do Auto-reply

O auto-reply só pode ocorrer quando todas as condições forem verdadeiras:

- [ ] `ai_mode = safe_auto`;
- [ ] `automation_state = ai_active`;
- [ ] intenção está na allowlist do workspace;
- [ ] confiança está acima do threshold;
- [ ] não é assunto sensível ou operacional;
- [ ] não há pedido explícito de humano;
- [ ] existe conhecimento suficiente, quando exigido;
- [ ] não houve resposta humana desde a mensagem analisada;
- [ ] não excedeu rate limit ou cooldown;
- [ ] a mensagem não é duplicada;
- [ ] o provider está conectado e saudável.

Intenções que devem ficar fora da primeira versão do auto-reply:

- incidentes;
- bugs;
- cobrança e reembolso;
- cancelamento;
- reclamações;
- privacidade e segurança;
- temas jurídicos;
- baixa confiança;
- sentimento negativo forte.

## Retomada da IA

Comportamento padrão:

1. Humano envia uma mensagem.
2. Mend pausa a IA imediatamente.
3. A conversa mostra `Human takeover`.
4. Nenhum inbound novo dispara auto-reply.
5. Um operador clica em `Resume AI`.
6. A IA volta ao modo configurado para aquela conversa.

Ao retomar, a IA deve analisar o contexto recente novamente. Não deve simplesmente reutilizar um draft antigo.

## E-mail

Não duplicar a lógica de automação para cada canal.

- [ ] Criar um contrato de evento neutro de canal: inbound, outbound, sender, provider id, conversation id e origin.
- [ ] Reutilizar triage, conhecimento, gates, takeover e auditoria.
- [ ] Criar adapter WhatsApp.
- [ ] Criar adapter e-mail depois.
- [ ] Garantir que uma resposta humana enviada pelo e-mail também pause a IA da conversa.

## Testes obrigatórios

- [ ] Mensagem inbound em modo Manual não gera resposta.
- [ ] Mensagem inbound em Copilot gera triage e draft, sem envio.
- [ ] Auto-reply responde apenas intenção permitida e confiança suficiente.
- [ ] Auto-reply não responde incidente, cobrança, reclamação ou baixa confiança.
- [ ] Mensagem humana pelo Mend pausa a conversa.
- [ ] Mensagem humana pelo WhatsApp pausa a conversa.
- [ ] Mensagem da própria IA não pausa a conversa.
- [ ] Humano e worker concorrendo não produzem auto-reply depois do takeover.
- [ ] Retry do webhook não duplica triage, issue, draft ou resposta.
- [ ] Falha no WhatsApp deixa erro auditável e não marca envio como concluído.
- [ ] `Resume AI` permite novo processamento somente de mensagens futuras.
- [ ] Artigo em draft nunca aparece no prompt de produção.
- [ ] Todas as decisões são visíveis no audit log.

## Critérios de aceite do MVP

O MVP de automação estará pronto quando:

1. Toda conversa tiver um modo explícito: Manual, Copilot ou Auto-reply.
2. Copilot funcionar de ponta a ponta com artigos publicados e revisão humana.
3. Uma mensagem humana, enviada pelo Mend ou pelo WhatsApp, pausar a IA.
4. Auto-reply puder ser habilitado apenas com confirmação explícita.
5. Auto-reply funcionar somente para uma allowlist de intenções simples.
6. O sistema revalidar takeover antes de enviar.
7. Cada decisão puder ser auditada.
8. O comportamento for coberto por testes de concorrência, idempotência e falha do provider.

## Ordem recomendada de implementação

1. Human takeover e origem das mensagens.
2. UI de Manual/Copilot/Auto-reply e estado pausado.
3. Copilot com artigos publicados, sources e drafts.
4. Pipeline de envio AI com idempotência e revalidação.
5. Auto-reply restrito a perguntas simples.
6. Rate limits, horários e regras avançadas.
7. Abstração de canal para e-mail.
