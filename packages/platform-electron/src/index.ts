import type { BoothPlatform } from "@tetra/booth-core";
import type { TetraBridge } from "./bridge";

export type { TetraBridge } from "./bridge";

const todo = (name: string) => async (): Promise<never> => {
  throw new Error(`${name} belum diimplementasi (Fase 1)`);
};

/** Adapter BoothPlatform untuk Electron; berbicara ke main lewat `window.tetra`. */
export const createElectronPlatform = (bridge: TetraBridge): BoothPlatform => ({
  camera: {
    list: todo("camera.list"),
    connect: todo("camera.connect"),
    startLiveView: todo("camera.startLiveView"),
    stopLiveView: todo("camera.stopLiveView"),
    capture: todo("camera.capture"),
    status: todo("camera.status"),
    onEvent: () => () => {},
  },
  printer: { submit: todo("printer.submit"), status: todo("printer.status") },
  storage: {
    sessionDir: todo("storage.sessionDir"),
    writeFile: todo("storage.writeFile"),
    readFile: todo("storage.readFile"),
  },
  db: {},
  sync: { status: async () => ({ online: false, pending: 0, lastError: null }) },
  device: {
    info: () => bridge.deviceInfo(),
    keepAwake: todo("device.keepAwake"),
    kiosk: todo("device.kiosk"),
  },
  health: () => bridge.health(),
});
