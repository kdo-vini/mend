import { expect, test } from "@playwright/test";

const productionBaseUrl = process.env.MEND_PRODUCTION_BASE_URL?.trim();

test.describe("production smoke", () => {
  test.skip(!productionBaseUrl, "MEND_PRODUCTION_BASE_URL is required");

  test("health and readiness endpoints are healthy", async ({ request }) => {
    expect((await request.get(`${productionBaseUrl}/api/health`)).ok()).toBe(
      true,
    );
    expect((await request.get(`${productionBaseUrl}/api/ready`)).ok()).toBe(
      true,
    );
  });

  // Read-only coverage: no login, credentials, or workspace writes.
  test("internal sign-in renders in Portuguese without overflow", async ({
    page,
  }) => {
    await page.goto(`${productionBaseUrl}/`);
    await expect(
      page.getByRole("heading", { name: "Entrar no Mend" }),
    ).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth > window.innerWidth,
      ),
    ).toBe(false);
  });
});
