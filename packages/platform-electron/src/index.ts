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
    db: {
      sessionStarted: (x) => bridge.sessionStarted(x),
      sessionCompleted: (x) => bridge.sessionCompleted(x),
    },
    crew: {
      pinStatus: () => bridge.crewPinStatus(),
      verifyPin: (pin) => bridge.crewVerify(pin),
      setPin: (pin) => bridge.crewSetPin(pin),
      lock: () => bridge.crewLock(),
      status: () => bridge.crewStatus(),
      resetPaper: (n) => bridge.crewResetPaper(n),
      failedPrints: () => bridge.crewFailedPrints(),
      reprint: (id) => bridge.crewReprint(id),
      exit: () => bridge.crewExit(),
      printerAlert: () => bridge.printerAlert(),
      onPrinterAlert: (cb) => bridge.onPrinterAlert(cb),
    },
    events: {
      list: () => bridge.eventsList(),
      active: () => bridge.eventsActive(),
      setActive: (id) => bridge.eventsSetActive(id),
      asset: (e, a) => bridge.eventAsset(e, a),
    },
    health: () => bridge.health(),
    phaseChanged: (phase) => bridge.phaseChanged(phase),
  };
};
