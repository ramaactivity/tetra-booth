import type { BoothCrew, BoothDb, BoothEvents } from "@tetra/booth-core";
import type { CommandResult, Paper } from "@tetra/shared";

export type BoothConfig = {
  /** Sumber kamera Fase 1 (DECISIONS #26). */
  camera: "webcam" | "simulated" | "hotfolder";
  /** Sesi berjalan sendiri tanpa sentuhan. */
  demo: boolean;
  /** Base URL halaman tamu untuk QR, mis. https://app.tetraphoto.com. */
  guestUrl: string;
  /** Mode kiosk aktif (M5): kursor disembunyikan di luar mode crew. */
  kiosk?: boolean;
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
  crewAutoStart: BoothCrew["autoStart"];
  crewSetAutoStart: BoothCrew["setAutoStart"];
  printerAlert: BoothCrew["printerAlert"];
  onPrinterAlert: BoothCrew["onPrinterAlert"];
  onPrintUpdated: BoothCrew["onPrintUpdated"];
  eventsList: BoothEvents["list"];
  eventsActive: BoothEvents["active"];
  eventsSetActive: BoothEvents["setActive"];
  eventAsset: BoothEvents["asset"];
};

declare global {
  interface Window {
    tetra: TetraBridge;
  }
}
