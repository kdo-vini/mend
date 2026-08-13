import { expect, test, type Page } from "@playwright/test";

const englishInterface = async (page: Page) => {
  await page.addInitScript(() => {
    window.localStorage.setItem("mend.interface-language", "en-US");
  });
};

test("solo founder can follow a triaged customer case into its run and back", async ({
  page,
}) => {
  await englishInterface(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/issues/TEC-24?demo=1");
  await expect(
    page.getByText("TEC-24", { exact: false }).first(),
  ).toBeVisible();

  await page.getByRole("button", { name: /Propose fix/ }).click();
  await expect(page).toHaveURL(/\/agent-runs\?/);
  await expect(page).toHaveURL(/demo=1/);
  await expect(page).toHaveURL(/run=run-204/);
  await expect(page.getByText("Current stage", { exact: true })).toBeVisible();
  await expect(page.getByText(/68%|investigation/).first()).toBeVisible();

  await page.getByRole("button", { name: "Open issue" }).click();
  await expect(
    page.getByRole("button", { name: "Close issue inspector" }),
  ).toBeVisible();
  await expect(page).toHaveURL(/run=run-204/);

  await page.getByRole("button", { name: "Open full issue" }).click();
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

test("desktop keeps the run beside the issue it opens", async ({ page }) => {
  await englishInterface(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/agent-runs?demo=1&run=run-204");
  await expect(page.getByRole("heading", { name: /TEC-24/ })).toBeVisible();

  await page.getByRole("button", { name: "Open issue" }).click();
  await expect(
    page.getByRole("button", { name: "Close issue inspector" }),
  ).toBeVisible();
  await expect(page).toHaveURL(/\/agent-runs\?demo=1&run=run-204/);
  await expect(page.getByRole("button", { name: /TEC-19/ })).toBeVisible();

  const inspector = await page.locator(".issue-inspector").boundingBox();
  expect(inspector).not.toBeNull();
  expect(inspector!.width).toBeLessThan(1440);

  await page.getByRole("button", { name: "Close issue inspector" }).click();
  await expect(page.getByRole("heading", { name: /TEC-24/ })).toBeVisible();
});

test("the issue inspector owns the whole screen on mobile widths", async ({
  page,
}) => {
  await englishInterface(page);
  await page.setViewportSize({ width: 600, height: 844 });
  await page.goto("/agent-runs?demo=1&run=run-204");
  await page.getByRole("button", { name: "Open issue" }).click();
  await expect(
    page.getByRole("button", { name: "Close issue inspector" }),
  ).toBeVisible();

  const inspector = await page.locator(".issue-inspector").boundingBox();
  expect(inspector).not.toBeNull();
  expect(inspector!.width).toBeGreaterThan(599);
});

test("outbound replies stay inside the mobile message canvas", async ({
  page,
}) => {
  await englishInterface(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/inbox?demo=1&conversation=conv-cliente-exemplo");
  await expect(page.getByPlaceholder("Write a reply…")).toBeVisible();

  const geometry = await page.evaluate(() => {
    const canvas = document.querySelector(".message-canvas");
    const bubble = document.querySelector(
      ".message-row.outbound .message-bubble",
    );
    if (!canvas || !bubble) return null;
    return {
      canvasRight: canvas.getBoundingClientRect().right,
      bubbleRight: bubble.getBoundingClientRect().right,
      canvasScrollWidth: canvas.scrollWidth,
      canvasClientWidth: canvas.clientWidth,
    };
  });
  expect(geometry, "the outbound reply is rendered").not.toBeNull();
  expect(geometry!.bubbleRight).toBeLessThanOrEqual(geometry!.canvasRight);
  expect(geometry!.canvasScrollWidth).toBeLessThanOrEqual(
    geometry!.canvasClientWidth,
  );
});

test("the mobile journey entry points keep a comfortable touch target", async ({
  page,
}) => {
  await englishInterface(page);
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
