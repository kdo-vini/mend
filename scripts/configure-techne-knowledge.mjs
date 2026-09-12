import "dotenv/config";
import process from "node:process";
import { createClient } from "@supabase/supabase-js";

/* global console */

const url = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey)
  throw new Error("Supabase server configuration is required");

const client = createClient(url, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const checked = (label, result) => {
  if (result.error) throw new Error(`${label}: ${result.error.message}`);
  return result.data ?? [];
};

const workspaces = checked(
  "workspaces",
  await client.from("workspaces").select("id,name,slug").order("name"),
);
const requested = process.env.MEND_ROLLOUT_WORKSPACE;
const workspace = requested
  ? workspaces.find((item) => item.id === requested || item.slug === requested)
  : workspaces.length === 1
    ? workspaces[0]
    : workspaces.find((item) => /techne/i.test(`${item.name} ${item.slug}`));
if (!workspace) {
  console.log(JSON.stringify({ workspaces }, null, 2));
  throw new Error("Set MEND_ROLLOUT_WORKSPACE to a workspace id or slug");
}

const products = [
  {
    product_key: "zelopdv",
    name: "ZeloPDV",
    description: "Operação de caixa, vendas, estoque, fiado e mesas.",
    aliases: ["pdv", "caixa", "fiado", "estoque", "mesa"],
  },
  {
    product_key: "zelochat",
    name: "ZeloChat",
    description: "Atendimento, WhatsApp, automações, bot e atendentes.",
    aliases: ["chat", "WhatsApp", "bot", "atendimento"],
  },
  {
    product_key: "zelomenu",
    name: "ZeloMenu",
    description:
      "Cardápio digital, categorias, produtos, links e disponibilidade.",
    aliases: ["menu", "cardápio digital", "link do cardápio"],
  },
];

if (process.argv.includes("--apply-products")) {
  checked(
    "support_products",
    await client.from("support_products").upsert(
      products.map((product) => ({
        workspace_id: workspace.id,
        ...product,
        status: "active",
      })),
      { onConflict: "workspace_id,product_key" },
    ),
  );
}

const [configuredProducts, repositories, articles] = await Promise.all([
  client
    .from("support_products")
    .select("id,product_key,name,aliases,status")
    .eq("workspace_id", workspace.id)
    .order("name"),
  client
    .from("repositories")
    .select(
      "id,name,default_branch,github_owner,github_repo,github_installation_id",
    )
    .eq("workspace_id", workspace.id)
    .order("name"),
  client
    .from("knowledge_articles")
    .select(
      process.argv.includes("--review-articles")
        ? "id,title,category,status,managed_by_sync,body"
        : "id,title,category,status,managed_by_sync",
    )
    .eq("workspace_id", workspace.id)
    .order("updated_at", { ascending: false }),
]);

if (process.argv.includes("--apply-reviewed-mappings")) {
  const productByKey = new Map(
    checked("products", configuredProducts).map((item) => [
      item.product_key,
      item.id,
    ]),
  );
  const articleProductKeys = new Map([
    ["Playbook ZeloPDV", ["zelopdv"]],
    ["Playbook ZeloChat", ["zelochat"]],
    ["Playbook ZeloMenu", ["zelomenu"]],
    ["Playbook de suporte e segurança", ["zelopdv", "zelochat"]],
  ]);
  for (const article of checked("articles", articles)) {
    const keys = articleProductKeys.get(article.title);
    if (!keys) continue;
    checked(
      `article:${article.title}`,
      await client.from("knowledge_article_products").upsert(
        keys.map((key) => ({
          workspace_id: workspace.id,
          article_id: article.id,
          product_id: productByKey.get(key),
        })),
        { onConflict: "article_id,product_id", ignoreDuplicates: true },
      ),
    );
  }
}

if (process.argv.includes("--connect-verified-zelopdv")) {
  const product = checked("products", configuredProducts).find(
    (item) => item.product_key === "zelopdv",
  );
  const repository = checked("repositories", repositories).find(
    (item) =>
      item.github_owner === "kdo-vini" && item.github_repo === "zelopdv",
  );
  if (!product || !repository)
    throw new Error("Verified ZeloPDV mapping is unavailable");
  checked(
    "zelopdv repository mapping",
    await client.from("support_product_repositories").upsert(
      {
        workspace_id: workspace.id,
        product_id: product.id,
        repository_id: repository.id,
        repository_role: "primary",
        knowledge_enabled: true,
      },
      { onConflict: "product_id,repository_id" },
    ),
  );
  checked(
    "zelopdv source",
    await client.from("knowledge_sources").upsert(
      {
        workspace_id: workspace.id,
        repository_id: repository.id,
        ref_name: repository.default_branch,
        sync_mode: "event",
      },
      { onConflict: "workspace_id,repository_id" },
    ),
  );
}

const [articleMappings, repositoryMappings, refreshedSources] =
  await Promise.all([
    client
      .from("knowledge_article_products")
      .select("article_id,product_id")
      .eq("workspace_id", workspace.id),
    client
      .from("support_product_repositories")
      .select("product_id,repository_id,repository_role,knowledge_enabled")
      .eq("workspace_id", workspace.id),
    client
      .from("knowledge_sources")
      .select(
        "id,repository_id,ref_name,observed_sha,indexed_sha,active_sha,sync_state",
      )
      .eq("workspace_id", workspace.id),
  ]);

console.log(
  JSON.stringify(
    {
      workspace,
      products: checked("products", configuredProducts),
      repositories: checked("repositories", repositories),
      articles: checked("articles", articles),
      sources: checked("sources", refreshedSources),
      articleMappings: checked("article mappings", articleMappings),
      repositoryMappings: checked("repository mappings", repositoryMappings),
    },
    null,
    2,
  ),
);
