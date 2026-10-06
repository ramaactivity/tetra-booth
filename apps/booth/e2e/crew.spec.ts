import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { _electron as electron, expect, type Page, test } from "@playwright/test";
import { HeartbeatRequest } from "@tetra/shared";

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

/** Satu sesi --fast dari layar awal sampai kembali ke layar awal. */
const session = async (w: Page) => {
  const start = w.getByRole("button", { name: /sentuh untuk mulai/i });
  await expect(start).toBeVisible();
  await w.waitForTimeout(1000); // START_GUARD_MS
  await start.click();
  await w.getByRole("button", { name: /pakai semua foto/i }).click({ timeout: 30_000 });
  await w.getByRole("button", { name: /cetak sekarang/i }).click({ timeout: 15_000 });
  await w.getByRole("button", { name: "Selesai" }).click({ timeout: 60_000 });
};
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
  await w.getByTestId("to-guest").click();
  // Memilih event kembali ke checklist crew; Buka untuk Tamu → layar tamu event itu.
  await expect(w.getByRole("heading", { name: "Andi & Sari" })).toBeVisible();
  await openCrew(w);
  await typePin(w, "2468");
  // Menu samping crew: tiap tombol ada di bagiannya.
  await w.getByTestId("crew-nav-printer").click();
  await w.getByRole("button", { name: /ganti roll/i }).click();
  await w.getByRole("textbox").fill("25");
  await w.getByRole("button", { name: /simpan/i }).click();
  await expect(w.getByText(/Kertas 25 \/ 25 lembar/)).toBeVisible();
  await w.screenshot({ path: "test-results/crew-menu.png" });

  // Kamera & Printer (DECISIONS #85): kamera dipaksa baris perintah → terkunci; pengingat 2inch cut tampil.
  await w.getByTestId("crew-nav-camera").click();
  await w.getByRole("button", { name: "Kamera & Printer" }).click();
  await expect(w.getByText(/Kamera · dikunci teknisi/)).toBeVisible();
  await expect(w.getByRole("button", { name: "Latihan tanpa kamera" })).toBeDisabled();
  await expect(w.getByText(/2inch cut: (Enable|Disable)/)).toBeVisible();
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
  // Tombol sidebar "Buka untuk Tamu" selalu terlihat (di bagian mana pun).
  await w.getByTestId("to-guest").click();

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

  // Ctrl+Shift+Q di layar awal: PIN crew lalu langsung konfirmasi Tutup Aplikasi.
  await w.keyboard.press("Control+Shift+Q");
  await typePin(w, "1357");
  await typePin(w, "1357");
  await expect(w.getByRole("button", { name: "Ya, Tutup Aplikasi" })).toBeVisible();
  const closed = app.waitForEvent("close");
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
  const beatBodies: HeartbeatRequest[] = [];
  const sessions: { id: string; eventId: string; assetCount: number; isTest?: boolean }[] = [];
  const puts: string[] = [];
  const recorded: string[] = [];
  const runs: { id: string; action: string; at: string; local?: unknown }[] = [];
  const storage: { bytes: number; files: number }[] = [];
  let gifHead = "";
  let linkCalls = 0;
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
              info: { scheduledStart: "08:00", scheduledEnd: "11:00", packageHours: 3 },
              layout: {
                ...config.layout,
                slots: [config.layout.slots[0], { ...config.layout.slots[0], id: "b", y: 900 }],
              },
            },
            files: [{ file: "overlay.png", sha256: pngSha, url: `http://127.0.0.1:${port}/m/ov` }],
          }),
        );
      } else if (req.url === `/api/booth/events/${EVENT}/run`) {
        // Timer event (#149): kiriman pertama gagal (server/internet putus) → antrean mengirim ulang.
        const b = JSON.parse(body) as { id: string; action: string; at: string };
        runs.push(b);
        if (runs.length === 1) {
          res.statusCode = 503;
          res.end("{}");
          return;
        }
        const state = { open: "running", start: "running", pause: "paused", finish: "finished" };
        res.end(JSON.stringify({ state: state[b.action as keyof typeof state] }));
      } else if (req.url === `/api/booth/events/${EVENT}/storage`) {
        storage.push(JSON.parse(body));
        res.end(JSON.stringify({ ok: true }));
      } else if (req.url === `/api/booth/events/${EVENT}/gallery-link`) {
        // Pertama: booth tidak ditugaskan ke event (#170) → pesan yang benar, bukan "butuh internet".
        if (++linkCalls === 1) {
          res.statusCode = 404;
          res.end(JSON.stringify({ error: "not_found" }));
          return;
        }
        res.end(JSON.stringify({ slug: "rina-dimas-2026-10-12" }));
      } else if (req.url === "/api/booth/sessions") {
        // Upsert boleh terkirim lebih dari sekali (idempotent): simpan satu per id.
        const x = JSON.parse(body);
        const i = sessions.findIndex((y) => y.id === x.id);
        if (i < 0) sessions.push(x);
        else sessions[i] = x;
        res.end(JSON.stringify({ ok: true }));
      } else if (req.url === "/api/booth/uploads/sign") {
        const { assets, sessionId } = JSON.parse(body) as {
          sessionId: string;
          assets: { kind: string; idx: number }[];
        };
        res.end(
          JSON.stringify({
            uploads: assets.map((a) => ({
              ...a,
              key: `k/${sessionId}/${a.kind}_${a.idx}`,
              url: `http://127.0.0.1:${port}/r2/${sessionId}/${a.kind}_${a.idx}`,
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
        if (req.url === "/api/booth/heartbeat")
          beatBodies.push(HeartbeatRequest.parse(JSON.parse(body)));
        res.end(JSON.stringify({ ok: true }));
      }
    });
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const port = (server.address() as { port: number }).port;

  const env: NodeJS.ProcessEnv = {
    ...process.env,
    TETRA_GUEST_URL: `http://127.0.0.1:${port}`,
    TETRA_NO_SHELL_OPEN: "1",
  };
  delete env.ELECTRON_RUN_AS_NODE;
  const data = makeData();
  const app = await electron.launch({
    executablePath: electronPath,
    // --use-mock-keychain: safeStorage di macOS tanpa dialog Keychain.
    args: [
      appDir,
      "--camera=simulated",
      "--no-spawn",
      `--data=${data}`,
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
  await expect(w.getByTestId("cloud-device")).toHaveText("Belum tersambung");

  // Sambungkan ke akun Tetra: petunjuk dari mana kodenya di samping keypad.
  await w.getByTestId("step-pair").getByRole("button", { name: "Sambungkan" }).click();
  await expect(w.getByRole("heading", { name: "Sambungkan ke akun Tetra" })).toBeVisible();
  await expect(w.getByText(/127\.0\.0\.1:\d+\/admin → Device → Tambah booth/)).toBeVisible();
  await w.screenshot({ path: "test-results/pair-empty.png" });
  await typePin(w, "111111");
  await expect(w.getByRole("status")).toHaveText(/^Kode salah atau sudah lewat 10 menit/);
  await w.screenshot({ path: "test-results/pair-error.png" });
  await typePin(w, "123456");
  await expect(w.getByTestId("pair-device")).toHaveText(
    "Booth ini sekarang tersambung sebagai Booth Uji · B07.",
  );
  await w.screenshot({ path: "test-results/pair-success.png" });
  await w.getByRole("button", { name: "Kembali ke Menu Crew" }).click();
  await expect(w.getByTestId("cloud-device")).toHaveText("Booth Uji · B07");
  await expect(w.getByTestId("step-pair")).toHaveAttribute("data-done", "true");
  // Sudah tersambung: sambung ulang = aksi kedua yang dijelaskan, bukan langsung keypad.
  await w.getByTestId("crew-nav-system").click();
  await w.getByRole("button", { name: "Sambungkan Ulang" }).click();
  await expect(w.getByTestId("pair-device")).toHaveText("Tersambung sebagai Booth Uji · B07");
  await w.screenshot({ path: "test-results/pair-already.png" });
  await w.getByRole("button", { name: "Kembali ke Menu Crew" }).click();
  await w.getByTestId("crew-nav-home").click();
  await expect.poll(() => beats).toContain(`Bearer ${TOKEN}`);
  // Snapshot status untuk pantauan admin (kontrak BoothStatus, field hasil zod tidak dibuang).
  const st = beatBodies[0]?.status;
  expect(st?.camera?.kind).toBeTruthy();
  expect(st?.printer?.status).toBeTruthy();
  expect(st?.paper?.capacity).toBeGreaterThan(0);
  expect(st?.failedPrints).toBeGreaterThanOrEqual(0);
  expect(st?.uploadPending).toBeGreaterThanOrEqual(0);
  expect(st?.diskFreeGb).toBeGreaterThan(0);

  // Bundle sudah ditarik otomatis setelah pairing; tombol sync tetap aman dipanggil ulang.
  await w.getByTestId("step-event").getByRole("button").click();
  await w.getByRole("button", { name: /Mode Event/ }).click();
  await w.getByRole("button", { name: "Ambil event terbaru" }).click();
  await w.getByRole("button", { name: /Rina & Dimas/ }).click();
  // Event cloud belum mulai: Buka untuk Tamu = pop-up Mulai acara / Tes dulu + panduan masuk crew (#152).
  await expect(w.getByTestId("crew-run")).toHaveAttribute("data-state", "idle");
  await w.getByTestId("open-guests").click();
  const go = w.getByTestId("start-dialog");
  await expect(go.getByRole("heading", { name: "Acara sudah mulai?" })).toBeVisible();
  await expect(go.getByTestId("crew-entry-guide")).toContainText("Ketuk pojok kanan atas 5×");
  await w.screenshot({ path: "test-results/booth-start-popup.png" });

  // Tes dulu: lencana TES, sesi ditandai tes, timer tidak mulai.
  await go.getByRole("button", { name: /^Tes dulu/ }).click();
  await expect(w.getByRole("heading", { name: "Rina & Dimas" })).toBeVisible();
  await expect(w.getByTestId("test-badge")).toBeVisible();
  await w.screenshot({ path: "test-results/booth-test-mode.png" });
  await session(w);
  await expect.poll(() => sessions.length, { timeout: 30_000 }).toBe(1);
  expect(sessions[0]?.isTest).toBe(true);
  expect(runs).toHaveLength(0);

  // Kembali ke crew → Buka untuk Tamu bertanya lagi → Mulai acara: timer menunggu sesi tamu pertama.
  await openCrew(w);
  await typePin(w, "2468");
  const run = w.getByTestId("crew-run");
  await expect(run).toHaveAttribute("data-state", "idle");
  // Timer belum pernah jalan: rekap tetap bisa dibuka (perkiraan dari sesi).
  await run.getByRole("button", { name: "Rekap Acara" }).click();
  await expect(w.getByTestId("booth-recap")).toBeVisible();
  // Ukuran folder event (#166): hanya sesi tes → kosong; tetap dilaporkan ke cloud.
  await expect(w.getByTestId("booth-recap-size")).toContainText("0 B · 0 file");
  await expect.poll(() => storage.at(-1)).toEqual({ bytes: 0, files: 0 });
  await w.getByTestId("booth-recap").getByRole("button", { name: "Tutup" }).click();
  await w.getByTestId("to-guest").click();
  await w
    .getByTestId("start-dialog")
    .getByRole("button", { name: /^Mulai acara/ })
    .click();
  await expect(w.getByRole("heading", { name: "Rina & Dimas" })).toBeVisible();
  await expect(w.getByTestId("test-badge")).toHaveCount(0);
  await openCrew(w);
  await typePin(w, "2468");
  await expect(run).toHaveAttribute("data-state", "waiting");
  await expect(run).toContainText("Menunggu sesi pertama");
  expect(runs).toHaveLength(0);
  // Menunggu sesi pertama: langsung ke tamu tanpa pop-up.
  await w.getByTestId("to-guest").click();
  await expect(w.getByTestId("start-dialog")).toHaveCount(0);
  await session(w);
  // Timer mulai di jam sesi tamu pertama; kiriman pertama gagal (503) lalu dikirim ulang (id & jam sama).
  await expect.poll(() => runs.length, { timeout: 30_000 }).toBe(2);
  expect(runs[0]?.action).toBe("start");
  expect(runs[1]).toEqual(runs[0]);
  await expect.poll(() => sessions.length, { timeout: 30_000 }).toBeGreaterThanOrEqual(2);
  expect(sessions.find((x) => x.id !== sessions[0]?.id)?.isTest).toBeUndefined();

  // Jeda / Lanjutkan / Hentikan dari Ringkasan → kartu rekap muncul sendiri.
  await openCrew(w);
  await typePin(w, "2468");
  await expect(run).toHaveAttribute("data-state", "running");
  await w.screenshot({ path: "test-results/crew-run.png" });
  await run.getByRole("button", { name: "Jeda Acara" }).click();
  await expect(run).toHaveAttribute("data-state", "paused");
  await run.getByRole("button", { name: "Lanjutkan Acara" }).click();
  await expect(run).toHaveAttribute("data-state", "running");
  await run.getByRole("button", { name: "Hentikan Acara" }).click();
  await expect(run).toContainText("Acara sudah selesai?");
  await run.getByRole("button", { name: "Ya, Hentikan" }).click();
  const recap = w.getByTestId("booth-recap");
  await expect(recap).toBeVisible();
  await expect(run).toHaveAttribute("data-state", "finished");
  await expect(recap.getByTestId("booth-recap-Sesi tamu")).toHaveText("1");
  await expect(recap).toContainText("1 sesi tes tidak dihitung");
  await expect(recap.getByTestId("booth-recap-schedule")).toContainText("Jadwal 08.00–11.00");
  // Ukuran isi Buka Folder Event (#166): sesi asli = lembar cetak + 2 foto asli + GIF.
  const size = recap.getByTestId("booth-recap-size");
  await expect(size).toContainText(/Ukuran file di laptop\s*[\d,]+ (B|KB|MB) · 4 file/);
  await expect(size).toContainText("Pastikan flashdisk punya ruang kosong lebih dari ini.");
  await expect.poll(() => storage.at(-1)?.files).toBe(4);
  await w.screenshot({ path: "test-results/booth-recap.png" });
  // Buka Folder Event: file sesi asli dikumpulkan (Explorer tidak dibuka di uji, TETRA_NO_SHELL_OPEN).
  await recap.getByRole("button", { name: /Buka Folder Event/ }).click();
  await expect(recap.getByTestId("booth-recap-note")).toContainText("Folder dibuka:");
  const folder = join(data, "Foto Event", "Rina & Dimas");
  expect(readdirSync(join(folder, "Cetak"))).toHaveLength(1);
  // Isi folder = jumlah file di baris ukuran.
  expect(
    ["Cetak", "Foto asli", "GIF", "Video"].reduce(
      (n, d) => n + (existsSync(join(folder, d)) ? readdirSync(join(folder, d)).length : 0),
      0,
    ),
  ).toBe(4);
  // Salin Link Galeri: ditolak server (404) = alasan & langkahnya, bukan "butuh internet" (#170).
  await recap.getByRole("button", { name: /Salin Link Galeri/ }).click();
  await expect(recap.getByTestId("booth-recap-note")).toHaveText(
    "Booth ini tidak ditugaskan ke event ini. Minta admin menugaskan booth ini di Pengaturan event, lalu coba lagi.",
  );
  // Setelah admin menugaskan: booth mengaktifkan link galeri klien lalu menyalin alamat slug.
  await recap.getByRole("button", { name: /Salin Link Galeri/ }).click();
  await expect(recap.getByTestId("booth-recap-note")).toContainText(
    `127.0.0.1:${port}/g/rina-dimas-2026-10-12`,
  );
  expect(await app.evaluate(({ clipboard }) => clipboard.readText())).toBe(
    `http://127.0.0.1:${port}/g/rina-dimas-2026-10-12`,
  );
  await w.screenshot({ path: "test-results/booth-recap-done.png" });
  await recap.getByRole("button", { name: "Tutup" }).click();
  // Rekap bisa dibuka lagi dari Ringkasan.
  await run.getByRole("button", { name: "Rekap Acara" }).click();
  await expect(recap).toBeVisible();
  await recap.getByRole("button", { name: "Tutup" }).click();
  await expect
    .poll(() => runs.map((r) => r.action))
    .toEqual(["start", "start", "pause", "start", "finish"]);
  // Hentikan Acara membawa ukuran folder event yang sama dengan rekap.
  expect(runs[4]?.local).toEqual(storage.at(-1));
  expect(runs[1]).not.toHaveProperty("local");
  const at = runs.slice(1).map((r) => Date.parse(r.at));
  expect(at).toEqual([...at].sort((a, b) => a - b));
  // Sudah dihentikan: Buka untuk Tamu bertanya dulu (#170); Tes dulu = timer tidak berubah.
  await w.getByTestId("to-guest").click();
  const again = w.getByTestId("start-dialog");
  await expect(again.getByRole("heading", { name: "Acara sudah dihentikan" })).toBeVisible();
  await expect(again.getByTestId("crew-entry-guide")).toContainText("Ketuk pojok kanan atas 5×");
  await w.screenshot({ path: "test-results/booth-start-finished.png" });
  await again.getByRole("button", { name: /^Tes dulu/ }).click();
  await expect(w.getByTestId("test-badge")).toBeVisible();
  expect(runs).toHaveLength(5);
  // Lanjutkan acara = segmen baru, timer jalan lagi (antrean run seperti Jeda/Lanjutkan).
  await openCrew(w);
  await typePin(w, "2468");
  await expect(run).toHaveAttribute("data-state", "finished");
  await w.getByTestId("to-guest").click();
  await again.getByRole("button", { name: /^Lanjutkan acara/ }).click();
  await expect(w.getByRole("heading", { name: "Rina & Dimas" })).toBeVisible();
  await expect(w.getByTestId("test-badge")).toHaveCount(0);
  await expect.poll(() => runs.map((r) => r.action).at(-1)).toBe("start");
  expect(runs).toHaveLength(6);
  await openCrew(w);
  await typePin(w, "2468");
  await expect(run).toHaveAttribute("data-state", "running");
  await w.getByTestId("to-guest").click();
  await expect(w.getByTestId("start-dialog")).toHaveCount(0);

  // Semua file sesi masuk R2 palsu dan tercatat (N4).
  await expect
    .poll(
      () =>
        sessions.length >= 2 &&
        recorded.length === sessions.slice(0, 2).reduce((a, x) => a + x.assetCount, 0),
      { timeout: 30_000 },
    )
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
