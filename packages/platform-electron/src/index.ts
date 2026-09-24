import {
  type BoothPlatform,
  type BoothStorage,
  createSimulatedCamera,
  createWebcamCamera,
} from "@tetra/booth-core";
import type { BoothConfig, TetraBridge } from "./bridge";

export type { BoothConfig, TetraBridge } from "./bridge";

/** Adapter BoothPlatform untuk Electron; berbicara ke main lewat `window.tetra`. */
export const createElectronPlatform = (bridge: TetraBridge, cfg: BoothConfig): BoothPlatform => {
  const storage: BoothStorage = {
    sessionDir: (id) => bridge.sessionDir(id),
    writeFile: (path, bytes) => bridge.writeFile(path, bytes),
    readFile: (path) => bridge.readFile(path),
  };
  return {
    camera:
      cfg.camera === "simulated" ? createSimulatedCamera(storage) : createWebcamCamera(storage),
    printer: { submit: (job) => bridge.printSubmit(job) },
    storage,
    health: () => bridge.health(),
    phaseChanged: (phase) => bridge.phaseChanged(phase),
  };
};
