import type { TetraBridge } from "@tetra/platform-electron";
import { contextBridge, ipcRenderer } from "electron";

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
};

contextBridge.exposeInMainWorld("tetra", bridge);
