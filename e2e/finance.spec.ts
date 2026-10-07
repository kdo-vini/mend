import { test, expect, type Page } from "@playwright/test";

test("attention review preserves context, restores focus and respects reduced motion", async ({
  page,
}, info) => {
  await page.setViewportSize(
    info.project.name === "mobile"
      ? { width: 390, height: 844 }
      : { width: 1440, height: 900 },
  );
  await page.emulateMedia({ reducedMotion: "reduce" });
  await openFinance(page, "en-US", "dark");
  await mockFinance(page);
  await page.goto("/financeiro?demo=1", { waitUntil: "domcontentloaded" });
  const review = page.getByRole("button", {
    name: "Review coverage",
    exact: true,
  });
  await review.focus();
  await page.keyboard.press("Enter");
  await expect(
    page.getByLabel("Sources reviewed", { exact: true }),
  ).toBeFocused();
  await expect(
    page.locator(".finance-ledger:not(.finance-zelo-charges)"),
  ).toBeVisible();
  expect(
    await page
      .locator(".finance-editor")
      .evaluate((el) => getComputedStyle(el).animationName),
  ).toBe("none");
  await page.keyboard.press("Escape");
  await expect(review).toBeFocused();
  await review.focus();
  await page.keyboard.press("Enter");
  await page.screenshot({
    path: info.outputPath("finance-review.png"),
    fullPage: true,
  });
  for (const label of [
    "Sources reviewed",
    "Expenses reviewed",
    "Taxes reviewed",
  ])
    await page.getByLabel(label, { exact: true }).check();
  await page.getByRole("button", { name: "Save review", exact: true }).click();
  await expect(
    page.getByText("Checks up to date", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("Coverage review saved.", { exact: true }),
  ).toBeVisible();
  await expect(page.locator(".finance-editor")).toHaveCount(0);
  expect(await noOverflow(page)).toBe(false);
  await page.screenshot({
    path: info.outputPath("finance-complete.png"),
    fullPage: true,
  });
});

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
async function mockFinance(page: Page, allowed = true, visualFixtures = false) {
  const tables: Record<string, Row[]> = {
    entries: [],
    settlements: [],
    templates: [],
    references: [],
    reviews: [],
  };
  const events: Array<Row & { record_id: string }> = [];
  const calls: Record<string, number> = {};
  const projects = ["Alpha", "Alpha Pro", "Diagium"].map((key, index) => ({
    id: `aaaaaaaa-aaaa-4aaa-8aaa-${String(index + 1).padStart(12, "0")}`,
    key,
    name: key,
    description: "",
    status: "active",
    version: 1,
  }));
  const state = { allowed, summaryGate: null as Promise<void> | null };
  const inMonth = (date: unknown, period: string) =>
    String(date).slice(0, 7) === period.slice(0, 7);
  const entry = (id: unknown) => tables.entries.find((row) => row.id === id);

  await page.route("**/api/projects", async (route) => {
    await route.fulfill({ json: { data: projects } });
  });

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
    if (parts[0] === "provider-balances") {
      await route.fulfill({
        json: {
          checkedAt: "2026-10-06T12:00:00.000Z",
          providers: Object.fromEntries(
            ["stripe", "abacatepay"].map((provider) => [
              provider,
              {
                status: "ok",
                scope: "provider_account",
                balances: [
                  {
                    currency: provider === "stripe" ? "USD" : "BRL",
                    availableMinor: visualFixtures ? 123456 : 0,
                    pendingMinor: visualFixtures ? 7890 : 0,
                  },
                ],
                payouts: visualFixtures
                  ? [
                      {
                        id: `${provider}-visual-payout`,
                        status: "in_transit",
                        currency: provider === "stripe" ? "USD" : "BRL",
                        amountMinor: 12000,
                        feeMinor: provider === "stripe" ? null : 300,
                        netMinor: provider === "stripe" ? 12000 : null,
                        arrivalAt:
                          provider === "stripe"
                            ? "2026-10-12T00:00:00.000Z"
                            : null,
                        createdAt: "2026-10-05T00:00:00.000Z",
                      },
                    ]
                  : [],
              },
            ]),
          ),
        },
      });
      return;
    }
    if (parts[0] === "zelo") {
      await route.fulfill({
        json: {
          period,
          checkedAt: "2026-10-06T12:00:00.000Z",
          providers: { stripe: "ok", abacatepay: "ok" },
          rows: [],
          totals: [],
        },
      });
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
      const selectedProject = url.searchParams.get("project");
      const live = tables.entries.filter(
        (r) =>
          r.period === period &&
          !r.cancelled &&
          (selectedProject === null || r.project === selectedProject),
      );
      const total = (kind: string) =>
        live
          .filter((r) => r.kind === kind && typeof r.amount_cents === "number")
          .reduce((sum, r) => sum + Number(r.amount_cents), 0);
      const cash = tables.settlements.filter((r) => {
        const linked = entry(r.entry_id);
        return (
          inMonth(r.paid_on, period) &&
          !r.cancelled &&
          Boolean(linked && !linked.cancelled && linked.kind !== "transfer") &&
          (selectedProject === null || linked?.project === selectedProject)
        );
      });
      const moved = (kind: string) =>
        cash
          .filter((r) => entry(r.entry_id)?.kind === kind)
          .reduce((sum, r) => sum + Number(r.amount_cents), 0);
      body = {
        income: total("income"),
        expenses: total("expense"),
        received: moved("income"),
        paid: moved("expense"),
        estimated_count: live.filter(
          (r) => r.kind !== "transfer" && r.estimated,
        ).length,
        unknown_count: live.filter(
          (r) => r.kind !== "transfer" && r.amount_cents === null,
        ).length,
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
      const selectedProject = url.searchParams.get("project");
      const rows =
        entity === "entries"
          ? tables.entries.filter(
              (r) =>
                r.period === period &&
                (selectedProject === null || r.project === selectedProject),
            )
          : entity === "settlements"
            ? tables.settlements.filter(
                (r) =>
                  inMonth(r.paid_on, period) &&
                  (selectedProject === null ||
                    entry(r.entry_id)?.project === selectedProject),
              )
            : entity === "references"
              ? tables.references.filter(
                  (r) =>
                    entry(r.entry_id)?.period === period &&
                    (selectedProject === null ||
                      entry(r.entry_id)?.project === selectedProject),
                )
              : entity === "templates"
                ? tables.templates.filter(
                    (r) =>
                      selectedProject === null || r.project === selectedProject,
                  )
                : tables[entity];
      const attention = url.searchParams.get("attention");
      const matching = attention
        ? rows.filter(
            (r) =>
              !r.cancelled &&
              r.kind !== "transfer" &&
              (attention === "unknown" ? r.amount_cents === null : r.estimated),
          )
        : rows;
      const offset = Number(url.searchParams.get("offset") ?? 0);
      const pageRows = matching.slice(offset, offset + 50);
      body = {
        data: pageRows.map((r) =>
          entity === "settlements" || entity === "references"
            ? { ...r, description: entry(r.entry_id)?.description }
            : r,
        ),
        nextOffset: offset + 50 < matching.length ? offset + 50 : null,
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

test("attention resolves records beyond the first page and refreshes after saving", async ({
  page,
}, info) => {
  await page.setViewportSize(
    info.project.name === "mobile"
      ? { width: 390, height: 844 }
      : { width: 1440, height: 900 },
  );
  await openFinance(page, "en-US");
  const { tables } = await mockFinance(page);
  const period = `${currentMonth()}-01`;
  tables.entries.push(
    ...Array.from({ length: 51 }, (_, index) => ({
      ...hostinger,
      id: `11111111-1111-4111-8111-${String(index).padStart(12, "0")}`,
      period,
      description: `Confirmed ${index}`,
    })),
  );
  tables.entries.push({
    ...hostinger,
    id: "22222222-2222-4222-8222-222222222222",
    period,
    description: "Missing invoice",
    amount_cents: null,
  });
  tables.entries.push({
    ...hostinger,
    id: "33333333-3333-4333-8333-333333333333",
    period,
    description: "Cancelled invoice",
    amount_cents: null,
    cancelled: true,
  });
  tables.entries.push({
    ...hostinger,
    id: "44444444-4444-4444-8444-444444444444",
    period,
    description: "Estimated hosting",
    estimated: true,
  });
  tables.entries.push({
    ...hostinger,
    id: "55555555-5555-4555-8555-555555555555",
    period,
    description: "Internal transfer",
    kind: "transfer",
    amount_cents: null,
    estimated: true,
  });
  await page.goto("/financeiro?demo=1");
  await expect(
    page.getByRole("button", { name: "Edit: Missing invoice", exact: true }),
  ).toHaveCount(0);
  await page
    .getByRole("button", { name: "Review missing amounts", exact: true })
    .click();
  await expect(page.locator(".finance-pending-context")).toContainText(
    "Entries with missing amounts",
  );
  await expect(page.locator(".finance-table")).not.toContainText("Confirmed 0");
  await expect(page.locator(".finance-table")).not.toContainText(
    "Cancelled invoice",
  );
  await expect(page.locator(".finance-table")).not.toContainText(
    "Internal transfer",
  );
  await page
    .getByRole("button", { name: "Edit: Missing invoice", exact: true })
    .click();
  expect(await noOverflow(page)).toBe(false);
  await page.screenshot({
    path: info.outputPath("guided-review.png"),
    fullPage: true,
  });
  await page.getByLabel("Amount (BRL)", { exact: true }).fill("25.00");
  await page.getByRole("button", { name: "Save record", exact: true }).click();
  await expect(
    page.getByText("No pending entries on this page", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Review missing amounts", exact: true }),
  ).toHaveCount(0);
  await page
    .getByRole("button", { name: "Review estimates", exact: true })
    .click();
  await expect(page.locator(".finance-table")).toContainText(
    "Estimated hosting",
  );
  await expect(page.locator(".finance-table")).not.toContainText(
    "Missing invoice",
  );
  await page
    .getByRole("button", { name: "Show all entries", exact: true })
    .click();
  await expect(page.locator(".finance-table")).toContainText("Confirmed 0");
});

test("leaving attention ignores its late response and preserves the general ledger", async ({
  page,
}) => {
  await openFinance(page, "en-US");
  const { tables } = await mockFinance(page);
  tables.entries.push({
    ...hostinger,
    period: `${currentMonth()}-01`,
    amount_cents: null,
  });
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("**/api/finance/entries?**", async (route) => {
    if (new URL(route.request().url()).searchParams.has("attention"))
      await gate;
    await route.fallback();
  });
  await page.goto("/financeiro?demo=1");
  await page
    .getByRole("button", { name: "Review missing amounts", exact: true })
    .click();
  await expect(page.locator(".finance-table")).toHaveCount(0);
  await page
    .getByRole("button", { name: "Show all entries", exact: true })
    .click();
  await expect(page.locator(".finance-table")).toContainText(
    "Hostinger Diagium",
  );
  const response = page.waitForResponse((r) =>
    r.url().includes("attention=unknown"),
  );
  release();
  await response;
  await expect(page.locator(".finance-pending-context")).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Edit: Hostinger Diagium", exact: true }),
  ).toBeEnabled();
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
  const summary = page.locator(".finance-summary-hero");
  await expect(summary).toContainText("Resultado gerencial");
  await expect(summary).toContainText(
    "O que pertence a outubro de 2026, independentemente do pagamento.",
  );
  await expect(summary).toContainText("Recebido no mês");
  await expect(summary).toContainText("Pago no mês");
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

test("home keeps finance exclusive to its own route", async ({
  page,
}, info) => {
  await openFinance(page, "en-US");
  const { calls } = await mockFinance(page);
  await page.goto("/dashboard?demo=1");
  await expect(page.locator(".dashboard-links")).toBeVisible();
  await expect(page.locator(".finance-panel")).toHaveCount(0);
  await expect(page.locator(".finance-metrics")).toHaveCount(0);
  // Dashboard must not request financial data or require financial permission.
  expect(calls["GET summary"] ?? 0).toBe(0);
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
  // Dashboard has no financial surface; returning to Finance stays revoked.
  await page.locator('a[href="/dashboard"]:visible').first().click();
  await expect(
    page.getByRole("heading", { name: "Diagium dashboard", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".finance-metrics")).toHaveCount(0);
  await page.goBack();
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
  await expect(page.locator(".finance-metrics")).toHaveCount(0);
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

test("deleting an expense requires confirmation and reason, preserves history and removes its total", async ({
  page,
}) => {
  await openFinance(page, "en-US");
  const { tables } = await mockFinance(page);
  tables.entries.push({ ...hostinger });
  await page.goto("/financeiro?demo=1");
  await page.getByLabel("Reporting month").fill("2026-10");
  await expect(metric(page, "Accrued expenses")).toContainText("19.90");
  await page.getByRole("button", { name: "Delete: Hostinger Diagium" }).click();
  const removeForm = editor(page);
  await expect(
    removeForm.getByRole("heading", { name: "Delete record", exact: true }),
  ).toBeVisible();
  const confirmDelete = removeForm.getByRole("button", {
    name: "Confirm deletion",
    exact: true,
  });
  await confirmDelete.click();
  await expect(removeForm).toBeVisible();
  expect(tables.entries[0].version).toBe(1);
  await removeForm
    .getByLabel("Cancellation reason", { exact: true })
    .fill("Duplicate accrual");
  await confirmDelete.click();
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
  await page.getByLabel("Served project").selectOption("Diagium");
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

test("project selection scopes summary and ledger and preselects a new expense", async ({
  page,
}) => {
  await openFinance(page, "en-US");
  const { tables } = await mockFinance(page);
  const period = `${currentMonth()}-01`;
  tables.entries.push(
    {
      ...hostinger,
      id: "11111111-1111-4111-8111-111111111111",
      period,
      project: "Alpha",
      amount_cents: 10000,
      description: "Alpha income",
      kind: "income",
    },
    {
      ...hostinger,
      id: "22222222-2222-4222-8222-222222222222",
      period,
      project: "Alpha Pro",
      amount_cents: 90000,
      description: "Alpha Pro income",
      kind: "income",
    },
  );
  await page.goto("/financeiro?demo=1");
  const projectFilter = page.locator(".finance-business select");
  await expect(projectFilter).toHaveValue("__all");

  await projectFilter.selectOption("Alpha");
  await expect(page).toHaveURL(/project=Alpha$/);
  await expect(metric(page, "Accrued revenue")).toContainText("100.00");
  await expect(page.locator(".finance-table")).toContainText("Alpha income");
  await expect(page.locator(".finance-table")).not.toContainText(
    "Alpha Pro income",
  );

  await projectFilter.selectOption("Alpha Pro");
  await expect(page).toHaveURL(/project=Alpha\+Pro$/);
  await expect(metric(page, "Accrued revenue")).toContainText("900.00");
  await expect(page.locator(".finance-table")).toContainText(
    "Alpha Pro income",
  );
  await expect(page.locator(".finance-table")).not.toContainText(
    "Alpha income",
  );

  await page.getByRole("button", { name: "New expense", exact: true }).click();
  const form = editor(page);
  const servedProject = form.getByLabel("Served project", { exact: true });
  await expect(servedProject).toHaveValue("Alpha Pro");
  await form.getByLabel("Description", { exact: true }).fill("Project expense");
  await form.getByLabel("Amount (BRL)", { exact: true }).fill("12.50");
  await form.getByLabel("Category", { exact: true }).fill("Operations");
  await form.getByLabel("Source", { exact: true }).fill("Manual");
  await form.getByRole("button", { name: "Save record", exact: true }).click();
  await expect(page.getByText("Entry saved.", { exact: true })).toBeVisible();
  expect(tables.entries.at(-1)).toMatchObject({
    description: "Project expense",
    project: "Alpha Pro",
    kind: "expense",
    amount_cents: 1250,
  });
  await expect(metric(page, "Accrued expenses")).toContainText("12.50");
  await expect(page.locator(".finance-table")).toContainText("Project expense");
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

for (const theme of ["light", "dark"] as const) {
  test(`finance visual ${theme}: overview and expense editor fit desktop/mobile`, async ({
    page,
  }, info) => {
    await page.setViewportSize(
      info.project.name === "mobile"
        ? { width: 390, height: 844 }
        : { width: 1440, height: 900 },
    );
    await openFinance(page, "en-US", theme);
    const { tables } = await mockFinance(page, true, true);
    tables.entries.push({
      ...hostinger,
      id: `${theme === "light" ? "33333333" : "44444444"}-3333-4333-8333-333333333333`,
      period: `${currentMonth()}-01`,
      kind: "income",
      amount_cents: 245000,
      description: "Synthetic project revenue",
      category: "Services",
      source: "Visual fixture",
      project: "Diagium",
    });

    await page.goto("/financeiro?demo=1");
    await expect(page.locator(".finance-summary-hero")).toBeVisible();
    await expect(page.locator(".provider-balances")).toBeVisible();
    await expect(page.locator(".provider-balance-grid")).toContainText(
      "Stripe",
    );
    await expect(page.locator(".provider-balance-grid")).toContainText(
      "AbacatePay",
    );
    expect(await noOverflow(page)).toBe(false);
    await page.screenshot({
      path: info.outputPath(`finance-${theme}-overview.png`),
      fullPage: true,
    });

    await page
      .getByRole("button", { name: "New expense", exact: true })
      .click();
    await expect(editor(page)).toBeVisible();
    expect(await noOverflow(page)).toBe(false);
    await page.screenshot({
      path: info.outputPath(`finance-${theme}-expense-editor.png`),
      fullPage: true,
    });
  });
}
