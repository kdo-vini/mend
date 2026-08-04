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

export default defineConfig({
  testDir: "./e2e",
  timeout: 30_000,
  fullyParallel: true,
  reporter: process.env.CI ? "line" : "list",
  use: {
    baseURL: "http://127.0.0.1:5174",
    trace: "on-first-retry",
    ...(executablePath ? { launchOptions: { executablePath } } : {}),
  },
  webServer: {
    command: "npm run dev -- --host 127.0.0.1 --port 5174",
    url: "http://127.0.0.1:5174/inbox",
    env: {
      VITE_SUPABASE_URL: "http://127.0.0.1:54321",
      VITE_SUPABASE_PUBLISHABLE_KEY: "e2e-public-key",
    },
    reuseExistingServer: true,
    timeout: 120_000,
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile", use: { ...devices["Pixel 5"] } },
  ],
});
