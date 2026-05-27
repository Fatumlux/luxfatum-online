import { defineConfig } from "vite";

export default defineConfig({
  base: "./",
  build: {
    outDir: "web-build",
    emptyOutDir: true,
    rollupOptions: {
      external: id => id.startsWith("https://")
    }
  },
  server: {
    host: "0.0.0.0",
    port: 5173
  }
});
