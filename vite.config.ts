import path from "node:path";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: { alias: { "@": path.resolve(__dirname, "./src") } },
  server: { port: 5173 },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          const moduleId = id.replaceAll("\\", "/");
          if (!moduleId.includes("/node_modules/")) return undefined;
          if (
            /\/node_modules\/(?:react|react-dom|react-router|react-router-dom|scheduler)\//.test(
              moduleId,
            )
          )
            return "vendor-react";
          if (
            moduleId.includes("/node_modules/@supabase/") ||
            moduleId.includes("/node_modules/ws/")
          )
            return "vendor-supabase";
          if (
            moduleId.includes("/node_modules/radix-ui/") ||
            moduleId.includes("/node_modules/@radix-ui/") ||
            moduleId.includes("/node_modules/lucide-react/")
          )
            return "vendor-ui";
          if (/\/node_modules\/(?:i18next|react-i18next)\//.test(moduleId))
            return "vendor-i18n";
          return "vendor";
        },
      },
    },
  },
});
