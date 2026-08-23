import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
  server: {
    port: 5173,
    host: true,
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          // Recharts is used only by lazy dashboard routes. Keep its D3
          // subpackages independently cacheable instead of producing one
          // oversized charting chunk.
          const chartPackage = id.match(/[\\/]node_modules[\\/](d3-[^\\/]+|victory-vendor|recharts|lodash)[\\/]/)?.[1];
          if (chartPackage) return `chart-${chartPackage}`;
        },
      },
    },
  },
});
