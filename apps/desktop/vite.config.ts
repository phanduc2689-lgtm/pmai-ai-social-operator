import path from "node:path";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const desktopRoot = path.resolve(__dirname);

export default defineConfig({
  root: desktopRoot,
  base: "./",
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { "@": path.resolve(desktopRoot, "../../src") },
  },
  publicDir: path.resolve(desktopRoot, "public"),
  build: {
    outDir: path.resolve(desktopRoot, "dist-renderer"),
    emptyOutDir: true,
    sourcemap: false,
    minify: true,
    assetsInlineLimit: 0,
  },
});
