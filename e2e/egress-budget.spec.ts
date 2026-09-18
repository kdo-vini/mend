import { existsSync } from "node:fs";
import { expect, test } from "@playwright/test";

const baseUrl = process.env.MEND_EGRESS_TEST_BASE_URL?.trim();
const storageState = process.env.MEND_EGRESS_STORAGE_STATE?.trim();
const enabled = Boolean(baseUrl && storageState && existsSync(storageState));

test.describe("authenticated egress budget", () => {
  test.skip(
    !enabled,
    "MEND_EGRESS_TEST_BASE_URL and MEND_EGRESS_STORAGE_STATE are required",
  );
  test.use({ storageState });

  test("bounds workspace startup and stays quiet while idle", async ({
    page,
  }) => {
    const restRequests: string[] = [];
    const storageRequests: string[] = [];
    page.on("request", (request) => {
      const url = request.url();
      if (url.includes(".supabase.co/rest/v1/")) restRequests.push(url);
      if (url.includes(".supabase.co/storage/v1/")) storageRequests.push(url);
    });

    await page.goto(`${baseUrl}/inbox`);
    await expect(page.locator(".inbox-page")).toBeVisible();
    await page.waitForTimeout(2_000);

    expect(restRequests.length).toBeLessThanOrEqual(15);
    expect(storageRequests).toHaveLength(0);

    const restAtIdleStart = restRequests.length;
    await page.waitForTimeout(15_000);
    expect(restRequests.length).toBe(restAtIdleStart);
    expect(storageRequests).toHaveLength(0);
  });
});
