import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.setItem("mend.interface-language", "en-US");
  });
});

test("desktop Inbox keeps active case context beside the conversation", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/inbox?demo=1");
  const context = page.getByRole("complementary", { name: "Case context" });
  await expect(context).toBeVisible();
  await expect(context.getByText("TEC-24", { exact: false })).toBeVisible();
  await expect(context.getByText("Next action", { exact: true })).toBeVisible();
});

test("mobile founder can open context and return to the reply composer", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/inbox?demo=1");
  await page
    .getByRole("button", { name: /Open conversation with/ })
    .first()
    .click();
  const trigger = page.getByRole("button", { name: "Open case context" });
  const triggerBox = await trigger.boundingBox();
  expect(triggerBox?.width).toBeGreaterThanOrEqual(44);
  expect(triggerBox?.height).toBeGreaterThanOrEqual(44);
  await trigger.click();
  await expect(trigger).toHaveAttribute("aria-expanded", "true");
  const context = page.getByRole("complementary", { name: "Case context" });
  await expect(context).toBeVisible();
  const close = page.getByRole("button", { name: "Close case context" });
  const closeBox = await close.boundingBox();
  expect(closeBox?.width).toBeGreaterThanOrEqual(44);
  expect(closeBox?.height).toBeGreaterThanOrEqual(44);
  await close.click();
  await expect(context).toBeHidden();
  await expect(trigger).toHaveAttribute("aria-expanded", "false");
  await expect(page.getByPlaceholder("Write a reply…")).toBeVisible();
  expect(
    await page.evaluate(() => document.body.scrollWidth),
  ).toBeLessThanOrEqual(390);
});
