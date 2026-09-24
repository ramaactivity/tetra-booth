import type { CommandResult, Paper } from "@tetra/shared";

/**
 * Satu-satunya pintu booth-core ke perangkat. TSD §0.
 * Implementasi: `@tetra/platform-electron` (Fase 0–6), `platform-capacitor` (Fase 7).
 */

/** Satu frame live view: video webcam, ImageBitmap dari JPEG DSLR, atau canvas simulasi. */
export type LiveFrame = { source: CanvasImageSource; width: number; height: number };
export type CaptureRequest = { sessionId: string; index: number };
/** File foto sudah tersimpan di disk lokal. */
export type CaptureResult = CommandResult<"capture">;
export type PrintJob = { jobId: string; path: string; copies: number; paper: Paper };

export interface BoothCamera {
  startLiveView(onFrame: (frame: LiveFrame) => void): Promise<void>;
  stopLiveView(): Promise<void>;
  capture(req: CaptureRequest): Promise<CaptureResult>;
  /** Buka ulang koneksi kamera setelah gagal (FSD §1.7). */
  reconnect(): Promise<void>;
}

export interface BoothStorage {
  /** Folder sesi lokal (sudah dibuat, berisi `raw/` dan `out/`), mis. %APPDATA%/TetraBooth/sessions/{id}. */
  sessionDir(sessionId: string): Promise<string>;
  writeFile(path: string, bytes: Uint8Array): Promise<void>;
  readFile(path: string): Promise<Uint8Array<ArrayBuffer>>;
}

export type AssetKind = "strip" | "strip_web" | "original" | "thumb_strip" | "thumb_original";
export type SessionAsset = { kind: AssetKind; idx: number; path: string; bytes: number };

/** Repositori SQLite lokal (06-DATA-MODEL §3). Semua idempotent. */
export interface BoothDb {
  sessionStarted(s: {
    id: string;
    eventId: string;
    layoutVersionId: string;
    startedAt: string;
  }): Promise<void>;
  /** Sesi + aset + antrean upload dalam satu transaksi (TSD §4.2). */
  sessionCompleted(s: {
    id: string;
    completedAt: string;
    photoCount: number;
    retakeCount: number;
    printCount: number;
    assets: SessionAsset[];
  }): Promise<void>;
}

export interface BoothPlatform {
  camera: BoothCamera;
  /** Gagal = reject. Sesi tetap selesai walau print gagal (FSD §1.10). */
  printer: { submit(job: PrintJob): Promise<void> };
  storage: BoothStorage;
  db: BoothDb;
  // ponytail: sync (Fase 2), keepAwake/kiosk (M5) ditambah saat ada pemakainya.
  /** Cek Camera Service hidup. */
  health(): Promise<CommandResult<"system.health">>;
  /** Kabari shell tiap pergantian fase (log, screenshot uji). */
  phaseChanged(phase: string): void;
}
