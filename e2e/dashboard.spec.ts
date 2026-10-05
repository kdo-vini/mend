import { expect, test } from "@playwright/test";

test("internal dashboard keeps WhatsApp navigation usable in both languages and viewports", async ({
  page,
}, testInfo) => {
  for (const locale of ["pt-BR", "en-US"] as const) {
    await page.addInitScript((language) => {
      window.localStorage.setItem("mend.interface-language", language);
    }, locale);
    await page.setViewportSize(
      testInfo.project.name === "mobile"
        ? { width: 390, height: 844 }
        : { width: 1366, height: 768 },
    );
    await page.goto("/dashboard?demo=1");
    await expect(
      page.getByRole("heading", {
        name: locale === "pt-BR" ? "Dashboard Diagium" : "Diagium dashboard",
      }),
    ).toBeVisible();
    const whatsapp = page
      .locator(".dashboard-links")
      .getByRole("link", { name: /WhatsApp/ });
    await expect(whatsapp).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth > window.innerWidth,
      ),
    ).toBe(false);
    await whatsapp.focus();
    await expect(whatsapp).toBeFocused();
    await page.screenshot({
      path: testInfo.outputPath(`dashboard-${locale}.png`),
      fullPage: true,
    });
    await whatsapp.click();
    await expect(page).toHaveURL(/\/inbox$/);
    await expect(page.locator(".inbox-page")).toBeVisible();
  }
});
