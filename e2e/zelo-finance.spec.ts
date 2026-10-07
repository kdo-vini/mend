import { expect, test, type Page } from "@playwright/test";
import type { ZeloFinanceFeed } from "../src/features/finance/api";

const snapshot = (period = "2026-10-01"): ZeloFinanceFeed => ({
  period,
  checkedAt: "2026-10-06T15:00:00Z",
  providers: { abacatepay: "ok", stripe: "ok" },
  rows: [
    {
      id: "abacatepay:bill_pix",
      externalId: "bill_pix",
      provider: "abacatepay",
      currency: "BRL",
      status: "paid",
      createdAt: "2026-10-01T15:00:00Z",
      paidAt: "2026-10-02T15:00:00Z",
      billedCents: 12345,
      receivedCents: 12345,
    },
    {
      id: "stripe:in_card",
      externalId: "in_card",
      provider: "stripe",
      currency: "BRL",
      status: "paid",
      createdAt: "2026-09-30T15:00:00Z",
      paidAt: "2026-10-03T15:00:00Z",
      billedCents: 5000,
      receivedCents: 5000,
    },
  ],
  totals: [
    {
      currency: "BRL",
      billedCents: 12345,
      receivedCents: 17345,
      pendingCents: 0,
    },
  ],
});
async function setup(page: Page, locale = "en-US", theme = "dark") {
  await page.setViewportSize(
    page.viewportSize()!.width < 650
      ? { width: 390, height: 844 }
      : { width: 1440, height: 900 },
  );
  await page.addInitScript(
    ({ locale, theme }) => {
      localStorage.setItem("mend.interface-language", locale);
      localStorage.setItem("mend.theme", theme);
    },
    { locale, theme },
  );
  const state = {
    allowed: true,
    status: 200,
    feed: snapshot(),
    calls: 0,
    providerBalancesCalls: 0,
    summaryCalls: 0,
    manualReceived: 0,
    summaryProjects: [] as (string | null)[],
    hold: null as Promise<void> | null,
  };
  await page.route("**/api/projects", (route) =>
    route.fulfill({
      json: {
        data: [
          {
            id: "c0e7238a-1e4d-4d55-8f02-3b671a0d83a0",
            key: "Zelo",
            name: "Zelo",
            description: "",
            status: "active",
            version: 1,
          },
        ],
      },
    }),
  );
  await page.route("**/api/finance/**", async (route) => {
    const url = new URL(route.request().url());
    const endpoint = url.pathname.split("/").pop();
    if (endpoint === "access")
      return route.fulfill({ json: { allowed: state.allowed } });
    if (endpoint === "zelo") {
      state.calls++;
      if (state.hold) await state.hold;
      return route.fulfill({
        status: state.status,
        json:
          state.status === 200
            ? { ...state.feed, period: url.searchParams.get("period") }
            : {
                error: {
                  code:
                    state.status === 403
                      ? "finance_forbidden"
                      : "upstream_error",
                  message: "Unavailable",
                },
              },
      });
    }
    if (endpoint === "summary") {
      state.summaryCalls++;
      state.summaryProjects.push(url.searchParams.get("project"));
      return route.fulfill({
        json: {
          income: 77777,
          expenses: 0,
          received: state.manualReceived,
          paid: 0,
          estimated_count: 0,
          unknown_count: 0,
          reference_pending: 0,
          review: null,
        },
      });
    }
    if (endpoint === "provider-balances") {
      state.providerBalancesCalls++;
      const provider = {
        status: "ok",
        scope: "provider_account",
        balances: [
          { currency: "BRL", availableMinor: 100000, pendingMinor: 5000 },
        ],
        payouts: [],
      };
      return route.fulfill({
        json: {
          checkedAt: "2026-10-06T15:00:00Z",
          providers: { abacatepay: provider, stripe: provider },
        },
      });
    }
    return route.fulfill({ json: { data: [], nextOffset: null } });
  });
  await page.goto("/financeiro?demo=1");
  await expect(projectSelect(page)).toBeVisible();
  await expect(projectSelect(page).locator('option[value="Zelo"]')).toHaveText(
    "Zelo",
  );
  return state;
}
const projectSelect = (page: Page) =>
  page.locator('select:has(option[value="__all"])');
const selectZelo = (page: Page) => projectSelect(page).selectOption("Zelo");
const selectAllProjects = (page: Page) =>
  projectSelect(page).selectOption("__all");
const refreshZeloFeed = (page: Page) =>
  page.locator(".finance-zelo-sync button").click();

for (const [locale, theme] of [
  ["en-US", "dark"],
  ["pt-BR", "light"],
]) {
  test(`Zelo transactions remain separate and readable (${locale}, ${theme})`, async ({
    page,
  }, info) => {
    const state = await setup(page, locale, theme);
    await selectZelo(page);
    await expect(projectSelect(page)).toHaveValue("Zelo");
    const panel = page.locator(".finance-zelo");
    await expect(panel.getByText("bill_pix", { exact: true })).toBeVisible();
    await expect(panel.getByText("in_card", { exact: true })).toBeVisible();
    await expect(panel.locator(".finance-zelo-totals")).toContainText(
      locale === "pt-BR" ? "173,45" : "173.45",
    );
    await expect(page.locator(".finance-new")).toHaveCount(2);
    await expect(panel).not.toContainText("777.77");
    await expect(page.locator(".provider-balances")).toBeVisible();
    expect(state.providerBalancesCalls).toBeGreaterThan(0);
    await expect(
      panel.locator(".finance-zelo-sources [data-state='ok']"),
    ).toHaveCount(2);
    await panel.getByRole("combobox").selectOption("stripe");
    await expect(panel.getByText("bill_pix", { exact: true })).toHaveCount(0);
    await expect(panel.getByText("in_card", { exact: true })).toBeVisible();
    await panel.getByRole("combobox").selectOption("all");
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: info.outputPath(`zelo-${locale}-${theme}.png`),
      fullPage: true,
    });
    const summaryCalls = state.summaryProjects.length;
    await selectAllProjects(page);
    await expect(projectSelect(page)).toHaveValue("__all");
    await expect
      .poll(() => state.summaryProjects.length)
      .toBeGreaterThan(summaryCalls);
    expect(state.summaryProjects.at(-1)).toBeNull();
    await expect(page.locator(".finance-new")).toHaveCount(2);
    await expect(page.locator(".finance-zelo")).toBeVisible();
    expect(state.summaryProjects).toContain("Zelo");
    expect(state.calls).toBeGreaterThan(0);
  });
}
test("missing sources are not displayed as a successful empty month", async ({
  page,
}) => {
  const state = await setup(page);
  state.feed = {
    ...snapshot(),
    rows: [],
    totals: [],
    providers: { abacatepay: "not_configured", stripe: "unavailable" },
  };
  await selectZelo(page);
  await refreshZeloFeed(page);
  await expect(
    page.locator(".finance-zelo-sources [data-state='not_configured']"),
  ).toHaveCount(1);
  await expect(
    page.locator(".finance-zelo-sources [data-state='unavailable']"),
  ).toHaveCount(1);
  await expect(page.locator(".finance-zelo .finance-coverage")).toHaveAttribute(
    "data-state",
    "partial",
  );
  await expect(page.locator(".finance-zelo table")).toHaveCount(0);
});
test("revoked access removes the displayed provider feed and cached figures", async ({
  page,
}) => {
  const state = await setup(page);
  await selectZelo(page);
  await expect(page.getByText("bill_pix", { exact: true })).toBeVisible();
  state.status = 403;
  await page.locator(".finance-zelo-sync button").click();
  await expect(page.locator(".finance-restricted")).toBeVisible();
  await expect(page.locator(".finance-zelo")).toHaveCount(0);
  await expect(page.getByText("bill_pix", { exact: true })).toHaveCount(0);
  await expect(projectSelect(page)).toHaveCount(0);
});
test("switching month preserves the old labeled snapshot until its response arrives", async ({
  page,
}) => {
  const state = await setup(page);
  await selectZelo(page);
  await expect(page.getByText("bill_pix", { exact: true })).toBeVisible();
  let release!: () => void;
  const summaryCalls = state.summaryCalls;
  state.hold = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.locator("input[type=month]:visible").fill("2026-09");
  try {
    await expect.poll(() => state.calls).toBe(2);
    await expect(page.locator(".finance-zelo-summary")).toHaveAttribute(
      "aria-label",
      /October 2026/,
    );
    await expect(page.locator(".finance-zelo .finance-sync")).toContainText(
      "September 2026",
    );
    await expect(page.getByText("bill_pix", { exact: true })).toBeVisible();
    expect(state.summaryCalls).toBeGreaterThan(summaryCalls);
  } finally {
    release();
  }
  await expect(page.locator(".finance-zelo-summary")).toHaveAttribute(
    "aria-label",
    /September 2026/,
  );
});
test("source filtering resets transaction pagination", async ({ page }) => {
  const state = await setup(page);
  state.feed.rows = Array.from({ length: 53 }, (_, index) => ({
    ...snapshot().rows[0],
    id: `pix-${index}`,
    externalId: `bill_transaction_${index}`,
  }));
  state.feed.rows.push(snapshot().rows[1]);
  await selectZelo(page);
  await refreshZeloFeed(page);
  await expect(page.locator(".finance-zelo tbody tr")).toHaveCount(50);
  await page
    .locator(".finance-zelo .finance-pagination")
    .getByRole("button", { name: "Next page", exact: true })
    .click();
  await expect(
    page.getByText("bill_transaction_52", { exact: true }),
  ).toBeVisible();
  await page.locator(".finance-zelo-filter select").selectOption("stripe");
  await expect(page.locator(".finance-zelo tbody tr")).toHaveCount(1);
  await expect(page.getByText("in_card", { exact: true })).toBeVisible();
  await expect(page.locator(".finance-zelo .finance-pagination")).toHaveCount(
    0,
  );
});
test("a temporary feed error keeps the last snapshot and allows recovery", async ({
  page,
}) => {
  const state = await setup(page);
  await selectZelo(page);
  await expect(page.getByText("bill_pix", { exact: true })).toBeVisible();
  state.status = 503;
  await refreshZeloFeed(page);
  await expect(page.locator(".finance-zelo [role=alert]")).toBeVisible();
  await expect(page.getByText("bill_pix", { exact: true })).toBeVisible();
  state.status = 200;
  await refreshZeloFeed(page);
  await expect(page.locator(".finance-zelo [role=alert]")).toHaveCount(0);
  await expect(page.getByText("bill_pix", { exact: true })).toBeVisible();
});
test("unknown paid amount stays unknown and the provider is marked partial", async ({
  page,
}) => {
  const state = await setup(page);
  state.feed.rows[0].receivedCents = null;
  state.feed.providers.abacatepay = "partial";
  state.feed.totals[0].receivedCents = 5000;
  await selectZelo(page);
  await refreshZeloFeed(page);
  await expect(
    page.locator(".finance-zelo .finance-badge[data-tone='unknown']"),
  ).toBeVisible();
  await expect(
    page.locator(".finance-zelo-sources [data-state='partial']"),
  ).toHaveCount(1);
  await expect(page.locator(".finance-zelo-totals")).toContainText("50.00");
});
test("Zelo feed remains available when the project selector returns to all projects", async ({
  page,
}) => {
  const state = await setup(page);
  await selectZelo(page);
  await expect(page.getByText("bill_pix", { exact: true })).toBeVisible();
  const feedCalls = state.calls;
  await selectAllProjects(page);
  await expect(projectSelect(page)).toHaveValue("__all");
  await expect(page.getByText("bill_pix", { exact: true })).toBeVisible();
  await expect(page.locator(".finance-zelo")).toBeVisible();
  await expect(page.locator(".provider-balances")).toBeVisible();
  expect(state.calls).toBe(feedCalls);
});

test("known net receipts combine with manual receipts once and never with provider balances", async ({
  page,
}) => {
  const state = await setup(page);
  state.manualReceived = 10000;
  state.feed.rows[0] = {
    ...state.feed.rows[0],
    feeCents: 345,
    netCents: 12000,
    availableAt: null,
  };
  state.feed.rows[1] = {
    ...state.feed.rows[1],
    feeCents: null,
    netCents: null,
    availableAt: null,
  };
  state.feed.totals[0] = {
    ...state.feed.totals[0],
    netKnownCents: 12000,
    unknownNetCount: 1,
  };
  await selectZelo(page);
  await refreshZeloFeed(page);
  const rollup = page.locator(".finance-net-rollup");
  await expect(rollup.locator("strong")).toContainText("220.00");
  await expect(rollup).toContainText("100.00");
  await expect(rollup).toContainText("120.00");
  await expect(page.locator(".provider-balances")).toContainText("1,000.00");
  await expect(page.locator(".finance-net-primary")).toContainText(
    "1 payment has no confirmed net",
  );
  const stripe = page
    .locator(".finance-zelo table tr")
    .filter({ hasText: "in_card" });
  await expect(stripe).toContainText("Unknown");
  let release!: () => void;
  state.hold = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.locator("input[type=month]:visible").fill("2026-09");
  try {
    await expect(rollup).toHaveCount(0);
  } finally {
    release();
  }
});
