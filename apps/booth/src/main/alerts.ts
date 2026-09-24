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

  // Tampil di layar tamu: kalimat pendek tanpa istilah teknis. Detail ada di menu crew & log (M-010).
  const compute = (): PrinterAlert => {
    if (printer.status === "error" || printer.status === "unavailable" || lastFailure) {
      return { message: "Printer bermasalah, hubungi crew" };
    }
    const { remaining } = db.paper();
    if (remaining <= PAPER_LOW) return { message: `Kertas hampir habis (${remaining})` };
    return null;
  };
  /** Setiap hasil cetak: menu crew menyegarkan kertas & daftar gagal saat itu juga (M-010). */
  const printUpdated = (u: { jobId: string; ok: boolean; message?: string }) => {
    for (const w of BrowserWindow.getAllWindows()) w.webContents.send("printUpdated", u);
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
    onPrintDone(jobId: string) {
      lastFailure = null;
      publish();
      printUpdated({ jobId, ok: true });
    },
    onPrintFailed(jobId: string, message: string) {
      lastFailure = message;
      publish();
      printUpdated({ jobId, ok: false, message });
    },
    refresh: publish,
  };
}
export type Alerts = ReturnType<typeof createAlerts>;
