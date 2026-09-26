import type {
  AssetKindName,
  CommandResult,
  EventBundle,
  Paper,
  PaymentCreateRequest,
  PaymentCreateResponse,
  PaymentStatus,
} from "@tetra/shared";

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

export type AssetKind = AssetKindName;
export type SessionAsset = { kind: AssetKind; idx: number; path: string; bytes: number };

/** Repositori SQLite lokal (06-DATA-MODEL §3). Semua idempotent. */
export interface BoothDb {
  sessionStarted(s: {
    id: string;
    eventId: string;
    layoutVersionId: string;
    startedAt: string;
    /** Photobox: pembayaran paket yang lunas. */
    paymentId?: string;
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

export type Unsubscribe = () => void;
export type CrewStatus = {
  online: boolean;
  /** Jumlah file di antrean upload. */
  uploadPending: number;
  uploadError: string | null;
  paper: { remaining: number; capacity: number };
  printer: { status: string; message?: string | undefined };
  cameraService: boolean;
  /** Booth di cloud (Fase 2), null = belum dipasangkan. */
  device: CloudDevice | null;
};

export type CloudDevice = { name: string; shortCode: string };
/** Kamera & printer dari mode crew (DECISIONS #85). */
export type DeviceSettings = {
  camera?: "webcam" | "simulated" | "hotfolder";
  webcamId?: string;
  hotFolder?: string;
  hotFolderTrigger?: string;
  printer?: string;
};
/** `locked` = flag yang dipaksa baris perintah (tidak bisa diubah dari mode crew). */
export type DeviceInfo = { now: DeviceSettings; locked: string[]; printers: string[] };
/** Setelan eksposur kamera DSLR (sementara lewat digiCamControl). */
export type CameraProp = { name: string; label: string; value: string; options: string[] };
/** `ready` = installer versi terbaru sudah terunduh di latar belakang (tinggal dipasang). */
export type UpdateCheck = {
  current: string;
  latest: string | null;
  available: boolean;
  ready?: boolean;
};
/** Hasil update terakhir, dibaca sekali setelah booth terbuka lagi. */
export type UpdateResult = { ok: boolean; from: string; to: string; now: string } | null;
export type FailedPrint = { id: string; copies: number; error: string | null; createdAt: string };
/** Peringatan kecil untuk crew di pojok layar (printer error, cetak gagal, kertas menipis). */
export type PrinterAlert = { message: string } | null;

export type PrintUpdate = { jobId: string; ok: boolean; message?: string };

/** Mode crew (FSD §1.3). Selain PIN, semua aksi ditolak shell kalau crew belum masuk. */
export interface BoothCrew {
  pinStatus(): Promise<{ hasPin: boolean; lockedUntil: number | null }>;
  verifyPin(pin: string): Promise<{ ok: boolean; lockedUntil: number | null }>;
  setPin(pin: string): Promise<void>;
  lock(): Promise<void>;
  status(): Promise<CrewStatus>;
  resetPaper(capacity: number): Promise<void>;
  failedPrints(): Promise<FailedPrint[]>;
  /** Cetak ulang job gagal sebagai job baru; kembalikan id job baru. */
  reprint(jobId: string): Promise<string>;
  exit(): Promise<void>;
  /** Buka dialog Printing Preferences printer (potong 2 inci DNP hanya bisa diatur di sana, DECISIONS #59). */
  printerSettings(): Promise<void>;
  /** Jalankan booth saat Windows login (M5). `supported` false di mode dev. */
  autoStart(): Promise<{ enabled: boolean; supported: boolean }>;
  setAutoStart(on: boolean): Promise<{ enabled: boolean; supported: boolean }>;
  /** Pasangkan booth ke cloud dengan kode 6 digit dari owner (FSD §1.2); gagal → Error berpesan untuk crew. */
  pair(code: string): Promise<CloudDevice>;
  /** Tarik bundle event yang ditugaskan dari cloud; kembalikan jumlah event yang diperbarui. */
  syncEvents(): Promise<number>;
  /** Unggah antrean sekarang juga, lewati jeda backoff (FSD §1.3 "coba sekarang"). */
  retryUploads(): Promise<void>;
  device(): Promise<DeviceInfo>;
  /** Simpan pengaturan perangkat; booth dibuka ulang supaya kamera & printer baru dipakai. */
  saveDevice(s: DeviceSettings): Promise<void>;
  /** Setelan eksposur DSLR yang tersedia (kosong = bukan DSLR / digiCamControl tidak menjawab). */
  cameraProps(): Promise<CameraProp[]>;
  setCameraProp(name: string, value: string): Promise<void>;
  /** Bandingkan versi terpasang dengan rilis terbaru di cloud (DECISIONS #80). */
  checkUpdate(): Promise<UpdateCheck>;
  /** Unduh & pasang versi terbaru; aplikasi tertutup lalu terbuka lagi. Hanya booth Windows. */
  installUpdate(): Promise<void>;
  /** Kemajuan unduhan update (byte), untuk ditampilkan ke crew (#89). */
  onUpdateProgress(cb: (p: { received: number; total: number }) => void): Unsubscribe;
  /** Update terakhir berhasil / gagal dipasang (sekali, setelah booth dibuka lagi). */
  updateResult(): Promise<UpdateResult>;
  /** Buka dashboard admin di browser; kiosk dilepas sementara. Hanya saat mode crew terbuka. */
  openAdmin(): Promise<void>;
  printerAlert(): Promise<PrinterAlert>;
  onPrinterAlert(cb: (a: PrinterAlert) => void): Unsubscribe;
  /** Setiap print selesai/gagal (menyegarkan kertas & daftar gagal, dan hasil test print di menu crew). */
  onPrintUpdated(cb: (u: PrintUpdate) => void): Unsubscribe;
}

/** Event dari bundle lokal (M6; Fase 2 lewat sync). */
export interface BoothEvents {
  list(): Promise<EventBundle[]>;
  active(): Promise<string | null>;
  setActive(id: string): Promise<void>;
  asset(eventId: string, assetId: string): Promise<Uint8Array<ArrayBuffer>>;
}

/** QRIS photobox lewat cloud (TSD §8). Satu-satunya langkah yang butuh internet; gagal = reject. */
export interface BoothPayments {
  create(req: PaymentCreateRequest): Promise<PaymentCreateResponse>;
  status(paymentId: string): Promise<PaymentStatus>;
}

export interface BoothPlatform {
  camera: BoothCamera;
  /** Gagal = reject. Sesi tetap selesai walau print gagal (FSD §1.10). */
  printer: { submit(job: PrintJob): Promise<void> };
  storage: BoothStorage;
  db: BoothDb;
  crew: BoothCrew;
  events: BoothEvents;
  payments: BoothPayments;
  // ponytail: sync (Fase 2), keepAwake/kiosk (M5) ditambah saat ada pemakainya.
  /** Cek Camera Service hidup. */
  health(): Promise<CommandResult<"system.health">>;
  /** Kabari shell tiap pergantian fase (log, screenshot uji). */
  phaseChanged(phase: string): void;
}
