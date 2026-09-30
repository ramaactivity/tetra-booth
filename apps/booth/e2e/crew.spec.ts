import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { _electron as electron, expect, type Page, test } from "@playwright/test";

/** Mode crew (M6) end-to-end: hotspot → PIN → event bundle → kertas → peringatan → kunci PIN. */

const appDir = join(__dirname, "..");
const electronPath = createRequire(__filename)("electron") as unknown as string;
// PNG 1×1 biru setengah transparan (R0 G0 B255 A127): overlay bundle uji, kelihatan biru di hasil cetak.
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
  "base64",
);

function makeData() {
  const data = mkdtempSync(join(tmpdir(), "tb-e2e-"));
  const dir = join(data, "events", "andi-sari", "bundle");
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "overlay.png"), PNG);
  writeFileSync(
    join(dir, "config.json"),
    JSON.stringify({
      id: "andi-sari",
      name: "Andi & Sari",
      tagline: "The Wedding of",
      date: "12 Oktober 2026",
      layout: {
        id: "l1",
        version: 1,
        paper: "4R",
        canvas: { width: 1200, height: 1800, dpi: 300 },
        slots: [{ id: "a", x: 100, y: 100, w: 1000, h: 667, fit: "cover", z: "below_overlay" }],
        overlay: { assetId: "ov" },
        texts: [],
      },
      assets: { ov: "overlay.png" },
    }),
  );
  return data;
}

const openCrew = async (w: Page) => {
  const hot = w.getByTestId("crew-hotspot");
  for (let i = 0; i < 5; i++) await hot.click();
};
const typePin = async (w: Page, pin: string) => {
  for (const d of pin) await w.getByRole("button", { name: d, exact: true }).click();
  await w.getByRole("button", { name: "OK" }).click();
};

test("mode crew: PIN, pilih event, kertas, peringatan, kunci", async () => {
  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;
  const app = await electron.launch({
    executablePath: electronPath,
    args: [appDir, "--camera=simulated", "--no-spawn", `--data=${makeData()}`],
    env: env as Record<string, string>,
  });
  const w = await app.firstWindow();
  await expect(w.getByRole("button", { name: /sentuh untuk mulai/i })).toBeVisible();

  // Buat PIN pertama kali (dua kali).
  await openCrew(w);
  await expect(w.getByText("Buat PIN crew")).toBeVisible();
  await typePin(w, "2468");
  await expect(w.getByText("Ulangi PIN")).toBeVisible();
  await typePin(w, "2468");
  await expect(w.getByRole("heading", { name: "Mode crew" })).toBeVisible();

  // Pilih event dari bundle lokal → attract menampilkan nama event.
  // Ganti Event = layar pilih mode (DECISIONS #86): Photobox kosong, Event berisi Andi & Sari.
  await w.getByTestId("step-event").getByRole("button").click();
  await expect(w.getByRole("heading", { name: "Pilih mode booth" })).toBeVisible();
  await w.screenshot({ path: "test-results/start-mode.png" });
  await w.getByRole("button", { name: /Mode Photobox/ }).click();
  await expect(w.getByText(/Belum ada event untuk mode ini/)).toBeVisible();
  await w.getByRole("button", { name: "Ganti mode" }).click();
  await w.getByRole("button", { name: /Mode Event/ }).click();
  await w.screenshot({ path: "test-results/start-events.png" });
  await w.getByRole("button", { name: /Andi & Sari/ }).click();
  await w.getByRole("button", { name: /Buka untuk Tamu/ }).click();
  // Memilih event kembali ke checklist crew; Buka untuk Tamu → layar tamu event itu.
  await expect(w.getByRole("heading", { name: "Andi & Sari" })).toBeVisible();
  await openCrew(w);
  await typePin(w, "2468");
  // Menu samping crew (W-034): tiap tombol ada di bagiannya.
  await w.getByTestId("crew-nav-printer").click();
  await w.getByRole("button", { name: /ganti roll/i }).click();
  await w.getByRole("textbox").fill("25");
  await w.getByRole("button", { name: /simpan/i }).click();
  await expect(w.getByText(/Kertas 25 \/ 25 lembar/)).toBeVisible();
  await w.screenshot({ path: "test-results/crew-menu.png" });

  // Kamera & Printer (DECISIONS #85): kamera dipaksa baris perintah → terkunci; pengingat 2inch cut tampil.
  await w.getByTestId("crew-nav-camera").click();
  await w.getByRole("button", { name: "Kamera & Printer" }).click();
  await expect(w.getByText(/Kamera · diatur lewat baris perintah/)).toBeVisible();
  await expect(w.getByRole("button", { name: "Simulasi" })).toBeDisabled();
  await expect(w.getByText(/2inch cut harus (Enable|Disable)/)).toBeVisible();
  await expect(w.getByRole("button", { name: "Simpan & Mulai Ulang" })).toBeDisabled();
  // Cermin: bawaan live view nyala, hasil foto mati (DECISIONS #35); ubah → bisa disimpan.
  await expect(w.getByRole("button", { name: "Live view · Nyala" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await w.getByRole("button", { name: "Hasil foto · Mati" }).click();
  await expect(w.getByText(/tulisan di baju & latar ikut terbalik/)).toBeVisible();
  await expect(w.getByRole("button", { name: "Simpan & Mulai Ulang" })).toBeEnabled();
  await w.screenshot({ path: "test-results/crew-device.png" });
  await w.getByRole("button", { name: "Hasil foto · Nyala" }).click();
  await expect(w.getByRole("button", { name: "Simpan & Mulai Ulang" })).toBeDisabled();
  await w.getByRole("button", { name: "Batal" }).click();

  // Pengaturan event di booth (DECISIONS #100): override lokal, badge, kembalikan ke cloud.
  await w.getByTestId("crew-nav-event").click();
  await w.getByRole("button", { name: "Pengaturan Event" }).click();
  const countdown = w.getByTestId("setting-countdownSec");
  await expect(countdown).toContainText("cloud: 3");
  await expect(w.getByTestId("setting-sessionSec")).toHaveCount(0);
  await w.getByRole("button", { name: "Hitung mundur (detik) +" }).click();
  await w.getByRole("button", { name: "Hitung mundur (detik) +" }).click();
  await w.getByRole("button", { name: "Simpan", exact: true }).click();
  await expect(countdown).toContainText("diubah di booth");
  await expect(countdown).toContainText("5");
  await w.screenshot({ path: "test-results/crew-event-settings.png" });
  await w.getByRole("button", { name: "Batal" }).click();
  await expect(w.getByTestId("settings-local")).toBeVisible();
  await w.getByRole("button", { name: "Pengaturan Event" }).click();
  await w.getByRole("button", { name: "Kembalikan ke cloud" }).click();
  await expect(countdown).not.toContainText("diubah di booth");
  await w.getByRole("button", { name: "Batal" }).click();
  await expect(w.getByTestId("settings-local")).toHaveCount(0);
  // Tombol sidebar "Keluar ke Mode Tamu" selalu terlihat (di bagian mana pun).
  await w.getByRole("button", { name: /keluar ke mode tamu/i }).click();

  await expect(w.getByRole("heading", { name: "Andi & Sari" })).toBeVisible();
  await expect(w.getByText("The Wedding of")).toBeVisible();
  await w.screenshot({ path: "test-results/attract-event.png" });
  await expect(w.getByTestId("printer-alert")).toContainText("Kertas hampir habis (25)");

  // PIN salah 5x → terkunci; PIN benar pun ditolak saat terkunci.
  await openCrew(w);
  await expect(w.getByText("Masukkan PIN crew")).toBeVisible();
  for (let i = 0; i < 5; i++) await typePin(w, "0000");
  await expect(w.getByText(/Terlalu banyak salah/)).toBeVisible();
  await w.screenshot({ path: "test-results/crew-locked.png" });

  await app.close();
});

test("kiosk: layar penuh, kursor tersembunyi, pulih dari crash renderer", async () => {
  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;
  const data = makeData();
  const app = await electron.launch({
    executablePath: electronPath,
    args: [appDir, "--kiosk", "--camera=simulated", "--no-spawn", `--data=${data}`],
    env: env as Record<string, string>,
  });
  const w = await app.firstWindow();
  await expect(w.getByRole("button", { name: /sentuh untuk mulai/i })).toBeVisible();
  expect(
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.isKiosk()),
  ).toBe(true);
  // Kursor tersembunyi juga di atas tombol (M-011).
  const start = w.getByRole("button", { name: /sentuh untuk mulai/i });
  expect(await start.evaluate((b) => getComputedStyle(b).cursor)).toBe("none");

  // Renderer crash → dimuat ulang, attract kembali, sesi tidak mulai sendiri (M-011, W-016).
  // Page Playwright tidak bisa dipakai setelah crash: pantau log harian booth.
  const log = () =>
    readdirSync(join(data, "logs"))
      .map((f) => readFileSync(join(data, "logs", f), "utf8"))
      .join("");
  const boots = () => (log().match(/R-INFO \[boot\] kamera=/g) ?? []).length;
  expect(boots()).toBe(1);
  await app.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()[0]?.webContents.forcefullyCrashRenderer(),
  );
  await expect.poll(boots, { timeout: 10_000 }).toBe(2);
  await new Promise((r) => setTimeout(r, 3000));
  expect(log()).toContain("renderer mati");
  expect(log()).not.toContain("[session] countdown");
  // app.close() ditolak kiosk (memang begitu); keluar paksa dari proses main.
  await app.evaluate(({ app }) => app.exit(0)).catch(() => {});
});

test("kiosk: tidak bisa ditutup, keluar hanya lewat mode crew", async () => {
  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;
  const app = await electron.launch({
    executablePath: electronPath,
    args: [appDir, "--kiosk", "--camera=simulated", "--no-spawn", `--data=${makeData()}`],
    env: env as Record<string, string>,
  });
  const w = await app.firstWindow();
  await expect(w.getByRole("button", { name: /sentuh untuk mulai/i })).toBeVisible();

  // Tutup jendela (Alt+F4 / tombol X) ditolak.
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.close());
  await w.waitForTimeout(500);
  expect(await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().length)).toBe(1);

  // Keluar lewat mode crew menutup aplikasi.
  await openCrew(w);
  await typePin(w, "1357");
  await typePin(w, "1357");
  await w.getByTestId("crew-nav-system").click();
  await expect(w.getByText("Auto-start hanya di app hasil build")).toBeVisible();
  const closed = app.waitForEvent("close");
  await w.getByRole("button", { name: "Tutup Aplikasi", exact: true }).click();
  // Jendela tertutup di tengah klik: Playwright menolak klik itu, yang penting event close datang.
  await w
    .getByRole("button", { name: "Ya, Tutup Aplikasi" })
    .click()
    .catch(() => {});
  await closed;
});

test("cloud: pairing, heartbeat, sync bundle event, sesi terunggah", async () => {
  // Server palsu API booth (kontrak @tetra/shared); server asli diuji di apps/web/e2e/booth-api.spec.ts.
  const { createServer } = await import("node:http");
  const TOKEN = "t".repeat(54);
  const beats: string[] = [];
  const sessions: { eventId: string; assetCount: number }[] = [];
  const puts: string[] = [];
  const recorded: string[] = [];
  let gifHead = "";
  const EVENT = "7c9e6679-7425-40de-944b-e07fc1f90ae8";
  const pngSha = createHash("sha256").update(PNG).digest("hex");
  const config = JSON.parse(
    readFileSync(join(makeData(), "events/andi-sari/bundle/config.json"), "utf8"),
  );
  const server = createServer((req, res) => {
    let body = "";
    req.on("data", (c) => {
      body += c;
    });
    req.on("end", () => {
      res.setHeader("content-type", "application/json");
      if (req.url === "/api/booth/pair") {
        const ok = JSON.parse(body).code === "123456";
        res.statusCode = ok ? 200 : 400;
        res.end(
          JSON.stringify(
            ok
              ? {
                  token: TOKEN,
                  deviceId: "7c9e6679-7425-40de-944b-e07fc1f90ae7",
                  name: "Booth Uji",
                  shortCode: "B07",
                }
              : { error: "invalid_code" },
          ),
        );
      } else if (req.url === "/api/booth/events") {
        res.end(JSON.stringify({ events: [{ id: EVENT, name: "Cloud", bundleVersion: 3 }] }));
      } else if (req.url === `/api/booth/events/${EVENT}/bundle`) {
        res.end(
          JSON.stringify({
            bundleVersion: 3,
            // 2 slot foto → GIF animasi ikut terbentuk.
            config: {
              ...config,
              id: EVENT,
              name: "Rina & Dimas",
              layout: {
                ...config.layout,
                slots: [config.layout.slots[0], { ...config.layout.slots[0], id: "b", y: 900 }],
              },
            },
            files: [{ file: "overlay.png", sha256: pngSha, url: `http://127.0.0.1:${port}/m/ov` }],
          }),
        );
      } else if (req.url === "/api/booth/sessions") {
        sessions.push(JSON.parse(body));
        res.end(JSON.stringify({ ok: true }));
      } else if (req.url === "/api/booth/uploads/sign") {
        const { assets } = JSON.parse(body) as { assets: { kind: string; idx: number }[] };
        res.end(
          JSON.stringify({
            uploads: assets.map((a) => ({
              ...a,
              key: `k/${a.kind}_${a.idx}`,
              url: `http://127.0.0.1:${port}/r2/${a.kind}_${a.idx}`,
            })),
          }),
        );
      } else if (req.url?.startsWith("/r2/")) {
        puts.push(req.url);
        if (req.url.includes("animation")) gifHead = body.slice(0, 6);
        res.end();
      } else if (req.url?.endsWith("/assets")) {
        recorded.push(...JSON.parse(body).assets.map((a: { kind: string }) => a.kind));
        res.end(JSON.stringify({ uploadStatus: "partial" }));
      } else if (req.url === "/m/ov") {
        res.setHeader("content-type", "image/png");
        res.end(PNG);
      } else {
        beats.push(req.headers.authorization ?? "");
        res.end(JSON.stringify({ ok: true }));
      }
    });
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const port = (server.address() as { port: number }).port;

  const env: NodeJS.ProcessEnv = { ...process.env, TETRA_GUEST_URL: `http://127.0.0.1:${port}` };
  delete env.ELECTRON_RUN_AS_NODE;
  const app = await electron.launch({
    executablePath: electronPath,
    // --use-mock-keychain: safeStorage di macOS tanpa dialog Keychain.
    args: [
      appDir,
      "--camera=simulated",
      "--no-spawn",
      `--data=${makeData()}`,
      "--fast",
      "--use-mock-keychain",
    ],
    env: env as Record<string, string>,
  });
  const w = await app.firstWindow();
  await expect(w.getByRole("button", { name: /sentuh untuk mulai/i })).toBeVisible();
  await openCrew(w);
  await typePin(w, "2468");
  await typePin(w, "2468");
  await expect(w.getByTestId("cloud-device")).toHaveText("Belum dipasangkan");

  await w.getByRole("button", { name: /^Pasangkan/ }).click();
  await typePin(w, "111111");
  await expect(w.getByRole("status")).toHaveText("Kode salah atau sudah kedaluwarsa");
  await typePin(w, "123456");
  await expect(w.getByTestId("cloud-device")).toHaveText("Booth Uji · B07");
  await expect.poll(() => beats).toContain(`Bearer ${TOKEN}`);

  // Bundle sudah ditarik otomatis setelah pairing; tombol sync tetap aman dipanggil ulang.
  await w.getByTestId("step-event").getByRole("button").click();
  await w.getByRole("button", { name: /Mode Event/ }).click();
  await w.getByRole("button", { name: "Sync dari Cloud" }).click();
  await w.getByRole("button", { name: /Rina & Dimas/ }).click();
  await w.getByRole("button", { name: /Buka untuk Tamu/ }).click();
  await expect(w.getByRole("heading", { name: "Rina & Dimas" })).toBeVisible();

  // Satu sesi (--fast) untuk event cloud → semua file masuk R2 palsu dan tercatat (N4).
  await w.waitForTimeout(1000);
  await w.getByRole("button", { name: /sentuh untuk mulai/i }).click();
  await w.getByRole("button", { name: /pakai semua foto/i }).click({ timeout: 30_000 });
  await w.getByRole("button", { name: /cetak sekarang/i }).click({ timeout: 15_000 });
  await expect
    .poll(() => sessions.length > 0 && recorded.length === sessions[0]?.assetCount, {
      timeout: 30_000,
    })
    .toBe(true);
  expect(sessions[0]?.eventId).toBe(EVENT);
  expect(recorded).toContain("strip_web");
  expect(recorded).toContain("animation");
  expect(gifHead).toBe("GIF89a");
  expect(new Set(puts).size).toBe(recorded.length);

  await app.close();
  server.close();
});

test("layar awal: pilih mode lalu event sebelum layar tamu (DECISIONS #86)", async () => {
  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;
  const app = await electron.launch({
    executablePath: electronPath,
    args: [appDir, "--camera=simulated", "--no-spawn", "--start-screen", `--data=${makeData()}`],
    env: env as Record<string, string>,
  });
  const w = await app.firstWindow();
  await expect(w.getByRole("heading", { name: "Pilih mode booth" })).toBeVisible();
  await w.getByRole("button", { name: /Mode Event/ }).click();
  // Pilih pertama saat app dibuka tidak butuh PIN.
  await w.getByRole("button", { name: /Andi & Sari/ }).click();
  await expect(w.getByRole("heading", { name: "Andi & Sari" })).toBeVisible();
  await expect(w.getByRole("button", { name: /sentuh untuk mulai/i })).toBeVisible();
  await app.close();
});
