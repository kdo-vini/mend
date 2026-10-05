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
    if (
      url.pathname.split("/").length === 5 &&
      route.request().method() === "GET"
    ) {
      const entity = url.pathname.split("/")[3];
      body = tables[entity].find((row) => row.id === endpoint);
    } else if (endpoint === "access") body = { allowed };
    else if (endpoint === "summary") {
      const rows = tables.entries;
      const expenses = rows
        .filter(
          (r) =>
            r.period === url.searchParams.get("period") &&
            r.kind === "expense" &&
            !r.cancelled,
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
      const index = tables[endpoint!].findIndex(
        (row) => row.id === input.record.id,
      );
      const existing = tables[endpoint!][index];
      if (existing && existing.version !== input.version) {
        await route.fulfill({
          status: 409,
          json: { error: { code: "finance_conflict", message: "Conflict" } },
        });
        return;
      }
      body = {
        ...input.record,
        version: existing ? Number(existing.version) + 1 : 1,
      };
      if (index < 0) tables[endpoint!].push(body as Record<string, unknown>);
      else tables[endpoint!][index] = body as Record<string, unknown>;
    } else
      body = {
        data: tables[endpoint!].filter(
          (r) => !r.period || r.period === url.searchParams.get("period"),
        ),
        nextOffset: null,
      };
    await route.fulfill({ json: body });
  });
  return tables;
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
test("conflict recovery retains edited amounts, refreshes untouched fields and saves the latest version", async ({
  page,
}) => {
  await page.addInitScript(() =>
    localStorage.setItem("mend.interface-language", "en-US"),
  );
  const tables = await mockFinance(page);
  tables.entries.push({
    id: "11111111-1111-4111-8111-111111111111",
    version: 1,
    description: "Hostinger Diagium",
    kind: "expense",
    period: "2026-10-01",
    amount_cents: 1990,
    category: "Infra",
    source: "Hostinger",
    estimated: false,
    project: "",
    allocation: "",
    cancelled: false,
    reason: "",
  });
  await page.goto("/financeiro?demo=1");
  await page.getByLabel("Reporting month").fill("2026-10");
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  await page
    .getByLabel("Amount (BRL), empty if unknown", { exact: true })
    .fill("25.99");
  tables.entries[0] = {
    ...tables.entries[0],
    version: 2,
    description: "Hostinger updated",
    amount_cents: 3000,
  };
  await page.getByRole("button", { name: "Save record", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Save record", exact: true }),
  ).toBeDisabled();
  await page
    .getByRole("button", {
      name: "Review latest version and keep draft",
      exact: true,
    })
    .click();
  await expect(
    page.getByLabel("Amount (BRL), empty if unknown", { exact: true }),
  ).toHaveValue("25.99");
  await expect(page.getByLabel("Description", { exact: true })).toHaveValue(
    "Hostinger updated",
  );
  await expect(page.locator(".finance-editor aside")).toContainText("30.00");
  await page.getByRole("button", { name: "Save record", exact: true }).click();
  await expect(page.locator(".finance-editor")).toHaveCount(0);
  expect(tables.entries[0]).toMatchObject({
    version: 3,
    amount_cents: 2599,
    description: "Hostinger updated",
  });
});
test("cancelling an expense requires a reason, preserves the record and removes its total", async ({
  page,
}) => {
  await page.addInitScript(() =>
    localStorage.setItem("mend.interface-language", "en-US"),
  );
  const tables = await mockFinance(page);
  tables.entries.push({
    id: "11111111-1111-4111-8111-111111111111",
    version: 1,
    description: "Hostinger Diagium",
    kind: "expense",
    period: "2026-10-01",
    amount_cents: 1990,
    category: "Infra",
    source: "Hostinger",
    estimated: false,
    project: "",
    allocation: "",
    cancelled: false,
    reason: "",
  });
  await page.goto("/financeiro?demo=1");
  await page.getByLabel("Reporting month").fill("2026-10");
  await expect(
    page
      .locator(".finance-metrics>div")
      .filter({ hasText: "Accrued expenses" }),
  ).toContainText("19.90");
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  await page
    .getByLabel("Cancel record (reason required)", { exact: true })
    .check();
  await page.getByRole("button", { name: "Save record", exact: true }).click();
  await expect(page.locator(".finance-editor")).toBeVisible();
  expect(tables.entries[0].version).toBe(1);
  await page
    .getByLabel("Cancellation reason", { exact: true })
    .fill("Duplicate accrual");
  await page.getByRole("button", { name: "Save record", exact: true }).click();
  await expect(page.locator(".finance-records")).toContainText("Cancelled");
  await expect(
    page
      .locator(".finance-metrics>div")
      .filter({ hasText: "Accrued expenses" }),
  ).toContainText("0.00");
  expect(tables.entries).toHaveLength(1);
  expect(tables.entries[0]).toMatchObject({
    cancelled: true,
    reason: "Duplicate accrual",
    version: 2,
  });
});
