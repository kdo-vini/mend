import { expect, test } from "@playwright/test";

test("workspace bootstrap does not restart when its resolved ID is published", async ({
  page,
}) => {
  const user = {
    id: "11111111-1111-4111-8111-111111111111",
    email: "navigation@example.com",
    aud: "authenticated",
    role: "authenticated",
    app_metadata: {},
    user_metadata: {},
  };
  const workspace = {
    id: "22222222-2222-4222-8222-222222222222",
    name: "Diagium",
    default_language: "en-US",
    slug: "diagium",
  };
  await page.addInitScript(
    ({ user }) => {
      localStorage.setItem("mend.interface-language", "en-US");
      localStorage.setItem(
        "sb-127-auth-token",
        JSON.stringify({
          access_token: "navigation-test-token",
          refresh_token: "navigation-test-refresh",
          expires_at: Math.floor(Date.now() / 1000) + 3600,
          token_type: "bearer",
          user,
        }),
      );
    },
    { user },
  );
  await page.route("**/auth/v1/user", (route) => route.fulfill({ json: user }));
  let contactLoads = 0;
  let lastContactAt = 0;
  await page.route("**/rest/v1/**", async (route) => {
    const table = new URL(route.request().url()).pathname.split("/").pop();
    if (table === "contacts") {
      contactLoads++;
      lastContactAt = Date.now();
    }
    const rows =
      table === "internal_workspace"
        ? [{ workspace_id: workspace.id }]
        : table === "workspaces"
          ? [workspace]
          : table === "workspace_members"
            ? [{ user_id: user.id, role: "owner", workspace_id: workspace.id }]
            : [];
    const object = route
      .request()
      .headers()
      .accept?.includes("vnd.pgrst.object");
    await route.fulfill({ json: object ? (rows[0] ?? null) : rows });
  });
  await page.route(
    (url) => url.pathname.startsWith("/api/"),
    (route) => route.fulfill({ json: { data: [] } }),
  );
  await page.goto("/inbox");
  await expect.poll(() => contactLoads).toBeGreaterThan(0);
  // Let the initial async hydration finish; no realtime or polling events are delivered.
  await expect.poll(() => Date.now() - lastContactAt).toBeGreaterThan(500);
  expect(contactLoads).toBe(1);
});

test("switching finance views preserves totals and does not reload the summary", async ({
  page,
}) => {
  await page.addInitScript(() =>
    localStorage.setItem("mend.interface-language", "en-US"),
  );
  let summaries = 0;
  let cashLoads = 0;
  let holdRevalidation = false;
  let releaseRevalidation!: () => void;
  const revalidation = new Promise<void>((resolve) => {
    releaseRevalidation = resolve;
  });
  await page.route("**/api/finance/**", async (route) => {
    const endpoint = new URL(route.request().url()).pathname.split("/").pop();
    if (endpoint === "access")
      return route.fulfill({ json: { allowed: true } });
    if (endpoint === "provider-balances") {
      const provider = {
        status: "not_configured",
        scope: "provider_account",
        balances: null,
        payouts: [],
      };
      return route.fulfill({
        json: {
          checkedAt: new Date().toISOString(),
          providers: { stripe: provider, abacatepay: provider },
        },
      });
    }
    if (endpoint === "zelo")
      return route.fulfill({
        json: {
          period: new URL(route.request().url()).searchParams.get("period"),
          checkedAt: new Date().toISOString(),
          providers: { stripe: "not_configured", abacatepay: "not_configured" },
          rows: [],
          totals: [],
        },
      });
    if (endpoint === "summary") {
      summaries++;
      if (holdRevalidation) await revalidation;
      else await new Promise((resolve) => setTimeout(resolve, 700));
      return route.fulfill({
        json: {
          income: 123456,
          expenses: 0,
          received: 0,
          paid: 0,
          estimated_count: 0,
          unknown_count: 0,
          reference_pending: 0,
          review: null,
        },
      });
    }
    if (endpoint === "settlements") cashLoads++;
    await new Promise((resolve) => setTimeout(resolve, 700));
    await route.fulfill({ json: { data: [], nextOffset: null } });
  });
  await page.goto("/financeiro?demo=1");
  const total = page.getByText(/1,234\.56/).first();
  await expect(total).toBeVisible();
  const initialSummaries = summaries;
  await page.getByRole("tab", { name: "Cash movements", exact: true }).click();
  await expect(total).toBeVisible();
  await expect.poll(() => cashLoads).toBeGreaterThan(0);
  expect(summaries).toBe(initialSummaries);

  // Re-entering finance is a route transition, distinct from a ledger tab.
  await page.locator('a[href^="/issues"]:visible').first().click();
  await expect(page).toHaveURL(/\/issues/);
  await expect(
    page.getByRole("heading", { name: "Issues", exact: true }),
  ).toBeVisible();
  if (!(await page.locator('a[href^="/financeiro"]:visible').count()))
    await page.getByRole("button", { name: "More", exact: true }).click();
  holdRevalidation = true;
  try {
    await page.locator('a[href^="/financeiro"]:visible').first().click();
    await expect.poll(() => summaries).toBeGreaterThan(initialSummaries);
    // The fresh summary cannot finish until released: only cached figures
    // can satisfy this assertion, regardless of CPU or scheduler latency.
    await expect(total).toBeVisible();
  } finally {
    releaseRevalidation();
  }
});
