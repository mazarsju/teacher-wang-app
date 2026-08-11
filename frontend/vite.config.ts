/// <reference types="vitest/config" />
import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const frontendDir = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [react()],
  // Load VITE_* from the repo-root `.env` (alongside backend COGNITO_*).
  envDir: path.resolve(frontendDir, ".."),
  css: {
    modules: {
      // Keeps both the raw ("foo-bar") and camelCase ("fooBar") keys, so static
      // classNames can use styles.fooBar while dynamic ones (`styles[`foo-${x}`]`)
      // still work.
      localsConvention: "camelCase",
    },
  },
  test: {
    globals: true,
    environment: "jsdom",
    setupFiles: "./src/test/setup.ts",
    css: {
      // Without this, *.module.css imports are auto-mocked (Vitest default)
      // and every class resolves to its raw property name instead of the
      // actual CSS class — opt them into real processing.
      include: [/\.module\.css$/],
      modules: {
        // Tests assert on literal class strings (toHaveClass("foo-bar")); keep
        // CSS module class names unscoped in tests instead of hashed.
        classNameStrategy: "non-scoped",
      },
    },
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
    port: 5173,
    proxy: {
      // Strip /api so Flask keeps its root routes (/characters, /chat, …).
      "/api": {
        target: "http://127.0.0.1:5000",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, "") || "/",
      },
    },
  },
});
