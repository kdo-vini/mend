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
  test("internal sign-in renders both supported locales without overflow", async ({
    page,
  }) => {
    for (const locale of ["pt-BR", "en-US"] as const) {
      await page.addInitScript((language) => {
        window.localStorage.setItem("mend.interface-language", language);
      }, locale);
      await page.goto(`${productionBaseUrl}/`);
      await expect(
        page.getByRole("heading", {
          name: locale === "pt-BR" ? "Entrar no Mend" : "Sign in to Mend",
        }),
      ).toBeVisible();
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth > window.innerWidth,
        ),
      ).toBe(false);
    }
  });
});
