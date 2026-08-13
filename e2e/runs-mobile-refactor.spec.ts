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
  await expect(page.getByText("File read", { exact: true })).toBeVisible();
  const action = page.getByRole("button", { name: "Cancel run", exact: true });
  await expect(action).toBeInViewport();
  expect(
    await page.evaluate(() => document.body.scrollWidth),
  ).toBeLessThanOrEqual(390);
});

test("run selection preserves unrelated params and invalid links fall back", async ({
  page,
}) => {
  await page.addInitScript(() => {
    window.localStorage.setItem("mend.interface-language", "en-US");
  });
  await page.goto("/agent-runs?demo=1&source=review&run=missing");

  await expect(page.getByRole("heading", { name: /TEC-24/ })).toBeVisible();
  await page.getByRole("button", { name: /TEC-19/ }).click();
  await expect(page).toHaveURL(/demo=1/);
  await expect(page).toHaveURL(/source=review/);
  await expect(page).toHaveURL(/run=run-201/);
  await expect(page.getByRole("heading", { name: /TEC-19/ })).toBeVisible();
});

test("mobile supervision follows the real Portuguese locale", async ({
  page,
}) => {
  await page.addInitScript(() => {
    window.localStorage.setItem("mend.interface-language", "pt-BR");
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/agent-runs?demo=1&run=run-204");

  await expect(page.getByText("Etapa atual", { exact: true })).toBeVisible();
  await expect(page.getByText("investigação", { exact: true })).toBeVisible();
  await expect(page.getByText("Arquivo lido", { exact: true })).toBeVisible();
});

test("case-only records expose investigation without agent run actions", async ({
  page,
}) => {
  await page.addInitScript(() => {
    window.localStorage.setItem("mend.interface-language", "en-US");
  });
  await page.goto("/agent-runs?demo=1&run=case:case-198");

  await expect(page.getByRole("heading", { name: /TEC-18/ })).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Start investigation", exact: true }),
  ).toHaveCount(1);
  await expect(
    page.getByRole("button", { name: "Retry this run", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Cancel run", exact: true }),
  ).toHaveCount(0);
});
