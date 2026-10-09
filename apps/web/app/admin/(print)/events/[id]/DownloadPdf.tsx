"use client";
import { Download } from "lucide-react";
import { useState } from "react";

/**
 * Unduh kartu QR sebagai PDF langsung (#230), tanpa dialog cetak browser (yang sering lupa dicentang "Grafik latar"
 * sehingga warna kartu hilang). Tiap sisi (`[data-testid]`) dirender ±380 dpi lewat html-to-image (font & latar
 * ikut), lalu satu halaman PDF per sisi dengan ukuran kertas persis (mm).
 */
export function DownloadPdf({
  sides,
  page,
  file,
}: {
  sides: string[];
  page: { w: number; h: number };
  file: string;
}) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(false);
  const run = async () => {
    setBusy(true);
    setErr(false);
    try {
      const [{ toJpeg }, { jsPDF }] = await Promise.all([import("html-to-image"), import("jspdf")]);
      await document.fonts.ready;
      const pdf = new jsPDF({
        unit: "mm",
        format: [page.w, page.h],
        orientation: page.w > page.h ? "landscape" : "portrait",
      });
      for (const [i, id] of sides.entries()) {
        const el = document.querySelector<HTMLElement>(`[data-testid="${id}"]`);
        if (!el) continue;
        const jpg = await toJpeg(el, {
          pixelRatio: 4,
          quality: 0.95,
          style: { boxShadow: "none", zoom: "1", margin: "0" },
        });
        if (i) pdf.addPage([page.w, page.h], page.w > page.h ? "landscape" : "portrait");
        pdf.addImage(jpg, "JPEG", 0, 0, page.w, page.h);
      }
      pdf.save(file);
    } catch (e) {
      console.warn("[kartu-qr] unduh PDF gagal", e);
      setErr(true);
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <button
        type="button"
        disabled={busy}
        onClick={() => void run()}
        className="layered pressable flex h-12 w-full items-center justify-center gap-2 rounded-[14px] border-[1.5px] border-ink bg-butter text-[15px] font-extrabold [--lb:1.5px] [--lx:4px] disabled:opacity-60"
      >
        <Download size={18} strokeWidth={2.5} /> {busy ? "Menyiapkan PDF…" : "Unduh PDF"}
      </button>
      {err && (
        <p role="alert" className="text-xs font-bold text-coral-strong">
          PDF gagal dibuat. Coba lagi, atau pakai Cetak dari browser.
        </p>
      )}
    </>
  );
}
