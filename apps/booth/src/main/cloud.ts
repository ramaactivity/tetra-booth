import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { statfs } from "node:fs/promises";
import { join } from "node:path";
import {
  BoothEventsResponse,
  type BoothStatus,
  BoothUpdateResponse,
  BundleManifest,
  EdsdkResponse,
  GalleryLinkResponse,
  type HeartbeatRequest,
  type LocalStorage,
  PairResponse,
  type PaymentCreateRequest,
  PaymentCreateResponse,
  PaymentStatusResponse,
  type RunAction,
} from "@tetra/shared";
import { app, safeStorage, screen } from "electron";
import type { Alerts } from "./alerts";
import { installBundle } from "./bundle-sync";
import { cameraHealth, request } from "./camera-client";
import { CloudError, cloudErrorText } from "./cloud-error";
import { config, printerName } from "./config";
import type { BoothDb } from "./db";
import { createRunQueue } from "./run-queue";
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

/** Pesan untuk crew di layar Sambungkan ke akun Tetra: apa yang salah + apa yang harus dilakukan. */
const PAIR_ERRORS: Record<string, string> = {
  invalid_code:
    "Kode salah atau sudah lewat 10 menit. Cek angkanya, atau minta admin menekan Buat kode baru.",
  rate_limited: "Terlalu banyak kode salah. Tunggu 10 menit, lalu coba lagi dengan kode baru.",
  bad_request: "Kode harus 6 angka.",
};

/**
 * Ringkasan kondisi booth untuk admin (monitoring jarak jauh). Semua dari data lokal + Camera Service
 * (timeout 3 dtk); bagian yang gagal dibaca dikosongkan, heartbeat tetap terkirim.
 */
async function statusSnapshot(db: BoothDb, alerts: Alerts): Promise<BoothStatus> {
  const activeEvent = db.kv.get("active_event_id") ?? "local";
  const userData = app.getPath("userData");
  let activeEventName: string | undefined;
  try {
    const cfg = JSON.parse(
      readFileSync(join(userData, "events", activeEvent, "bundle", "config.json"), "utf8"),
    ) as { name?: unknown };
    if (typeof cfg.name === "string") activeEventName = cfg.name.slice(0, 120);
  } catch {
    // bundle tidak ada/rusak: admin menampilkan id saja
  }
  const health = await cameraHealth().catch(() => null);
  const model =
    config.camera === "canon" || config.camera === "sony"
      ? await request({ id: randomUUID(), type: "camera.status" })
          .then((s) => s.model?.slice(0, 80) ?? null)
          .catch(() => null)
      : null;
  const printer = alerts.printer();
  const disk = await statfs(userData).catch(() => null);
  return {
    activeEvent,
    ...(activeEventName ? { activeEventName } : {}),
    camera: {
      kind: config.camera,
      // Webcam dibuka renderer, bukan Camera Service: main tidak tahu status sambungannya.
      connected: config.camera === "webcam" ? null : health?.camera === "connected",
      model,
    },
    printer: {
      name: printerName?.slice(0, 120) ?? null,
      status: health ? printer.status : "unavailable",
      message: printer.message?.slice(0, 200) ?? null,
    },
    paper: db.paper(),
    failedPrints: db.failedPrintCount(),
    uploadPending: db.uploadPending(),
    lastError: db.uploadError()?.slice(0, 300) ?? null,
    ...(disk ? { diskFreeGb: Math.round((disk.bavail * disk.bsize) / 1e8) / 10 } : {}),
  };
}

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
      status: await statusSnapshot(db, alerts),
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
    if (!res.ok) throw new CloudError(`${path}: server ${res.status}`, res.status);
    return res.json() as Promise<unknown>;
  };
  const download = async (url: string) => {
    const res = await fetch(url, { signal: AbortSignal.timeout(60_000) });
    if (!res.ok) throw new Error(`unduh ${url}: ${res.status}`);
    return new Uint8Array(await res.arrayBuffer());
  };

  const api = async (path: string, body: unknown) => {
    const t = token();
    if (!t) throw new CloudError("booth belum dipasangkan", 401);
    const res = await fetch(`${baseUrl}${path}`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${t}` },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) throw new CloudError(`${path}: server ${res.status}`, res.status);
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
  const runQueue = createRunQueue({
    kv: db.kv,
    log,
    post: async (path, body) => {
      const t = token();
      if (!t) throw new Error("booth belum dipasangkan");
      const res = await fetch(`${baseUrl}${path}`, {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${t}` },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      return { status: res.status, body: await res.json().catch(() => null) };
    },
  });
  const uploadQuiet = () => {
    void uploader.drain();
    void runQueue.drain();
  };
  /** Event cloud = bundle pernah diunduh dari cloud (event lokal/contoh tidak punya timer). */
  const cloudEvent = (eventId: string) => !!db.kv.get(`bundle_version:${eventId}`);

  let syncing: Promise<number> | null = null;
  /**
   * Unduh bundle event yang versinya berubah; kembalikan jumlah event yang diperbarui. Idempotent.
   * `force` (Sync dari Cloud oleh crew): pasang ulang walau versi sama, sehingga bundle lokal yang rusak/terubah
   * pulih (W-034). File yang hash-nya sama dipakai ulang, jadi yang diunduh hanya manifest.
   */
  const syncEvents = (force = false) => {
    syncing ??= (async () => {
      const t = token();
      if (!t) return 0;
      const { events } = BoothEventsResponse.parse(await get("/api/booth/events", t));
      let updated = 0;
      for (const e of events) {
        if (!force && db.kv.get(`bundle_version:${e.id}`) === String(e.bundleVersion)) continue;
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
    /** Timer event (#149): null = bukan event cloud. */
    runState: (eventId: string) => (cloudEvent(eventId) ? runQueue.state(eventId) : null),
    /** `arm` = Mulai acara (#152): timer mulai saat sesi tamu pertama. */
    runAction: (eventId: string, action: RunAction | "arm", local?: LocalStorage) =>
      !cloudEvent(eventId)
        ? null
        : action === "arm"
          ? runQueue.arm(eventId)
          : runQueue.push(eventId, action, local),
    /**
     * Laporkan ukuran folder event di laptop (#166) saat rekap booth dibuka. Idempotent (nilai terakhir menang);
     * offline / gagal = dilewati, terkirim lagi saat rekap dibuka berikutnya.
     */
    reportStorage(eventId: string, local: LocalStorage) {
      if (!cloudEvent(eventId) || !token()) return;
      api(`/api/booth/events/${eventId}/storage`, local).catch((e: unknown) =>
        log(
          `[cloud] ukuran folder event belum terkirim: ${e instanceof Error ? e.message : String(e)} (${cloudErrorText(e, "offline")})`,
        ),
      );
    },
    /** Sesi tamu (bukan tes) mulai: timer yang menunggu mulai di jam sesi itu. */
    sessionStarted: (eventId: string, at: string) => {
      if (cloudEvent(eventId)) runQueue.sessionStarted(eventId, at);
    },
    /** Timer menurut laptop ini (rekap booth offline, #154). */
    localRun: (eventId: string) => runQueue.localRun(eventId),
    /** Aktifkan link galeri klien event ini (#155) dan balas slug-nya. Offline/ditolak = Error. */
    async galleryLink(eventId: string) {
      return GalleryLinkResponse.parse(await api(`/api/booth/events/${eventId}/gallery-link`, {}))
        .slug;
    },
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
    /** DLL Canon EDSDK privat (DECISIONS #112); null = belum ada di cloud. */
    async edsdk() {
      const t = token();
      if (!t) throw new Error("booth belum dipasangkan");
      const res = await fetch(`${baseUrl}/api/booth/edsdk`, {
        headers: { authorization: `Bearer ${t}` },
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      if (res.status === 404) return null;
      if (!res.ok) throw new Error(`/api/booth/edsdk: server ${res.status}`);
      return EdsdkResponse.parse(await res.json());
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
        throw new Error(
          "Laptop booth tidak tersambung ke internet. Sambungkan ke Wi-Fi atau hotspot, lalu ketik kodenya lagi.",
        );
      }
      const body: unknown = await res.json().catch(() => ({}));
      if (!res.ok) {
        const err = (body as { error?: string }).error ?? "";
        throw new Error(
          PAIR_ERRORS[err] ??
            `Server sedang bermasalah (${res.status}). Coba lagi beberapa menit lagi.`,
        );
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
