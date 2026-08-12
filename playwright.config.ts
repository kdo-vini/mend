import { existsSync } from "node:fs";
import path from "node:path";
import { defineConfig, devices } from "@playwright/test";

const localFallback = process.env.LOCALAPPDATA
  ? path.join(
      process.env.LOCALAPPDATA,
      "ms-playwright",
      "chromium-1228",
      "chrome-win64",
      "chrome.exe",
    )
  : "";
const executablePath =
  process.env.PLAYWRIGHT_EXECUTABLE_PATH ??
  (existsSync(localFallback) ? localFallback : undefined);
const e2ePort = process.env.MEND_E2E_PORT?.trim() || "5174";
if (!/^\d{2,5}$/.test(e2ePort))
  throw new Error("MEND_E2E_PORT must be a valid TCP port");
const e2eBaseUrl = `http://127.0.0.1:${e2ePort}`;

export default defineConfig({
  testDir: "./e2e",
  timeout: 30_000,
  fullyParallel: true,
  reporter: process.env.CI ? "line" : "list",
  use: {
    baseURL: e2eBaseUrl,
    trace: "on-first-retry",
    ...(executablePath ? { launchOptions: { executablePath } } : {}),
  },
  webServer: {
    command: `npm run dev -- --host 127.0.0.1 --port ${e2ePort}`,
    url: `${e2eBaseUrl}/inbox`,
    env: {
      VITE_SUPABASE_URL: "http://127.0.0.1:54321",
      VITE_SUPABASE_PUBLISHABLE_KEY: "e2e-public-key",
      VITE_MEND_AUTH_EMAIL_DELIVERY_READY: "1",
    },
    reuseExistingServer: true,
    timeout: 120_000,
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile", use: { ...devices["Pixel 5"] } },
  ],
});
