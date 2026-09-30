import { randomUUID } from "node:crypto";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { createServer } from "node:http";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { _electron as electron, expect, type Page, test } from "@playwright/test";

/**
 * "Tajamkan foto lama" (DECISIONS #140) terhadap cloud palsu: satu sesi (desain 4R pilihan tamu + filter Hangat),
 * lalu piece@2x.jpg dihapus supaya jadi sesi lama → crew → Sistem → Tajamkan: desain × filter yang cocok
 * ditemukan, strip_web & thumb_strip diunggah ulang lewat antrean upload.
 */

const appDir = join(__dirname, "..");
const electronPath = createRequire(__filename)("electron") as unknown as string;
const EVENT = "5a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d";
const TOKEN = "e".repeat(54);
const slot = (id: string, x: number, y: number, w: number, h: number) =>
  ({ id, x, y, w, h, fit: "cover", z: "below_overlay" }) as const;
const layout = (id: string, paper: string, w: number, slots: ReturnType<typeof slot>[]) => ({
  id,
  version: 1,
  paper,
  canvas: { width: w, height: 1800, dpi: 300 },
  background: { color: "#ffffff" },
  slots,
  texts: [],
});
const strip = layout(
  "strip-3-rr",
  "2x6x2",
  600,
  [0, 1, 2].map((i) => slot(`s${i}`, 30, 30 + i * 390, 540, 360)),
);
const grid = layout("4r-grid-rr", "4R", 1200, [
  slot("a", 40, 40, 540, 720),
  slot("b", 620, 40, 540, 720),
]);
const CONFIG = {
  id: EVENT,
  name: "Sari & Bima",
  date: "1 Oktober 2026",
  layout: strip,
  designs: [
    { id: strip.id, name: "Strip Klasik", info: "2x6", layout: strip },
    { id: grid.id, name: "Bingkai Emas", info: "4R", layout: grid },
  ],
  settings: { countdownSec: 1, shotDelaySec: 0.2, maxPrints: 3, filters: ["bw", "warm"] },
  assets: {},
};

const typePin = async (w: Page, pin: string) => {
  for (const d of pin) await w.getByRole("button", { name: d, exact: true }).click();
  await w.getByRole("button", { name: "OK" }).click();
};

test("tajamkan foto lama: sesi tanpa piece@2x dirender ulang & strip_web diunggah lagi", async () => {
  const sessions: { id: string }[] = [];
  const signed: string[] = [];
  const puts: string[] = [];
  const server = createServer((req, res) => {
    let body = "";
    req.on("data", (c) => {
      body += c;
    });
    req.on("end", () => {
      res.setHeader("content-type", "application/json");
      const url = req.url ?? "";
      if (url === "/api/booth/pair")
        return res.end(
          JSON.stringify({
            token: TOKEN,
            deviceId: randomUUID(),
            name: "Booth Uji",
            shortCode: "B09",
          }),
        );
      if (url === "/api/booth/events")
        return res.end(
          JSON.stringify({ events: [{ id: EVENT, name: "Sari & Bima", bundleVersion: 1 }] }),
        );
      if (url === `/api/booth/events/${EVENT}/bundle`)
        return res.end(JSON.stringify({ bundleVersion: 1, config: CONFIG, files: [] }));
      if (url === "/api/booth/sessions") sessions.push(JSON.parse(body));
      if (url.startsWith("/put/")) puts.push(url.slice(5));
      if (url === "/api/booth/uploads/sign") {
        const assets: { kind: string; idx: number }[] = JSON.parse(body).assets;
        for (const a of assets) signed.push(a.kind);
        const uploads = assets.map((a) => ({
          ...a,
          key: "k",
          url: `http://127.0.0.1:${port}/put/${a.kind}`,
        }));
        return res.end(JSON.stringify({ uploads }));
      }
      res.end(JSON.stringify({ ok: true, uploadStatus: "partial" }));
    });
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const port = (server.address() as { port: number }).port;
  const env: NodeJS.ProcessEnv = { ...process.env, TETRA_GUEST_URL: `http://127.0.0.1:${port}` };
  delete env.ELECTRON_RUN_AS_NODE;
  const data = mkdtempSync(join(tmpdir(), "tb-rr-"));
  const app = await electron.launch({
    executablePath: electronPath,
    args: [appDir, "--camera=simulated", "--no-spawn", `--data=${data}`, "--use-mock-keychain"],
    env: env as Record<string, string>,
  });
  const count = (xs: string[], k: string) => xs.filter((x) => x === k).length;
  try {
    const w = await app.firstWindow();
    const start = w.getByRole("button", { name: /sentuh untuk mulai/i });
    await expect(start).toBeVisible();
    for (let i = 0; i < 5; i++) await w.getByTestId("crew-hotspot").click();
    await typePin(w, "2468");
    await typePin(w, "2468");
    await w.getByRole("button", { name: /^Pasangkan/ }).click();
    await typePin(w, "123456");
    await expect(w.getByTestId("cloud-device")).toHaveText("Booth Uji · B09");
    await w.getByTestId("step-event").getByRole("button").click();
    await w.getByRole("button", { name: /Mode Event/ }).click();
    await w.getByRole("button", { name: "Ambil event terbaru" }).click();
    await w.getByRole("button", { name: /Sari & Bima/ }).click();
    await w.getByTestId("to-guest").click();

    // Sesi: desain kedua (4R, 2 foto) + filter Hangat → pencocokan harus memilih kombinasi ini.
    await start.click();
    await w.getByTestId("layout-card").filter({ hasText: "Bingkai Emas" }).click();
    await w.getByRole("button", { name: /Mulai Foto/ }).click();
    await w.getByRole("button", { name: /pakai semua foto/i }).click({ timeout: 30_000 });
    await w.getByTestId("filter-card").filter({ hasText: "Hangat" }).click();
    await w.getByRole("button", { name: /Pakai Filter Ini/ }).click();
    await w.getByRole("button", { name: /cetak sekarang/i }).click({ timeout: 15_000 });
    await expect.poll(() => sessions[0]?.id, { timeout: 30_000 }).toBeTruthy();
    await expect.poll(() => count(puts, "strip_web"), { timeout: 30_000 }).toBe(1);
    await expect.poll(() => count(puts, "thumb_strip"), { timeout: 30_000 }).toBe(1);

    // Jadikan sesi lama: potongan web 2× belum ada.
    const web = join(data, "sessions", sessions[0]?.id ?? "", "out", "piece@2x.jpg");
    expect(existsSync(web)).toBe(true);
    rmSync(web);

    await w.getByRole("button", { name: "Selesai" }).click({ timeout: 60_000 });
    await expect(start).toBeVisible();
    for (let i = 0; i < 5; i++) await w.getByTestId("crew-hotspot").click();
    await typePin(w, "2468");
    await w.getByTestId("crew-nav-system").click();
    await w.getByRole("button", { name: "Mulai tajamkan" }).click();
    await expect(w.getByTestId("sharpen-status")).toContainText("Selesai: 1 diperbarui", {
      timeout: 30_000,
    });
    await w.screenshot({ path: "test-results/rerender-summary.png" });
    expect(existsSync(web)).toBe(true);
    await expect.poll(() => count(signed, "strip_web"), { timeout: 30_000 }).toBe(2);
    await expect.poll(() => count(puts, "strip_web"), { timeout: 30_000 }).toBe(2);
    await expect.poll(() => count(puts, "thumb_strip"), { timeout: 30_000 }).toBe(2);

    // Sudah punya piece@2x → tidak ada yang perlu ditajamkan lagi.
    await w.getByRole("button", { name: "Mulai tajamkan" }).click();
    await expect(w.getByTestId("sharpen-status")).toContainText("Tidak ada sesi lama");
  } finally {
    await app.close();
    server.close();
  }
});
