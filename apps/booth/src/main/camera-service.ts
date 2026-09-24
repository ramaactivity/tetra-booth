import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { existsSync } from "node:fs";
import { createServer } from "node:net";
import { dirname, join } from "node:path";
import { app } from "electron";
import type { Alerts } from "./alerts";
import {
  cameraHealth,
  listenEvents,
  request,
  ServiceUnavailable,
  setEndpoint,
} from "./camera-client";
import { cameraServiceFlags } from "./config";
import type { BoothDb } from "./db";
import { createSupervisor } from "./supervisor";
import { waitUntil } from "./wait";

const EXE = process.platform === "win32" ? "TetraCamera.exe" : "TetraCamera";

/** Lokasi Camera Service: flag → zip dist:dev (app/booth + app/camera) → installer (resources/camera) → build dev di repo. */
function findBinary(): string | undefined {
  const candidates = [
    cameraServiceFlags.path,
    join(dirname(process.execPath), "..", "camera", EXE),
    join(process.resourcesPath ?? "", "camera", EXE),
    join(__dirname, "../../../../services/camera/TetraCamera.Host/bin/Debug/net10.0", EXE),
  ];
  return candidates.find((p): p is string => !!p && existsSync(p));
}

/** Health berulang tiap 150 ms sampai berhasil atau batas waktu habis. */
async function waitHealthy(timeoutMs: number): Promise<boolean> {
  const end = Date.now() + timeoutMs;
  while (Date.now() < end) {
    if (
      await cameraHealth().then(
        () => true,
        () => false,
      )
    )
      return true;
    await new Promise((r) => setTimeout(r, 150));
  }
  return false;
}

const freePort = () =>
  new Promise<number>((resolve, reject) => {
    const srv = createServer();
    srv.once("error", reject);
    srv.listen(0, "127.0.0.1", () => {
      const addr = srv.address();
      srv.close(() =>
        typeof addr === "object" && addr ? resolve(addr.port) : reject(new Error("port")),
      );
    });
  });

/**
 * Jalankan Camera Service di bawah supervisor dengan port & token acak (TSD §1).
 * Token lewat env, bukan argumen, supaya tidak terlihat di daftar proses.
 */
export async function startCameraService(log: (m: string) => void, db: BoothDb, alerts: Alerts) {
  const bin = findBinary();
  if (!bin) {
    log(
      "[supervisor] binary Camera Service tidak ditemukan; booth jalan tanpa printer. Pakai --camera-service=<path> atau --no-spawn.",
    );
    return undefined;
  }
  const port = await freePort();
  const token = randomBytes(24).toString("base64url");
  setEndpoint(port, token);
  // Jurnal print di folder data booth: kirim ulang setelah crash tidak mencetak dua kali (DECISIONS #39).
  const args = [
    ...cameraServiceFlags.args,
    "--print-journal",
    join(app.getPath("userData"), "print-journal.log"),
  ];
  log(`[supervisor] ${bin} port ${port} ${args.join(" ")}`);

  // ponytail: di macOS/Linux, Camera Service bisa yatim kalau Electron crash (port acak per start, jadi tidak bentrok).
  // Di Windows tidak terjadi: anak ikut mati lewat job object (W-013).
  const sup = createSupervisor({
    spawn: () => {
      const c = spawn(bin, args, {
        env: { ...process.env, TETRA_CAMERA_PORT: String(port), TETRA_CAMERA_TOKEN: token },
        stdio: ["ignore", "pipe", "pipe"],
        windowsHide: true,
      });
      c.stdout?.on("data", (b: Buffer) => log(`[camera] ${b.toString().trimEnd()}`));
      c.stderr?.on("data", (b: Buffer) => log(`[camera] ${b.toString().trimEnd()}`));
      return c;
    },
    health: cameraHealth,
    log,
    onReady: () => void resubmitPending(db, log),
  });
  sup.start();
  // Tunggu service siap sebelum jendela dibuka, supaya health pertama di renderer tidak gagal palsu (M-008).
  const t0 = Date.now();
  const ready = await waitHealthy(5000);
  log(
    `[supervisor] Camera Service ${ready ? `siap dalam ${Date.now() - t0} ms` : "belum siap setelah 5 s, booth tetap jalan"}`,
  );
  const stopEvents = watchPrintEvents(log, db, alerts);
  // Event printer.status pertama bisa terkirim sebelum koneksi event tersambung: isi status awal dari health (W-018).
  if (ready)
    void cameraHealth().then(
      (h) => alerts.onPrinterStatus(h.printer),
      () => {},
    );
  // Keluar dengan halus (M-012): tunggu print yang sedang diserahkan ke printer selesai (maks 15 s),
  // baru hentikan Camera Service. Menutup booth tepat setelah QR tidak boleh membatalkan cetakan tamu.
  let drained = false;
  app.on("before-quit", (e) => {
    if (drained) return;
    e.preventDefault();
    const since = () => new Date(Date.now() - RESUBMIT_WINDOW_MS).toISOString();
    void waitUntil(() => db.printsInFlight(since()) === 0, QUIT_DRAIN_MS).then((ok) => {
      const left = db.printsInFlight(since());
      log(
        ok
          ? "[print] antrean kosong, Camera Service dihentikan"
          : `[print] keluar dengan ${left} job belum selesai`,
      );
      drained = true;
      stopEvents();
      sup.stop();
      app.quit();
    });
  });
  app.on("will-quit", () => {
    stopEvents();
    sup.stop();
  });
  return sup;
}

/** Hasil cetak datang sebagai event, bukan balasan print.submit: catat ke print_jobs + log (M-007). */
export function watchPrintEvents(log: (m: string) => void, db: BoothDb, alerts: Alerts) {
  return listenEvents((e) => {
    if (e.type === "print.done") {
      db.printJobResult(e.payload.jobId, "done");
      alerts.onPrintDone(e.payload.jobId);
      log(`[print] selesai ${e.payload.jobId} · kertas ${db.paper().remaining}`);
    } else if (e.type === "print.failed") {
      db.printJobResult(e.payload.jobId, "failed", `${e.payload.code}: ${e.payload.message}`);
      alerts.onPrintFailed(e.payload.jobId, `${e.payload.code}: ${e.payload.message}`);
      log(`[print] GAGAL ${e.payload.jobId}: ${e.payload.code} ${e.payload.message}`);
    } else if (e.type === "printer.status") {
      alerts.onPrinterStatus(e.payload.status, e.payload.message);
      const msg = e.payload.message ? `: ${e.payload.message}` : "";
      log(`[print] printer ${e.payload.status}${msg}`);
    }
  });
}

/** Batas tunggu print selesai saat app ditutup (M-012). */
export const QUIT_DRAIN_MS = 15_000;

/** Batas kirim ulang print tertunda: umur job & jumlah percobaan (M-009, DECISIONS #38). */
export const RESUBMIT_WINDOW_MS = 10 * 60_000;
export const RESUBMIT_MAX_ATTEMPTS = 3;

/**
 * Setelah Camera Service (re)start dan sehat: kirim ulang print yang diterima tapi belum ada hasilnya.
 * Antrean print Camera Service ada di memori, jadi crash menghapusnya tanpa event. Risiko: cetak ganda
 * kalau crash terjadi setelah kertas keluar tapi sebelum print.done; lebih baik daripada tamu tanpa cetakan.
 */
export async function resubmitPending(db: BoothDb, log: (m: string) => void, now = Date.now()) {
  const since = new Date(now - RESUBMIT_WINDOW_MS).toISOString();
  const expired = db.printExpire(since, RESUBMIT_MAX_ATTEMPTS);
  if (expired) log(`[print] ${expired} job tidak terkirim, dipindah ke "Cetak gagal"`);
  for (const j of db.pendingPrints(since, RESUBMIT_MAX_ATTEMPTS)) {
    const paper = j.paper === "4R" ? "4R" : "2x6x2";
    // Percobaan dicatat dulu; kalau job sudah final (mis. print_uncertain), jangan kirim (M-012).
    if (
      !db.printSubmitting({
        id: j.id,
        sessionId: j.session_id,
        path: j.path,
        copies: j.copies,
        paper,
      })
    )
      continue;
    try {
      const r = await request({
        id: crypto.randomUUID(),
        type: "print.submit",
        payload: { jobId: j.id, path: j.path, copies: j.copies, paper },
      });
      if (!r.accepted) db.printJobResult(j.id, "failed", "print ditolak Camera Service");
      else log(`[print] kirim ulang ${j.id}`);
    } catch (e) {
      log(`[print] kirim ulang ${j.id} gagal: ${e instanceof Error ? e.message : String(e)}`);
      if (e instanceof ServiceUnavailable) return;
      db.printJobResult(j.id, "failed", e instanceof Error ? e.message : String(e));
    }
  }
}
