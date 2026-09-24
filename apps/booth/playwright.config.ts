import { defineConfig } from "@playwright/test";

// Uji Electron sungguhan (build dulu: pnpm --filter booth build). Jalan di Mac, Windows, dan CI (xvfb).
export default defineConfig({
  testDir: "./e2e",
  timeout: 90_000,
  reporter: "list",
  use: { screenshot: "only-on-failure" },
});
