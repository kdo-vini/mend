/* eslint-disable no-undef */
/**
 * Seeds customer-facing Zelo support knowledge + Techne automation policy.
 * Run: node scripts/seed-zelopdv-support-knowledge.mjs
 */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

function loadEnv() {
  const raw = readFileSync(resolve(process.cwd(), ".env"), "utf8");
  return Object.fromEntries(
    raw
      .split(/\r?\n/)
      .filter((line) => line && !line.startsWith("#") && line.includes("="))
      .map((line) => {
        const i = line.indexOf("=");
        return [line.slice(0, i), line.slice(i + 1)];
      }),
  );
}

const env = loadEnv();
const url = env.SUPABASE_URL;
const key = env.SUPABASE_SERVICE_ROLE_KEY;
const openaiKey = env.OPENAI_API_KEY;
const workspaceId = "0de88c1f-bb26-4fbc-bc65-f01a434eadda";
const embeddingModel = "text-embedding-3-small";

const products = {
  zelopdv: "eb09e246-acc5-4e0d-ac64-99aca18f1d8a",
  zelochat: "8398f3b9-32fc-4ac5-b038-0dd014b0acba",
  zelomenu: "42524f3f-8099-4d07-babc-25d1b42a53fe",
};

const headers = {
  apikey: key,
  Authorization: `Bearer ${key}`,
  Accept: "application/json",
  "Content-Type": "application/json",
  Prefer: "return=representation",
  "User-Agent": "mend-seed-knowledge/1.0",
};

async function rest(path, init = {}) {
  const response = await fetch(`${url}/rest/v1/${path}`, {
    ...init,
    headers: { ...headers, ...(init.headers || {}) },
  });
  const text = await response.text();
  if (!response.ok)
    throw new Error(`${path} ${response.status} ${text.slice(0, 500)}`);
  return text ? JSON.parse(text) : null;
}

function digest(value) {
  return createHash("sha256").update(value).digest("hex");
}

function splitBounded(value, maximum) {
  const pieces = [];
  let remaining = value.trim();
  while (remaining.length > maximum) {
    const candidate = remaining.slice(0, maximum + 1);
    const boundary = Math.max(
      candidate.lastIndexOf(". "),
      candidate.lastIndexOf("; "),
      candidate.lastIndexOf(" "),
    );
    const length =
      boundary >= Math.floor(maximum * 0.55) ? boundary + 1 : maximum;
    pieces.push(remaining.slice(0, length).trim());
    remaining = remaining.slice(length).trim();
  }
  if (remaining) pieces.push(remaining);
  return pieces;
}

function chunkArticle(article) {
  const maximum = 1200;
  const version = digest(
    `${article.id}\n${article.title}\n${article.body}\n${article.updated_at}`,
  );
  let heading = article.title.trim();
  const sections = [];
  let pending;
  const flush = () => {
    if (pending) sections.push(pending);
    pending = undefined;
  };
  for (const block of article.body.split(/\n\s*\n/g)) {
    const normalized = block.trim();
    if (!normalized) continue;
    const markdownHeading = /^#{1,6}\s+(.+)$/.exec(normalized);
    if (markdownHeading?.[1]) {
      flush();
      heading = markdownHeading[1].trim();
      continue;
    }
    for (const content of splitBounded(normalized, maximum)) {
      const combined = pending ? `${pending.content}\n\n${content}` : content;
      if (pending?.heading === heading && combined.length <= maximum)
        pending.content = combined;
      else {
        flush();
        pending = { heading, content };
      }
    }
  }
  flush();
  return sections.map((section, index) => ({
    workspace_id: workspaceId,
    article_id: article.id,
    article_version: version,
    chunk_index: index,
    heading: section.heading,
    content: section.content,
    content_hash: digest(
      `${version}:${index}:${section.heading}:${section.content}`,
    ),
  }));
}

async function embedMany(texts) {
  const response = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${openaiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ model: embeddingModel, input: texts }),
  });
  const payload = await response.json();
  if (!response.ok)
    throw new Error(
      `openai embeddings ${response.status} ${JSON.stringify(payload).slice(0, 300)}`,
    );
  return payload.data
    .sort((a, b) => a.index - b.index)
    .map((item) => item.embedding);
}

const articles = [
  {
    title: "Como cadastrar produtos no ZeloPDV",
    category: "Como fazer",
    productKeys: ["zelopdv"],
    body: `## Objetivo
Ensinar o cliente a cadastrar produtos, categorias e preços no ZeloPDV.

## Passo a passo
1. Acesse o ZeloPDV pelo navegador e entre na conta da loja.
2. Abra o menu de **Produtos** (ou Cadastro de produtos).
3. Crie ou escolha uma **categoria** (ex.: Lanches, Bebidas, Pizzas).
4. Clique em **Novo produto**.
5. Preencha nome, preço de venda e, se usar estoque, a quantidade inicial.
6. Salve o produto e confirme que ele aparece na lista e no caixa.

## Dicas
- Use nomes curtos e claros para facilitar a busca no caixa.
- Se o produto não aparecer no caixa, confira se está ativo e na categoria correta.
- Fotos de produtos para o cliente final ficam no **ZeloMenu** (cardápio digital), não no ZeloPDV.

## Quando encaminhar para humano
Se o cadastro falhar com erro técnico, se produtos somem sozinhos ou se houver dúvida de permissão de usuário, chame atendimento humano.`,
  },
  {
    title: "Como abrir, vender e fechar o caixa no ZeloPDV",
    category: "Como fazer",
    productKeys: ["zelopdv"],
    body: `## Objetivo
Orientar o uso diário do caixa: abertura, venda e fechamento.

## Abrir o caixa
1. Entre no ZeloPDV.
2. Abra o módulo de **Caixa**.
3. Informe o valor de abertura (troco inicial), se solicitado.
4. Confirme a abertura do turno.

## Registrar uma venda
1. No caixa, busque o produto pelo nome.
2. Ajuste quantidade e observações se necessário.
3. Escolha a forma de pagamento: dinheiro, Pix, crédito ou débito.
4. Finalize a venda e confira o comprovante/resumo.

## Fechar o caixa
1. Ao final do turno, abra **Fechamento de caixa**.
2. Confira o resumo de vendas e formas de pagamento.
3. Informe o valor contado na gaveta, se o sistema pedir.
4. Confirme o fechamento.

## Problemas comuns
- Não consigo vender: verifique se o caixa está aberto e se o produto está ativo.
- Valor não bate: revise cancelamentos, fiado e vendas do período antes de chamar suporte.

## Quando encaminhar para humano
Erro ao abrir/fechar caixa, vendas duplicadas, divergência que impede o fechamento do dia.`,
  },
  {
    title: "Como usar mesas e comandas no ZeloPDV",
    category: "Como fazer",
    productKeys: ["zelopdv"],
    body: `## Objetivo
Explicar o add-on de Mesas: abrir comanda, lançar itens e fechar a mesa.

## Pré-requisito
O módulo de Mesas é um add-on. Sem ele ativo, o sistema mostra upsell/assinatura para Mesas.

## Fluxo básico
1. Acesse o mapa de mesas.
2. Toque em uma mesa livre para abrir a comanda.
3. Adicione itens da comanda conforme o pedido.
4. Quando o cliente for pagar, escolha a forma de pagamento e feche a mesa.
5. O sistema gera a venda e libera a mesa.

## Recursos úteis
- Pagamento parcial (por valor ou por itens).
- Pré-conta e recibo final para impressão.
- Divisão de conta quando disponível na tela de fechamento.

## Quando encaminhar para humano
Mesa travada, comanda que não fecha, add-on ativo mas módulo inacessível, ou erro ao converter comanda em venda.`,
  },
  {
    title: "Como controlar estoque e fiado no ZeloPDV",
    category: "Como fazer",
    productKeys: ["zelopdv"],
    body: `## Estoque
1. Cadastre o produto com controle de estoque habilitado.
2. Informe a quantidade inicial.
3. Nas vendas, o estoque baixa automaticamente quando aplicável.
4. Ajuste manualmente só quando houver inventário/contagem.

## Fiado
1. Cadastre o cliente na ficha de clientes.
2. Ao vender, escolha a opção de fiado/a prazo quando disponível.
3. Acompanhe o saldo que cada cliente deve na ficha do cliente.
4. Registre pagamentos parciais ou quitação do fiado na própria ficha.

## O que não prometer
Não diga que o ZeloPDV substitui contador ou emite NFC-e automaticamente, a menos que isso esteja confirmado para a conta do cliente.

## Quando encaminhar para humano
Saldo de fiado inconsistente, estoque negativo sem explicação, ou perda de histórico de clientes.`,
  },
  {
    title: "Controle de acessos e funcionários no ZeloPDV",
    category: "Como fazer",
    productKeys: ["zelopdv"],
    body: `## O que existe hoje
O add-on **Controle de Acessos** permite convidar subusuários por e-mail, definir cargos e permissões, e auditar ações importantes. O dono (owner) continua sendo a âncora da empresa; billing e assinatura ficam com o owner.

## Como orientar
1. Confirme se o add-on de Acessos está ativo na assinatura.
2. Oriente o dono a convidar o funcionário pelo e-mail.
3. Escolha um cargo/perfil com as permissões adequadas (caixa, gestão, relatórios etc.).
4. Peça para o funcionário ativar o convite pelo link recebido.

## Limites importantes
- Há limite padrão de subusuários (em geral até 5).
- Sem o add-on, não prometa login individual completo por funcionário.
- Não peça senha do cliente nem códigos de autenticação no WhatsApp.

## Quando encaminhar para humano
Convite que não chega, permissão que não aplica, usuário sem acesso após ativação, ou pedido de alteração sensível de conta.`,
  },
  {
    title: "Como editar o cardápio digital no ZeloMenu",
    category: "Como fazer",
    productKeys: ["zelomenu"],
    body: `## Objetivo
Ajudar o cliente a atualizar categorias, produtos e disponibilidade no cardápio digital.

## Passo a passo
1. Acesse o painel do ZeloMenu / gestão do cardápio.
2. Abra **Categorias** e organize a ordem (ex.: Destaques, Lanches, Bebidas).
3. Em **Produtos**, edite nome, descrição, preço e disponibilidade.
4. Marque itens como indisponíveis quando acabarem, em vez de apagar.
5. Salve e abra o link do cardápio no celular para conferir.

## Dicas
- Fotos e apresentação visual do cardápio ficam no ZeloMenu.
- O caixa/gestão interna continua no ZeloPDV.
- Se o cliente pergunta só de cardápio, responda no contexto ZeloMenu; se pergunta de caixa/estoque, use ZeloPDV.

## Quando encaminhar para humano
Link do cardápio fora do ar, publicação que não atualiza, ou erro ao salvar produtos/categorias.`,
  },
  {
    title: "Como compartilhar o link do cardápio ZeloMenu",
    category: "Como fazer",
    productKeys: ["zelomenu"],
    body: `## Objetivo
Ensinar a encontrar e compartilhar o link do cardápio digital com clientes.

## Passo a passo
1. Entre no painel do ZeloMenu.
2. Localize o **link do cardápio** da loja.
3. Copie o link e envie no WhatsApp, Instagram ou imprima em QR Code na mesa.
4. Peça para um cliente de teste abrir o link e fazer um pedido de verificação.

## Problemas comuns
- Link antigo: confirme se está usando o link atual da loja correta.
- Cardápio desatualizado: publique/salve as alterações e recarregue sem cache.

## Quando encaminhar para humano
Link quebrado, loja errada no link, ou QR Code apontando para estabelecimento antigo.`,
  },
  {
    title: "Como conectar o WhatsApp no ZeloChat",
    category: "Como fazer",
    productKeys: ["zelochat"],
    body: `## Objetivo
Reconectar ou conectar o WhatsApp usado no atendimento.

## Passo a passo
1. Abra o ZeloChat no navegador.
2. Vá em **Configurações > WhatsApp**.
3. Clique em **Gerar QR Code**.
4. No celular, abra WhatsApp > Aparelhos conectados > Conectar um aparelho.
5. Escaneie o QR Code e aguarde o status conectado.

## Se desconectar com frequência
- Evite desconectar o aparelho manualmente no WhatsApp.
- Mantenha o celular com internet estável.
- Não use o mesmo número em múltiplas ferramentas conflitantes sem orientação.

## Quando encaminhar para humano
QR que não valida, número errado conectado, ou desconexões repetidas após vários scans.`,
  },
  {
    title: "Como ligar, desligar e testar a IA no ZeloChat",
    category: "Como fazer",
    productKeys: ["zelochat"],
    body: `## Objetivo
Ajustar o modo da IA e testar respostas com segurança.

## Passo a passo
1. Abra **Cérebro IA** / configurações de IA no ZeloChat.
2. Escolha o modo: sempre ligada, desligada ou agendada por horário.
3. Revise as instruções do negócio em linguagem natural.
4. Use o **Simulador** para testar uma mensagem sem enviar ao cliente.
5. Só publique/salve depois de validar a resposta.

## Sinais de problema
- IA não responde: confira se está ligada, se o WhatsApp está conectado e se a assinatura está ativa.
- IA responde errado: ajuste as instruções e teste no simulador antes de voltar ao ar.

## Quando encaminhar para humano
Assinatura ativa mas IA permanentemente muda, simulador inconsistente com produção, ou pedido para alterar cobrança da IA.`,
  },
  {
    title: "Planos, preços e assinatura Zelo",
    category: "Faturamento",
    productKeys: ["zelopdv", "zelochat", "zelomenu"],
    body: `## Preços de referência (mensal)
- ZeloPDV: R$ 59/mês
- ZeloChat: R$ 149/mês
- Pacote Gestão + Atendimento (PDV + Chat): R$ 198/mês
- Add-on Mesas: R$ 30/mês
- Add-on Acessos: R$ 30/mês
- ZeloMenu: R$ 40/mês
- Trial do ZeloPDV: 14 dias, sem cartão. ZeloChat não tem trial gratuito.

## Onde o cliente gerencia pagamento
Orientar: **Configurações > Assinatura** no painel, usando o portal seguro (Stripe ou AbacatePay/Pix conforme a conta).

## Regra de atendimento
A IA pode informar preços públicos e onde fica a assinatura. Para **pagamento de mensalidade, renovação, falha de cobrança, troca de cartão, cancelamento, desconto ou estorno**, encaminhe imediatamente para atendimento humano. Não peça dados de cartão no WhatsApp.`,
  },
  {
    title: "Quando a IA resolve e quando chama humano",
    category: "Política de atendimento",
    productKeys: ["zelopdv", "zelochat", "zelomenu"],
    body: `## A IA resolve sozinha (maioria dos casos)
- Saudação, agradecimento e despedida
- Como fazer no ZeloPDV, ZeloChat e ZeloMenu
- Dúvidas de status operacional com base publicada
- Orientação de configuração comum (produtos, caixa, cardápio, WhatsApp, IA)
- Pedidos de recurso de baixo risco (registrar interesse e explicar o que já existe)

## A IA inicia, mas pode precisar de humano depois
- Relato de bug: a IA faz triagem, pede detalhes, abre contexto e só escala se não resolver
- Situação ambígua de produto: a IA pergunta se é PDV, Chat ou Menu antes de inventar

## Humano assume imediatamente
- Pagamento de mensalidade, renovação, cobrança, cancelamento e desconto
- Incidente grave (loja parada, indisponibilidade ampla)
- Acesso à conta, exclusão de dados, reclamação intensa
- Bug que bloqueia venda e não tem workaround seguro na base

## Tom
Português brasileiro, curto, humano, sem inventar recurso. Se não souber, diga que vai confirmar com a equipe.`,
  },
];

const aliases = {
  [products.zelopdv]: [
    "pdv",
    "caixa",
    "fiado",
    "estoque",
    "mesa",
    "mesas",
    "comanda",
    "comandas",
    "produtos",
    "venda",
    "vendas",
    "despesas",
  ],
  [products.zelochat]: [
    "chat",
    "WhatsApp",
    "bot",
    "atendimento",
    "IA",
    "impressora",
    "Cérebro IA",
  ],
  [products.zelomenu]: [
    "menu",
    "cardápio",
    "cardapio",
    "cardápio digital",
    "link do cardápio",
    "categorias",
  ],
};

const nextPolicy = {
  draft_enabled: true,
  notify_on_bug: true,
  allowed_actions: [
    "respond",
    "triage",
    "create_issue",
    "investigate",
    "propose_fix",
    "implement_fix",
  ],
  allowed_channels: ["whatsapp", "web"],
  automation_routes: {
    bug: "bug_triage",
    other: "safe_auto_reply",
    how_to: "knowledge_auto_reply",
    social: "safe_auto_reply",
    status: "knowledge_auto_reply",
    billing: "human_escalation",
    feature: "safe_auto_reply",
    incident: "human_escalation",
    question: "knowledge_auto_reply",
  },
  coding_routing_v2: false,
  safe_auto_enabled: true,
  safe_auto_intents: [
    "question",
    "how_to",
    "status",
    "social",
    "feature",
    "other",
  ],
  mcp_failure_policy: "review",
  allowed_integrations: ["agent", "google_calendar", "knowledge", "mcp"],
  bug_auto_fix_enabled: true,
  bug_auto_reply_enabled: true,
  human_approval_actions: ["implement_fix", "publish", "deploy", "delete"],
  safe_auto_send_enabled: true,
  bug_auto_deploy_enabled: false,
  coding_subscription_auth: false,
  safe_auto_min_confidence: 0.7,
  automation_fallback_route: "safe_auto_reply",
  notify_on_human_escalation: true,
  require_published_knowledge: true,
};

async function upsertArticle(definition) {
  const existing = await rest(
    `knowledge_articles?workspace_id=eq.${workspaceId}&title=eq.${encodeURIComponent(definition.title)}&managed_by_sync=eq.false&select=*`,
  );
  const payload = {
    workspace_id: workspaceId,
    title: definition.title,
    category: definition.category,
    body: definition.body,
    status: "published",
    managed_by_sync: false,
    audience: "customer",
    trust_level: "reviewed",
    updated_at: new Date().toISOString(),
  };
  let article;
  if (existing?.[0]) {
    article = (
      await rest(`knowledge_articles?id=eq.${existing[0].id}`, {
        method: "PATCH",
        body: JSON.stringify(payload),
      })
    )[0];
    console.log("updated", article.title);
  } else {
    article = (
      await rest("knowledge_articles", {
        method: "POST",
        body: JSON.stringify(payload),
      })
    )[0];
    console.log("created", article.title);
  }

  await rest(
    `knowledge_article_products?workspace_id=eq.${workspaceId}&article_id=eq.${article.id}`,
    { method: "DELETE" },
  );
  const productIds = definition.productKeys.map((key) => products[key]);
  await rest("knowledge_article_products", {
    method: "POST",
    body: JSON.stringify(
      productIds.map((productId) => ({
        workspace_id: workspaceId,
        article_id: article.id,
        product_id: productId,
      })),
    ),
  });

  await rest(
    `knowledge_chunks?workspace_id=eq.${workspaceId}&article_id=eq.${article.id}`,
    { method: "DELETE" },
  );
  const chunks = chunkArticle(article);
  if (!chunks.length) return article;
  const vectors = await embedMany(chunks.map((chunk) => chunk.content));
  await rest("knowledge_chunks", {
    method: "POST",
    body: JSON.stringify(
      chunks.map((chunk, index) => ({
        ...chunk,
        embedding: vectors[index],
        embedding_model: embeddingModel,
      })),
    ),
  });
  console.log(`  chunks=${chunks.length}`);
  return article;
}

async function enrichZeloMenuPlaybook() {
  const body = `O QUE É O ZELOMENU
O ZeloMenu é o cardápio digital do ecossistema Zelo para restaurantes, lanchonetes, bares e pizzarias. Ele organiza categorias e produtos, facilita pedidos pelo link/QR Code e complementa o ZeloPDV (caixa e gestão interna).

RECURSOS QUE PODEM SER CITADOS
- Categorias e produtos do cardápio digital
- Disponibilidade de itens (marcar como esgotado)
- Link do cardápio para compartilhar com clientes
- Pedidos vindos do cardápio digital quando a loja usa o fluxo conectado ao ecossistema Zelo

O QUE NÃO DIZER
Não diga que o ZeloMenu substitui o caixa. Caixa, estoque, fiado e despesas são ZeloPDV. Não prometa integração automática com iFood/Rappi sem confirmação do plano do cliente.

QUANDO ALGUÉM PERGUNTA DO CARDÁPIO
1. Confirme se a dúvida é sobre o link/cardápio digital (ZeloMenu) ou sobre cadastro interno no PDV.
2. Oriente edição de categorias/produtos e teste do link no celular.
3. Se pedir preço, renovação ou falha de cobrança, encaminhe para humano.

RESPOSTA CURTA MODELO
"No ZeloMenu você edita o cardápio digital e compartilha o link com o cliente. Se a dúvida for de caixa, estoque ou fiado, isso fica no ZeloPDV."`;

  await upsertArticle({
    title: "Playbook ZeloMenu",
    category: "Playbooks",
    productKeys: ["zelomenu"],
    body,
  });
}

async function main() {
  if (!url || !key || !openaiKey) {
    throw new Error(
      "Missing SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY or OPENAI_API_KEY",
    );
  }

  for (const article of articles) await upsertArticle(article);
  await enrichZeloMenuPlaybook();

  for (const [productId, list] of Object.entries(aliases)) {
    await rest(`support_products?id=eq.${productId}`, {
      method: "PATCH",
      body: JSON.stringify({
        aliases: list,
        updated_at: new Date().toISOString(),
      }),
    });
    console.log("aliases updated", productId);
  }

  await rest(`workspaces?id=eq.${workspaceId}`, {
    method: "PATCH",
    body: JSON.stringify({
      ai_policy_json: nextPolicy,
      updated_at: new Date().toISOString(),
    }),
  });
  console.log(
    "automation policy updated (billing/incident -> human, rest -> AI)",
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
