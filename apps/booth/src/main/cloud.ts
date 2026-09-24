import { type HeartbeatRequest, PairResponse } from "@tetra/shared";
import { app, safeStorage, screen } from "electron";
import type { Alerts } from "./alerts";
import type { BoothDb } from "./db";

/**
 * Koneksi cloud (Fase 2, N2/N5): pairing kode 6 digit → device token, heartbeat tiap 60 s saat online.
 * Token disimpan terenkripsi (DPAPI/Keychain lewat safeStorage) di kv, tidak pernah dikirim ke renderer.
 * Booth yang belum dipasangkan tetap jalan offline (DECISIONS #56).
 */
export type CloudDevice = { name: string; shortCode: string };

const HEARTBEAT_MS = 60_000;
const TIMEOUT_MS = 15_000;

const PAIR_ERRORS: Record<string, string> = {
  invalid_code: "Kode salah atau sudah kedaluwarsa",
  rate_limited: "Terlalu banyak percobaan, tunggu 10 menit",
  bad_request: "Kode harus 6 digit",
};

export function createCloud(
  db: BoothDb,
  alerts: Alerts,
  baseUrl: string,
  log: (m: string) => void,
) {
  const device = (): CloudDevice | null => {
    const v = db.kv.get("cloud_device");
    return v ? (JSON.parse(v) as CloudDevice) : null;
  };
  const token = (): string | null => {
    const v = db.kv.get("cloud_token");
    return v ? safeStorage.decryptString(Buffer.from(v, "base64")) : null;
  };

  const heartbeat = async () => {
    const t = token();
    if (!t) return;
    const { width, height } = screen.getPrimaryDisplay().size;
    const body: HeartbeatRequest = {
      appVersion: app.getVersion(),
      screen: { width, height },
      status: {
        activeEvent: db.kv.get("active_event_id") ?? "local",
        paper: db.paper(),
        printer: alerts.printer().status,
        uploadPending: db.uploadPending(),
      },
    };
    try {
      const res = await fetch(`${baseUrl}/api/booth/heartbeat`, {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${t}` },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      if (res.status === 401)
        log("[cloud] token ditolak server (dicabut?), pasangkan ulang dari mode crew");
      else if (!res.ok) log(`[cloud] heartbeat gagal ${res.status}`);
    } catch {
      // offline: diam, coba lagi di putaran berikutnya
    }
  };

  return {
    device,
    token,
    async pair(code: string): Promise<CloudDevice> {
      if (!safeStorage.isEncryptionAvailable())
        throw new Error("Penyimpanan terenkripsi tidak tersedia di laptop ini");
      let res: Response;
      try {
        res = await fetch(`${baseUrl}/api/booth/pair`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ code }),
          signal: AbortSignal.timeout(TIMEOUT_MS),
        });
      } catch {
        throw new Error("Tidak tersambung ke server. Cek internet lalu coba lagi");
      }
      const body: unknown = await res.json().catch(() => ({}));
      if (!res.ok) {
        const err = (body as { error?: string }).error ?? "";
        throw new Error(PAIR_ERRORS[err] ?? `Server menolak (${res.status})`);
      }
      const p = PairResponse.parse(body);
      db.kv.set("cloud_token", safeStorage.encryptString(p.token).toString("base64"));
      const d = { name: p.name, shortCode: p.shortCode };
      db.kv.set("cloud_device", JSON.stringify(d));
      log(`[cloud] dipasangkan sebagai ${d.name} (${d.shortCode}) ke ${baseUrl}`);
      void heartbeat();
      return d;
    },
    start() {
      void heartbeat();
      const t = setInterval(() => void heartbeat(), HEARTBEAT_MS);
      app.on("will-quit", () => clearInterval(t));
    },
  };
}

export type Cloud = ReturnType<typeof createCloud>;
