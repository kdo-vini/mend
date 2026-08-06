import { defineConfig } from "i18next-cli";

export default defineConfig({
  locales: ["pt-BR", "en-US"],
  extract: {
    input: ["src/**/*.{ts,tsx}"],
    output: "src/i18n/locales/{{language}}/{{namespace}}.json",
  },
  lint: {
    ignoredTags: ["pre", "code"],
    checkInterpolationParams: true,
  },
});
