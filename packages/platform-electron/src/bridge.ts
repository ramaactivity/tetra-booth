import type { CommandResult } from "@tetra/shared";

/**
 * API yang di-expose preload Electron ke renderer lewat contextBridge (`window.tetra`).
 * Dipakai bersama oleh apps/booth/src/preload dan adapter ini supaya tipenya satu.
 */
export type TetraBridge = {
  health(): Promise<CommandResult<"system.health">>;
  deviceInfo(): Promise<{
    id: string | null;
    appVersion: string;
    screen: { width: number; height: number };
  }>;
};

declare global {
  interface Window {
    tetra: TetraBridge;
  }
}
