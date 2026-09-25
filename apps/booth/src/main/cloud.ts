import { join } from "node:path";
import {
  BoothEventsResponse,
  BoothUpdateResponse,
  BundleManifest,
  type HeartbeatRequest,
  PairResponse,
  type PaymentCreateRequest,
  PaymentCreateResponse,
  PaymentStatusResponse,
} from "@tetra/shared";
import { app, safeStorage, screen } from "electron";
import type { Alerts } from "./alerts";
import { installBundle } from "./bundle-sync";
import { cameraHealth } from "./camera-client";
import type { BoothDb } from "./db";
import { createUploader } from "./upload";

/**
 * Koneksi cloud (Fase 2, N2/N3/N5): pairing kode 6 digit → device token, heartbeat tiap 60 s,
 * tarik bundle event yang ditugaskan (saat boot, tiap 5 menit, dan dari mode crew), antrean upload sesi.
 * Token disimpan terenkripsi (DPAPI/Keychain lewat safeStorage) di kv, tidak pernah dikirim ke renderer.
 * Booth yang belum dipasangkan tetap jalan offline (DECISIONS #56).
 */
export type CloudDevice = { name: string; shortCode: string };

const HEARTBEAT_MS = 60_000;
const SYNC_MS = 5 * 60_000;
/** Cek antrean upload / koneksi (TSD §4.2). */
const UPLOAD_MS = 15_000;
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
    const camera = await cameraHealth().then(
      (h) => h,
      () => null,
    );
    const body: HeartbeatRequest = {
      appVersion: app.getVersion(),
      screen: { width, height },
      status: {
        activeEvent: db.kv.get("active_event_id") ?? "local",
        paper: db.paper(),
        printer: alerts.printer().status,
        camera,
        uploadPending: db.uploadPending(),
        lastError: db.uploadError(),
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

  const get = async (path: string, t: string) => {
    const res = await fetch(`${baseUrl}${path}`, {
      headers: { authorization: `Bearer ${t}` },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) throw new Error(`${path}: server ${res.status}`);
    return res.json() as Promise<unknown>;
  };
  const download = async (url: string) => {
    const res = await fetch(url, { signal: AbortSignal.timeout(60_000) });
    if (!res.ok) throw new Error(`unduh ${url}: ${res.status}`);
    return new Uint8Array(await res.arrayBuffer());
  };

  const api = async (path: string, body: unknown) => {
    const t = token();
    if (!t) throw new Error("booth belum dipasangkan");
    const res = await fetch(`${baseUrl}${path}`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${t}` },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) throw new Error(`${path}: server ${res.status}`);
    return res.json() as Promise<unknown>;
  };
  const uploader = createUploader({
    db,
    api,
    log,
    put: async (url, bytes, contentType) => {
      const res = await fetch(url, {
        method: "PUT",
        headers: { "content-type": contentType },
        body: new Uint8Array(bytes),
        signal: AbortSignal.timeout(120_000),
      });
      if (!res.ok) throw new Error(`R2 PUT ${res.status}`);
    },
  });
  const uploadQuiet = () => void uploader.drain();

  let syncing: Promise<number> | null = null;
  /** Unduh bundle event yang versinya berubah; kembalikan jumlah event yang diperbarui. Idempotent. */
  const syncEvents = () => {
    syncing ??= (async () => {
      const t = token();
      if (!t) return 0;
      const { events } = BoothEventsResponse.parse(await get("/api/booth/events", t));
      let updated = 0;
      for (const e of events) {
        if (db.kv.get(`bundle_version:${e.id}`) === String(e.bundleVersion)) continue;
        const m = BundleManifest.parse(await get(`/api/booth/events/${e.id}/bundle`, t));
        await installBundle(join(app.getPath("userData"), "events", e.id), m, download);
        db.kv.set(`bundle_version:${e.id}`, String(m.bundleVersion));
        log(`[cloud] bundle ${e.name} v${m.bundleVersion} terpasang`);
        updated++;
      }
      return updated;
    })().finally(() => {
      syncing = null;
    });
    return syncing;
  };
  const syncQuiet = () =>
    void syncEvents().catch((e: unknown) =>
      log(`[cloud] sync event gagal: ${e instanceof Error ? e.message : String(e)}`),
    );

  return {
    device,
    syncEvents,
    /** Sesi baru selesai: langsung coba unggah (tanpa menunggu putaran 15 dtk). */
    kickUpload: uploadQuiet,
    /** "Coba sekarang" dari mode crew: lewati backoff. */
    retryUploads() {
      db.uploadRetryNow(new Date().toISOString());
      return uploader.drain();
    },
    token,
    /** Rilis booth terbaru di cloud (DECISIONS #80); null = belum ada rilis. */
    async latestRelease() {
      const t = token();
      if (!t) throw new Error("booth belum dipasangkan");
      const res = await fetch(`${baseUrl}/api/booth/update`, {
        headers: { authorization: `Bearer ${t}` },
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      if (res.status === 404) return null;
      if (!res.ok) throw new Error(`/api/booth/update: server ${res.status}`);
      return BoothUpdateResponse.parse(await res.json());
    },
    /** Tagihan QRIS photobox (TSD §8). Gagal apa pun (offline, belum dipasangkan, server) = Error. */
    async createPayment(req: PaymentCreateRequest) {
      return PaymentCreateResponse.parse(await api("/api/booth/payments", req));
    },
    async paymentStatus(id: string) {
      const t = token();
      if (!t) throw new Error("booth belum dipasangkan");
      return PaymentStatusResponse.parse(await get(`/api/booth/payments/${id}`, t)).status;
    },
    async pair(code: string): Promise<CloudDevice> {
      // Booth hanya Windows (DPAPI) & macOS dev (Keychain); Linux = CI tanpa keyring.
      if (process.platform === "linux" && !safeStorage.isEncryptionAvailable())
        safeStorage.setUsePlainTextEncryption(true);
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
      syncQuiet();
      return d;
    },
    start() {
      void heartbeat();
      syncQuiet();
      const t = setInterval(() => void heartbeat(), HEARTBEAT_MS);
      const s = setInterval(syncQuiet, SYNC_MS);
      const u = setInterval(uploadQuiet, UPLOAD_MS);
      uploadQuiet();
      app.on("will-quit", () => {
        clearInterval(t);
        clearInterval(s);
        clearInterval(u);
      });
    },
  };
}

export type Cloud = ReturnType<typeof createCloud>;
