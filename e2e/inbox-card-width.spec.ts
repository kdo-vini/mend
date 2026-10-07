import { expect, test } from "@playwright/test";

for (const viewport of [
  { name: "desktop", width: 1280, height: 900 },
  { name: "mobile", width: 390, height: 844 },
]) {
  test(`${viewport.name} Inbox keeps linked issue card and message bubbles inside the canvas`, async ({
    page,
  }) => {
    await page.setViewportSize({
      width: viewport.width,
      height: viewport.height,
    });
    await page.addInitScript(() => {
      localStorage.setItem("mend.interface-language", "en-US");
    });
    await page.goto("/inbox?demo=1");

    await page
      .getByRole("button", { name: /Open conversation with/ })
      .first()
      .click();

    const canvas = page.locator(".message-canvas");
    const issueCard = page.locator(".issue-event");
    await expect(canvas).toBeVisible();
    await expect(issueCard).toBeVisible();
    await issueCard.scrollIntoViewIfNeeded();

    const bounds = await page.evaluate(() => {
      const canvas = document.querySelector(".message-canvas");
      const issueCard = document.querySelector(".issue-event");
      if (!canvas || !issueCard) return null;
      const rect = (element: Element) => {
        const { left, right } = element.getBoundingClientRect();
        return { left, right };
      };
      return {
        canvas: rect(canvas),
        issueCard: rect(issueCard),
        bubbles: Array.from(
          canvas.querySelectorAll<HTMLElement>(".message-bubble"),
        ).map(rect),
      };
    });

    expect(bounds).not.toBeNull();
    expect(bounds!.bubbles.length).toBeGreaterThan(0);
    for (const child of [bounds!.issueCard, ...bounds!.bubbles]) {
      expect(child.left).toBeGreaterThanOrEqual(bounds!.canvas.left - 1);
      expect(child.right).toBeLessThanOrEqual(bounds!.canvas.right + 1);
    }
  });
}
