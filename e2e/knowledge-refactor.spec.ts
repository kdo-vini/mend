import { expect, test, type Page } from "@playwright/test";

type LiveKnowledgeRow = {
  id: string;
  workspace_id: string;
  title: string;
  category: string;
  body: string;
  status: "draft" | "published";
  created_at: string;
  updated_at: string;
  created_by_user_id: string | null;
};

const testUser = {
  id: "11111111-1111-4111-8111-111111111111",
  aud: "authenticated",
  role: "authenticated",
  email: "knowledge-owner@example.com",
  created_at: "2026-01-01T00:00:00.000Z",
  app_metadata: { provider: "email", providers: ["email"] },
  user_metadata: {},
};

const testSession = {
  access_token: "knowledge-e2e-access-token",
  token_type: "bearer",
  expires_in: 3_600,
  expires_at: Math.floor(Date.now() / 1_000) + 3_600,
  refresh_token: "knowledge-e2e-refresh-token",
  user: testUser,
};

const liveWorkspace = {
  id: "22222222-2222-4222-8222-222222222222",
  name: "Knowledge QA",
  slug: "knowledge-qa",
  issue_prefix: "KQA",
  next_issue_number: 1,
  timezone: "America/Sao_Paulo",
  default_language: "en-US",
  ai_policy_json: {},
  github_connected_at: null,
  github_installation_id: null,
  github_owner: null,
  created_at: "2026-01-01T00:00:00.000Z",
  updated_at: "2026-01-01T00:00:00.000Z",
};

function liveArticle(
  id: string,
  title: string,
  status: "draft" | "published",
): LiveKnowledgeRow {
  return {
    id,
    workspace_id: liveWorkspace.id,
    title,
    category: status === "published" ? "Product" : "Billing",
    body: `${title} body`,
    status,
    created_at: "2026-08-13T12:00:00.000Z",
    updated_at: "2026-08-13T12:00:00.000Z",
    created_by_user_id: testUser.id,
  };
}

async function installLiveKnowledgeHarness(
  page: Page,
  initialArticles: LiveKnowledgeRow[],
) {
  const articles = [...initialArticles];
  const writes: string[] = [];

  await page.route("**/auth/v1/token**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(testSession),
    });
  });
  await page.route("**/auth/v1/user**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ user: testUser }),
    });
  });
  await page.route("**/rest/v1/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const table = url.pathname.split("/").at(-1);
    const method = request.method();
    let response: unknown = [];

    if (table === "workspaces") response = [liveWorkspace];
    if (table === "knowledge_articles" && method === "GET") response = articles;

    await route.fulfill({
      status: 200,
      contentType: "application/json",
      headers: { "Content-Range": "0-0/*" },
      body: JSON.stringify(response),
    });
  });
  await page.route("**/api/knowledge**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const method = request.method();
    const id = url.pathname.split("/").at(-1);
    let response: unknown;

    if (method === "POST") {
      const payload = request.postDataJSON() as Partial<LiveKnowledgeRow>;
      const created = {
        ...liveArticle("live-created", payload.title ?? "Untitled", "draft"),
        ...payload,
      } as LiveKnowledgeRow;
      articles.unshift(created);
      writes.push("POST");
      response = created;
    } else if (method === "PATCH") {
      const payload = request.postDataJSON() as Partial<LiveKnowledgeRow>;
      const index = articles.findIndex((article) => article.id === id);
      articles[index] = {
        ...articles[index],
        ...payload,
        updated_at: "2026-08-13T13:00:00.000Z",
      };
      writes.push("PATCH");
      response = articles[index];
    } else {
      const index = articles.findIndex((article) => article.id === id);
      const [deleted] = articles.splice(index, 1);
      writes.push("DELETE");
      response = { id: deleted.id };
    }

    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(response),
    });
  });

  return { articles, writes };
}

async function openLiveKnowledge(page: Page) {
  await page.goto("/knowledge?auth=1");
  await page.getByRole("textbox", { name: "Email" }).fill(testUser.email);
  await page.getByRole("textbox", { name: "Password" }).fill("password-123");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Knowledge" })).toBeVisible();
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.setItem("mend.interface-language", "en-US");
  });
});

test("desktop Knowledge opens a scan-first adjacent preview", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/knowledge?demo=1");
  await page
    .getByRole("button", { name: /Como lidar com pagamentos Pix pendentes/ })
    .click();
  await expect(
    page.getByRole("complementary", { name: "Article preview" }),
  ).toBeVisible();
  await expect(
    page.getByText("Available to AI", { exact: true }),
  ).toBeVisible();
  const collectionBox = await page
    .locator(".knowledge-collection")
    .boundingBox();
  const previewBox = await page.locator(".knowledge-preview").boundingBox();
  expect(collectionBox).not.toBeNull();
  expect(previewBox).not.toBeNull();
  expect(previewBox!.x).toBeGreaterThan(
    collectionBox!.x + collectionBox!.width,
  );
  expect(previewBox!.width).toBeGreaterThanOrEqual(300);
  expect(previewBox!.width).toBeLessThanOrEqual(380);
});

test("mobile Knowledge uses one column without horizontal overflow", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/knowledge?demo=1");
  await expect(page.locator(".knowledge-collection")).toBeVisible();
  expect(
    await page.evaluate(() => document.body.scrollWidth),
  ).toBeLessThanOrEqual(390);
});

test("mobile Knowledge moves focus into detail and restores it on Back", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/knowledge?demo=1");
  const article = page.getByRole("button", {
    name: /Como lidar com pagamentos Pix pendentes/,
  });

  await article.click();
  const back = page.getByRole("button", { name: "Back to articles" });
  await expect(back).toBeFocused();
  await expect(back).toHaveCSS("min-height", "44px");

  await back.click();
  await expect(article).toBeFocused();
});

test("demo Knowledge reconciles selection when filtering and creating", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/knowledge?demo=1");
  await page
    .getByRole("button", { name: /Como lidar com pagamentos Pix pendentes/ })
    .click();
  await page.getByLabel("Search knowledge").fill("Política");
  await expect(page.getByText("Internal draft", { exact: true })).toBeVisible();
  await page.getByLabel("Search knowledge").fill("does not exist");
  await expect(page.getByText("No matching articles")).toBeVisible();
  await page.getByRole("button", { name: "Clear filters" }).click();
  await expect(page.locator(".knowledge-preview")).toHaveCount(0);

  await page
    .getByRole("combobox", { name: "Filter knowledge by category" })
    .click();
  await page.getByRole("option", { name: "Payments" }).click();
  await expect(page.locator(".knowledge-preview")).toHaveCount(0);
  await page.getByRole("button", { name: "New article" }).click();
  await expect(
    page.getByRole("button", { name: /Novo artigo de conhecimento/ }),
  ).toBeVisible();
  await expect(page.getByText("Internal draft", { exact: true })).toBeVisible();
  await expect(
    page.getByRole("combobox", { name: "Filter knowledge by category" }),
  ).toContainText("All categories");
});

test("Knowledge uses stacked detail at intermediate content widths", async ({
  page,
}) => {
  await page.setViewportSize({ width: 900, height: 900 });
  await page.goto("/knowledge?demo=1");
  await page
    .getByRole("button", { name: /Como lidar com pagamentos Pix pendentes/ })
    .click();
  const collectionBox = await page
    .locator(".knowledge-collection")
    .boundingBox();
  const previewBox = await page.locator(".knowledge-preview").boundingBox();
  expect(collectionBox).not.toBeNull();
  expect(previewBox).not.toBeNull();
  expect(previewBox!.y).toBeGreaterThanOrEqual(
    collectionBox!.y + collectionBox!.height,
  );
});

test("Knowledge explains draft eligibility in Portuguese", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.addInitScript(() => {
    window.localStorage.setItem("mend.interface-language", "pt-BR");
  });
  await page.goto("/knowledge?demo=1");
  await page
    .getByRole("button", { name: /Política de respostas automáticas/ })
    .click();
  await expect(
    page.getByText("Rascunho interno", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Voltar aos artigos" }).click();
  await page
    .getByRole("button", { name: /Como lidar com pagamentos Pix pendentes/ })
    .click();
  await expect(
    page.getByText("Disponível para a IA", { exact: true }),
  ).toBeVisible();
});

test("live Knowledge preserves filtered CRUD selection through real API calls", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const harness = await installLiveKnowledgeHarness(page, [
    liveArticle("live-hidden", "Unrelated internal note", "draft"),
    liveArticle("live-published", "Published live guide", "published"),
    liveArticle("live-draft", "Draft live notes", "draft"),
  ]);
  await openLiveKnowledge(page);

  const search = page.getByLabel("Search knowledge");
  await search.fill("does not exist");
  await expect(page.getByText("No matching articles")).toBeVisible();
  await expect(page.locator(".knowledge-preview")).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Clear filters" }),
  ).toBeVisible();

  await page.getByRole("button", { name: "New article" }).click();
  await page.getByLabel("Title").fill("Created under filter");
  await page.getByLabel("Article body").fill("Created article body");
  await page.getByRole("button", { name: "Save article" }).click();
  await expect(search).toHaveValue("");
  await expect(page.getByText("Internal draft", { exact: true })).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Back to articles" }),
  ).toBeFocused();

  await page.getByRole("button", { name: "Edit article" }).click();
  await page.getByLabel("Title").fill("Renamed after filtered save");
  await page.getByRole("button", { name: "Save article" }).click();
  await expect(
    page.getByRole("heading", { name: "Renamed after filtered save" }),
  ).toBeVisible();

  await page.getByRole("button", { name: "Back to articles" }).click();
  await search.fill("Renamed after filtered save");
  await page
    .getByRole("button", { name: /Renamed after filtered save/ })
    .click();
  await page.getByRole("button", { name: "Delete article" }).click();
  const clear = page.getByRole("button", { name: "Clear filters" });
  await expect(clear).toBeVisible();
  await expect(clear).toBeFocused();
  await clear.click();
  await search.fill("live");
  await page.getByRole("button", { name: /Published live guide/ }).click();
  await page.getByRole("button", { name: "Delete article" }).click();
  await expect(
    page.getByRole("heading", { name: "Draft live notes" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Delete article" }).click();
  await expect(clear).toBeFocused();
  await clear.click();
  await page.getByRole("button", { name: /Unrelated internal note/ }).click();
  await page.getByRole("button", { name: "Delete article" }).click();
  await expect(page.getByText("No knowledge articles yet")).toBeVisible();
  await expect(
    page.locator(".page-header").getByRole("button", { name: "New article" }),
  ).toBeFocused();
  expect(harness.writes).toEqual([
    "POST",
    "PATCH",
    "DELETE",
    "DELETE",
    "DELETE",
    "DELETE",
  ]);
});
