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
  const trigger = page.locator(".inbox-context-trigger");
  await expect(
    page.getByRole("button", { name: "Open case context" }),
  ).toBeVisible();
  const triggerBox = await trigger.boundingBox();
  expect(triggerBox?.width).toBeGreaterThanOrEqual(44);
  expect(triggerBox?.height).toBeGreaterThanOrEqual(44);
  await expect(trigger).toHaveAttribute("aria-controls", "inbox-case-context");
  await trigger.focus();
  await page.keyboard.press("Enter");
  await expect(trigger).toHaveAttribute("aria-expanded", "true");
  const context = page.getByRole("complementary", { name: "Case context" });
  await expect(context).toHaveAttribute("id", "inbox-case-context");
  await expect(context).toBeVisible();
  const close = page.getByRole("button", { name: "Close case context" });
  await expect(close).toBeFocused();
  const closeBox = await close.boundingBox();
  expect(closeBox?.width).toBeGreaterThanOrEqual(44);
  expect(closeBox?.height).toBeGreaterThanOrEqual(44);
  await page.keyboard.press("Tab");
  await expect(context.locator(":focus")).toHaveCount(1);
  await expect(page.locator("#root")).toHaveAttribute("aria-hidden", "true");
  await page.keyboard.press("Escape");
  await expect(context).toBeHidden();
  await expect(trigger).toHaveAttribute("aria-expanded", "false");
  await expect(trigger).toBeFocused();

  await trigger.click();
  const closeAfterReopen = page.getByRole("button", {
    name: "Close case context",
  });
  await expect(closeAfterReopen).toBeFocused();
  await closeAfterReopen.click();
  await expect(context).toBeHidden();
  await expect(trigger).toBeFocused();
  await expect(page.getByPlaceholder("Write a reply…")).toBeVisible();
  expect(
    await page.evaluate(() => document.body.scrollWidth),
  ).toBeLessThanOrEqual(390);
});

test("compact Inbox traps and restores focus while case context is modal", async ({
  page,
}) => {
  await page.setViewportSize({ width: 900, height: 800 });
  await page.goto("/inbox?demo=1");
  const trigger = page.locator(".inbox-context-trigger");
  await expect(
    page.getByRole("button", { name: "Open case context" }),
  ).toBeVisible();
  const context = page.getByRole("complementary", { name: "Case context" });

  await expect(trigger).toHaveAttribute("aria-controls", "inbox-case-context");
  await trigger.click();
  await expect(
    page.getByRole("button", { name: "Close case context" }),
  ).toBeFocused();
  await expect(page.locator("#root")).toHaveAttribute("aria-hidden", "true");
  await page.keyboard.press("Shift+Tab");
  await expect(context.locator(":focus")).toHaveCount(1);
  await page.keyboard.press("Escape");
  await expect(context).toBeHidden();
  await expect(trigger).toBeFocused();
});
