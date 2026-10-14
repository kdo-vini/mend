import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.setItem("mend.interface-language", "en-US");
  });
});

/**
 * The composer shows WhatsApp formatting while typing by painting a styled
 * copy of the text behind a transparent textarea. If the copy laid text out
 * differently (a wider bold, a monospace font) the caret would drift away
 * from the visible words, so both boxes must wrap identically.
 */
test("the composer formats WhatsApp markup in place without drifting", async ({
  page,
}) => {
  await page.goto("/inbox?demo=1");
  await page
    .getByRole("button", { name: /Open conversation with/ })
    .first()
    .click();
  const field = page.getByRole("textbox", { name: "Write a reply" });
  await field.click();
  await field.fill(
    "Olá *Lucas*, segue o _resumo_ com ~erro~ e ```codigo``` para conferir. ".repeat(
      3,
    ),
  );
  await field.press("End");
  const highlight = page.locator(".composer-highlight");
  await expect(highlight.locator("strong").first()).toHaveText("Lucas");
  await expect(highlight.locator(".wa-marker").first()).toHaveText("*");

  const layout = await page.evaluate(() => {
    const textarea =
      document.querySelector<HTMLTextAreaElement>(".composer textarea")!;
    const copy = document.querySelector<HTMLElement>(".composer-highlight")!;
    return {
      textarea: textarea.scrollHeight,
      copy: copy.scrollHeight,
      textareaWidth: textarea.clientWidth,
      copyWidth: copy.clientWidth,
    };
  });
  expect(layout.copy).toBe(layout.textarea);
  expect(layout.copyWidth).toBe(layout.textareaWidth);

  await field.fill("oi mundo");
  await field.evaluate((element: HTMLTextAreaElement) =>
    element.setSelectionRange(3, 8),
  );
  await field.press("ControlOrMeta+b");
  await expect(field).toHaveValue("oi *mundo*");
});
