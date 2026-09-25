import { execFile, spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { connect } from "node:net";
import { dirname, join } from "node:path";

/**
 * Kamera DSLR sebelum EDSDK lewat digiCamControl (DECISIONS #48): shutter dipicu lewat web server-nya
 * (port 5513) dan foto masuk hot folder. `--digicam` menambahkan: buka digiCamControl otomatis bila belum
 * jalan, dan live view dari `/liveview.jpg` (frame JPEG ±960×640, ±8 fps di 700D).
 */
const DIGICAM_PORT = 5513;
const SETTLE_MS = 20_000;
/** Dipakai Camera Service (.NET HttpClient, toleran terhadap header ganda) untuk memicu shutter. */
export const DIGICAM_TRIGGER = `http://127.0.0.1:${DIGICAM_PORT}/?CMD=Capture`;

const EXE_CANDIDATES = [
  join(
    process.env["ProgramFiles(x86)"] ?? "C:\\Program Files (x86)",
    "digiCamControl",
    "CameraControl.exe",
  ),
  join(process.env.ProgramFiles ?? "C:\\Program Files", "digiCamControl", "CameraControl.exe"),
];

/**
 * GET ke web server digiCamControl lewat socket TCP mentah. Server Griffin-nya mengirim header Content-Length dua
 * kali, yang ditolak fetch (UND_ERR_RES_CONTENT_LENGTH_MISMATCH) maupun node:http (juga dengan insecureHTTPParser:
 * HPE_UNEXPECTED_CONTENT_LENGTH). Body = Content-Length pertama; koneksi keep-alive diputus setelah body lengkap.
 */
const get = (path: string, timeoutMs: number) =>
  new Promise<Buffer>((resolve, reject) => {
    const sock = connect(DIGICAM_PORT, "127.0.0.1");
    let buf = Buffer.alloc(0);
    const fail = (e: Error) => {
      sock.destroy();
      reject(e);
    };
    sock.setTimeout(timeoutMs, () => fail(new Error(`digiCamControl ${path}: timeout`)));
    sock.on("error", fail);
    sock.on("connect", () =>
      sock.write(
        `GET ${path} HTTP/1.1\r\nHost: 127.0.0.1:${DIGICAM_PORT}\r\nConnection: close\r\n\r\n`,
      ),
    );
    const done = () => {
      const end = buf.indexOf("\r\n\r\n");
      if (end < 0) return false;
      const head = buf.subarray(0, end).toString("latin1");
      const len = Number(/\r\ncontent-length:\s*(\d+)/i.exec(head)?.[1] ?? Number.NaN);
      const body = buf.subarray(end + 4);
      if (Number.isFinite(len) && body.length < len) return false;
      sock.destroy();
      const status = Number(/^HTTP\/1\.\d (\d{3})/.exec(head)?.[1]);
      if (status === 200) resolve(Number.isFinite(len) ? body.subarray(0, len) : body);
      else reject(new Error(`digiCamControl ${path}: HTTP ${status}`));
      return true;
    };
    sock.on("data", (c: Buffer) => {
      buf = Buffer.concat([buf, c]);
      done();
    });
    sock.on("end", () => {
      if (!done()) fail(new Error(`digiCamControl ${path}: respons terpotong`));
    });
  });

const alive = () =>
  get("/?slc=get&param1=camera", 2000).then(
    () => true,
    () => false,
  );

/** Folder sesi digiCamControl = tempat foto disimpan = hot folder booth. */
const sessionFolder = async (log: (m: string) => void) => {
  const dir = (await get("/?slc=get&param1=session.folder", 3000)).toString("utf8").trim();
  log(`[digicam] folder sesi: ${dir}`);
  return dir || undefined;
};

/**
 * Jendela sambutan "Open Source"/donasi digiCamControl tampil di atas semua jendela (topmost), menutupi booth, dan
 * menahan perintah jendela (Capture, LiveView) sampai ditutup; web server-nya sendiri tetap menjawab. Jendela itu
 * tidak dibuat kalau StartMinimized aktif (MainWindow v2.1.7), jadi setelan itu dinyalakan sebelum digiCamControl
 * dibuka. Hanya saat tidak berjalan: digiCamControl menulis ulang settings.json saat keluar.
 * (Branding.xml ShowWelcomeScreen=false juga bisa, tapi butuh admin di folder instalasi.)
 */
const SETTINGS = join(
  process.env.ProgramData ?? "C:\\ProgramData",
  "digiCamControl",
  "settings.json",
);
async function startMinimized(log: (m: string) => void) {
  try {
    const s = await readFile(SETTINGS, "utf8");
    const off = /"StartMinimized":\s*false/;
    if (!off.test(s)) return;
    await writeFile(SETTINGS, s.replace(off, '"StartMinimized": true'));
    log("[digicam] StartMinimized dinyalakan (tanpa dialog sambutan)");
  } catch (e) {
    log(`[digicam] settings.json tidak bisa diubah: ${e instanceof Error ? e.message : e}`);
  }
}

/**
 * Pastikan web server digiCamControl hidup; kalau belum, jalankan aplikasinya (tanpa dialog sambutan),
 * dan tunggu sampai web server hidup (log tiap 60 s). Kamera & printer Camera Service menunggu ini karena hot folder
 * = folder sesi digiCamControl.
 * Hasil = folder sesi digiCamControl, atau undefined kalau tidak bisa dipastikan.
 */
export async function ensureDigiCam(
  log: (m: string) => void,
  exePath?: string,
): Promise<string | undefined> {
  if (await alive()) {
    log("[digicam] sudah berjalan");
    return sessionFolder(log).catch(() => undefined);
  }
  const exe = [exePath, ...EXE_CANDIDATES].find((p): p is string => !!p && existsSync(p));
  if (!exe) {
    log("[digicam] CameraControl.exe tidak ditemukan; pasang digiCamControl");
    return undefined;
  }
  // digiCamControl menjalankan ngrok.exe saat start. ngrok yatim dari instance yang dimatikan paksa membuat web server
  // instance baru macet beberapa menit (diuji 2026-09-25: 3–4 menit dengan ngrok yatim, 5,5 s setelah dibersihkan).
  await new Promise((r) =>
    execFile("taskkill", ["/IM", "ngrok.exe", "/F"], { windowsHide: true }, () => r(null)),
  );
  await startMinimized(log);
  log(`[digicam] membuka ${exe}`);
  // cwd = folder instalasi: digiCamControl memuat plugin & file web server relatif ke folder kerja.
  spawn(exe, [], { cwd: dirname(exe), detached: true, stdio: "ignore" }).unref();
  const t0 = Date.now();
  for (let i = 1; ; i++) {
    await new Promise((r) => setTimeout(r, 1000));
    if (await alive()) {
      // Web server hidup ±6 s, tapi kamera baru tersambung ±10–12 s. Perintah jendela (LiveViewWnd_*, Capture)
      // di sela itu membuat digiCamControl macet permanen (700D, 2026-09-25), jadi beri jeda sebelum dipakai.
      await new Promise((r) => setTimeout(r, SETTLE_MS));
      log(`[digicam] siap dalam ${Math.round((Date.now() - t0) / 1000)} s`);
      return sessionFolder(log).catch(() => undefined);
    }
    if (i % 60 === 0)
      log(`[digicam] belum merespons ${i} s; cek kamera & Webserver aktif di digiCamControl`);
  }
}

/**
 * Live view: `LiveView_NoProcess` = frame JPEG asli kamera diteruskan apa adanya (tanpa kotak fokus/grid/overlay
 * digiCamControl dan tanpa encode ulang: 960×640 ±270 KB, bukan ±35 KB). digiCamControl menghasilkan ±6–7 frame
 * baru/s dari 700D (batas pembacaan live view-nya, bukan booth); /liveview.jpg menjawab frame terakhir seketika.
 */
export const liveViewStart = async () => {
  await get("/?CMD=LiveViewWnd_Show", 5000);
  // Jendela live view digiCamControl muncul di depan booth; diperkecil (live view tetap jalan), sama seperti
  // endpoint /liveviewwebcam.jpg bawaan digiCamControl.
  await new Promise((r) => setTimeout(r, 500));
  await get("/?CMD=All_Minimize", 5000);
  await get("/?CMD=LiveView_NoProcess", 5000);
};
export const liveViewStop = () => get("/?CMD=LiveViewWnd_Hide", 5000).then(() => undefined);
let lastFrame: Buffer | undefined;
/** Frame baru, atau array kosong kalau belum ada / sama dengan sebelumnya (renderer menunggu sebentar). */
export const liveViewFrame = async () => {
  const b = await get(`/liveview.jpg?t=${Date.now()}`, 3000);
  if (b.length === 0 || lastFrame?.equals(b)) return new Uint8Array(0);
  lastFrame = b;
  return new Uint8Array(b);
};
