import type { TetraBridge } from "@tetra/platform-electron";
import { contextBridge, ipcRenderer } from "electron";

const bridge: TetraBridge = {
  health: () => ipcRenderer.invoke("health"),
  deviceInfo: () => ipcRenderer.invoke("deviceInfo"),
};

contextBridge.exposeInMainWorld("tetra", bridge);
