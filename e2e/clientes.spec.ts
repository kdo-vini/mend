import { expect, test } from "@playwright/test";

test("clientes filters by stage and opens a client in demo mode", async ({
  page,
}) => {
  await page.goto("/clientes?demo=1");
  await expect(
    page.getByRole("heading", { name: "Clientes", level: 1 }),
  ).toBeVisible();

  const funnel = page.getByRole("group", { name: "Filtrar por estágio" });
  await funnel.getByRole("button", { name: /Ativo/ }).click();
  await expect(page).toHaveURL(/estagio=ativo/);
  await expect(funnel.getByRole("button", { name: /Ativo/ })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(
    page.getByRole("link", { name: "Dra. Marina Exemplo" }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Dra. Helena Exemplo" }),
  ).toHaveCount(0);

  await page.getByRole("link", { name: "Dra. Marina Exemplo" }).click();
  await expect(page).toHaveURL(/\/clientes\/demo-client-4/);
  await expect(
    page.getByRole("heading", { name: "Dra. Marina Exemplo", level: 1 }),
  ).toBeVisible();

  const horizontalOverflow = await page.evaluate(
    () => document.documentElement.scrollWidth > window.innerWidth,
  );
  expect(horizontalOverflow).toBe(false);
});
