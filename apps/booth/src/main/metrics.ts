import { app } from "electron";
import { cameraHealth } from "./camera-client";
import type { BoothDb } from "./db";

const mb = (kb: number) => Math.round(kb / 1024);

/**
 * Satu baris metrik ke log harian (M8): memori per jenis proses Electron + Camera Service, dan jumlah sesi.
 * Dipakai stress test untuk deteksi leak, juga di event nyata (lihat log setelah acara).
 */
export async function metricsLine(db: BoothDb): Promise<string> {
  const byType: Record<string, number> = {};
  for (const m of app.getAppMetrics()) {
    const key =
      m.type === "Browser"
        ? "main"
        : m.type === "Tab"
          ? "renderer"
          : m.type === "GPU"
            ? "gpu"
            : "lain";
    byType[key] = (byType[key] ?? 0) + mb(m.memory.workingSetSize);
  }
  const cam = await cameraHealth().catch(() => null);
  const electronTotal = Object.values(byType).reduce((a, b) => a + b, 0);
  const camMb = Math.round(cam?.workingSetMb ?? 0);
  return [
    "[metrics]",
    `sesi=${db.completedSessions()}`,
    `main=${byType.main ?? 0}`,
    `renderer=${byType.renderer ?? 0}`,
    `gpu=${byType.gpu ?? 0}`,
    `lain=${byType.lain ?? 0}`,
    `camera=${cam ? camMb : "-"}`,
    `handles=${cam?.handles ?? "-"}`,
    `total=${electronTotal + camMb}`,
  ].join(" ");
}

export function startMetrics(db: BoothDb, everySec: number, log: (m: string) => void) {
  const tick = () => void metricsLine(db).then(log, () => {});
  const t = setInterval(tick, everySec * 1000);
  app.on("will-quit", () => clearInterval(t));
  setTimeout(tick, 5000);
}
