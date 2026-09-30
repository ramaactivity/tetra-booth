import type { BoothCrew, BoothDb, BoothEvents, BoothPayments } from "@tetra/booth-core";
import type { CommandResult, Paper } from "@tetra/shared";

export type BoothConfig = {
  /** Sumber kamera Fase 1 (DECISIONS #26). */
  camera: "webcam" | "simulated" | "hotfolder" | "canon";
  /** Sesi berjalan sendiri tanpa sentuhan. */
  demo: boolean;
  /** Demo dipercepat untuk stress test (M8): countdown 1 s, jeda pendek. */
  fast?: boolean;
  /** Base URL halaman tamu untuk QR, mis. https://booth.tetraphoto.com. */
  guestUrl: string;
  /** Kamera Camera Service punya live view (digiCamControl, `--digicam`). */
  liveView?: boolean;
  /** Mode kiosk aktif (M5): kursor disembunyikan di luar mode crew. */
  kiosk?: boolean;
  /** Layar awal pilih mode & event (DECISIONS #86): saat app dibuka manual, bukan saat dibuka ulang sendiri. */
  startScreen?: boolean;
  /** Putar video bumper saat event dibuka (#105). */
  bumper?: boolean;
  /** Webcam pilihan crew (`MediaDeviceInfo.deviceId`); kosong = bawaan. */
  webcamId?: string;
  /** Opsi crew: live view seperti cermin (bawaan nyala). */
  mirrorLiveView?: boolean;
  /** Opsi crew: hasil foto ikut dibalik (bawaan mati). */
  mirrorPhoto?: boolean;
};

/**
 * API yang di-expose preload Electron ke renderer lewat contextBridge (`window.tetra`).
 * Dipakai bersama oleh apps/booth/src/preload dan adapter ini supaya tipenya satu.
 * Semua input divalidasi ulang di main (batas IPC).
 */
export type TetraBridge = {
  config(): Promise<BoothConfig>;
  health(): Promise<CommandResult<"system.health">>;
  sessionDir(sessionId: string): Promise<string>;
  writeFile(path: string, bytes: Uint8Array): Promise<void>;
  readFile(path: string): Promise<Uint8Array<ArrayBuffer>>;
  cameraCapture(req: { sessionId: string; index: number }): Promise<CommandResult<"capture">>;
  cameraStatus(): Promise<CommandResult<"camera.status">>;
  liveViewStart(): Promise<void>;
  /** Satu frame JPEG live view yang baru; kosong = belum ada frame baru. */
  liveViewFrame(): Promise<Uint8Array<ArrayBuffer>>;
  liveViewStop(): Promise<void>;
  printSubmit(job: { jobId: string; path: string; copies: number; paper: Paper }): Promise<void>;
  phaseChanged(phase: string): void;
  sessionStarted: BoothDb["sessionStarted"];
  sessionCompleted: BoothDb["sessionCompleted"];
  crewPinStatus: BoothCrew["pinStatus"];
  crewVerify: BoothCrew["verifyPin"];
  crewSetPin: BoothCrew["setPin"];
  crewLock: BoothCrew["lock"];
  crewStatus: BoothCrew["status"];
  crewResetPaper: BoothCrew["resetPaper"];
  crewFailedPrints: BoothCrew["failedPrints"];
  crewReprint: BoothCrew["reprint"];
  crewExit: BoothCrew["exit"];
  crewPrinterSettings: BoothCrew["printerSettings"];
  crewAutoStart: BoothCrew["autoStart"];
  crewSetAutoStart: BoothCrew["setAutoStart"];
  crewPair: BoothCrew["pair"];
  crewSyncEvents: BoothCrew["syncEvents"];
  crewRetryUploads: BoothCrew["retryUploads"];
  crewCheckUpdate: BoothCrew["checkUpdate"];
  crewDevice: BoothCrew["device"];
  crewSaveDevice: BoothCrew["saveDevice"];
  crewCameraProps: BoothCrew["cameraProps"];
  crewSetCameraProp: BoothCrew["setCameraProp"];
  crewFocus: NonNullable<BoothCrew["focus"]>;
  crewFocusAt: NonNullable<BoothCrew["focusAt"]>;
  crewEventSettings: BoothCrew["eventSettings"];
  crewSetEventSettings: BoothCrew["setEventSettings"];
  crewDesigns: BoothCrew["designs"];
  crewSaveDesign: BoothCrew["saveDesign"];
  crewResetDesign: BoothCrew["resetDesign"];
  crewInstallUpdate: BoothCrew["installUpdate"];
  onUpdateProgress: BoothCrew["onUpdateProgress"];
  updateResult: BoothCrew["updateResult"];
  crewOpenAdmin: BoothCrew["openAdmin"];
  printerAlert: BoothCrew["printerAlert"];
  onPrinterAlert: BoothCrew["onPrinterAlert"];
  onPrintUpdated: BoothCrew["onPrintUpdated"];
  eventsList: BoothEvents["list"];
  eventsActive: BoothEvents["active"];
  eventsSetActive: BoothEvents["setActive"];
  eventAsset: BoothEvents["asset"];
  paymentCreate: BoothPayments["create"];
  paymentStatus: BoothPayments["status"];
};

declare global {
  interface Window {
    tetra: TetraBridge;
  }
}
