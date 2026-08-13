import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.setItem("mend.interface-language", "en-US");
  });
});

test("desktop Knowledge opens a scan-first adjacent preview", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/knowledge?demo=1");
  await page
    .getByRole("button", { name: /Como lidar com pagamentos Pix pendentes/ })
    .click();
  await expect(
    page.getByRole("complementary", { name: "Article preview" }),
  ).toBeVisible();
  await expect(
    page.getByText("Available to AI", { exact: true }),
  ).toBeVisible();
  const collectionBox = await page
    .locator(".knowledge-collection")
    .boundingBox();
  const previewBox = await page.locator(".knowledge-preview").boundingBox();
  expect(collectionBox).not.toBeNull();
  expect(previewBox).not.toBeNull();
  expect(previewBox!.x).toBeGreaterThan(
    collectionBox!.x + collectionBox!.width,
  );
  expect(previewBox!.width).toBeGreaterThanOrEqual(300);
  expect(previewBox!.width).toBeLessThanOrEqual(380);
});

test("mobile Knowledge uses one column without horizontal overflow", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/knowledge?demo=1");
  await expect(page.locator(".knowledge-collection")).toBeVisible();
  expect(
    await page.evaluate(() => document.body.scrollWidth),
  ).toBeLessThanOrEqual(390);
});

test("mobile Knowledge moves focus into detail and restores it on Back", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/knowledge?demo=1");
  const article = page.getByRole("button", {
    name: /Como lidar com pagamentos Pix pendentes/,
  });

  await article.click();
  const back = page.getByRole("button", { name: "Back to articles" });
  await expect(back).toBeFocused();
  await expect(back).toHaveCSS("min-height", "44px");

  await back.click();
  await expect(article).toBeFocused();
});
