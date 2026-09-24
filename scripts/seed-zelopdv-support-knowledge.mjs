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
    body: `No ZeloPDV você cadastra produtos assim:
1. Entre na conta da loja.
2. Abra *Produtos* (ou Cadastro de produtos).
3. Crie ou escolha uma *categoria* (ex.: Lanches, Bebidas).
4. Toque em *Novo produto*.
5. Preencha nome, preço e, se usar estoque, a quantidade.
6. Salve e confira se aparece na lista e no caixa.

Dica: nomes curtos facilitam a busca no caixa. Se o produto não aparecer, confira se está ativo e na categoria certa. Fotos para o cliente final ficam no *ZeloMenu*, não no ZeloPDV.

Resposta curta modelo:
"No ZeloPDV: Produtos → Nova categoria (se precisar) → Novo produto → nome e preço → salvar. Quer que eu te guie no cadastro agora?"`,
  },
  {
    title: "Como abrir, vender e fechar o caixa no ZeloPDV",
    category: "Como fazer",
    productKeys: ["zelopdv"],
    body: `Abrir o caixa:
1. Entre no ZeloPDV e abra *Caixa*.
2. Informe o valor de abertura (troco), se pedir.
3. Confirme a abertura do turno.

Registrar uma venda:
1. Busque o produto pelo nome.
2. Ajuste quantidade/observações se precisar.
3. Escolha o pagamento: dinheiro, Pix, crédito ou débito.
4. Finalize e confira o comprovante.

Fechar o caixa:
1. Abra *Fechamento de caixa*.
2. Confira vendas e formas de pagamento.
3. Informe o valor contado, se pedir.
4. Confirme o fechamento.

Se não conseguir vender, confira se o caixa está aberto e se o produto está ativo.

Resposta curta modelo:
"No caixa do ZeloPDV: abra o turno, lance a venda, escolha o pagamento e finalize. No fim do dia use o fechamento de caixa. Em qual etapa você está?"`,
  },
  {
    title: "Como usar mesas e comandas no ZeloPDV",
    category: "Como fazer",
    productKeys: ["zelopdv"],
    body: `O módulo de *Mesas* no ZeloPDV é um *add-on*. Se não estiver ativo, o sistema mostra a opção de assinar.

Para usar mesas e comandas:
1. Abra o mapa de mesas.
2. Toque em uma mesa livre para abrir a comanda.
3. Adicione os itens do pedido.
4. No pagamento, escolha a forma e feche a mesa.
5. O sistema gera a venda e libera a mesa.

Também pode ter pagamento parcial, pré-conta e divisão de conta na tela de fechamento (quando disponível).

Resposta curta modelo:
"No ZeloPDV, Mesas é um add-on. Abra o mapa, toque numa mesa livre, lance os itens e feche no pagamento. Quer o passo a passo no app?"`,
  },
  {
    title: "Como acessar pedidos no ZeloMenu e no ZeloPDV",
    category: "Como fazer",
    productKeys: ["zelopdv", "zelomenu"],
    body: `Pedidos do cardápio digital ficam no *ZeloMenu*. Caixa e vendas internas ficam no *ZeloPDV*.

Para ver pedidos do cardápio (ZeloMenu):
1. Abra o painel do ZeloMenu.
2. Entre em *Pedidos* (ou a lista de pedidos da loja).
3. Abra o pedido para ver itens, status e dados do cliente.

Para vendas no caixa (ZeloPDV):
1. Abra o *Caixa* ou o histórico de vendas.
2. Busque pelo horário, valor ou produto.
3. Abra a venda para conferir o comprovante.

Se a dúvida for só "acessar pedidos", confirme se é pedido do cardápio digital ou venda do caixa.

Resposta curta modelo:
"Pedidos do cardápio ficam no ZeloMenu em Pedidos. Vendas do caixa ficam no ZeloPDV. Você quer ver pedidos do link/cardápio ou vendas do caixa?"`,
  },
  {
    title: "Como controlar estoque e fiado no ZeloPDV",
    category: "Como fazer",
    productKeys: ["zelopdv"],
    body: `Estoque no ZeloPDV:
1. Cadastre o produto com estoque habilitado.
2. Informe a quantidade inicial.
3. Nas vendas o estoque baixa automaticamente quando aplicável.
4. Ajuste manual só em inventário/contagem.

Fiado:
1. Cadastre o cliente.
2. Na venda, escolha fiado/a prazo quando disponível.
3. Acompanhe o saldo na ficha do cliente.
4. Registre pagamentos parciais ou quitação na ficha.

Não diga que o ZeloPDV substitui contador ou emite NFC-e automaticamente, a menos que isso esteja confirmado na conta.

Resposta curta modelo:
"No ZeloPDV o estoque baixa nas vendas quando o produto está com controle ativo; o fiado fica na ficha do cliente. Você quer ajuda com estoque ou com fiado?"`,
  },
  {
    title: "Controle de acessos e funcionários no ZeloPDV",
    category: "Como fazer",
    productKeys: ["zelopdv"],
    body: `O add-on *Controle de Acessos* permite convidar subusuários por e-mail, definir cargos/permissões e auditar ações. O dono (owner) continua responsável pela empresa; billing fica com o owner.

Como orientar:
1. Confirme se o add-on de Acessos está ativo.
2. O dono convida o funcionário pelo e-mail.
3. Escolhe o cargo/perfil (caixa, gestão, relatórios etc.).
4. O funcionário ativa o convite pelo link.

Limites: em geral até 5 subusuários. Sem o add-on, não prometa login individual completo. Nunca peça senha ou códigos de autenticação no WhatsApp.

Resposta curta modelo:
"Com o add-on de Acessos, o dono convida o funcionário por e-mail e define o cargo. O convite chega no e-mail para ativar. Seu add-on de Acessos já está ativo?"`,
  },
  {
    title: "Como editar o cardápio digital no ZeloMenu",
    category: "Como fazer",
    productKeys: ["zelomenu"],
    body: `No ZeloMenu você edita o cardápio digital assim:
1. Abra o painel do ZeloMenu.
2. Em *Categorias*, organize a ordem (Destaques, Lanches, Bebidas…).
3. Em *Produtos*, edite nome, descrição, preço e disponibilidade.
4. Marque itens esgotados como indisponíveis em vez de apagar.
5. Salve e abra o link no celular para conferir.

Fotos e apresentação ficam no ZeloMenu. Caixa, estoque e fiado ficam no ZeloPDV.

Resposta curta modelo:
"No ZeloMenu: Categorias e Produtos → edite preço/disponibilidade → salve e teste o link no celular. Sua dúvida é do cardápio digital ou do caixa no PDV?"`,
  },
  {
    title: "Como compartilhar o link do cardápio ZeloMenu",
    category: "Como fazer",
    productKeys: ["zelomenu"],
    body: `Para compartilhar o cardápio:
1. Entre no painel do ZeloMenu.
2. Copie o *link do cardápio* da loja.
3. Envie no WhatsApp/Instagram ou use QR Code na mesa.
4. Peça a um cliente de teste abrir o link.

Se o cardápio parecer antigo, use o link atual da loja correta, salve as alterações e recarregue sem cache.

Resposta curta modelo:
"No ZeloMenu copie o link do cardápio da loja e envie no WhatsApp ou no QR Code. Quer que eu te diga onde achar o link no painel?"`,
  },
  {
    title: "Como conectar o WhatsApp no ZeloChat",
    category: "Como fazer",
    productKeys: ["zelochat"],
    body: `Para conectar o WhatsApp no ZeloChat:
1. Abra o ZeloChat no navegador.
2. Vá em *Configurações > WhatsApp*.
3. Clique em *Gerar QR Code*.
4. No celular: WhatsApp > Aparelhos conectados > Conectar um aparelho.
5. Escaneie e aguarde o status conectado.

Dicas: evite desconectar o aparelho manualmente; mantenha internet estável; não use o mesmo número em várias ferramentas conflitantes sem orientação.

Resposta curta modelo:
"No ZeloChat: Configurações > WhatsApp > Gerar QR Code e escaneie em Aparelhos conectados. O WhatsApp está desconectado agora?"`,
  },
  {
    title: "Como ligar, desligar e testar a IA no ZeloChat",
    category: "Como fazer",
    productKeys: ["zelochat"],
    body: `Para ajustar a IA no ZeloChat:
1. Abra *Cérebro IA* / configurações de IA.
2. Escolha o modo: sempre ligada, desligada ou agendada.
3. Revise as instruções do negócio.
4. Teste no *Simulador* antes de enviar ao cliente.
5. Salve só depois de validar.

Se a IA não responde: confira se está ligada, se o WhatsApp está conectado e se a assinatura está ativa. Se responde errado: ajuste as instruções e teste no simulador.

Resposta curta modelo:
"No ZeloChat abra o Cérebro IA, escolha o modo, ajuste as instruções e teste no Simulador antes de publicar. Quer ligar, desligar ou corrigir uma resposta?"`,
  },
  {
    title: "Planos, preços e assinatura Zelo",
    category: "Faturamento",
    productKeys: ["zelopdv", "zelochat", "zelomenu"],
    body: `Preços de referência (mensal):
- ZeloPDV: R$ 59/mês
- ZeloChat: R$ 149/mês
- Pacote Gestão + Atendimento (PDV + Chat): R$ 198/mês
- Add-on Mesas: R$ 30/mês
- Add-on Acessos: R$ 30/mês
- ZeloMenu: R$ 40/mês
- Trial do ZeloPDV: 14 dias, sem cartão. ZeloChat não tem trial gratuito.

O cliente gerencia pagamento em *Configurações > Assinatura* (portal Stripe ou AbacatePay/Pix conforme a conta).

A IA pode informar preços públicos e onde fica a assinatura. Para pagamento de mensalidade, renovação, falha de cobrança, troca de cartão, cancelamento, desconto ou estorno, um humano assume. Nunca peça dados de cartão no WhatsApp.

Resposta curta modelo:
"O ZeloPDV fica R$ 59/mês; Mesas e Acessos são add-ons de R$ 30/mês cada. Assinatura fica em Configurações > Assinatura. Se for cobrança ou renovação, posso te passar para o time humano."`,
  },
  {
    title: "Quando a IA resolve e quando chama humano",
    category: "Política de atendimento",
    productKeys: ["zelopdv", "zelochat", "zelomenu"],
    body: `A IA resolve sozinha: saudação, como fazer no ZeloPDV/ZeloChat/ZeloMenu, status operacional com base publicada, configuração comum e pedidos de recurso de baixo risco.

A IA inicia e pode precisar de humano depois: bug com triagem, ou produto ambíguo (perguntar se é PDV, Chat ou Menu).

Humano assume imediatamente: mensalidade/renovação/cobrança/cancelamento/desconto, incidente grave, acesso à conta, exclusão de dados, reclamação intensa, ou bug que bloqueia venda sem workaround seguro.

Tom: português brasileiro, curto, humano, sem inventar recurso. Se não souber, diga que vai confirmar com a equipe.

Esta política é interna: nunca cole estes critérios na mensagem ao cliente.`,
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

  const oldChunks = await rest(
    `knowledge_chunks?workspace_id=eq.${workspaceId}&article_id=eq.${article.id}&select=id`,
  );
  if (oldChunks?.length) {
    const chunkIds = oldChunks.map((chunk) => chunk.id).join(",");
    // Historical drafts may still reference old chunks; clear before replace.
    await rest(
      `ai_draft_evidence?workspace_id=eq.${workspaceId}&knowledge_chunk_id=in.(${chunkIds})`,
      { method: "DELETE" },
    );
    await rest(
      `knowledge_chunks?workspace_id=eq.${workspaceId}&article_id=eq.${article.id}`,
      { method: "DELETE" },
    );
  }
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

async function enrichZeloPdvPlaybook() {
  const body = `O QUE É O ZELOPDV
O ZeloPDV é o sistema de caixa e gestão interna do ecossistema Zelo: produtos, vendas, estoque, fiado, despesas e (com add-on) mesas/comandas e controle de acessos.

RECURSOS QUE PODEM SER CITADOS
- Cadastro de produtos e categorias
- Abertura, venda e fechamento de caixa
- Estoque e fiado
- Add-on Mesas (mapa, comanda, fechamento)
- Add-on Controle de Acessos (convites e permissões)

O QUE NÃO DIZER
Não diga que o ZeloPDV é cardápio digital (isso é ZeloMenu). Não diga que substitui contador ou emite NFC-e sem confirmação da conta. Não peça senha no WhatsApp.

COMO RESPONDER
1. Responda só o que o cliente perguntou, em 2-6 linhas no WhatsApp.
2. Se a dúvida for ampla ("como funciona mesas?"), dê o essencial e ofereça o próximo passo.
3. Se for cobrança/renovação/cancelamento, passe para humano sem explicar playbook interno.

Resposta curta modelo:
"No ZeloPDV você cuida de caixa, produtos, estoque e fiado. Mesas e acessos são add-ons. Me diga o que você quer fazer agora que eu te guio."`;

  await upsertArticle({
    title: "Playbook ZeloPDV",
    category: "Playbooks",
    productKeys: ["zelopdv"],
    body,
  });
}

async function enrichZeloChatPlaybook() {
  const body = `O QUE É O ZELOCHAT
O ZeloChat é o atendimento WhatsApp do ecossistema Zelo: conexão do número, fila, IA (Cérebro IA) e automações.

RECURSOS QUE PODEM SER CITADOS
- Conectar/desconectar WhatsApp via QR Code
- Ligar, desligar ou agendar a IA
- Simulador para testar respostas
- Instruções do negócio em linguagem natural

O QUE NÃO DIZER
Não diga que o ZeloChat substitui o caixa. Não peça código de verificação do WhatsApp no chat de suporte. Não invente integração com iFood/Rappi.

COMO RESPONDER
Respostas curtas, uma dúvida por vez. Se for cobrança da IA ou assinatura, humano assume.

Resposta curta modelo:
"No ZeloChat você conecta o WhatsApp e controla a IA em Cérebro IA. Quer reconectar o WhatsApp ou ajustar a IA?"`;

  await upsertArticle({
    title: "Playbook ZeloChat",
    category: "Playbooks",
    productKeys: ["zelochat"],
    body,
  });
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

COMO RESPONDER
1. Confirme se a dúvida é sobre o link/cardápio digital (ZeloMenu) ou sobre cadastro interno no PDV.
2. Oriente edição de categorias/produtos e teste do link no celular.
3. Se pedir renovação ou falha de cobrança, encaminhe para humano.

Resposta curta modelo:
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
  await enrichZeloPdvPlaybook();
  await enrichZeloChatPlaybook();
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
