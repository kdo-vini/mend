import { expect, test } from "@playwright/test";

// Gate: with no MEND_PRODUCTION_BASE_URL, every test below is skipped before
// its fixtures (page, request) are ever created, so this file makes zero
// network requests — local or remote — when the variable is unset. This is
// intentionally evaluated once, at collection time, not inside a test body.
const productionBaseUrl = process.env.MEND_PRODUCTION_BASE_URL?.trim();

// Mirrors the auth locale bundles (signInTitle in
// src/i18n/locales/*/auth.json): AuthGate renders the sign-in form on "/" for
// every visitor without a session.
const signInHeading = {
  "en-US": "Sign in to Mend",
  "pt-BR": "Entrar no Mend",
} as const;

test.describe("production smoke", () => {
  // Suite-level skip: when false, none of the tests in this describe ever
  // run, so none of their fixtures (page/request/browser) are created and no
  // request of any kind — local dev server, production, or otherwise — is
  // made. This is the entire safety gate for this file.
  test.skip(!productionBaseUrl, "MEND_PRODUCTION_BASE_URL is required");

  // Read-only: two unauthenticated GETs against published health/readiness
  // routes. No login, no state change, no write of any kind.
  test("health and readiness endpoints are healthy", async ({ request }) => {
    const health = await request.get(`${productionBaseUrl}/api/health`);
    expect(health.ok()).toBe(true);

    const ready = await request.get(`${productionBaseUrl}/api/ready`);
    expect(ready.ok()).toBe(true);
  });

  // Read-only: an unauthenticated GET of "/" renders AuthGate's sign-in form
  // once the session probe finds no session. Nothing is submitted, so this
  // never signs in, touches a workspace, or reaches an authenticated route.
  test("published root renders the sign-in form without page overflow", async ({
    page,
  }) => {
    await page.addInitScript(() => {
      window.localStorage.setItem("mend.interface-language", "en-US");
    });
    // Absolute URL: always targets productionBaseUrl, never the config's
    // local e2eBaseUrl.
    await page.goto(`${productionBaseUrl}/`);

    await expect(
      page.getByRole("heading", { name: signInHeading["en-US"] }),
    ).toBeVisible();
    await expect(page.getByRole("textbox", { name: "Email" })).toBeVisible();
    await expect(page.locator(".marketing-page")).toHaveCount(0);

    const hasHorizontalOverflow = await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth,
    );
    expect(hasHorizontalOverflow).toBe(false);
  });

  // Read-only: locale is a client-side localStorage preference read by the
  // i18n bootstrap (src/i18n/index.ts) for every visitor, authenticated or
  // not, so this is legitimate unauthenticated coverage. Theme is
  // intentionally NOT exercised here: only the authenticated app shell
  // (src/App.tsx) ever sets document.documentElement.dataset.theme.
  test("sign-in form renders each supported locale with real, translated copy", async ({
    page,
  }) => {
    for (const locale of Object.keys(signInHeading) as Array<
      keyof typeof signInHeading
    >) {
      await page.addInitScript((nextLocale) => {
        window.localStorage.setItem("mend.interface-language", nextLocale);
      }, locale);
      await page.goto(`${productionBaseUrl}/`);

      await expect(
        page.getByRole("heading", { name: signInHeading[locale] }),
      ).toBeVisible();
      await expect(page.locator(".marketing-page")).toHaveCount(0);

      const background = await page.evaluate(
        () => getComputedStyle(document.body).backgroundColor,
      );
      expect(background).not.toBe("");
      expect(background).not.toBe("rgba(0, 0, 0, 0)");
      expect(background).not.toBe("transparent");
    }
  });
});
