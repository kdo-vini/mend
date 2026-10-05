import { test, expect, type Page } from "@playwright/test";

async function mockFinance(page: Page, allowed = true) {
  const tables: Record<string, Array<Record<string, unknown>>> = {
    entries: [],
    settlements: [],
    templates: [],
    references: [],
    reviews: [],
  };
  await page.route("**/api/finance/**", async (route) => {
    const url = new URL(route.request().url());
    const endpoint = url.pathname.split("/").pop();
    let body: unknown;
    if (endpoint === "access") body = { allowed };
    else if (endpoint === "summary") {
      const rows = tables.entries;
      const expenses = rows
        .filter(
          (r) =>
            r.period === url.searchParams.get("period") && r.kind === "expense",
        )
        .reduce((sum, r) => sum + Number(r.amount_cents), 0);
      body = {
        income: 0,
        expenses,
        received: 0,
        paid: tables.settlements
          .filter((r) =>
            String(r.paid_on).startsWith(
              String(url.searchParams.get("period")).slice(0, 7),
            ),
          )
          .reduce((sum, r) => sum + Number(r.amount_cents), 0),
        estimated_count: 0,
        unknown_count: 0,
        reference_pending: 0,
        review: null,
      };
    } else if (route.request().method() === "POST") {
      const input = route.request().postDataJSON();
      body = { ...input.record, version: 1 };
      tables[endpoint!].push(body as Record<string, unknown>);
    } else
      body = {
        data: tables[endpoint!].filter(
          (r) => !r.period || r.period === url.searchParams.get("period"),
        ),
        nextOffset: null,
      };
    await route.fulfill({ json: body });
  });
}
test("finance keeps accruals and cash distinct, persists entry and respects month on desktop/mobile", async ({
  page,
}, info) => {
  await page.addInitScript(() =>
    localStorage.setItem("mend.interface-language", "pt-BR"),
  );
  await mockFinance(page);
  await page.goto("/financeiro?demo=1");
  await expect(
    page.getByRole("heading", { name: "Financeiro Diagium", exact: true }),
  ).toBeVisible();
  await page.getByLabel("Mês de referência").fill("2026-10");
  await expect(
    page.getByText(
      "Totais registrados — cobertura parcial; resultado provisório.",
    ),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Novo registro", exact: true })
    .click();
  await page.getByLabel("Descrição", { exact: true }).fill("Hostinger Diagium");
  await page
    .getByLabel("Valor (R$), vazio se desconhecido", { exact: true })
    .fill("19,90");
  await page.getByLabel("Categoria", { exact: true }).fill("Infraestrutura");
  await page.getByLabel("Fonte / origem", { exact: true }).fill("Hostinger");
  await page
    .getByRole("button", { name: "Salvar registro", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Hostinger Diagium", exact: true }),
  ).toBeVisible();
  await expect(
    page
      .locator(".finance-metrics>div")
      .filter({ hasText: "Despesas por competência" }),
  ).toContainText("19,90");
  await expect(
    page.locator(".finance-metrics>div").filter({ hasText: "Pago no mês" }),
  ).toContainText("0,00");
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Hostinger Diagium", exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
  ).toBe(false);
  await page.screenshot({
    path: info.outputPath("finance-pt-BR.png"),
    fullPage: true,
  });
  await page.getByLabel("Mês de referência").fill("2026-09");
  await expect(
    page.getByRole("heading", { name: "Hostinger Diagium", exact: true }),
  ).toHaveCount(0);
  await expect(
    page
      .locator(".finance-metrics>div")
      .filter({ hasText: "Despesas por competência" }),
  ).toContainText("0,00");
});
test("home contains monthly financial metrics rather than only navigation", async ({
  page,
}) => {
  await mockFinance(page);
  await page.goto("/dashboard?demo=1");
  await expect(page.locator(".finance-metrics")).toBeVisible();
  await expect(page.locator(".finance-panel input[type=month]")).toBeVisible();
});
test("financial permission denies data and actions in either locale", async ({
  page,
}) => {
  for (const locale of ["pt-BR", "en-US"]) {
    await page.addInitScript(
      (language) => localStorage.setItem("mend.interface-language", language),
      locale,
    );
    await mockFinance(page, false);
    await page.goto("/financeiro?demo=1");
    await expect(
      page.getByText(
        locale === "pt-BR"
          ? /Acesso financeiro restrito/
          : /Finance access is restricted/,
      ),
    ).toBeVisible();
    await expect(page.locator(".finance-metrics")).toHaveCount(0);
    await expect(page.locator(".finance-editor")).toHaveCount(0);
  }
});
test("payment and reconciliation forms remain usable in English dark mode", async ({
  page,
}, info) => {
  await page.addInitScript(() => {
    localStorage.setItem("mend.interface-language", "en-US");
    localStorage.setItem("mend.theme", "dark");
  });
  await mockFinance(page);
  await page.goto("/financeiro?demo=1");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.getByLabel("Reporting month").fill("2026-10");
  await page.getByRole("button", { name: "New record", exact: true }).click();
  await page
    .getByLabel("Description", { exact: true })
    .fill("Hostinger Diagium");
  await page
    .getByLabel("Amount (BRL), empty if unknown", { exact: true })
    .fill("19.90");
  await page.getByLabel("Category", { exact: true }).fill("Infrastructure");
  await page.getByLabel("Source", { exact: true }).fill("Hostinger");
  await page.getByRole("button", { name: "Save record", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Hostinger Diagium", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Record receipt/payment", exact: true })
    .click();
  const selectedEntry = await page
    .getByLabel("Entry identifier", { exact: true })
    .inputValue();
  await expect(
    page.getByLabel("Entry identifier", { exact: true }),
  ).toHaveAttribute("readonly", "");
  await page
    .getByLabel("Amount (BRL), empty if unknown", { exact: true })
    .fill("19.90");
  await page
    .getByLabel("Actual receipt/payment date", { exact: true })
    .fill("2026-10-05");
  await page.getByLabel("Source", { exact: true }).fill("Bank");
  await page.screenshot({
    path: info.outputPath("payment-dark-en-US.png"),
    fullPage: true,
  });
  await page.getByRole("button", { name: "Save record", exact: true }).click();
  await expect(
    page
      .locator(".finance-metrics>div")
      .filter({ hasText: "Cash paid this month" }),
  ).toContainText("19.90");
  await page
    .getByRole("button", { name: "Cash movements", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Link evidence", exact: true })
    .click();
  await expect(
    page.getByLabel("Entry identifier", { exact: true }),
  ).toHaveValue(selectedEntry);
  await expect(
    page.getByLabel("Settlement identifier (optional)", { exact: true }),
  ).not.toHaveValue("");
  await page.getByLabel("Source", { exact: true }).fill("Bank");
  await page
    .getByLabel("External identifier (optional)", { exact: true })
    .fill("qa-statement-1");
  await page.getByRole("button", { name: "Save record", exact: true }).click();
  await expect(
    page
      .locator(".finance-metrics>div")
      .filter({ hasText: "Accrued expenses" }),
  ).toContainText("19.90");
  await expect(
    page
      .locator(".finance-metrics>div")
      .filter({ hasText: "Cash paid this month" }),
  ).toContainText("19.90");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
  ).toBe(false);
});
