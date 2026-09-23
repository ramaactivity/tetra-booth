import { join } from "node:path";
import { app, BrowserWindow, ipcMain, screen } from "electron";
import { cameraHealth } from "./camera-client";

const createWindow = () => {
  const win = new BrowserWindow({
    width: 1280,
    height: 720,
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, "../preload/index.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  if (process.env.ELECTRON_RENDERER_URL) win.loadURL(process.env.ELECTRON_RENDERER_URL);
  else win.loadFile(join(__dirname, "../renderer/index.html"));
};

ipcMain.handle("health", () => cameraHealth());
ipcMain.handle("deviceInfo", () => ({
  id: null,
  appVersion: app.getVersion(),
  screen: screen.getPrimaryDisplay().size,
}));

app.whenReady().then(createWindow);
app.on("window-all-closed", () => app.quit());
