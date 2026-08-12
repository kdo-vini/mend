import { defineConfig } from "i18next-cli";

export default defineConfig({
  locales: ["en-US", "pt-BR"],
  extract: {
    input: ["src/**/*.{ts,tsx}"],
    output: "src/i18n/locales/{{language}}/{{namespace}}.json",
  },
  lint: {
    ignoredTags: ["pre", "code"],
    ignore: ["src/features/settings/pages/SettingsWhatsAppPage.tsx"],
    checkInterpolationParams: true,
  },
});
