import { expect, test } from "@playwright/test";

test("internal dashboard keeps WhatsApp navigation usable across viewports", async ({
  page,
}, testInfo) => {
  await page.setViewportSize(
    testInfo.project.name === "mobile"
      ? { width: 390, height: 844 }
      : { width: 1366, height: 768 },
  );
  await page.goto("/dashboard?demo=1");
  await expect(
    page.getByRole("heading", {
      name: "Dashboard Diagium",
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
    path: testInfo.outputPath(`dashboard-pt-BR.png`),
    fullPage: true,
  });
  await whatsapp.click();
  await expect(page).toHaveURL(/\/inbox$/);
  await expect(page.locator(".inbox-page")).toBeVisible();
});
