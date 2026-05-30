import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  base: "./",
  plugins: [react()],
  build: {
    outDir: "web-build",
    emptyOutDir: true,
    sourcemap: false,
    chunkSizeWarningLimit: 950
  },
  server: {
    host: "0.0.0.0",
    port: 5173
  }
});
