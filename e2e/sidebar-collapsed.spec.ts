import { expect, test } from "@playwright/test";

test("collapsed sidebar keeps every control inside the rail and remembers its state", async ({
  page,
}, testInfo) => {
  test.skip(
    testInfo.project.name === "mobile",
    "phones replace the sidebar with the top bar",
  );
  // A short laptop viewport: the rail must still fit the footer and avatar.
  await page.setViewportSize({ width: 1366, height: 560 });
  await page.goto("/inbox?demo=1");
  await page.getByRole("button", { name: "Recolher barra lateral" }).click();
  await expect(page.locator(".app-shell")).toHaveClass(/sidebar-is-collapsed/);

  const overflowing = await page
    .locator(".app-shell .sidebar")
    .evaluate((sidebar) => {
      const rail = sidebar.getBoundingClientRect();
      return [
        ...sidebar.querySelectorAll<HTMLElement>(
          ".brand-row > *, .command-trigger, .nav-item, .sidebar-utilities .icon-button, .user-row",
        ),
      ]
        .filter((element) => element.offsetParent !== null)
        .filter((element) => {
          const box = element.getBoundingClientRect();
          return (
            box.left < rail.left ||
            box.right > rail.right ||
            box.top < rail.top ||
            box.bottom > rail.bottom
          );
        })
        .map((element) => element.className);
    });
  expect(overflowing).toEqual([]);

  // The availability popover opens beside the rail, over the page content.
  expect(
    await page
      .locator(".app-shell .sidebar")
      .evaluate((sidebar) => getComputedStyle(sidebar).zIndex),
  ).not.toBe("auto");

  await expect(
    page.locator(".primary-nav").getByRole("link", {
      name: "Caixa de entrada",
    }),
  ).toHaveAttribute("title", "Caixa de entrada");

  await page.reload();
  await expect(page.locator(".app-shell")).toHaveClass(/sidebar-is-collapsed/);
  await page.getByRole("button", { name: "Expandir barra lateral" }).click();
  await expect(page.locator(".app-shell")).not.toHaveClass(
    /sidebar-is-collapsed/,
  );
});
