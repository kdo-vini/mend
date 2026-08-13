import { expect, test } from "@playwright/test";

// Gate: with no MEND_PRODUCTION_BASE_URL, every test below is skipped before
// its fixtures (page, request) are ever created, so this file makes zero
// network requests — local or remote — when the variable is unset. This is
// intentionally evaluated once, at collection time, not inside a test body.
const productionBaseUrl = process.env.MEND_PRODUCTION_BASE_URL?.trim();

// Confirmed against src/features/marketing/LandingPage.tsx and the marketing
// locale bundles: the hero <h1> is two <span> children (titleLead +
// titleAccent) and the accessible name join inserts a single space between
// them, matching the already-passing assertion in e2e/mvp.spec.ts.
const heroHeading = {
  "en-US": "Your support loop, finally off your plate.",
  "pt-BR": "Seu loop de suporte, finalmente fora da sua cabeça.",
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

  // Read-only: the public landing at "/" is served to every visitor
  // regardless of session state (see AuthGate's publicLanding branch), so
  // this never touches sign-in, a workspace, or any authenticated route.
  test("published landing renders the interactive case playback without page overflow", async ({
    page,
  }) => {
    await page.addInitScript(() => {
      window.localStorage.setItem("mend.interface-language", "en-US");
    });
    // Absolute URL: always targets productionBaseUrl, never the config's
    // local e2eBaseUrl. See the webServer note below for why this matters.
    await page.goto(`${productionBaseUrl}/`);

    await expect(
      page.getByRole("heading", { name: heroHeading["en-US"] }),
    ).toBeVisible();

    const playback = page.getByLabel("Interactive Mend case playback");
    await expect(playback).toBeVisible();
    await expect(playback).toHaveAttribute("data-scene", "signal");

    // Scene controls only change which part of the static demo specimen is
    // highlighted client-side; nothing here reaches WhatsApp, an issue, a
    // run, or any backend mutation.
    await page.getByRole("button", { name: "Investigate" }).click();
    await expect(playback).toHaveAttribute("data-scene", "investigate");

    await page.getByRole("button", { name: "Pause playback" }).click();
    await expect(playback).toHaveAttribute("data-playing", "false");

    const hasHorizontalOverflow = await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth,
    );
    expect(hasHorizontalOverflow).toBe(false);
  });

  // Read-only: locale is a client-side localStorage preference read by the
  // i18n bootstrap (src/i18n/index.ts) for every visitor, authenticated or
  // not, so this is legitimate unauthenticated coverage. Theme is
  // intentionally NOT exercised here: only the authenticated app shell
  // (src/App.tsx) ever sets document.documentElement.dataset.theme, so the
  // public landing always renders the single default (dark) palette and a
  // real light/dark toggle would not be genuine landing-page behavior.
  test("landing renders each supported locale with real, translated copy", async ({
    page,
  }) => {
    for (const locale of Object.keys(heroHeading) as Array<
      keyof typeof heroHeading
    >) {
      await page.addInitScript((nextLocale) => {
        window.localStorage.setItem("mend.interface-language", nextLocale);
      }, locale);
      await page.goto(`${productionBaseUrl}/`);

      await expect(
        page.getByRole("heading", { name: heroHeading[locale] }),
      ).toBeVisible();

      const background = await page.evaluate(
        () => getComputedStyle(document.body).backgroundColor,
      );
      expect(background).not.toBe("");
      expect(background).not.toBe("rgba(0, 0, 0, 0)");
      expect(background).not.toBe("transparent");
    }
  });
});
