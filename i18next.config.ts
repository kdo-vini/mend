import { defineConfig } from "i18next-cli";

export default defineConfig({
  locales: ["en-US", "pt-BR"],
  extract: {
    // The legacy feature screens are migrated namespace by namespace. Keep the
    // lint gate focused on the translation foundation and already-migrated UI
    // until each domain joins the catalog contract.
    input: ["src/i18n/**/*.{ts,tsx}", "src/components/LanguageSwitcher.tsx"],
    output: "src/i18n/locales/{{language}}/{{namespace}}.json",
  },
  lint: {
    ignoredTags: ["pre", "code"],
    checkInterpolationParams: true,
  },
});
