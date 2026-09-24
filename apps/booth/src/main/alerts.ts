import { BrowserWindow } from "electron";
import type { BoothDb } from "./db";

/** Ambang peringatan kertas (FSD §1.10). */
export const PAPER_LOW = 30;

export type PrinterAlert = { message: string } | null;

/**
 * Peringatan kecil untuk crew di pojok layar booth (FSD §1.10): printer error, cetak gagal, kertas menipis.
 * Disiarkan ke renderer setiap berubah.
 */
export function createAlerts(db: BoothDb) {
  let printer: { status: string; message?: string | undefined } = { status: "unknown" };
  let lastFailure: string | null = null;
  let current: PrinterAlert = null;

  const compute = (): PrinterAlert => {
    if (printer.status === "error" || printer.status === "unavailable") {
      return {
        message: `Printer ${printer.status === "error" ? "error" : "tidak tersedia"}${printer.message ? `: ${printer.message}` : ""}`,
      };
    }
    if (lastFailure) return { message: `Cetak gagal: ${lastFailure}` };
    const { remaining } = db.paper();
    if (remaining <= PAPER_LOW) return { message: `Kertas tinggal ${remaining} lembar` };
    return null;
  };
  const publish = () => {
    const next = compute();
    if (JSON.stringify(next) === JSON.stringify(current)) return;
    current = next;
    for (const w of BrowserWindow.getAllWindows()) w.webContents.send("printerAlert", current);
  };

  return {
    get: () => compute(),
    printer: () => printer,
    onPrinterStatus(status: string, message?: string) {
      printer = { status, message };
      publish();
    },
    onPrintDone() {
      lastFailure = null;
      publish();
    },
    onPrintFailed(message: string) {
      lastFailure = message;
      publish();
    },
    refresh: publish,
  };
}
export type Alerts = ReturnType<typeof createAlerts>;
