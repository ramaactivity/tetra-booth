import {
  type BoothCamera,
  type BoothPlatform,
  type BoothStorage,
  createSimulatedCamera,
  createWebcamCamera,
  type FocusStep,
  withMirroredPhotos,
} from "@tetra/booth-core";
import type { BoothConfig, TetraBridge } from "./bridge";

export type { BoothConfig, TetraBridge } from "./bridge";

/**
 * Kamera di Camera Service (hot folder M7, Canon EDSDK Fase 1b): capture lewat main → WebSocket.
 * Tanpa live view (hot folder biasa) layar countdown menampilkan ajakan melihat ke kamera. Dengan
 * `cfg.liveView` (digiCamControl) frame JPEG diambil berulang lewat main, satu permintaan pada satu waktu.
 */
const LIVE_VIEW_IDLE_MS = 60_000;

const serviceCamera = (
  bridge: TetraBridge,
  liveView: boolean,
  /**
   * Canon EDSDK: nyalakan lagi EVF tepat setelah jepret (selama layar preview). 60D butuh ±1,5 s sampai frame
   * pertama, jadi tanpa ini separuh countdown 3 dtk berikutnya tanpa gambar. Jepret tetap dengan EVF mati: jepret
   * dengan EVF nyala memakai AF Live yang lambat (preview 5,3 s vs 1,9 s) dan gagal AF di tempat gelap (W-034).
   */
  rewarmAfterCapture = false,
): BoothCamera => {
  let run = 0;
  // Live view DSLR butuh 1–2 s untuk mulai; tetap nyala di antara foto satu sesi, mati setelah idle.
  let hide: ReturnType<typeof setTimeout> | undefined;
  const warm = () => {
    if (!liveView) return;
    clearTimeout(hide);
    void bridge.liveViewStart().catch(() => {});
    hide = setTimeout(() => void bridge.liveViewStop().catch(() => {}), LIVE_VIEW_IDLE_MS);
  };
  return {
    warm,
    startLiveView: async (onFrame) => {
      if (!liveView) return;
      clearTimeout(hide);
      const me = ++run;
      await bridge.liveViewStart();
      void (async () => {
        while (me === run) {
          const bytes = await bridge.liveViewFrame().catch(() => null);
          if (me !== run) break;
          // Gagal → tunggu lebih lama; kosong = belum ada frame baru → cek lagi 40 ms (maks ±25 permintaan/s).
          if (!bytes || bytes.length === 0) {
            await new Promise((r) => setTimeout(r, bytes ? 40 : 300));
            continue;
          }
          const bmp = await createImageBitmap(new Blob([bytes], { type: "image/jpeg" })).catch(
            () => null,
          );
          if (!bmp) continue;
          if (me === run) onFrame({ source: bmp, width: bmp.width, height: bmp.height });
          bmp.close();
        }
      })();
    },
    stopLiveView: async () => {
      if (!liveView) return;
      run++;
      clearTimeout(hide);
      hide = setTimeout(() => void bridge.liveViewStop().catch(() => {}), LIVE_VIEW_IDLE_MS);
    },
    // Live view dimatikan dulu: di 700D, jepret saat live view terus dibaca kadang membuat file tidak terkirim
    // ("EOS capture end" tanpa file) lalu kamera macet (W-031, 2026-09-25). Countdown berikutnya menyalakannya lagi.
    capture: async (req) => {
      if (liveView) {
        run++;
        clearTimeout(hide);
        await bridge.liveViewStop().catch(() => {});
        await new Promise((r) => setTimeout(r, 300));
      }
      if (!liveView || !rewarmAfterCapture) return bridge.cameraCapture(req);
      try {
        return await bridge.cameraCapture(req);
      } finally {
        warm();
      }
    },
    reconnect: async () => {
      const s = await bridge.cameraStatus();
      if (!s.connected) throw new Error("kamera Camera Service belum terhubung");
    },
  };
};

/** Adapter BoothPlatform untuk Electron; berbicara ke main lewat `window.tetra`. */
export const createElectronPlatform = (bridge: TetraBridge, cfg: BoothConfig): BoothPlatform => {
  const storage: BoothStorage = {
    sessionDir: (id) => bridge.sessionDir(id),
    writeFile: (path, bytes) => bridge.writeFile(path, bytes),
    readFile: (path) => bridge.readFile(path),
  };
  const camera =
    cfg.camera === "simulated"
      ? createSimulatedCamera(storage)
      : cfg.camera === "hotfolder" || cfg.camera === "canon"
        ? serviceCamera(bridge, !!cfg.liveView, cfg.camera === "canon")
        : createWebcamCamera(storage, cfg.webcamId);
  return {
    camera: cfg.mirrorPhoto ? withMirroredPhotos(camera, storage) : camera,
    mirrorLiveView: cfg.mirrorLiveView ?? true,
    printer: {
      submit: (job) => bridge.printSubmit(job),
      reprint: (req) => bridge.printReprint(req),
    },
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
      printerSettings: () => bridge.crewPrinterSettings(),
      autoStart: () => bridge.crewAutoStart(),
      setAutoStart: (on) => bridge.crewSetAutoStart(on),
      pair: (code) => bridge.crewPair(code),
      syncEvents: () => bridge.crewSyncEvents(),
      retryUploads: () => bridge.crewRetryUploads(),
      oldSessions: () => bridge.crewOldSessions(),
      reupload: (id, a) => bridge.crewReupload(id, a),
      checkUpdate: () => bridge.crewCheckUpdate(),
      device: () => bridge.crewDevice(),
      saveDevice: (s) => bridge.crewSaveDevice(s),
      cameraProps: () => bridge.crewCameraProps(),
      setCameraProp: (n, v) => bridge.crewSetCameraProp(n, v),
      eventSettings: (id) => bridge.crewEventSettings(id),
      setEventSettings: (id, o) => bridge.crewSetEventSettings(id, o),
      designs: (id) => bridge.crewDesigns(id),
      saveDesign: (id, l, f) => bridge.crewSaveDesign(id, l, f),
      resetDesign: (id, l) => bridge.crewResetDesign(id, l),
      ...(cfg.liveView ? { focus: (s: FocusStep) => bridge.crewFocus(s) } : {}),
      ...(cfg.camera === "canon"
        ? { focusAt: (x: number, y: number) => bridge.crewFocusAt(x, y) }
        : {}),
      installUpdate: () => bridge.crewInstallUpdate(),
      onUpdateProgress: (cb) => bridge.onUpdateProgress(cb),
      updateResult: () => bridge.updateResult(),
      openAdmin: (path) => bridge.crewOpenAdmin(path),
      printerAlert: () => bridge.printerAlert(),
      onPrinterAlert: (cb) => bridge.onPrinterAlert(cb),
      onPrintUpdated: (cb) => bridge.onPrintUpdated(cb),
    },
    events: {
      list: () => bridge.eventsList(),
      active: () => bridge.eventsActive(),
      setActive: (id) => bridge.eventsSetActive(id),
      asset: (e, a) => bridge.eventAsset(e, a),
      recentPieces: (e, n, before) => bridge.eventsRecentPieces(e, n, before),
    },
    payments: {
      create: (req) => bridge.paymentCreate(req),
      status: (id) => bridge.paymentStatus(id),
    },
    health: () => bridge.health(),
    phaseChanged: (phase) => bridge.phaseChanged(phase),
  };
};
