import { BrowserWindow } from "electron";
import type { BoothDb } from "./db";

/** Ambang peringatan kertas (FSD §1.10). */
export const PAPER_LOW = 30;

/** `ok` = kabar baik (titik mint), bukan peringatan: booth terhubung ke laptop printer (#261). */
export type PrinterAlert = { message: string; ok?: true } | null;
export type HubLink = "ok" | "unreachable" | "badkey";

/**
 * Peringatan kecil untuk crew di pojok layar booth (FSD §1.10): printer error, cetak gagal, kertas menipis.
 * Disiarkan ke renderer setiap berubah.
 */
export function createAlerts(db: BoothDb) {
  let printer: { status: string; message?: string | undefined } = { status: "unknown" };
  let lastFailure: string | null = null;
  let current: PrinterAlert = null;
  /** Printer bersama (#261): booth ini mencetak lewat laptop printer; status & kertas dari sana. */
  let hubPaper: (() => { remaining: number; capacity: number }) | null = null;
  /** Belum ada jawaban dari laptop printer = belum terhubung. */
  let hubLink: HubLink = "unreachable";
  const paper = () => hubPaper?.() ?? db.paper();

  // Tampil di layar tamu: kalimat pendek tanpa istilah teknis. Detail ada di menu crew & log (M-010).
  const compute = (): PrinterAlert => {
    if (hubPaper && hubLink === "unreachable")
      return { message: "Belum terhubung ke printer pusat" };
    if (hubPaper && hubLink === "badkey")
      return { message: "Kode printer pusat salah, hubungi crew" };
    if (printer.status === "error" || printer.status === "unavailable" || lastFailure) {
      return {
        message: hubPaper
          ? "Printer pusat bermasalah, hubungi crew"
          : "Printer bermasalah, hubungi crew",
      };
    }
    const { remaining } = paper();
    if (remaining <= PAPER_LOW) return { message: `Kertas hampir habis (${remaining})` };
    return hubPaper ? { message: "Terhubung ke printer pusat", ok: true } : null;
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
    paper,
    /** Status printer lokal (Camera Service); diabaikan kalau booth ini mencetak lewat laptop printer. */
    onPrinterStatus(status: string, message?: string) {
      if (hubPaper) return;
      printer = { status, message };
      publish();
    },
    viaHub(p: () => { remaining: number; capacity: number }) {
      hubPaper = p;
      publish();
    },
    /** Hasil cek laptop printer tiap 5 dtk; `printer` = status printer di sana (hanya kalau terhubung). */
    onHubStatus(link: HubLink, p?: { status: string; message?: string | undefined }) {
      hubLink = link;
      printer = p ?? { status: "unknown" };
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
