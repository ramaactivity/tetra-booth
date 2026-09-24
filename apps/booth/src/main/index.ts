import { join } from "node:path";
import { app, BrowserWindow } from "electron";
import { dataDir, windowSize } from "./config";
import { registerIpc } from "./ipc";

// Data lokal di %APPDATA%/TetraBooth (TSD §3), bukan nama produk dengan spasi.
app.setPath("userData", dataDir ?? join(app.getPath("appData"), "TetraBooth"));

const createWindow = () => {
  const win = new BrowserWindow({
    ...windowSize,
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, "../preload/index.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      // Booth tidak boleh melambat walau jendela tertutup jendela lain (timer sesi, live view, screenshot uji).
      backgroundThrottling: false,
    },
  });
  if (process.env.ELECTRON_RENDERER_URL) win.loadURL(process.env.ELECTRON_RENDERER_URL);
  else win.loadFile(join(__dirname, "../renderer/index.html"));
};

registerIpc();
app.whenReady().then(createWindow);
app.on("window-all-closed", () => app.quit());
