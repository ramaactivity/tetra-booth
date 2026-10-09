import { defineConfig } from "@playwright/test";

const CI = !!process.env.CI;

export default defineConfig({
  testDir: "./e2e",
  timeout: 30_000,
  forbidOnly: CI,
  reporter: "list",
  // Data uji "e2e …" di organisasi Tetra (dev = prod) dihapus setelah run, termasuk sisa tes yang gagal.
  globalTeardown: "./e2e/teardown.ts",
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
      // Tetra Ops palsu (stub http lokal di e2e/wizard-ops.spec.ts, DECISIONS #150).
      TETRA_OPS_URL: "http://127.0.0.1:4019",
      TETRA_OPS_TOKEN: "e2e-ops-token",
      // API Hermes (#215, e2e/promo.spec.ts); org = Tetra (dev = prod).
      HERMES_API_TOKEN: "e2e-hermes-token-0123456789abcdef0123",
      TETRA_OPS_ORG_ID: "ba9df22f-5abc-4322-ab3b-9a3f4b00e481",
      // Ops → Booth (cek & pakai kode promo #218).
      TETRA_OPS_API_TOKEN: "e2e-ops-api-token",
      TETRA_OPS_WEBHOOK_SECRET: "e2e-ops-webhook-secret",
    },
  },
});
