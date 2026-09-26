import { createHash, randomUUID } from "node:crypto";
import { mkdtempSync } from "node:fs";
import { createServer } from "node:http";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { _electron as electron, expect, type Page, test } from "@playwright/test";

/**
 * Mode event multi desain (DECISIONS #99) terhadap cloud palsu: tamu memilih desain (pratinjau asli dari template
 * engine) → langsung foto tanpa bayar → jumlah foto & cetakan mengikuti desain yang dipilih.
 * Juga layar awal per event (#102): gambar latar, teks tombol sendiri, tanpa strip contoh.
 */

const appDir = join(__dirname, "..");
const electronPath = createRequire(__filename)("electron") as unknown as string;
const EVENT = "7c2e5d3f-0a7b-4f1c-9d4e-2b3c4d5e6f70";
const TOKEN = "d".repeat(54);
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
  "strip-3-e2e",
  "2x6x2",
  600,
  [0, 1, 2].map((i) => slot(`s${i}`, 30, 30 + i * 390, 540, 360)),
);
const grid = layout("4r-grid-e2e", "4R", 1200, [
  slot("a", 40, 40, 540, 720),
  slot("b", 620, 40, 540, 720),
]);
// PNG 1×1 biru: gambar latar layar awal uji.
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
  "base64",
);
const CONFIG = {
  id: EVENT,
  name: "Rina & Dimas",
  date: "12 Oktober 2026",
  layout: strip,
  designs: [
    { id: strip.id, name: "Strip Klasik", info: "2x6", layout: strip },
    { id: grid.id, name: "Bingkai Emas", info: "4R", layout: grid },
  ],
  attract: { cta: "Ayo Foto!", samples: false, imageAssetId: "attract" },
  settings: { countdownSec: 1, shotDelaySec: 0.2, maxPrints: 3, countdownSound: true },
  assets: { attract: "attract.png" },
};

const typePin = async (w: Page, pin: string) => {
  for (const d of pin) await w.getByRole("button", { name: d, exact: true }).click();
  await w.getByRole("button", { name: "OK" }).click();
};

test("mode event multi desain: pilih desain → foto sesuai desain, tanpa bayar", async () => {
  const sessions: Record<string, unknown>[] = [];
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
            shortCode: "B08",
          }),
        );
      if (url === "/api/booth/events")
        return res.end(
          JSON.stringify({ events: [{ id: EVENT, name: "Rina & Dimas", bundleVersion: 1 }] }),
        );
      if (url === `/api/booth/events/${EVENT}/bundle`)
        return res.end(
          JSON.stringify({
            bundleVersion: 1,
            config: CONFIG,
            files: [
              {
                file: "attract.png",
                sha256: createHash("sha256").update(PNG).digest("hex"),
                url: `http://127.0.0.1:${port}/m/attract`,
              },
            ],
          }),
        );
      if (url === "/m/attract") {
        res.setHeader("content-type", "image/png");
        return res.end(PNG);
      }
      if (url === "/api/booth/sessions") sessions.push(JSON.parse(body));
      if (url === "/api/booth/uploads/sign") return res.end(JSON.stringify({ uploads: [] }));
      res.end(JSON.stringify({ ok: true, uploadStatus: "partial" }));
    });
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const port = (server.address() as { port: number }).port;
  const env: NodeJS.ProcessEnv = { ...process.env, TETRA_GUEST_URL: `http://127.0.0.1:${port}` };
  delete env.ELECTRON_RUN_AS_NODE;
  const app = await electron.launch({
    executablePath: electronPath,
    args: [
      appDir,
      "--camera=simulated",
      "--no-spawn",
      `--data=${mkdtempSync(join(tmpdir(), "tb-ds-"))}`,
      "--use-mock-keychain",
    ],
    env: env as Record<string, string>,
  });
  try {
    const w = await app.firstWindow();
    await expect(w.getByRole("button", { name: /sentuh untuk mulai/i })).toBeVisible();
    for (let i = 0; i < 5; i++) await w.getByTestId("crew-hotspot").click();
    await typePin(w, "2468");
    await typePin(w, "2468");
    await w.getByRole("button", { name: /^Pasangkan/ }).click();
    await typePin(w, "123456");
    await expect(w.getByTestId("cloud-device")).toHaveText("Booth Uji · B08");
    await w.getByRole("button", { name: "Ganti Event" }).click();
    await w.getByRole("button", { name: /Mode Event/ }).click();
    await w.getByRole("button", { name: "Sync dari Cloud" }).click();
    await w.getByRole("button", { name: /Rina & Dimas/ }).click();
    await w.waitForTimeout(1000);

    // Layar awal per event: gambar latar, teks tombol sendiri, strip contoh disembunyikan.
    const start = w.getByRole("button", { name: /Ayo Foto!/ });
    await expect(start).toBeVisible();
    await expect(w.locator("main > img").first()).toHaveAttribute("src", /^blob:/);
    await expect(w.getByText("Rina & Dimas", { exact: true }).nth(1)).toBeHidden();
    await w.screenshot({ path: "test-results/designs-attract.png" });
    await start.click();
    await expect(w.getByRole("heading", { name: "Pilih desain" })).toBeVisible();
    const cards = w.getByTestId("layout-card");
    await expect(cards).toHaveCount(2);
    // Pratinjau = render template engine (bukan kotak slot), tanpa harga.
    await expect(cards.locator("img")).toHaveCount(2, { timeout: 10_000 });
    await expect(cards.filter({ hasText: "Rp" })).toHaveCount(0);
    await cards.filter({ hasText: "Bingkai Emas" }).click();
    await w.screenshot({ path: "test-results/designs-pick.png" });
    await w.getByRole("button", { name: /Mulai Foto/ }).click();
    // Kalimat sebelum foto (#103): foto 1 dari 2, lalu foto terakhir. Suara ON tanpa file → tetap jalan.
    await expect(w.getByText("Siap-siap, gaya pertama!")).toBeVisible();
    await expect(w.getByText("Oke gaya terakhir, cheers!")).toBeVisible({ timeout: 20_000 });

    await w.getByRole("button", { name: /pakai semua foto/i }).click({ timeout: 30_000 });
    await expect(w.getByRole("heading", { name: "Mau cetak berapa?" })).toBeVisible({
      timeout: 15_000,
    });
    await w.getByRole("button", { name: /cetak sekarang/i }).click();
    await expect
      .poll(() => sessions[0], { timeout: 30_000 })
      .toMatchObject({ eventId: EVENT, photoCount: 2 });
  } finally {
    await app.close();
    server.close();
  }
});
