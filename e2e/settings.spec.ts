import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.setItem("mend.interface-language", "en-US");
  });
});

test("settings keeps the standard workspace page frame", async ({ page }) => {
  await page.goto("/settings?demo=1");
  const settingsFrame = await page
    .locator(".settings-v2-shell")
    .evaluate((element) => {
      const style = getComputedStyle(element);
      return {
        paddingBlockStart: style.paddingBlockStart,
        paddingInlineStart: style.paddingInlineStart,
      };
    });

  await page.goto("/issues?demo=1");
  const standardFrame = await page.locator(".page").evaluate((element) => {
    const style = getComputedStyle(element);
    return {
      paddingBlockStart: style.paddingBlockStart,
      paddingInlineStart: style.paddingInlineStart,
    };
  });

  expect(settingsFrame).toEqual(standardFrame);
});

test("settings opens as a domain hub and keeps repositories focused", async ({
  page,
}) => {
  await page.goto("/settings?demo=1");

  await expect(
    page.getByRole("heading", { name: "Workspace settings" }),
  ).toBeVisible();
  if (test.info().project.name === "mobile") {
    await expect(page.locator(".settings-v2-shell")).toHaveCSS(
      "padding-left",
      "13px",
    );
    await expect(page.locator(".settings-v2-shell")).toHaveCSS(
      "padding-top",
      "16px",
    );
    await expect(page.getByLabel("Settings section")).toBeVisible();
    await page
      .getByLabel("Settings section")
      .selectOption("/settings/engineering/repositories");
  } else {
    await expect(page.locator(".settings-v2-shell")).toHaveCSS(
      "padding-left",
      "34px",
    );
    await expect(page.locator(".settings-v2-shell")).toHaveCSS(
      "padding-top",
      "29px",
    );
    await expect(
      page.getByRole("link", { name: "Coding connections", exact: true }),
    ).toBeVisible();
    await page.getByRole("link", { name: "Repositories", exact: true }).click();
  }
  await expect(page).toHaveURL(/\/settings\/engineering\/repositories\?demo=1/);
  await expect(
    page.getByRole("heading", { name: "Repositories" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Coding connections" }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("heading", { name: "Routing by coding stage" }),
  ).toHaveCount(0);
});

test("legacy repository tab links to the focused repository route", async ({
  page,
}) => {
  await page.goto("/settings?tab=repositories&demo=1");
  await expect(page).toHaveURL(/\/settings\/engineering\/repositories\?demo=1/);
});

test("settings navigation becomes a compact mobile selector", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/settings?demo=1");

  await expect(page.getByLabel("Settings section")).toBeVisible();
  await expect(page.locator(".settings-v2-nav")).toBeHidden();

  await page
    .getByLabel("Settings section")
    .selectOption("/settings/engineering/repositories");
  await expect(page).toHaveURL(/\/settings\/engineering\/repositories\?demo=1/);
  await expect(page.getByText("No workspace selected")).toBeVisible();
  await expect(page.getByText("Loading repositories…")).toHaveCount(0);

  const bodyWidth = await page.evaluate(() => document.body.scrollWidth);
  expect(bodyWidth).toBeLessThanOrEqual(390);
});
