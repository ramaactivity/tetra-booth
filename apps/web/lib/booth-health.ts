import { BoothStatus } from "@tetra/shared";
import { isOnline } from "@/lib/format";

/**
 * Kesehatan booth dari heartbeat (tiap 60 dtk): satu sumber aturan untuk halaman Device dan Tetra Assistant (#264).
 */
export const PAPER_LOW = 30;
export const DISK_LOW_GB = 5;
export const OFFLINE_ALERT_MS = 12 * 3600_000;

export const PRINTER_TEXT: Record<string, string> = {
  ready: "Siap",
  error: "Error",
  unavailable: "Tidak terhubung",
};
export const CAMERA_KIND: Record<string, string> = {
  webcam: "Webcam",
  simulated: "Simulasi",
  hotfolder: "Hot folder",
  canon: "Canon",
  sony: "Sony",
  lumix: "Lumix",
  nikon: "Nikon",
};

/** Status perangkat: `detail` (model/nama) teks biasa, `text` di pill berwarna + teks. */
export type Pill = { detail?: string | null | undefined; text: string; tone: "ok" | "bad" | "off" };
export const TONE = { ok: "bg-mint-soft", bad: "bg-coral", off: "bg-neutral" } as const;

/** Masalah yang perlu ditangani crew (teks, bukan warna saja); dipakai juga untuk urutan kartu. */
export function problems(
  st: BoothStatus,
  lastSeen: string | null,
  now: number,
  paired: boolean,
  outdated: boolean,
) {
  const p: string[] = [];
  if (!paired) return p;
  // Offline: snapshot terakhir sudah basi. Hanya ditandai kalau baru hilang (< 12 jam, kemungkinan saat event),
  // booth yang lama disimpan tidak ikut naik ke atas.
  if (!isOnline(lastSeen, now))
    return lastSeen && now - Date.parse(lastSeen) < OFFLINE_ALERT_MS ? ["Booth offline"] : p;
  if (st.camera?.connected === false) p.push("Kamera tidak terhubung");
  if (st.printer && st.printer.status !== "ready" && st.printer.status !== "unknown")
    p.push(`Printer ${PRINTER_TEXT[st.printer.status]?.toLowerCase() ?? st.printer.status}`);
  if (st.paper && st.paper.remaining <= PAPER_LOW)
    p.push(`Kertas tinggal ${st.paper.remaining} lembar`);
  if (st.failedPrints) p.push(`${st.failedPrints} cetak gagal`);
  if (st.uploadPending && st.lastError) p.push(`Upload tersendat: ${st.lastError}`);
  if (st.diskFreeGb !== undefined && st.diskFreeGb < DISK_LOW_GB)
    p.push(`Disk tinggal ${st.diskFreeGb} GB`);
  if (outdated) p.push("Versi aplikasi lama");
  return p;
}

/** Ringkasan satu laptop booth untuk crew (Tetra Assistant & halaman crew Tetra Ops, #264). */
export function boothSummary(
  d: { name: string; short_code: string | null; last_seen_at: string | null; status: unknown },
  now = Date.now(),
) {
  const r = BoothStatus.safeParse(d.status);
  const st = r.success ? r.data : null;
  return {
    name: d.name,
    code: d.short_code,
    online: isOnline(d.last_seen_at, now),
    last_seen_at: d.last_seen_at,
    issues: st ? problems(st, d.last_seen_at, now, true, false) : [],
    paper: st?.paper ? { remaining: st.paper.remaining, capacity: st.paper.capacity } : null,
    failed_prints: st?.failedPrints ?? 0,
    upload_pending: st?.uploadPending ?? 0,
    camera: st?.camera
      ? {
          model: st.camera.model ?? CAMERA_KIND[st.camera.kind] ?? st.camera.kind,
          connected: st.camera.connected,
        }
      : null,
    printer: st?.printer ? { name: st.printer.name, status: st.printer.status } : null,
  };
}

/** Laptop yang menjalankan event ini (heartbeat `activeEvent`) atau yang ditugaskan ke event ini. */
export const boothsOfEvent = <D extends { id: string; status: unknown }>(
  e: { id: string; all_devices: boolean; event_devices: { device_id: string }[] },
  devices: D[],
) =>
  devices.filter(
    (d) =>
      BoothStatus.safeParse(d.status).data?.activeEvent === e.id ||
      (!e.all_devices && e.event_devices.some((x) => x.device_id === d.id)),
  );
