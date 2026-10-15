import { expect, test } from "@playwright/test";

test("mobile run deep links expose a vertical case chain and current action", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/agent-runs?demo=1&run=run-204");

  await expect(page).toHaveURL(/demo=1.*run=run-204/);
  await expect(page.getByRole("heading", { name: /TEC-24/ })).toBeVisible();
  await expect(page.getByText("68%", { exact: true }).first()).toBeVisible();
  const progress = page.getByRole("list", { name: "Progresso do caso" });
  await expect(progress).toHaveCSS("flex-direction", "column");
  await expect(page.getByText("Etapa atual", { exact: true })).toBeVisible();
  await expect(page.getByText("investigação", { exact: true })).toBeVisible();
  await expect(page.getByText("Arquivo lido", { exact: true })).toBeVisible();
  const action = page.getByRole("button", {
    name: "Cancelar execução",
    exact: true,
  });
  await expect(action).toBeInViewport();
  expect(
    await page.evaluate(() => document.body.scrollWidth),
  ).toBeLessThanOrEqual(390);
});

test("run selection preserves unrelated params and invalid links fall back", async ({
  page,
}) => {
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
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/agent-runs?demo=1&run=run-204");

  await expect(page.getByText("Etapa atual", { exact: true })).toBeVisible();
  await expect(page.getByText("investigação", { exact: true })).toBeVisible();
  await expect(page.getByText("Arquivo lido", { exact: true })).toBeVisible();
});

test("desktop keeps Run again as a secondary terminal action", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "desktop");
  await page.goto("/agent-runs?demo=1&run=run-201");

  await expect(page.getByRole("heading", { name: /TEC-19/ })).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Executar novamente", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Aprovar commit local", exact: true }),
  ).toBeVisible();
});

test("mobile keeps only the current authorized terminal actions", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "mobile");
  await page.goto("/agent-runs?demo=1&run=run-201");

  await expect(
    page.getByRole("button", { name: "Executar novamente", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Aprovar commit local", exact: true }),
  ).toBeInViewport();
});

test("run-198 remains the failed agent run deep link", async ({ page }) => {
  await page.goto("/agent-runs?demo=1&run=run-198");

  await expect(page.getByRole("heading", { name: /TEC-18/ })).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Tentar novamente", exact: true }),
  ).toHaveCount(1);
  await expect(
    page.getByRole("button", { name: "Iniciar investigação", exact: true }),
  ).toHaveCount(0);
});
