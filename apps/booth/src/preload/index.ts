import type { TetraBridge } from "@tetra/platform-electron";
import { contextBridge, type IpcRendererEvent, ipcRenderer } from "electron";

const bridge: TetraBridge = {
  config: () => ipcRenderer.invoke("config"),
  health: () => ipcRenderer.invoke("health"),
  sessionDir: (id) => ipcRenderer.invoke("sessionDir", id),
  writeFile: (path, bytes) => ipcRenderer.invoke("writeFile", path, bytes),
  readFile: (path) => ipcRenderer.invoke("readFile", path),
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
  printerAlert: () => ipcRenderer.invoke("printerAlert"),
  onPrinterAlert: (cb) => {
    const h = (_e: IpcRendererEvent, a: Parameters<typeof cb>[0]) => cb(a);
    ipcRenderer.on("printerAlert", h);
    return () => ipcRenderer.off("printerAlert", h);
  },
  eventsList: () => ipcRenderer.invoke("eventsList"),
  eventsActive: () => ipcRenderer.invoke("eventsActive"),
  eventsSetActive: (id) => ipcRenderer.invoke("eventsSetActive", id),
  eventAsset: (e, a) => ipcRenderer.invoke("eventAsset", e, a),
};

contextBridge.exposeInMainWorld("tetra", bridge);
