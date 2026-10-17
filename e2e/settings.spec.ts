import { expect, test } from "@playwright/test";

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

test("settings opens as a compact outcome-oriented hub", async ({ page }) => {
  await page.goto("/settings?demo=1");

  await expect(
    page.getByRole("heading", { name: "Configurações do espaço de trabalho" }),
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
    await expect(page.getByLabel("Seção de configurações")).toBeVisible();
    await page
      .getByLabel("Seção de configurações")
      .selectOption("/settings/engineering/agents/issues/providers");
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
      page.getByRole("link", { name: "Agentes e modelos", exact: true }),
    ).toBeVisible();
    await expect(page.getByRole("link", { name: "GitHub" })).toHaveCount(0);
    await page
      .getByRole("link", { name: "Agentes e modelos", exact: true })
      .click();
  }
  await expect(page).toHaveURL(
    /\/settings\/engineering\/agents\/issues\/providers\?demo=1/,
  );
  await expect(
    page.getByRole("heading", { name: "Agentes e modelos" }),
  ).toBeVisible();
  await expect(page.getByRole("link", { name: "Provedores" })).toHaveAttribute(
    "aria-current",
    "page",
  );
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

  await expect(page.getByLabel("Seção de configurações")).toBeVisible();
  await expect(page.locator(".settings-v2-nav")).toBeHidden();

  await page
    .getByLabel("Seção de configurações")
    .selectOption("/settings/automation/replies");
  await expect(page).toHaveURL(/\/settings\/automation\/replies\?demo=1/);
  await expect(
    page.getByText("Nenhum espaço de trabalho selecionado"),
  ).toBeVisible();
  await expect(page.getByText("Carregando política da IA…")).toHaveCount(0);

  const selectorHeight = await page
    .getByLabel("Seção de configurações")
    .evaluate((element) => element.getBoundingClientRect().height);
  expect(selectorHeight).toBeGreaterThanOrEqual(44);

  const bodyWidth = await page.evaluate(() => document.body.scrollWidth);
  expect(bodyWidth).toBeLessThanOrEqual(390);
});

test("the mobile settings selector sits directly above its content", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/settings?demo=1");
  await expect(page.getByLabel("Seção de configurações")).toBeVisible();

  const gap = await page.evaluate(() => {
    const shell = document.querySelector(".settings-v2-shell");
    const sidebar = shell?.querySelector(".settings-v2-sidebar");
    const content = shell?.querySelector(".settings-v2-content");
    if (!shell || !sidebar || !content) return null;
    return (
      content.getBoundingClientRect().top -
      sidebar.getBoundingClientRect().bottom
    );
  });
  expect(gap, "the settings sidebar and content are rendered").not.toBeNull();
  expect(gap!).toBeGreaterThan(0);
  expect(gap!).toBeLessThanOrEqual(32);
});

test("desktop settings keeps its two-column layout", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/settings?demo=1");

  const columns = await page
    .locator(".settings-v2-shell")
    .evaluate((element) => getComputedStyle(element).gridTemplateColumns);
  expect(columns.split(" ")).toHaveLength(2);

  const rows = await page.evaluate(() => {
    const shell = document.querySelector(".settings-v2-shell");
    const sidebar = shell?.querySelector(".settings-v2-sidebar");
    const content = shell?.querySelector(".settings-v2-content");
    if (!sidebar || !content) return null;
    return {
      sidebarTop: sidebar.getBoundingClientRect().top,
      contentTop: content.getBoundingClientRect().top,
    };
  });
  expect(rows).not.toBeNull();
  expect(rows!.sidebarTop).toBe(rows!.contentTop);
});

test("settings uses the selected language for providers", async ({ page }) => {
  await page.goto("/settings/engineering/agents/providers?demo=1");

  await expect(
    page.getByRole("heading", { name: "Agentes e modelos" }),
  ).toBeVisible();
  await expect(
    page.getByText("Provedores conectados", { exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByText(
      "Verify access and refresh the catalog before using a connection in routing.",
      { exact: true },
    ),
  ).toHaveCount(0);
});

test("legacy provider connections redirects to the canonical agents route", async ({
  page,
}) => {
  await page.goto(
    "/settings/engineering/coding/connections?demo=1&source=bookmark",
  );

  await expect(page).toHaveURL(
    /\/settings\/engineering\/agents\/issues\/providers\?demo=1&source=bookmark/,
  );
  await expect(
    page.getByRole("heading", { name: "Agentes e modelos" }),
  ).toBeVisible();
});

test("canonical automation routes select their matching decision tabs", async ({
  page,
}) => {
  await page.goto("/settings/automation/replies?demo=1");
  await expect(page.getByRole("link", { name: "Respostas" })).toHaveAttribute(
    "aria-current",
    "page",
  );

  await page.goto("/settings/automation/intake?demo=1");
  await expect(
    page.getByRole("link", { name: "Coleta inicial" }),
  ).toHaveAttribute("aria-current", "page");

  await page.goto("/settings/automation/flows?demo=1&source=bookmark");
  await expect(page).toHaveURL(
    /\/settings\/automation\/intake\?demo=1&source=bookmark/,
  );
  await expect(
    page.getByRole("link", { name: "Coleta inicial" }),
  ).toHaveAttribute("aria-current", "page");
});

test("nested sibling routes expose their computed navigation item as current", async ({
  page,
}) => {
  const currentItem = page.locator(
    ".settings-v2-nav-item[aria-current='page']",
  );

  await page.goto("/settings/automation/intake?demo=1");
  await expect(currentItem).toHaveText("Automação");

  await page.goto("/settings/engineering/agents/run-policy?demo=1");
  await expect(currentItem).toHaveText("Agentes e modelos");
});

test("settings taxonomy remains usable in light and dark themes", async ({
  page,
}) => {
  for (const theme of ["light", "dark"] as const) {
    await page.goto("/settings?demo=1");
    await page.evaluate((nextTheme) => {
      window.localStorage.setItem("mend.theme", nextTheme);
    }, theme);
    await page.reload();

    await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
    if (test.info().project.name === "mobile") {
      await expect(page.getByLabel("Seção de configurações")).toBeVisible();
    } else {
      await expect(
        page.getByRole("link", { name: "Automação", exact: true }),
      ).toBeVisible();
    }
  }
});
