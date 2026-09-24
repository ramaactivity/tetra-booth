import { defineConfig } from "vitest/config";

// e2e/ milik Playwright (pnpm e2e), bukan Vitest.
export default defineConfig({ test: { include: ["src/**/*.test.ts"] } });
