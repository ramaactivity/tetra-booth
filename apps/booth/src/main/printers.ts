import { execFile } from "node:child_process";

/** Antrean printer Windows (Win32_Printer): `offline` = port tidak tersambung (WorkOffline). */
export type PrinterQueue = { offline: boolean; port: string };

/**
 * Printer virtual bawaan Windows yang tidak pernah dipakai booth. "Microsoft Print to PDF" tetap tampil (uji tanpa
 * kertas & e2e). Audit B04 Rafi & Dinda: crew sempat memilih antrean yang salah dari daftar yang bercampur.
 */
const VIRTUAL = /^(OneNote\b.*|Send To OneNote\b.*|Microsoft XPS Document Writer|Fax)$/i;

export const isVirtualPrinter = (name: string) => VIRTUAL.test(name.trim());

/** Keluaran `Get-CimInstance Win32_Printer | ConvertTo-Json` (satu objek atau array) → antrean per nama. */
export function parseWin32Printers(json: string): Record<string, PrinterQueue> {
  let rows: unknown;
  try {
    rows = JSON.parse(json);
  } catch {
    return {};
  }
  const list: unknown[] = Array.isArray(rows) ? rows : rows ? [rows] : [];
  const out: Record<string, PrinterQueue> = {};
  for (const r of list) {
    if (!r || typeof r !== "object") continue;
    const { Name, PortName, WorkOffline } = r as Record<string, unknown>;
    if (typeof Name !== "string") continue;
    out[Name] = {
      offline: WorkOffline === true,
      port: typeof PortName === "string" ? PortName : "",
    };
  }
  return out;
}

/**
 * Daftar printer untuk mode crew: printer virtual disembunyikan (kecuali yang sedang dipakai), antrean yang tersambung
 * di atas, antrean offline (mis. "DS-RX1 (Copy 2)" dari port USB lain) di bawah. Urutan asal dipertahankan.
 */
export function orderPrinters(
  names: readonly string[],
  queues: Record<string, PrinterQueue>,
  current?: string,
): string[] {
  const rank = (n: string) => (queues[n]?.offline ? 1 : 0);
  return names
    .filter((n) => n === current || !isVirtualPrinter(n))
    .map((n, i) => ({ n, i }))
    .sort((a, b) => rank(a.n) - rank(b.n) || a.i - b.i)
    .map((x) => x.n);
}

const QUERY =
  "Get-CimInstance Win32_Printer | Select-Object Name,PortName,WorkOffline | ConvertTo-Json -Compress";

/** Antrean dari Windows; di OS lain, atau kalau PowerShell gagal/lambat, kosong (daftar printer tetap tampil). */
export function queryPrinterQueues(timeoutMs = 5000): Promise<Record<string, PrinterQueue>> {
  if (process.platform !== "win32") return Promise.resolve({});
  return new Promise((resolve) => {
    execFile(
      "powershell.exe",
      ["-NoProfile", "-NonInteractive", "-Command", QUERY],
      { timeout: timeoutMs, windowsHide: true },
      (err, stdout) => resolve(err ? {} : parseWin32Printers(stdout)),
    );
  });
}
