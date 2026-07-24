/// <reference types="vitest/config" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
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
        "src/vite-env.d.ts",
      ],
    },
  },
  server: {
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
    },
  },
});
