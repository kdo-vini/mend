import { expect, test } from "@playwright/test";

test("solo founder can follow a triaged customer case into its run and back", async ({
  page,
}) => {
  await page.addInitScript(() => {
    window.localStorage.setItem("mend.interface-language", "en-US");
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/issues/TEC-24?demo=1");
  await expect(
    page.getByText("TEC-24", { exact: false }).first(),
  ).toBeVisible();
  await page.getByRole("button", { name: /Propose fix/ }).click();
  await expect(page).toHaveURL(/\/agent-runs\?run=run-204/);
  await expect(page.getByText("Current stage", { exact: true })).toBeVisible();
  await expect(page.getByText(/68%|investigation/).first()).toBeVisible();
  await page.getByRole("button", { name: "Open issue" }).click();
  await expect(page).toHaveURL(/\/issues\/TEC-24/);
  await expect(
    page.getByText("TEC-24", { exact: false }).first(),
  ).toBeVisible();
  await page.getByRole("button", { name: /Cliente Exemplo/ }).click();
  await expect(page).toHaveURL(/\/inbox\?conversation=/);
  await expect(page.getByPlaceholder("Write a reply…")).toBeVisible();
  expect(
    await page.evaluate(() => document.body.scrollWidth),
  ).toBeLessThanOrEqual(390);
});

test("the mobile journey entry points keep a comfortable touch target", async ({
  page,
}) => {
  await page.addInitScript(() => {
    window.localStorage.setItem("mend.interface-language", "en-US");
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/inbox?demo=1");

  for (const name of ["Notifications", "Search workspace"]) {
    const box = await page
      .locator(".mobile-topbar")
      .getByRole("button", { name })
      .boundingBox();
    expect(box, `${name} is rendered on mobile`).not.toBeNull();
    expect(box!.width, `${name} width`).toBeGreaterThanOrEqual(44);
    expect(box!.height, `${name} height`).toBeGreaterThanOrEqual(44);
  }
});
