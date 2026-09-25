import "@sentry/electron/preload";
import type { TetraBridge } from "@tetra/platform-electron";
import { contextBridge, type IpcRendererEvent, ipcRenderer } from "electron";

const bridge: TetraBridge = {
  config: () => ipcRenderer.invoke("config"),
  health: () => ipcRenderer.invoke("health"),
  sessionDir: (id) => ipcRenderer.invoke("sessionDir", id),
  writeFile: (path, bytes) => ipcRenderer.invoke("writeFile", path, bytes),
  readFile: (path) => ipcRenderer.invoke("readFile", path),
  cameraCapture: (req) => ipcRenderer.invoke("cameraCapture", req),
  cameraStatus: () => ipcRenderer.invoke("cameraStatus"),
  liveViewStart: () => ipcRenderer.invoke("liveViewStart"),
  liveViewFrame: () => ipcRenderer.invoke("liveViewFrame"),
  liveViewStop: () => ipcRenderer.invoke("liveViewStop"),
  printSubmit: (job) => ipcRenderer.invoke("printSubmit", job),
  phaseChanged: (phase) => ipcRenderer.send("phaseChanged", phase),
  sessionStarted: (x) => ipcRenderer.invoke("sessionStarted", x),
  sessionCompleted: (x) => ipcRenderer.invoke("sessionCompleted", x),
  crewPinStatus: () => ipcRenderer.invoke("crewPinStatus"),
  crewVerify: (pin) => ipcRenderer.invoke("crewVerify", pin),
  crewSetPin: (pin) => ipcRenderer.invoke("crewSetPin", pin),
  crewLock: () => ipcRenderer.invoke("crewLock"),
  crewStatus: () => ipcRenderer.invoke("crewStatus"),
  crewResetPaper: (n) => ipcRenderer.invoke("crewResetPaper", n),
  crewFailedPrints: () => ipcRenderer.invoke("crewFailedPrints"),
  crewReprint: (id) => ipcRenderer.invoke("crewReprint", id),
  crewExit: () => ipcRenderer.invoke("crewExit"),
  crewPrinterSettings: () => ipcRenderer.invoke("crewPrinterSettings"),
  crewAutoStart: () => ipcRenderer.invoke("crewAutoStart"),
  crewSetAutoStart: (on) => ipcRenderer.invoke("crewSetAutoStart", on),
  crewPair: (code) => ipcRenderer.invoke("crewPair", code),
  crewSyncEvents: () => ipcRenderer.invoke("crewSyncEvents"),
  crewRetryUploads: () => ipcRenderer.invoke("crewRetryUploads"),
  crewCheckUpdate: () => ipcRenderer.invoke("crewCheckUpdate"),
  crewDevice: () => ipcRenderer.invoke("crewDevice"),
  crewSaveDevice: (s) => ipcRenderer.invoke("crewSaveDevice", s),
  crewCameraProps: () => ipcRenderer.invoke("crewCameraProps"),
  crewSetCameraProp: (n, v) => ipcRenderer.invoke("crewSetCameraProp", n, v),
  crewInstallUpdate: () => ipcRenderer.invoke("crewInstallUpdate"),
  printerAlert: () => ipcRenderer.invoke("printerAlert"),
  onPrinterAlert: (cb) => {
    const h = (_e: IpcRendererEvent, a: Parameters<typeof cb>[0]) => cb(a);
    ipcRenderer.on("printerAlert", h);
    return () => ipcRenderer.off("printerAlert", h);
  },
  onPrintUpdated: (cb) => {
    const h = (_e: IpcRendererEvent, u: Parameters<typeof cb>[0]) => cb(u);
    ipcRenderer.on("printUpdated", h);
    return () => ipcRenderer.off("printUpdated", h);
  },
  eventsList: () => ipcRenderer.invoke("eventsList"),
  eventsActive: () => ipcRenderer.invoke("eventsActive"),
  eventsSetActive: (id) => ipcRenderer.invoke("eventsSetActive", id),
  eventAsset: (e, a) => ipcRenderer.invoke("eventAsset", e, a),
  paymentCreate: (req) => ipcRenderer.invoke("paymentCreate", req),
  paymentStatus: (id) => ipcRenderer.invoke("paymentStatus", id),
};

contextBridge.exposeInMainWorld("tetra", bridge);
