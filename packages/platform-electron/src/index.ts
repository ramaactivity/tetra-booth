import {
  type BoothCamera,
  type BoothPlatform,
  type BoothStorage,
  createSimulatedCamera,
  createWebcamCamera,
} from "@tetra/booth-core";
import type { BoothConfig, TetraBridge } from "./bridge";

export type { BoothConfig, TetraBridge } from "./bridge";

/**
 * Kamera di Camera Service (hot folder M7, Canon EDSDK Fase 1b): capture lewat main → WebSocket.
 * Hot folder tidak punya live view; layar countdown menampilkan ajakan melihat ke kamera.
 */
const serviceCamera = (bridge: TetraBridge): BoothCamera => ({
  startLiveView: async () => {},
  stopLiveView: async () => {},
  capture: (req) => bridge.cameraCapture(req),
  reconnect: async () => {
    const s = await bridge.cameraStatus();
    if (!s.connected) throw new Error("kamera Camera Service belum terhubung");
  },
});

/** Adapter BoothPlatform untuk Electron; berbicara ke main lewat `window.tetra`. */
export const createElectronPlatform = (bridge: TetraBridge, cfg: BoothConfig): BoothPlatform => {
  const storage: BoothStorage = {
    sessionDir: (id) => bridge.sessionDir(id),
    writeFile: (path, bytes) => bridge.writeFile(path, bytes),
    readFile: (path) => bridge.readFile(path),
  };
  return {
    camera:
      cfg.camera === "simulated"
        ? createSimulatedCamera(storage)
        : cfg.camera === "hotfolder"
          ? serviceCamera(bridge)
          : createWebcamCamera(storage),
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
      autoStart: () => bridge.crewAutoStart(),
      setAutoStart: (on) => bridge.crewSetAutoStart(on),
      pair: (code) => bridge.crewPair(code),
      syncEvents: () => bridge.crewSyncEvents(),
      printerAlert: () => bridge.printerAlert(),
      onPrinterAlert: (cb) => bridge.onPrinterAlert(cb),
      onPrintUpdated: (cb) => bridge.onPrintUpdated(cb),
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
