import { defineConfig } from "i18next-cli";

export default defineConfig({
  locales: ["en-US", "pt-BR"],
  extract: {
    input: ["src/**/*.{ts,tsx}"],
    output: "src/i18n/locales/{{language}}/{{namespace}}.json",
  },
  lint: {
    ignoredTags: ["pre", "code"],
    // The legacy settings form is being decomposed into Settings V2 pages.
    // Keep its existing copy out of the extractor while the frontend guard
    // still requires every settings module to participate in i18n.
    ignore: [
      "src/features/settings/pages/SettingsPage.tsx",
      "src/features/settings/pages/SettingsWhatsAppPage.tsx",
    ],
    checkInterpolationParams: true,
  },
});
