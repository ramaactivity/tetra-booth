import type { BoothCrew, BoothDb, BoothEvents, BoothPayments } from "@tetra/booth-core";
import type { CommandResult, Paper } from "@tetra/shared";

export type BoothConfig = {
  /** Sumber kamera Fase 1 (DECISIONS #26). */
  camera: "webcam" | "simulated" | "hotfolder";
  /** Sesi berjalan sendiri tanpa sentuhan. */
  demo: boolean;
  /** Demo dipercepat untuk stress test (M8): countdown 1 s, jeda pendek. */
  fast?: boolean;
  /** Base URL halaman tamu untuk QR, mis. https://booth.tetraphoto.com. */
  guestUrl: string;
  /** Mode kiosk aktif (M5): kursor disembunyikan di luar mode crew. */
  kiosk?: boolean;
  /** Webcam pilihan crew (`MediaDeviceInfo.deviceId`); kosong = bawaan. */
  webcamId?: string;
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
  crewInstallUpdate: BoothCrew["installUpdate"];
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
