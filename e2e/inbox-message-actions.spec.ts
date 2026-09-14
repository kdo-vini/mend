import { expect, test } from "@playwright/test";

const phone = { width: 393, height: 852 };

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.setItem("mend.interface-language", "en-US");
  });
});

/**
 * An outbound bubble's action menu opens from a trigger sitting well left of
 * the screen edge, and the menu is right-anchored to it. Without a viewport
 * clamp the menu ran off the left edge on a phone and its labels — Edit,
 * Cancel, Retry — were unreadable, which is the only way back from a failed
 * send.
 */
test("the message action menu opens fully inside a phone viewport", async ({
  page,
}) => {
  await page.setViewportSize(phone);
  await page.goto("/inbox?demo=1");
  await page
    .getByRole("button", { name: /Open conversation with/ })
    .first()
    .click();
  const trigger = page
    .locator(".message-row.outbound")
    .last()
    .locator('[aria-haspopup="menu"]');
  await trigger.scrollIntoViewIfNeeded();
  await trigger.click();

  const menu = page.locator('[role="menu"].row-actions-menu');
  await expect(menu).toBeVisible();
  const box = await menu.boundingBox();
  expect(box).not.toBeNull();
  expect(box!.x).toBeGreaterThanOrEqual(0);
  expect(box!.x + box!.width).toBeLessThanOrEqual(phone.width);
  expect(box!.y).toBeGreaterThanOrEqual(0);
  expect(box!.y + box!.height).toBeLessThanOrEqual(phone.height);
});
