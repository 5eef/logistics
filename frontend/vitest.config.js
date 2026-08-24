import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [react()],
  resolve: { alias: { "@": path.resolve(__dirname, "src") } },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: "./src/test/setup.js",
    exclude: ["e2e/**", "e2e-staging/**", "e2e-portfolio/**", "node_modules/**", "dist/**"],
    coverage: { provider: "v8", reporter: ["text", "html"] },
  },
});
