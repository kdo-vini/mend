import { expect, test } from "@playwright/test";

test("approved workspace surfaces preserve navigation and settings typography in both themes", async ({
  page,
}, info) => {
  await page.addInitScript(() => {
    localStorage.setItem("mend.interface-language", "pt-BR");
  });
  for (const theme of ["light", "dark"]) {
    for (const route of [
      "dashboard",
      "inbox",
      "issues",
      "settings/integrations",
    ]) {
      await page.goto(`/${route}?demo=1`);
      await expect(page.locator("h1")).toBeVisible();
      await page.evaluate((value) => {
        document.documentElement.dataset.theme = value;
      }, theme);
      await page.evaluate(() => document.fonts.ready);
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth > innerWidth,
        ),
      ).toBe(false);
      if (route === "dashboard") {
        await expect(page.locator(".dashboard-links")).toBeVisible();
        await expect(page.locator(".finance-summary")).toHaveCount(0);
      }
      if (route === "inbox") {
        await expect(page.locator(".conversation-row").first()).toBeVisible();
        expect(
          await page
            .locator(".conversation-row")
            .first()
            .evaluate((row) => {
              const rail = row
                .closest(".conversation-rail")!
                .getBoundingClientRect();
              const bounds = row.getBoundingClientRect();
              return bounds.left >= rail.left && bounds.right <= rail.right;
            }),
        ).toBe(true);
      }
      if (route.startsWith("settings")) {
        const label = page.locator(".settings-v2-nav-group-label").first();
        const typography = await label.evaluate((element) => {
          const style = getComputedStyle(element);
          return {
            family: style.fontFamily,
            transform: style.textTransform,
            spacing: style.letterSpacing,
          };
        });
        expect(typography.family).toContain("Inter");
        expect(typography.transform).toBe("none");
        expect(typography.spacing).toBe("normal");
      }
      await page.screenshot({
        path: info.outputPath(`${route.replaceAll("/", "-")}-${theme}.png`),
        fullPage: true,
        animations: "disabled",
      });
    }
  }
});
