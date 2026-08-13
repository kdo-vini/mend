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

test("settings opens as a compact outcome-oriented hub", async ({ page }) => {
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
      .selectOption("/settings/engineering/agents/providers");
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
      page.getByRole("link", { name: "Agents & models", exact: true }),
    ).toBeVisible();
    await expect(page.getByRole("link", { name: "GitHub" })).toHaveCount(0);
    await page
      .getByRole("link", { name: "Agents & models", exact: true })
      .click();
  }
  await expect(page).toHaveURL(
    /\/settings\/engineering\/agents\/providers\?demo=1/,
  );
  await expect(
    page.getByRole("heading", { name: "Coding connections" }),
  ).toBeVisible();
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
    .selectOption("/settings/automation/replies");
  await expect(page).toHaveURL(/\/settings\/automation\/replies\?demo=1/);
  await expect(page.getByText("No workspace selected")).toBeVisible();
  await expect(page.getByText("Loading AI policy…")).toHaveCount(0);

  const selectorHeight = await page
    .getByLabel("Settings section")
    .evaluate((element) => element.getBoundingClientRect().height);
  expect(selectorHeight).toBeGreaterThanOrEqual(44);

  const bodyWidth = await page.evaluate(() => document.body.scrollWidth);
  expect(bodyWidth).toBeLessThanOrEqual(390);
});

test("settings uses the selected language for coding connections", async ({
  page,
}) => {
  await page.addInitScript(() => {
    window.localStorage.setItem("mend.interface-language", "pt-BR");
  });
  await page.goto("/settings/engineering/agents/providers?demo=1");

  await expect(
    page.getByRole("heading", { name: "Conexões de coding" }),
  ).toBeVisible();
  await expect(
    page.getByText("Connected providers", { exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByText(
      "Verify access and refresh the catalog before using a connection in routing.",
      { exact: true },
    ),
  ).toHaveCount(0);
});

test("legacy coding connections redirects to the canonical agents route", async ({
  page,
}) => {
  await page.goto(
    "/settings/engineering/coding/connections?demo=1&source=bookmark",
  );

  await expect(page).toHaveURL(
    /\/settings\/engineering\/agents\/providers\?demo=1&source=bookmark/,
  );
  await expect(
    page.getByRole("heading", { name: "Coding connections" }),
  ).toBeVisible();
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
      await expect(page.getByLabel("Settings section")).toBeVisible();
    } else {
      await expect(
        page.getByRole("link", { name: "Automation", exact: true }),
      ).toBeVisible();
    }
  }
});
