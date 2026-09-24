import type { BoothDb } from "@tetra/booth-core";
import type { CommandResult, Paper } from "@tetra/shared";

export type BoothConfig = {
  /** Sumber kamera Fase 1 (DECISIONS #26). */
  camera: "webcam" | "simulated";
  /** Sesi berjalan sendiri tanpa sentuhan. */
  demo: boolean;
  /** Base URL halaman tamu untuk QR, mis. https://app.tetraphoto.com. */
  guestUrl: string;
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
  printSubmit(job: { jobId: string; path: string; copies: number; paper: Paper }): Promise<void>;
  phaseChanged(phase: string): void;
  sessionStarted: BoothDb["sessionStarted"];
  sessionCompleted: BoothDb["sessionCompleted"];
};

declare global {
  interface Window {
    tetra: TetraBridge;
  }
}
