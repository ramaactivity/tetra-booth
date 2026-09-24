import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { existsSync } from "node:fs";
import { createServer } from "node:net";
import { dirname, join } from "node:path";
import { app } from "electron";
import { cameraHealth, listenEvents, setEndpoint } from "./camera-client";
import { cameraServiceFlags } from "./config";
import type { BoothDb } from "./db";
import { createSupervisor } from "./supervisor";

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
export async function startCameraService(log: (m: string) => void, db: BoothDb) {
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
  const args = cameraServiceFlags.printerArgs;
  log(`[supervisor] ${bin} port ${port} ${args.join(" ")}`);

  // ponytail: kalau Electron crash, Camera Service yatim tetap hidup (Windows tidak ikut membunuh anak).
  // Aman karena port acak per start; bersihkan proses yatim di M5 (kiosk) kalau jadi masalah.
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
  });
  sup.start();
  const stopEvents = watchPrintEvents(log, db);
  app.on("will-quit", () => {
    stopEvents();
    sup.stop();
  });
  return sup;
}

/** Hasil cetak datang sebagai event, bukan balasan print.submit: catat ke print_jobs + log (M-007). */
export function watchPrintEvents(log: (m: string) => void, db: BoothDb) {
  return listenEvents((e) => {
    if (e.type === "print.done") {
      db.printJobResult(e.payload.jobId, "done");
      log(`[print] selesai ${e.payload.jobId}`);
    } else if (e.type === "print.failed") {
      db.printJobResult(e.payload.jobId, "failed", `${e.payload.code}: ${e.payload.message}`);
      log(`[print] GAGAL ${e.payload.jobId}: ${e.payload.code} ${e.payload.message}`);
    } else if (e.type === "printer.status") {
      log(
        `[print] printer ${e.payload.status}${e.payload.message ? `: ${e.payload.message}` : ""}`,
      );
    }
  });
}
