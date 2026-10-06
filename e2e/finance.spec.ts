import { test, expect, type Page } from "@playwright/test";

type Row = Record<string, unknown>;
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const currentMonth = () =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
  })
    .format(new Date())
    .slice(0, 7);
const hostinger = {
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
};

/**
 * In-memory stand-in for the existing `/api/finance` routes (same paths,
 * payloads and 403/409 codes). Persistence rules are covered by the real
 * database test; this mock only lets the UI run against the API contract.
 */
async function mockFinance(page: Page, allowed = true) {
  const tables: Record<string, Row[]> = {
    entries: [],
    settlements: [],
    templates: [],
    references: [],
    reviews: [],
  };
  const events: Array<Row & { record_id: string }> = [];
  const calls: Record<string, number> = {};
  const state = { allowed, summaryGate: null as Promise<void> | null };
  const inMonth = (date: unknown, period: string) =>
    String(date).slice(0, 7) === period.slice(0, 7);
  const entry = (id: unknown) => tables.entries.find((row) => row.id === id);

  await page.route("**/api/finance/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const parts = url.pathname.split("/").slice(3);
    const period = url.searchParams.get("period") ?? "";
    const key = `${request.method()} ${parts[0]}`;
    calls[key] = (calls[key] ?? 0) + 1;
    if (parts[0] === "access") {
      await route.fulfill({ json: { allowed: state.allowed } });
      return;
    }
    if (!state.allowed) {
      await route.fulfill({
        status: 403,
        json: { error: { code: "finance_forbidden", message: "Restricted" } },
      });
      return;
    }
    let body: unknown;
    if (parts[0] === "summary") {
      if (state.summaryGate) await state.summaryGate;
      const live = tables.entries.filter(
        (r) => r.period === period && !r.cancelled,
      );
      const total = (kind: string) =>
        live
          .filter((r) => r.kind === kind && typeof r.amount_cents === "number")
          .reduce((sum, r) => sum + Number(r.amount_cents), 0);
      const cash = tables.settlements.filter(
        (r) => inMonth(r.paid_on, period) && !r.cancelled,
      );
      const moved = (kind: string) =>
        cash
          .filter((r) => entry(r.entry_id)?.kind === kind)
          .reduce((sum, r) => sum + Number(r.amount_cents), 0);
      body = {
        income: total("income"),
        expenses: total("expense"),
        received: moved("income"),
        paid: moved("expense"),
        estimated_count: live.filter((r) => r.estimated).length,
        unknown_count: live.filter((r) => r.amount_cents === null).length,
        reference_pending: cash.filter(
          (r) => !tables.references.some((ref) => ref.settlement_id === r.id),
        ).length,
        review: tables.reviews.find((r) => r.period === period) ?? null,
      };
    } else if (parts[0] === "generate") {
      const target = request.postDataJSON().period as string;
      let generated = 0;
      for (const template of tables.templates) {
        if (!template.active || String(template.starts_on) > target) continue;
        const id = `${String(template.id).slice(0, 24)}${target.replace(/-/g, "").slice(0, 6)}aaaaaa`;
        if (tables.entries.some((r) => r.id === id)) continue;
        tables.entries.push({
          id,
          version: 1,
          kind: "expense",
          period: target,
          description: template.description,
          amount_cents: template.amount_cents,
          category: template.category,
          source: template.source,
          estimated: template.estimated,
          project: template.project,
          allocation: template.allocation,
          cancelled: false,
          reason: "",
        });
        generated += 1;
      }
      body = { generated };
    } else if (parts[0] === "history") {
      body = { data: events.filter((e) => e.record_id === parts[1]) };
    } else if (parts.length === 2) {
      body = tables[parts[0]].find((row) => row.id === parts[1]);
    } else if (request.method() === "POST") {
      const input = request.postDataJSON();
      const rows = tables[parts[0]];
      const index = rows.findIndex((row) => row.id === input.record.id);
      const existing = rows[index];
      if ((existing?.version ?? null) !== input.version) {
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
      events.unshift({
        id: events.length + 1,
        record_id: input.record.id,
        actor_id: "aaaaaaaa-0000-4000-8000-000000000001",
        happened_at: "2026-10-05T12:00:00.000Z",
        before_record: existing ?? null,
        after_record: body as Row,
      });
      if (index < 0) rows.push(body as Row);
      else rows[index] = body as Row;
    } else {
      const entity = parts[0];
      const rows =
        entity === "entries"
          ? tables.entries.filter((r) => r.period === period)
          : entity === "settlements"
            ? tables.settlements.filter((r) => inMonth(r.paid_on, period))
            : entity === "references"
              ? tables.references.filter(
                  (r) => entry(r.entry_id)?.period === period,
                )
              : tables[entity];
      body = {
        data: rows.map((r) =>
          entity === "settlements" || entity === "references"
            ? { ...r, description: entry(r.entry_id)?.description }
            : r,
        ),
        nextOffset: null,
      };
    }
    await route.fulfill({ json: body });
  });
  return { tables, calls, state };
}

async function openFinance(page: Page, locale: "pt-BR" | "en-US", theme = "") {
  await page.addInitScript(
    ([language, mode]) => {
      localStorage.setItem("mend.interface-language", language);
      if (mode) localStorage.setItem("mend.theme", mode);
    },
    [locale, theme],
  );
}

const metric = (page: Page, label: string) =>
  page.locator(".finance-metric").filter({ hasText: label });
const noOverflow = (page: Page) =>
  page.evaluate(() => document.documentElement.scrollWidth > innerWidth);
const editor = (page: Page) => page.locator(".finance-editor");

test("pending saves cannot be displaced by a different financial action", async ({
  page,
}) => {
  await openFinance(page, "en-US");
  const { tables } = await mockFinance(page);
  tables.entries.push({ ...hostinger, period: `${currentMonth()}-01` });
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("**/api/finance/entries", async (route) => {
    if (route.request().method() === "POST") await gate;
    await route.fallback();
  });
  await page.goto("/financeiro?demo=1");
  await page.getByRole("button", { name: "Edit: Hostinger Diagium" }).click();
  await page.getByLabel("Description", { exact: true }).fill("Updated expense");
  const saving = page.waitForRequest(
    (request) =>
      request.method() === "POST" &&
      request.url().endsWith("/api/finance/entries"),
  );
  await page.getByRole("button", { name: "Save record", exact: true }).click();
  await saving;
  try {
    await expect(
      page.getByRole("button", { name: "New income", exact: true }),
    ).toBeDisabled();
    await expect(
      page.getByRole("button", { name: "New expense", exact: true }),
    ).toBeDisabled();
    await expect(
      page.getByRole("button", { name: "Review coverage", exact: true }),
    ).toBeDisabled();
    await page
      .getByRole("button", {
        name: "Actions for Hostinger Diagium",
        exact: true,
      })
      .click();
    await expect(
      page.getByRole("menuitem", { name: "Change history", exact: true }),
    ).toBeDisabled();
  } finally {
    release();
  }
  await expect(page.getByText("Entry saved.", { exact: true })).toBeVisible();
});

test("coverage review waits for the selected month's summary", async ({
  page,
}) => {
  await openFinance(page, "en-US");
  const { tables } = await mockFinance(page);
  tables.reviews.push({
    id: "22222222-2222-4222-8222-222222222222",
    version: 1,
    period: `${currentMonth()}-01`,
    sources_complete: true,
  });
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("**/api/finance/summary?**", async (route) => {
    if (
      new URL(route.request().url()).searchParams.get("period") === "2099-09-01"
    )
      await gate;
    await route.fallback();
  });
  await page.goto("/financeiro?demo=1");
  await expect(
    page.getByRole("button", { name: "Review coverage", exact: true }),
  ).toBeEnabled();
  const loading = page.waitForRequest(
    (request) =>
      request.url().includes("/api/finance/summary?") &&
      request.url().includes("2099-09-01"),
  );
  await page.getByLabel("Reporting month").fill("2099-09");
  await loading;
  try {
    await expect(
      page.getByRole("button", { name: "Review coverage", exact: true }),
    ).toBeDisabled();
  } finally {
    release();
  }
  await expect(
    page.getByRole("button", { name: "Review coverage", exact: true }),
  ).toBeEnabled();
  await page
    .getByRole("button", { name: "Review coverage", exact: true })
    .click();
  await expect(editor(page)).toContainText("September 2099");
  await expect(
    page.getByLabel("Sources reviewed", { exact: true }),
  ).not.toBeChecked();
});

test("finance keeps accruals and cash distinct, persists entry and respects month on desktop/mobile", async ({
  page,
}, info) => {
  await openFinance(page, "pt-BR");
  await mockFinance(page);
  await page.goto("/financeiro?demo=1");
  await expect(
    page.getByRole("heading", { name: "Financeiro Diagium", exact: true }),
  ).toBeVisible();
  await page.getByLabel("Mês de referência").fill("2026-10");
  await expect(
    page.getByText("Cobertura parcial — resultado provisório"),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Competência", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Caixa", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Nova despesa", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Nova despesa", exact: true }),
  ).toBeVisible();
  // Optional project/allocation stay folded until requested.
  await expect(page.getByLabel("Projeto atendido")).toHaveCount(0);
  await page.getByLabel("Descrição", { exact: true }).fill("Hostinger Diagium");
  await page.getByLabel("Valor (R$)", { exact: true }).fill("19,90");
  await page.getByLabel("Categoria", { exact: true }).fill("Infraestrutura");
  await page.getByLabel("Fonte / origem", { exact: true }).fill("Hostinger");
  await page
    .getByRole("button", { name: "Salvar registro", exact: true })
    .click();
  await expect(editor(page)).toHaveCount(0);
  await expect(page.getByText("Lançamento salvo.")).toBeVisible();
  await expect(
    page.getByRole("cell", { name: /^Hostinger Diagium/ }),
  ).toBeVisible();
  await expect(metric(page, "Despesas por competência")).toContainText("19,90");
  await expect(metric(page, "Pago no mês")).toContainText("0,00");
  await page.reload();
  await page.getByLabel("Mês de referência").fill("2026-10");
  await expect(
    page.getByRole("cell", { name: /^Hostinger Diagium/ }),
  ).toBeVisible();
  expect(await noOverflow(page)).toBe(false);
  await page.screenshot({
    path: info.outputPath("finance-pt-BR.png"),
    fullPage: true,
  });
  await page.getByRole("button", { name: /Mês anterior/ }).click();
  await expect(page.getByLabel("Mês de referência")).toHaveValue("2026-09");
  await expect(
    page.getByRole("cell", { name: /^Hostinger Diagium/ }),
  ).toHaveCount(0);
  await expect(page.getByText("Nenhum lançamento neste mês")).toBeVisible();
  await expect(metric(page, "Despesas por competência")).toContainText("0,00");
  await page.getByRole("button", { name: /Próximo mês/ }).click();
  await expect(
    page.getByRole("cell", { name: /^Hostinger Diagium/ }),
  ).toBeVisible();
});

test("home contains monthly financial metrics rather than only navigation", async ({
  page,
}, info) => {
  await openFinance(page, "en-US");
  const { calls } = await mockFinance(page);
  await page.goto("/dashboard?demo=1");
  await expect(page.locator(".finance-panel .finance-metrics")).toBeVisible();
  await expect(page.locator(".finance-panel input[type=month]")).toBeVisible();
  await expect(metric(page, "Accrued revenue")).toBeVisible();
  await expect(page.getByRole("link", { name: "Open finance" })).toBeVisible();
  // The home block reads the summary only; it never lists ledger rows.
  expect(calls["GET entries"] ?? 0).toBe(0);
  expect(await noOverflow(page)).toBe(false);
  await page.screenshot({
    path: info.outputPath("dashboard-en-US.png"),
    fullPage: true,
  });
});

test("financial permission denies data and actions in either locale", async ({
  page,
}) => {
  for (const locale of ["pt-BR", "en-US"] as const) {
    await openFinance(page, locale);
    await mockFinance(page, false);
    await page.goto("/financeiro?demo=1");
    await expect(
      page.getByText(
        locale === "pt-BR"
          ? /Acesso financeiro restrito\. Peça/
          : /Finance access is restricted\. Ask/,
      ),
    ).toBeVisible();
    await expect(page.locator(".finance-metrics")).toHaveCount(0);
    await expect(editor(page)).toHaveCount(0);
    await expect(
      page.getByRole("button", {
        name: locale === "pt-BR" ? "Nova despesa" : "New expense",
      }),
    ).toHaveCount(0);
  }
});

test("revoked access mid-session removes displayed figures immediately", async ({
  page,
}) => {
  await openFinance(page, "en-US");
  const { tables, state } = await mockFinance(page);
  tables.entries.push({ ...hostinger });
  await page.goto("/financeiro?demo=1");
  await page.getByLabel("Reporting month").fill("2026-10");
  await expect(metric(page, "Accrued expenses")).toContainText("19.90");
  state.allowed = false;
  await page.getByRole("tab", { name: "Cash movements" }).click();
  await expect(page.getByText(/Finance access is restricted\./)).toBeVisible();
  await expect(page.locator(".finance-metrics")).toHaveCount(0);
  await expect(page.getByText("Hostinger Diagium")).toHaveCount(0);
  // Cached figures are not reused after revocation on another route either.
  await page.locator('a[href="/dashboard"]:visible').first().click();
  await expect(
    page.getByRole("heading", { name: "Diagium dashboard", exact: true }),
  ).toBeVisible();
  await expect(page.getByText(/Finance access is restricted\./)).toBeVisible();
  await expect(page.locator(".finance-metrics")).toHaveCount(0);
});

test("returning to finance paints cached figures while revalidating", async ({
  page,
}) => {
  await openFinance(page, "en-US");
  const { tables, calls, state } = await mockFinance(page);
  tables.entries.push({ ...hostinger, period: `${currentMonth()}-01` });
  await page.goto("/financeiro?demo=1");
  await expect(metric(page, "Accrued expenses")).toContainText("19.90");
  await page.locator('a[href="/dashboard"]:visible').first().click();
  await expect(page).toHaveURL(/\/dashboard/);
  await expect(
    page.getByRole("heading", { name: "Diagium dashboard", exact: true }),
  ).toBeVisible();
  await expect(metric(page, "Accrued expenses")).toContainText("19.90");
  const accessChecks = calls["GET access"];
  const summaryChecks = calls["GET summary"];
  let release!: () => void;
  state.summaryGate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.goBack();
  try {
    await expect(
      page.getByRole("heading", { name: "Diagium finance", exact: true }),
    ).toBeVisible();
    // Every mount rechecks access; prove cached values before the fresh summary can return.
    await expect.poll(() => calls["GET access"]).toBeGreaterThan(accessChecks);
    await expect
      .poll(() => calls["GET summary"])
      .toBeGreaterThan(summaryChecks);
    await expect(metric(page, "Accrued expenses")).toContainText("19.90");
  } finally {
    release();
  }
});

test("switching ledger tabs keeps figures and does not repeat access or summary calls", async ({
  page,
}) => {
  await openFinance(page, "en-US");
  const { tables, calls } = await mockFinance(page);
  tables.entries.push({ ...hostinger });
  await page.goto("/financeiro?demo=1");
  await page.getByLabel("Reporting month").fill("2026-10");
  await expect(metric(page, "Accrued expenses")).toContainText("19.90");
  const before = { ...calls };
  for (const tab of ["Cash movements", "Recurring expenses", "Evidence"]) {
    await page.getByRole("tab", { name: tab }).click();
    await expect(page.getByRole("tab", { name: tab })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    await expect(metric(page, "Accrued expenses")).toContainText("19.90");
  }
  await page.getByRole("tab", { name: "Accruals" }).focus();
  await page.keyboard.press("ArrowRight");
  await expect(page.getByRole("tab", { name: "Cash movements" })).toBeFocused();
  expect(calls["GET access"]).toBe(before["GET access"]);
  expect(calls["GET summary"]).toBe(before["GET summary"]);
});

test("payment starts from the entry with explicit date, partial amount and no raw identifiers", async ({
  page,
}, info) => {
  await openFinance(page, "en-US", "dark");
  const { tables } = await mockFinance(page);
  await page.goto("/financeiro?demo=1");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.getByLabel("Reporting month").fill("2026-10");
  await page.getByRole("button", { name: "New expense", exact: true }).click();
  await page
    .getByLabel("Description", { exact: true })
    .fill("Hostinger Diagium");
  await page.getByLabel("Amount (BRL)", { exact: true }).fill("19.90");
  await page.getByLabel("Category", { exact: true }).fill("Infrastructure");
  await page.getByLabel("Source", { exact: true }).fill("Hostinger");
  await page.getByRole("button", { name: "Save record", exact: true }).click();
  await page
    .getByRole("button", { name: "Record payment: Hostinger Diagium" })
    .click();
  await expect(
    page.getByRole("heading", { name: "Record payment", exact: true }),
  ).toBeVisible();
  await expect(editor(page).locator(".finance-context")).toContainText(
    "Hostinger Diagium",
  );
  for (const value of await editor(page)
    .locator("input")
    .evaluateAll((inputs) =>
      inputs.map((input) => (input as HTMLInputElement).value),
    ))
    expect(value).not.toMatch(uuid);
  await expect(
    page.getByLabel("Amount received or paid (BRL)", { exact: true }),
  ).toHaveValue("19.90");
  await page
    .getByLabel("Amount received or paid (BRL)", { exact: true })
    .fill("10.00");
  await page
    .getByLabel("Actual receipt/payment date", { exact: true })
    .fill("2026-10-05");
  await page.getByLabel("Account or channel", { exact: true }).fill("Bank");
  await page.screenshot({
    path: info.outputPath("payment-dark-en-US.png"),
    fullPage: true,
  });
  await page.getByRole("button", { name: "Save record", exact: true }).click();
  await expect(metric(page, "Cash paid this month")).toContainText("10.00");
  await expect(metric(page, "Accrued expenses")).toContainText("19.90");
  expect(tables.settlements[0]).toMatchObject({
    entry_id: tables.entries[0].id,
    paid_on: "2026-10-05",
    amount_cents: 1000,
    source: "Bank",
  });

  await page.getByRole("tab", { name: "Cash movements" }).click();
  await expect(
    page.getByRole("cell", { name: /^Hostinger Diagium/ }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Actions for Hostinger Diagium" })
    .click();
  await page.getByRole("menuitem", { name: "Link evidence" }).click();
  await expect(
    page.getByRole("heading", { name: "Link evidence to cash movement" }),
  ).toBeVisible();
  for (const value of await editor(page)
    .locator("input")
    .evaluateAll((inputs) =>
      inputs.map((input) => (input as HTMLInputElement).value),
    ))
    expect(value).not.toMatch(uuid);
  await page.getByLabel("Evidence source", { exact: true }).fill("Bank");
  await page
    .getByLabel("External identifier (optional)", { exact: true })
    .fill("qa-statement-1");
  await page.getByRole("button", { name: "Save record", exact: true }).click();
  await expect(page.getByText("Evidence linked.")).toBeVisible();
  expect(tables.references[0]).toMatchObject({
    entry_id: tables.entries[0].id,
    settlement_id: tables.settlements[0].id,
    source: "Bank",
    external_id: "qa-statement-1",
  });
  await page.getByRole("tab", { name: "Evidence" }).click();
  await expect(
    page.getByRole("cell", { name: "qa-statement-1" }),
  ).toBeVisible();
  expect(await noOverflow(page)).toBe(false);
});

test("conflict recovery retains edited amounts, refreshes untouched fields and saves the latest version", async ({
  page,
}) => {
  await openFinance(page, "en-US");
  const { tables } = await mockFinance(page);
  tables.entries.push({ ...hostinger });
  await page.goto("/financeiro?demo=1");
  await page.getByLabel("Reporting month").fill("2026-10");
  await page.getByRole("button", { name: "Edit: Hostinger Diagium" }).click();
  await page.getByLabel("Amount (BRL)", { exact: true }).fill("25.99");
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
  await expect(page.getByLabel("Amount (BRL)", { exact: true })).toHaveValue(
    "25.99",
  );
  await expect(page.getByLabel("Description", { exact: true })).toHaveValue(
    "Hostinger updated",
  );
  await expect(page.locator(".finance-editor aside")).toContainText("30.00");
  await page.getByRole("button", { name: "Save record", exact: true }).click();
  await expect(editor(page)).toHaveCount(0);
  expect(tables.entries[0]).toMatchObject({
    version: 3,
    amount_cents: 2599,
    description: "Hostinger updated",
  });
});

test("cancelling an expense requires a reason, preserves the record and removes its total", async ({
  page,
}) => {
  await openFinance(page, "en-US");
  const { tables } = await mockFinance(page);
  tables.entries.push({ ...hostinger });
  await page.goto("/financeiro?demo=1");
  await page.getByLabel("Reporting month").fill("2026-10");
  await expect(metric(page, "Accrued expenses")).toContainText("19.90");
  await page.getByRole("button", { name: "Edit: Hostinger Diagium" }).click();
  await page
    .getByLabel("Cancel record (reason required)", { exact: true })
    .check();
  await page.getByRole("button", { name: "Save record", exact: true }).click();
  await expect(editor(page)).toBeVisible();
  expect(tables.entries[0].version).toBe(1);
  await page
    .getByLabel("Cancellation reason", { exact: true })
    .fill("Duplicate accrual");
  await page.getByRole("button", { name: "Save record", exact: true }).click();
  await expect(page.locator(".finance-table")).toContainText("Cancelled");
  await expect(page.locator(".finance-table")).toContainText(
    "Reason: Duplicate accrual",
  );
  await expect(metric(page, "Accrued expenses")).toContainText("0.00");
  // Cancelled entries can no longer receive payments.
  await expect(
    page.getByRole("button", { name: "Record payment: Hostinger Diagium" }),
  ).toHaveCount(0);
  expect(tables.entries).toHaveLength(1);
  expect(tables.entries[0]).toMatchObject({
    cancelled: true,
    reason: "Duplicate accrual",
    version: 2,
  });
  await page
    .getByRole("button", { name: "Actions for Hostinger Diagium" })
    .click();
  await page.getByRole("menuitem", { name: "Change history" }).click();
  const history = page.locator(".finance-history");
  await expect(history).toContainText("Changed");
  await expect(history).toContainText("Duplicate accrual");
  await expect(history.locator("del").first()).toContainText("No");
});

test("recurring expenses generate the month once, and Supabase costs require a project", async ({
  page,
}) => {
  await openFinance(page, "en-US");
  const { tables } = await mockFinance(page);
  await page.goto("/financeiro?demo=1");
  await page.getByLabel("Reporting month").fill("2026-10");
  await page.getByRole("tab", { name: "Recurring expenses" }).click();
  await page
    .getByRole("button", { name: "New recurring expense", exact: true })
    .click();
  await page.getByLabel("Description", { exact: true }).fill("Supabase Pro");
  await page.getByLabel("Amount (BRL)", { exact: true }).fill("125,00");
  await page.getByLabel("Category", { exact: true }).fill("Infrastructure");
  await page.getByLabel("Source", { exact: true }).fill("Supabase");
  // Supabase reveals the project field as required.
  await expect(page.getByLabel("Served project")).toBeVisible();
  await page.getByRole("button", { name: "Save record", exact: true }).click();
  await expect(editor(page)).toBeVisible();
  expect(tables.templates).toHaveLength(0);
  await page.getByLabel("Served project").fill("Diagium");
  await page.getByRole("button", { name: "Save record", exact: true }).click();
  await expect(page.getByText("Recurring expense saved.")).toBeVisible();
  expect(tables.templates[0]).toMatchObject({
    starts_on: "2026-10-01",
    ends_on: null,
    active: true,
    amount_cents: 12500,
    project: "Diagium",
  });
  await page.getByRole("button", { name: /Generate .* expenses/ }).click();
  await expect(page.getByText(/1 expense generated/)).toBeVisible();
  await page.getByRole("button", { name: /Generate .* expenses/ }).click();
  await expect(page.getByText(/0 expenses generated/)).toBeVisible();
  expect(tables.entries).toHaveLength(1);
  expect(tables.settlements).toHaveLength(0);
  await expect(metric(page, "Accrued expenses")).toContainText("125.00");
  await page.getByRole("tab", { name: "Accruals" }).click();
  await expect(page.getByRole("cell", { name: /^Supabase Pro/ })).toBeVisible();
});

test("coverage review and unknown amounts drive the coverage status", async ({
  page,
}) => {
  await openFinance(page, "en-US");
  const { tables } = await mockFinance(page);
  tables.entries.push({
    ...hostinger,
    amount_cents: null,
    estimated: false,
  });
  await page.goto("/financeiro?demo=1");
  await page.getByLabel("Reporting month").fill("2026-10");
  await expect(page.getByText("1 unknown amount")).toBeVisible();
  await expect(page.locator(".finance-table")).toContainText("Unknown amount");
  await page.getByRole("button", { name: "Review coverage" }).click();
  for (const label of [
    "Sources reviewed",
    "Expenses reviewed",
    "Taxes reviewed",
  ])
    await page.getByLabel(label, { exact: true }).check();
  await page.getByRole("button", { name: "Save review", exact: true }).click();
  await expect(page.getByText("Coverage review saved.")).toBeVisible();
  await expect(
    page.getByText("Sources, expenses and taxes not yet reviewed"),
  ).toHaveCount(0);
  // Still partial while an amount is unknown.
  await expect(
    page.getByText("Partial coverage — provisional result"),
  ).toBeVisible();
  await page.getByRole("button", { name: "Edit: Hostinger Diagium" }).click();
  await page.getByLabel("Amount (BRL)", { exact: true }).fill("19,90");
  await page.getByRole("button", { name: "Save record", exact: true }).click();
  await expect(
    page.getByText("Monthly coverage confirmed by the operator."),
  ).toBeVisible();
  expect(tables.reviews[0]).toMatchObject({
    period: "2026-10-01",
    sources_complete: true,
    expenses_complete: true,
    taxes_complete: true,
  });
});
