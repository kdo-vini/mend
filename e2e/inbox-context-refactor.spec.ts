import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.setItem("mend.interface-language", "en-US");
  });
});

test("desktop Inbox keeps active case context beside the conversation", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/inbox?demo=1");
  const context = page.getByRole("complementary", { name: "Case context" });
  await expect(context).toBeVisible();
  await expect(context.getByText("TEC-24", { exact: false })).toBeVisible();
  await expect(context.getByText("Next action", { exact: true })).toBeVisible();
});

test("mobile founder can open context and return to the reply composer", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/inbox?demo=1");
  await page
    .getByRole("button", { name: /Open conversation with/ })
    .first()
    .click();
  const trigger = page.locator(".inbox-context-trigger");
  await expect(
    page.getByRole("button", { name: "Open case context" }),
  ).toBeVisible();
  const triggerBox = await trigger.boundingBox();
  expect(triggerBox?.width).toBeGreaterThanOrEqual(44);
  expect(triggerBox?.height).toBeGreaterThanOrEqual(44);
  await expect(trigger).toHaveAttribute("aria-controls", "inbox-case-context");
  await trigger.focus();
  await page.keyboard.press("Enter");
  await expect(trigger).toHaveAttribute("aria-expanded", "true");
  const context = page.getByRole("complementary", { name: "Case context" });
  await expect(context).toHaveAttribute("id", "inbox-case-context");
  await expect(context).toBeVisible();
  const close = page.getByRole("button", { name: "Close case context" });
  await expect(close).toBeFocused();
  const closeBox = await close.boundingBox();
  expect(closeBox?.width).toBeGreaterThanOrEqual(44);
  expect(closeBox?.height).toBeGreaterThanOrEqual(44);
  await page.keyboard.press("Tab");
  await expect(context.locator(":focus")).toHaveCount(1);
  await expect(page.locator("#root")).toHaveAttribute("aria-hidden", "true");
  await page.keyboard.press("Escape");
  await expect(context).toBeHidden();
  await expect(trigger).toHaveAttribute("aria-expanded", "false");
  await expect(trigger).toBeFocused();

  await trigger.click();
  const closeAfterReopen = page.getByRole("button", {
    name: "Close case context",
  });
  await expect(closeAfterReopen).toBeFocused();
  await closeAfterReopen.click();
  await expect(context).toBeHidden();
  await expect(trigger).toBeFocused();
  await expect(page.getByPlaceholder("Write a reply…")).toBeVisible();
  expect(
    await page.evaluate(() => document.body.scrollWidth),
  ).toBeLessThanOrEqual(390);
});

for (const viewport of [
  { label: "desktop", width: 1440, height: 900 },
  { label: "mobile", width: 390, height: 844 },
]) {
  test(`${viewport.label} Inbox starts a chat instead of an issue`, async ({
    page,
  }) => {
    await page.setViewportSize({
      width: viewport.width,
      height: viewport.height,
    });
    await page.goto("/inbox?demo=1");
    await expect(page.getByRole("button", { name: "New issue" })).toHaveCount(
      0,
    );

    const trigger = page.getByRole("button", { name: "New chat" });
    await expect(trigger).toBeVisible();
    const triggerBox = await trigger.boundingBox();
    expect(triggerBox?.height).toBeGreaterThanOrEqual(
      viewport.label === "mobile" ? 44 : 32,
    );

    await trigger.click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await expect(
      dialog.getByText(
        "Messaging a number that never wrote to you first can get your WhatsApp account restricted.",
      ),
    ).toBeVisible();

    const submit = dialog.getByRole("button", { name: "Start conversation" });
    await expect(submit).toBeDisabled();
    await dialog.getByLabel("Phone number").fill("+55 11 99999-9999");
    await expect(submit).toBeDisabled();
    await dialog.getByLabel("First message").fill("Hello from Téchne");
    await expect(submit).toBeEnabled();
    await dialog.getByLabel("Phone number").fill("+55 11");
    await expect(submit).toBeDisabled();

    expect(
      await page.evaluate(() => document.body.scrollWidth),
    ).toBeLessThanOrEqual(viewport.width);

    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    await expect(trigger).toBeFocused();
    expect(
      await page.evaluate(() => document.body.scrollWidth),
    ).toBeLessThanOrEqual(viewport.width);
  });
}

test("compact Inbox traps and restores focus while case context is modal", async ({
  page,
}) => {
  await page.setViewportSize({ width: 900, height: 800 });
  await page.goto("/inbox?demo=1");
  const trigger = page.locator(".inbox-context-trigger");
  await expect(
    page.getByRole("button", { name: "Open case context" }),
  ).toBeVisible();
  const context = page.getByRole("complementary", { name: "Case context" });

  await expect(trigger).toHaveAttribute("aria-controls", "inbox-case-context");
  await trigger.click();
  await expect(
    page.getByRole("button", { name: "Close case context" }),
  ).toBeFocused();
  await expect(page.locator("#root")).toHaveAttribute("aria-hidden", "true");
  await page.keyboard.press("Shift+Tab");
  await expect(context.locator(":focus")).toHaveCount(1);
  await page.keyboard.press("Escape");
  await expect(context).toBeHidden();
  await expect(trigger).toBeFocused();
});

test("mobile Inbox conversation list uses the rail height and clears the bottom nav", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/inbox?demo=1");

  const rail = page.locator(".conversation-rail");
  const list = page.locator(".conversation-list");
  const nav = page.locator(".mobile-bottom-nav");
  await expect(rail).toBeVisible();
  await expect(nav).toBeVisible();

  const railBox = await rail.boundingBox();
  const listBox = await list.boundingBox();
  const navBox = await nav.boundingBox();
  if (!railBox || !listBox || !navBox)
    throw new Error("inbox rail not laid out");

  // The list must scroll inside the rail rather than stop at a fixed cap that
  // leaves most of the rail unusable and hides conversations below it.
  expect(listBox.height).toBeGreaterThan(railBox.height * 0.6);
  // Conversations must not run under the bottom tab bar.
  expect(listBox.y + listBox.height).toBeLessThanOrEqual(navBox.y);
  expect(railBox.y + railBox.height).toBeLessThanOrEqual(navBox.y);
  // The Inbox is a fixed-height surface: the page itself must not scroll.
  const pageScroll = await page.evaluate(() => ({
    scrollHeight: document.scrollingElement?.scrollHeight ?? 0,
    innerHeight: window.innerHeight,
  }));
  expect(pageScroll.scrollHeight).toBeLessThanOrEqual(pageScroll.innerHeight);
});
