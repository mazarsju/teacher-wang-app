/// <reference types="vitest/config" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const host = process.env.TAURI_DEV_HOST;

export default defineConfig({
  plugins: [react()],
  // Relative asset URLs are required when the UI is loaded from the Tauri webview.
  base: "./",
  clearScreen: false,
  envPrefix: ["VITE_", "TAURI_"],
  build: {
    target: process.env.TAURI_ENV_PLATFORM === "windows" ? "chrome105" : "safari13",
    minify: !process.env.TAURI_ENV_DEBUG ? "esbuild" : false,
    sourcemap: !!process.env.TAURI_ENV_DEBUG,
  },
  test: {
    globals: true,
    environment: "jsdom",
    setupFiles: "./src/test/setup.ts",
    coverage: {
      provider: "v8",
      reporter: ["text", "html", "json-summary"],
      reportsDirectory: "./coverage",
      include: ["src/**/*.{ts,tsx}"],
      exclude: [
        "src/**/*.test.{ts,tsx}",
        "src/test/**",
        "src/main.tsx",
        "src/desktopApi.ts",
        "src/vite-env.d.ts",
      ],
    },
  },
  server: {
    port: 5173,
    strictPort: true,
    host: host || false,
    hmr: host
      ? {
          protocol: "ws",
          host,
          port: 1421,
        }
      : undefined,
    watch: {
      ignored: ["**/src-tauri/**"],
    },
    proxy: {
      "/health": "http://127.0.0.1:5000",
      "/characters": "http://127.0.0.1:5000",
      "/database": "http://127.0.0.1:5000",
      "/words": "http://127.0.0.1:5000",
      "/llm-config": "http://127.0.0.1:5000",
      "/token-usage": "http://127.0.0.1:5000",
      "/chat": "http://127.0.0.1:5000",
      "/challenges": "http://127.0.0.1:5000",
      "/hsk-characters": "http://127.0.0.1:5000",
      "/hsk-level": "http://127.0.0.1:5000",
      // Trailing slash so /anki-connect/* static assets are not proxied to Flask.
      "/anki/": "http://127.0.0.1:5000",
    },
  },
});
