import { defineConfig } from "@playwright/test";

const CI = !!process.env.CI;

export default defineConfig({
  testDir: "./e2e",
  timeout: 30_000,
  forbidOnly: CI,
  reporter: "list",
  use: { baseURL: "http://localhost:3000" },
  webServer: {
    // CI: server produksi (satu proses, tanpa HMR). Lokal: dev server, atau pakai yang sudah jalan.
    command: CI ? "pnpm build && pnpm start" : "pnpm dev",
    url: "http://localhost:3000",
    reuseExistingServer: !CI,
    timeout: 240_000,
  },
});
