import { expect, test } from "@playwright/test";

test("secondary text stays readable on app surfaces in both themes", async ({
  page,
}) => {
  await page.goto("/inbox?demo=1");
  const ratios = await page.evaluate(() => {
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 1;
    const ctx = canvas.getContext("2d")!;
    const luminance = (color: string) => {
      ctx.clearRect(0, 0, 1, 1);
      ctx.fillStyle = color;
      ctx.fillRect(0, 0, 1, 1);
      const values = Array.from(ctx.getImageData(0, 0, 1, 1).data)
        .slice(0, 3)
        .map((channel) => {
          const value = channel / 255;
          return value <= 0.04045
            ? value / 12.92
            : ((value + 0.055) / 1.055) ** 2.4;
        });
      return values[0] * 0.2126 + values[1] * 0.7152 + values[2] * 0.0722;
    };
    const result: Record<string, number> = {};
    for (const theme of ["dark", "light"]) {
      document.documentElement.dataset.theme = theme;
      const styles = getComputedStyle(document.documentElement);
      const foreground = luminance(
        styles.getPropertyValue("--text-muted").trim(),
      );
      for (const surface of [
        "--canvas",
        "--surface",
        "--surface-hover",
        "--surface-selected",
      ]) {
        const background = luminance(styles.getPropertyValue(surface).trim());
        result[`${theme}/${surface}`] =
          (Math.max(foreground, background) + 0.05) /
          (Math.min(foreground, background) + 0.05);
      }
    }
    return result;
  });
  for (const [surface, ratio] of Object.entries(ratios))
    expect(ratio, surface).toBeGreaterThanOrEqual(4.5);

  const refreshingOpacity = await page.evaluate(() => {
    return ["finance-summary", "finance-table-region"].map((className) => {
      const panel = document.createElement("section");
      panel.className = className;
      panel.dataset.refreshing = "true";
      document.body.append(panel);
      const opacity = getComputedStyle(panel).opacity;
      panel.remove();
      return opacity;
    });
  });
  expect(refreshingOpacity).toEqual(["1", "1"]);
});
