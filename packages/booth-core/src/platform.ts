import type {
  AssetKindName,
  CommandResult,
  EventBundle,
  EventInfo,
  EventRun,
  EventSettings,
  LayoutSpec,
  Paper,
  PaymentCreateRequest,
  PaymentCreateResponse,
  PaymentStatus,
  RunAction,
  RunState,
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
/** Cetak lagi dari galeri tamu (#145): lembar cetak sesi (out/strip.jpg), dibatasi `max` lembar per sesi. */
export type ReprintRequest = { sessionId: string; copies: number; max: number; paper: Paper };
/** `jobId` null = batas tercapai, tidak dicetak. `reprinted` = total lembar cetak ulang galeri sesi ini. */
export type ReprintResult = { jobId: string | null; reprinted: number };

export interface BoothCamera {
  startLiveView(onFrame: (frame: LiveFrame) => void): Promise<void>;
  stopLiveView(): Promise<void>;
  capture(req: CaptureRequest): Promise<CaptureResult>;
  /** Nyalakan live view kamera lebih awal tanpa membaca frame (DSLR butuh ±1,5 s sampai frame pertama). */
  warm?(): void;
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
    /** Sesi mode "Tes dulu" crew (#153): tidak dihitung, tidak tampil di galeri. */
    isTest?: boolean;
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
/** Timer event menurut booth: `waiting` = Mulai acara ditekan, menunggu sesi tamu pertama (#152). */
export type BoothRunState = RunState | "waiting";
/** Rekap booth (#154), dihitung dari data laptop ini (jalan offline). */
export type BoothRecap = {
  /** Sesi asli selesai (tanpa sesi tes). */
  sessions: number;
  /** Lembar dicetak, termasuk cetak lagi dari galeri. */
  prints: number;
  tests: number;
  firstAt: string | null;
  lastAt: string | null;
  /** Timer menurut laptop ini; null = event lokal (bukan cloud). */
  run: EventRun | null;
  /** Jadwal, paket, slug dari bundle cloud. */
  info: EventInfo;
};
/** Ukuran folder event di laptop ini (#166). `drives` = flashdisk terpasang, ruang dalam byte. */
export type EventSize = {
  bytes: number;
  files: number;
  drives: { name: string; free: number; total: number }[];
};
/** Kamera & printer dari mode crew (DECISIONS #85). */
export type DeviceSettings = {
  camera?: "webcam" | "simulated" | "hotfolder" | "canon" | "sony";
  webcamId?: string;
  /** Live view seperti cermin (bawaan nyala, FSD §1.7). */
  mirrorLiveView?: boolean;
  /** Hasil foto ikut dibalik seperti cermin (bawaan mati, DECISIONS #35). */
  mirrorPhoto?: boolean;
  /** DSLR: autofocus di awal tiap countdown (#88). */
  afBeforeCapture?: boolean;
  hotFolder?: string;
  hotFolderTrigger?: string;
  printer?: string;
};
/** `locked` = flag yang dipaksa baris perintah (tidak bisa diubah dari mode crew). */
export type DeviceInfo = { now: DeviceSettings; locked: string[]; printers: string[] };
/** Field pengaturan event yang boleh diubah crew di booth (DECISIONS #100). */
export type EventOverride = Partial<
  Pick<EventSettings, "countdownSec" | "retakeMax" | "maxPrints" | "qrScreenSec" | "sessionSec">
>;
export type EventSettingsInfo = { cloud: EventSettings; override: EventOverride };
/** File aset baru dari editor desain booth (overlay/latar/font); disimpan di folder lokal event. */
export type DesignFile = { assetId: string; ext: string; bytes: Uint8Array<ArrayBuffer> };
/** AF, atau geser fokus manual kecil/sedang/besar ke dekat / jauh. */
export type FocusStep = "af" | "near3" | "near2" | "near1" | "far1" | "far2" | "far3";
/** Setelan eksposur kamera DSLR (Canon EDSDK, #113). */
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

/** Sesi lama tanpa potongan web 2× (#140): foto raw urut & potongan 1× tersimpan (null = tidak ada). */
export type OldSession = { id: string; eventId: string; photos: string[]; piece: string | null };

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
  /** Sesi selesai event cloud yang strip_web-nya masih 1× (belum ada out/piece@2x.jpg), urut per event (#140). */
  oldSessions(): Promise<OldSession[]>;
  /** Tandai aset sesi yang ditulis ulang (strip_web/thumb_strip) untuk diunggah lagi lewat antrean upload. */
  reupload(sessionId: string, assets: SessionAsset[]): Promise<void>;
  /** Timer event (#149) menurut booth ini; null = event lokal (bukan dari cloud). */
  runState(eventId: string): Promise<BoothRunState | null>;
  /**
   * Catat aksi timer (jam laptop saat ditekan) dan kirim ke cloud lewat antrean (offline aman).
   * `open` = Buka untuk Tamu: mulai/lanjutkan kalau belum selesai. Balas state baru; null = event lokal.
   */
  eventRun(eventId: string, action: RunAction | "arm"): Promise<BoothRunState | null>;
  /** Rekap acara di booth (#154). */
  recap(eventId: string): Promise<BoothRecap>;
  /**
   * Ukuran isi Buka Folder Event (#166, dihitung dari file sumber) + flashdisk terpasang (Windows; kosong kalau
   * tidak terdeteksi). Online = sekalian dilaporkan ke cloud.
   */
  eventSize(eventId: string): Promise<EventSize>;
  /** Kumpulkan file sesi event ini ke satu folder lalu buka di Explorer (#155). Balas path folder. */
  openEventFolder(eventId: string): Promise<string>;
  /** Aktifkan link galeri klien & salin alamatnya ke clipboard (#155). Offline = Error berpesan. */
  galleryLink(eventId: string): Promise<string>;
  /** Unggah antrean sekarang juga, lewati jeda backoff (FSD §1.3 "coba sekarang"). */
  retryUploads(): Promise<void>;
  device(): Promise<DeviceInfo>;
  /** Simpan pengaturan perangkat; booth dibuka ulang supaya kamera & printer baru dipakai. */
  saveDevice(s: DeviceSettings): Promise<void>;
  /** Setelan eksposur DSLR yang tersedia (kosong = bukan DSLR Canon / kamera belum tersambung). */
  cameraProps(): Promise<CameraProp[]>;
  setCameraProp(name: string, value: string): Promise<void>;
  /** Pengaturan event: nilai cloud + override lokal booth (DECISIONS #100). */
  eventSettings(eventId: string): Promise<EventSettingsInfo>;
  /** Simpan override (hanya field yang beda dari cloud disimpan); null = kembalikan ke cloud. */
  setEventSettings(eventId: string, override: EventOverride | null): Promise<EventSettingsInfo>;
  /** Desain yang diedit di booth (DECISIONS #128/#131): layout.id → ISO waktu simpan. */
  designs(eventId: string): Promise<Record<string, string>>;
  /** Simpan layout hasil editor sebagai override lokal; `files` = aset baru. Balas ISO waktu simpan. */
  saveDesign(eventId: string, layout: LayoutSpec, files: DesignFile[]): Promise<string>;
  /** Kembalikan desain ke versi cloud: satu layout.id, atau semua (null). */
  resetDesign(eventId: string, layoutId: string | null): Promise<void>;
  /** Fokus DSLR lewat live view (#88); tidak ada = kamera tanpa live view (webcam, hot folder). */
  focus?(step: FocusStep): Promise<void>;
  /** Tap to focus (#114, Canon EDSDK): titik 0–1 di frame kamera (tanpa cermin). */
  focusAt?(x: number, y: number): Promise<void>;
  /** Bandingkan versi terpasang dengan rilis terbaru di cloud (DECISIONS #80). */
  checkUpdate(): Promise<UpdateCheck>;
  /** Unduh & pasang versi terbaru; aplikasi tertutup lalu terbuka lagi. Hanya booth Windows. */
  installUpdate(): Promise<void>;
  /** Kemajuan unduhan update (byte), untuk ditampilkan ke crew (#89). */
  onUpdateProgress(cb: (p: { received: number; total: number }) => void): Unsubscribe;
  /** Update terakhir berhasil / gagal dipasang (sekali, setelah booth dibuka lagi). */
  updateResult(): Promise<UpdateResult>;
  /** Buka dashboard admin di browser; kiosk dilepas sementara. Hanya saat mode crew terbuka. */
  openAdmin(path?: string): Promise<void>;
  printerAlert(): Promise<PrinterAlert>;
  onPrinterAlert(cb: (a: PrinterAlert) => void): Unsubscribe;
  /** Setiap print selesai/gagal (menyegarkan kertas & daftar gagal, dan hasil test print di menu crew). */
  onPrintUpdated(cb: (u: PrintUpdate) => void): Unsubscribe;
}

/** Satu sesi selesai: `path` = potongan kecil (layar awal), `full` = potongan paling tajam (galeri). */
export type SessionPiece = {
  sessionId: string;
  path: string;
  full: string;
  completedAt: string;
  /** layout.id desain yang dipakai sesi ini (kertas cetak ulang). */
  layoutId: string;
  printCount: number;
  reprinted: number;
};
/** `hours` = jam UTC "YYYY-MM-DDTHH" yang punya sesi, terbaru dulu; `total` = semua sesi selesai event. */
export type PiecePage = {
  total: number;
  hours: { hour: string; n: number }[];
  pieces: SessionPiece[];
};

/** Event dari bundle lokal (M6; Fase 2 lewat sync). */
export interface BoothEvents {
  list(): Promise<EventBundle[]>;
  active(): Promise<string | null>;
  setActive(id: string): Promise<void>;
  asset(eventId: string, assetId: string): Promise<Uint8Array<ArrayBuffer>>;
  /**
   * Hasil desain sesi selesai event ini di laptop ini, terbaru dulu (layar awal #143, galeri #145).
   * `before` = `completedAt` kartu terakhir halaman sebelumnya.
   */
  recentPieces(eventId: string, limit: number, before?: string): Promise<PiecePage>;
}

/** QRIS photobox lewat cloud (TSD §8). Satu-satunya langkah yang butuh internet; gagal = reject. */
export interface BoothPayments {
  create(req: PaymentCreateRequest): Promise<PaymentCreateResponse>;
  status(paymentId: string): Promise<PaymentStatus>;
}

export interface BoothPlatform {
  camera: BoothCamera;
  /** Gagal = reject. Sesi tetap selesai walau print gagal (FSD §1.10). */
  printer: {
    submit(job: PrintJob): Promise<void>;
    /** Cetak lagi dari galeri lewat antrean & tabel print_jobs yang sama (#145). */
    reprint(req: ReprintRequest): Promise<ReprintResult>;
  };
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
  /** Live view di-mirror (bawaan true); false = seperti yang dilihat kamera. */
  mirrorLiveView?: boolean;
}
