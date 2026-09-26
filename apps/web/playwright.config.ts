import { defineConfig } from "@playwright/test";

const CI = !!process.env.CI;

export default defineConfig({
  testDir: "./e2e",
  timeout: 30_000,
  forbidOnly: CI,
  reporter: "list",
  use: { baseURL: "http://localhost:3000" },
  webServer: {
    // Biner `next` dipanggil langsung: lewat `pnpm start` sinyal terminate tidak sampai ke next-server
    // dan Playwright menggantung saat teardown. CI: server produksi (build dilakukan di step CI sebelumnya).
    command: CI ? "node_modules/.bin/next start" : "node_modules/.bin/next dev",
    url: "http://localhost:3000",
    reuseExistingServer: !CI,
    timeout: 120_000,
    gracefulShutdown: { signal: "SIGTERM", timeout: 5_000 },
    // Pembayaran photobox pakai provider palsu (DECISIONS #70); tidak pernah aktif di production.
    env: {
      PAYMENT_PROVIDER: "fake",
      XENDIT_CALLBACK_TOKEN: "e2e-callback-token",
      MIDTRANS_SERVER_KEY: "SB-Mid-server-e2e",
    },
  },
});
