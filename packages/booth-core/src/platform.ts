import type { CameraInfoSchema, CommandResult, Paper, ServiceEvent } from "@tetra/shared";
import type { z } from "zod";

/**
 * Satu-satunya pintu booth-core ke perangkat. TSD §0.
 * Implementasi: `@tetra/platform-electron` (Fase 0–6), `platform-capacitor` (Fase 7).
 */

export type CameraInfo = z.infer<typeof CameraInfoSchema>;
export type CameraStatus = CommandResult<"camera.status">;
export type CaptureRequest = { sessionId: string; index: number };
export type CaptureResult = CommandResult<"capture">;
export type PrintJob = { jobId: string; path: string; copies: number; paper: Paper };
export type PrintStatus = CommandResult<"print.status">;

export type Unsubscribe = () => void;

export interface BoothPlatform {
  camera: {
    list(): Promise<CameraInfo[]>;
    connect(id: string): Promise<void>;
    /** Frame JPEG live view; renderer menggambar ke canvas dengan mirror. */
    startLiveView(onFrame: (jpeg: Uint8Array) => void): Promise<void>;
    stopLiveView(): Promise<void>;
    capture(req: CaptureRequest): Promise<CaptureResult>;
    status(): Promise<CameraStatus>;
    onEvent(cb: (e: ServiceEvent) => void): Unsubscribe;
  };
  printer: {
    submit(job: PrintJob): Promise<void>;
    status(jobId: string): Promise<PrintStatus>;
  };
  storage: {
    /** Folder sesi lokal, mis. %APPDATA%/TetraBooth/sessions/{id}. */
    sessionDir(sessionId: string): Promise<string>;
    writeFile(path: string, bytes: Uint8Array): Promise<void>;
    readFile(path: string): Promise<Uint8Array>;
  };
  // ponytail: `db` (Fase 1) dan `sync` (Fase 2) ditambah saat ada pemakainya. Lihat TSD §0.
  device: {
    info(): Promise<{
      id: string | null;
      appVersion: string;
      screen: { width: number; height: number };
    }>;
    keepAwake(on: boolean): Promise<void>;
    kiosk(on: boolean): Promise<void>;
  };
  /** Cek Camera Service hidup. */
  health(): Promise<CommandResult<"system.health">>;
}
