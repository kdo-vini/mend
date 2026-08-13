import { expect, test } from "@playwright/test";

test("mobile run deep links expose a vertical case chain and current action", async ({
  page,
}) => {
  await page.addInitScript(() => {
    window.localStorage.setItem("mend.interface-language", "en-US");
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/agent-runs?demo=1&run=run-204");

  await expect(page).toHaveURL(/demo=1.*run=run-204/);
  await expect(page.getByRole("heading", { name: /TEC-24/ })).toBeVisible();
  await expect(page.getByText("68%", { exact: true }).first()).toBeVisible();
  const progress = page.getByRole("list", { name: "Case progress" });
  await expect(progress).toHaveCSS("flex-direction", "column");
  await expect(page.getByText("Current stage", { exact: true })).toBeVisible();
  await expect(page.getByText("investigation", { exact: true })).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Cancel run", exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(() => document.body.scrollWidth),
  ).toBeLessThanOrEqual(390);
});
