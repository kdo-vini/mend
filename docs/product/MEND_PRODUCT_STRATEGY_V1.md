# Mend — Product Strategy v1.0

**Status:** Decisão de produto antes da próxima grande fase de desenvolvimento  
**Data:** 7 de agosto de 2026  
**Owner:** Vinicius / Téchne

---

## 1. Decisão executiva

**Mend é um AI Support Engineer para founders e times pequenos de SaaS.**

Ele assume o caminho entre a primeira mensagem do cliente e a resolução do problema: responde dúvidas, identifica problemas de configuração, reconhece possíveis bugs, reúne contexto, investiga o software, propõe ou aplica correções permitidas, valida o resultado e chama o founder apenas quando sua participação é realmente necessária.

O Mend não vende “um chatbot com RAG” nem “um coding agent dentro do suporte”. Ele vende uma coisa mais valiosa:

> **Menos interrupções para o founder e mais tempo construindo o produto.**

### Posicionamento canônico

> **Mend handles support end-to-end for early-stage SaaS teams — from the first customer message to the verified fix — and only brings the founder in when it needs them.**

### Frase curta

> **An AI Support Engineer for early-stage SaaS.**

### Promessa da marca

> **Keep shipping. Mend the support loop.**

---

## 2. Cliente inicial

### ICP primário

Founders técnicos, CTOs e times muito pequenos de SaaS que:

- possuem de 1 a aproximadamente 10 desenvolvedores;
- ainda recebem suporte diretamente ou são escalados com frequência;
- não têm uma estrutura madura de Support Engineering, QA, PM e incident response;
- usam WhatsApp ou outro canal direto para falar com clientes;
- já utilizam ferramentas como GitHub, APIs de LLM e coding agents;
- sofrem com multitarefa entre produto, suporte, debugging e operação;
- valorizam velocidade e aceitam automação gradual com políticas de segurança.

### Comprador inicial

O comprador é principalmente o próprio **founder técnico**.

Em empresas um pouco maiores, o comprador pode ser Head of Support, Support Engineering Lead ou CTO, mas esse não é o foco da primeira versão.

### Anti-ICP inicial

Mend não será otimizado agora para:

- empresas grandes com dezenas de engenheiros e equipes especializadas;
- operações enterprise que exigem SSO, procurement, compliance avançado e vários níveis de permissão;
- centrais de atendimento genéricas sem acesso ao produto, código ou engenharia;
- empresas que querem apenas um chatbot de FAQ.

---

## 3. A dor central

A dor não é simplesmente “responder muitas mensagens”.

A dor é o **context switching operacional imposto ao founder**:

```text
Cliente reclama
→ founder para o trabalho
→ lê a conversa
→ tenta entender o contexto
→ pergunta mais informações
→ verifica se é dúvida, configuração ou bug
→ procura no código, logs ou banco
→ copia o contexto para um coding agent
→ acompanha a investigação
→ valida a correção
→ faz deploy
→ volta ao cliente
→ tenta retornar ao trabalho original
```

Em times pequenos, essa interrupção normalmente não tem um dono especializado. O founder vira ao mesmo tempo:

- suporte;
- suporte técnico;
- QA;
- incident manager;
- engenheiro de produção;
- responsável pela comunicação com o cliente.

### Consequências econômicas

- menos tempo dedicado a produto e crescimento;
- desenvolvimento fragmentado por interrupções;
- bugs levando horas ou dias para chegar ao responsável certo;
- informações perdidas entre cliente e engenharia;
- o mesmo problema sendo investigado novamente;
- clientes esperando enquanto o founder reconstrói contexto;
- problemas importantes esquecidos ou tratados informalmente;
- desgaste do fundador e queda na velocidade de entrega.

---

## 4. Job to be Done

> **Quando um cliente reportar uma dúvida ou problema, eu quero que o Mend assuma o caso do início ao fim, para que eu continue construindo meu SaaS e só seja chamado quando existir uma decisão, risco ou ambiguidade que realmente exija minha participação.**

O resultado comprado não é “uso de IA”.

O resultado comprado é:

- menos intervenções do founder;
- resolução mais rápida;
- contexto preservado;
- bugs investigados com evidência;
- correções verificadas;
- aprendizado reaproveitado no próximo caso.

---

## 5. Tese do produto

O mercado já possui:

- helpdesks que organizam conversas;
- agentes que respondem dúvidas;
- observability tools que detectam erros;
- coding agents que modificam código;
- CI/CD que publica software.

O problema de um SaaS pequeno continua existindo porque o founder precisa conectar manualmente todas essas partes.

A tese do Mend é:

> **A vantagem não está em mais um agente isolado. Está em conectar suporte, contexto, investigação, código, deploy, resposta ao cliente e memória em um único loop operacional.**

O moat desejado não é o Inbox nem um modelo específico. É o histórico estruturado e auditável de:

```text
Mensagem do cliente
→ contexto recuperado
→ decisão de suporte
→ issue
→ evidência
→ investigação
→ root cause
→ correção
→ validação
→ release
→ resultado
→ aprendizado
```

Quanto mais o Mend opera um produto, mais contexto e memória ele acumula para resolver o próximo caso.

---

## 6. Produto V1

A V1 comercial deve provar uma única promessa:

> **Mend consegue assumir uma parte material do suporte e da manutenção corretiva de um SaaS pequeno sem exigir participação constante do founder.**

### Escopo obrigatório

#### 6.1 WhatsApp-first support

- Inbox próprio funcional;
- histórico de conversa;
- identificação do cliente e workspace;
- pausa e handoff para humano;
- domínio interno que não fique preso para sempre ao WhatsApp.

O Inbox faz parte do produto inicial, mas no futuro Mend também deverá funcionar como uma camada de inteligência conectada a outros helpdesks e canais.

#### 6.2 Conhecimento confiável

- artigos Draft e Published;
- apenas Published disponível para IA;
- RAG multi-tenant;
- chunking semântico;
- busca híbrida semântica + lexical;
- fontes e rastreabilidade;
- teste de retrieval;
- capacidade de dizer que não encontrou informação suficiente.

#### 6.3 Identidade e tom da empresa

Mend deve conhecer:

- produto;
- preços;
- políticas;
- procedimentos;
- estilo de comunicação;
- limites do que pode prometer;
- quando deve escalar.

O objetivo não é soar roboticamente igual em toda empresa. O admin deve definir tom, exemplos e regras.

#### 6.4 Suporte autônomo

Mend deve distinguir e tratar:

- dúvida;
- orientação de uso;
- problema de configuração;
- cobrança ou assunto comercial;
- solicitação que exige humano;
- possível bug.

Em casos seguros e bem fundamentados, responde sozinho. Em casos incertos, gera draft ou escala.

#### 6.5 Memória operacional

Issues resolvidas devem gerar memória estruturada contendo:

- sintoma;
- componente afetado;
- assinaturas de erro;
- investigação;
- root cause;
- workaround;
- correção;
- PR e deploy relacionados;
- resultado final.

Essa memória deve ajudar na deduplicação, triagem e investigação futura.

#### 6.6 Loop de engenharia

Para possíveis bugs:

```text
mensagem
→ issue persistida
→ coleta de contexto e evidências
→ deduplicação
→ investigação em ambiente isolado
→ veredito estruturado
→ decisão por política
→ correção permitida
→ validação independente
→ branch e PR
→ merge/deploy permitido
→ verificação
→ resposta ao cliente
→ aprendizado
```

#### 6.7 Autonomia orientada por política

O produto precisa ser tecnicamente capaz de fechar o loop, mas não deve tratar toda mudança da mesma forma.

Exemplos:

- dúvida documentada: resposta automática;
- configuração simples: orientação automática;
- bug isolado de baixo risco: correção e fluxo automatizado conforme política;
- pagamentos, auth, permissões, migrations e mudanças destrutivas: aprovação humana obrigatória ou bloqueio;
- evidência insuficiente: pergunta direcionada e escalonamento.

#### 6.8 BYOK e controle de modelos

Mend não subsidiará uso de modelos na V1.

O cliente conecta suas próprias credenciais para providers suportados. O Mend cobra por software, infraestrutura e orquestração; o consumo de IA é cobrado diretamente pelo provider escolhido.

A configuração deve separar:

- providers de IA para triagem, respostas, embeddings, reranking e consolidação;
- coding agents para investigação e alteração de repositórios.

O modelo não deve permanecer hardcoded no fluxo de produção.

O admin deve poder escolher:

- provider e modelo por tarefa;
- preset de custo/qualidade;
- orçamento e alertas;
- fallback permitido;
- quais agentes podem investigar ou corrigir.

As chaves devem ser criptografadas, server-side e nunca retornadas ao cliente depois de salvas.

#### 6.9 Mend Impact

A V1 deve medir valor desde o primeiro caso. Analytics não é uma feature posterior; é parte do produto e da estratégia comercial.

---

## 7. North Star e métricas

### North Star Metric

> **Founder-Free Resolution Rate**

Percentual de casos elegíveis que chegaram a uma resolução sem intervenção manual do founder.

Também deve existir a visão inversa:

> **Founder Intervention Rate**

A métrica precisa distinguir casos que, por política, sempre exigem aprovação. Caso contrário, o produto será penalizado por agir com segurança.

### Métricas principais

- total de conversas recebidas;
- AI resolution rate;
- founder intervention rate;
- human escalation rate;
- median first response time;
- median time to resolution;
- grounded answer rate;
- bug triage precision;
- duplicate detection rate;
- median time to verdict;
- root cause identification rate;
- validated patch rate;
- Mend PR acceptance rate;
- median customer report to PR;
- verified fix rate;
- human touches per case;
- AI cost per conversation;
- AI cost per investigation;
- AI cost per verified fix;
- safety incidents;
- customer correction/reopen rate.

### Regra de apresentação

Toda estatística pública deve mostrar amostra e período.

Exemplo:

```text
72% founder-free resolution
128 eligible cases · last 30 days
```

Nunca publicar percentuais impressionantes sem contexto.

---

## 8. Modelo de autonomia e lançamento

Mend será dogfooded primeiro no ecossistema Zelo.

A autonomia será liberada em estágios.

### Estágio 1 — Shadow

- Mend analisa tudo;
- produz resposta, classificação, evidências e ação recomendada;
- não executa ações externas sem humano;
- decisões do Mend são comparadas às decisões reais.

### Estágio 2 — Autonomous support

- responde automaticamente perguntas e casos de configuração considerados seguros;
- possíveis bugs continuam com aprovação humana;
- coleta estatísticas de resolução, escalonamento e erros.

### Estágio 3 — Autonomous investigation

- cria issue;
- coleta contexto;
- investiga repositório;
- entrega veredito e root cause;
- gera patch validado;
- humano aprova PR e release.

### Estágio 4 — Policy-based remediation

- mudanças de baixo risco podem chegar a merge/deploy sem intervenção;
- mudanças médias e altas permanecem bloqueadas por aprovação;
- verificação comportamental é obrigatória antes da resposta ao cliente.

### Estágio 5 — Design partners

Somente depois de evidência interna suficiente, Mend entra em 5 a 10 SaaS pequenos como design partners pagos.

---

## 9. Critérios para provar a tese no Zelo

Antes de usar estatísticas como argumento comercial, Mend deve operar um volume minimamente relevante.

### Primeira janela de validação

- pelo menos 100 conversas elegíveis;
- pelo menos 10 possíveis bugs investigados;
- pelo menos 5 mudanças ou PRs propostos, caso o volume real gere essa quantidade;
- zero vazamento entre tenants;
- zero ação destrutiva não autorizada;
- zero cliente informado falsamente de que algo foi corrigido;
- registro completo de custos e intervenções.

### Hipóteses iniciais de sucesso

Esses números são metas de aprendizado, não promessas públicas antecipadas:

- mais de 60% dos casos elegíveis resolvidos sem founder;
- menos de 20% de escalonamentos desnecessários;
- redução material do tempo entre reclamação e diagnóstico;
- maioria dos PRs do Mend considerada útil ou aceitável;
- custo de IA por caso suficientemente baixo para não comprometer o ROI;
- nenhum incidente de segurança ou autonomia grave.

Se os dados mostrarem que o Mend resolve suporte, mas não engenharia, o posicionamento deve refletir isso. Se os dados mostrarem que a maior parte do valor está na investigação e correção, pricing e mensagem devem enfatizar esse resultado.

---

## 10. Modelo de negócio

### Decisão atual

Mend cobra por:

- plataforma;
- orquestração;
- armazenamento e retrieval;
- background jobs;
- control plane;
- políticas e aprovações;
- GitHub/deploy integrations;
- traces, analytics e evals;
- infraestrutura Mend dentro de fair use;
- suporte e onboarding.

O cliente paga separadamente por:

- OpenAI, Anthropic, Google ou outro provider;
- WhatsApp provider;
- GitHub;
- deploy provider;
- observability e serviços externos conectados.

### Princípios de pricing

- BYOK obrigatório na primeira versão;
- nenhum markup sobre tokens;
- não cobrar apenas por seat;
- não usar token como unidade comercial visível;
- começar com assinatura simples;
- medir conversas, investigações, compute e verified fixes internamente;
- criar overage de infraestrutura Mend apenas quando o custo real justificar;
- pricing final deve nascer do valor comprovado e do padrão de uso, não de uma tabela inventada antes do dogfood.

### Hipótese de design partner

Faixa para teste, não preço definitivo:

- **Brasil:** R$497–797/mês;
- **Global:** US$149–199/mês;
- BYOK;
- onboarding próximo ao founder;
- desconto permanente em relação ao futuro list price enquanto permanecer cliente;
- quantidade limitada de design partners.

A oferta deve ser paga. Beta gratuito prolongado não valida disposição de compra.

---

## 11. Go-to-market inicial

### Estratégia

Founder-led sales para contatos próximos e founders de SaaS pequenos.

### Narrativa

Não vender infraestrutura ou número de agentes.

Vender:

> **“Mend removes support and corrective maintenance from the founder’s daily workload.”**

### Prova

O case study inicial será o próprio ecossistema Zelo.

Exemplo futuro de prova:

```text
Last 30 days on Zelo

• 74% founder-free resolution
• 3 min median first response
• 18 min median bug verdict
• 7 validated fixes
• 71% Mend PR acceptance
• US$3.90 average AI cost per accepted fix
```

Os números acima são apenas um formato ilustrativo. A LP só usará resultados reais.

### CTA inicial

Até haver prova forte:

> **Join the Design Partner Program**

Depois da validação:

> **Connect WhatsApp**

---

## 12. Mensagem da landing page

### Hero

> **Keep shipping. Mend the support loop.**

### Subheadline recomendada

> **Your customers need support. You need to keep building. Mend handles the loop — from the first message to the verified fix — and only brings you in when it needs you.**

### Valor em uma linha

> **Support, investigation and corrective engineering for early-stage SaaS teams.**

### Três resultados a comunicar

1. **Handle support without becoming support.**  
   Mend learns your product, answers customers and escalates only when needed.

2. **Turn complaints into engineering context.**  
   Conversations become traceable issues, evidence and root-cause investigations.

3. **Carry fixes to a verified outcome.**  
   Mend can generate, validate and release permitted corrections, then return to the customer.

---

## 13. O que não construiremos agora

Para proteger foco, a primeira fase não prioriza:

- substituição completa de Intercom ou Zendesk;
- omnichannel amplo;
- enterprise SSO e compliance complexo;
- marketplace de integrações;
- dezenas de roles e permissões;
- billing de tokens pelo Mend;
- modelos próprios;
- autonomia irrestrita;
- desenvolvimento autônomo de features;
- decisões de produto por IA;
- multi-agent orchestration sem necessidade clara;
- dashboards sofisticados sem métricas confiáveis;
- refatoração total da infraestrutura já existente.

---

## 14. Princípios de produto

1. **Founder time is the unit of value.**  
   Toda feature deve reduzir intervenção, tempo ou carga mental do founder.

2. **End-to-end beats impressive fragments.**  
   Uma resposta brilhante sem resolver o problema vale menos que um loop completo e confiável.

3. **Evidence before autonomy.**  
   Mend conquista mais autonomia ao demonstrar precisão e segurança.

4. **The model is replaceable; the workflow is the product.**  
   Providers e modelos mudam. Contexto, memória, políticas e orquestração permanecem.

5. **BYOK keeps incentives aligned.**  
   O cliente controla qualidade, custo e provider; Mend não lucra aumentando consumo de tokens.

6. **Every resolved case must improve the next one.**  
   Uma resolução que não gera memória é uma oportunidade perdida.

7. **Never claim “fixed” before verification.**

8. **Human escalation is a valid outcome.**  
   O objetivo não é evitar humanos a qualquer custo; é usar humanos somente quando agregam decisão real.

9. **Build for the small team first.**  
   Enterprise complexity não deve contaminar a experiência inicial.

10. **Measure before marketing.**  
    Mend será vendido com resultados observados, não com promessas vagas sobre IA.

---

## 15. Decisões fechadas

- Mend é um **AI Support Engineer**, não apenas helpdesk ou coding agent.
- O ICP inicial é founder técnico de SaaS com time pequeno.
- A dor central é suporte e manutenção corretiva interrompendo o trabalho de produto.
- A promessa é assumir o loop da mensagem ao resultado verificado.
- WhatsApp é o primeiro canal.
- Inbox próprio permanece, mas não será uma prisão arquitetural.
- BYOK será o modelo inicial.
- Mend não subsidiará tokens.
- O sistema deve ser multi-provider e configurável por tarefa.
- A autonomia será liberada por política e prova.
- Zelo será o primeiro ambiente real de validação.
- Founder-Free Resolution Rate será a North Star.
- Analytics e custos entram desde a primeira versão.
- Pricing definitivo será definido depois do dogfood e dos primeiros design partners.

---

## 16. Próximo documento

A partir desta estratégia, o próximo artefato deve ser:

> **Mend V1 Product Requirements Document**

Ele deverá transformar esta direção em:

- jornadas do usuário;
- funcionalidades obrigatórias;
- estados e permissões;
- escopo de cada tela;
- eventos e métricas;
- modelo BYOK;
- plano de dogfood;
- critérios de aceitação;
- itens explicitamente fora do escopo;
- handoff de engenharia por fases.

Nenhuma nova fase grande de desenvolvimento deve começar antes de esse PRD estar aprovado.
