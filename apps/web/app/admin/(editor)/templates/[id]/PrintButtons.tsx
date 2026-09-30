"use client";
import { GEIST, samplePhoto, VARS } from "@tetra/editor";
import type { LayoutSpec } from "@tetra/shared";
import { browserContext, type ImageLike, render } from "@tetra/template-engine";
import { Popover } from "@tetra/ui";
import { Printer, Settings2 } from "lucide-react";
import { useRef, useState } from "react";

const btn =
  "flex h-9 items-center gap-1.5 rounded-[10px] border-[1.5px] border-ink bg-white px-3 text-[13px] font-bold disabled:opacity-50";

/**
 * Tes cetak dari browser: lembar 4×6 (engine yang sama dengan booth, foto contoh) ke dialog cetak
 * browser. Untuk printer yang terpasang di komputer ini; cetak lewat booth tetap dari menu crew.
 */
export function TestPrintButton({
  layout,
  images,
  fontFamily,
}: {
  layout: LayoutSpec;
  images: Record<string, ImageLike>;
  fontFamily: (id: string) => string;
}) {
  const [busy, setBusy] = useState(false);
  const print = async () => {
    setBusy(true);
    try {
      const sheet = render(
        layout,
        {
          photos: layout.slots.map((s, i) =>
            samplePhoto(Math.max(1, Math.round(s.w)), Math.max(1, Math.round(s.h)), i),
          ),
          assets: images,
          vars: VARS,
        },
        { ...browserContext(GEIST), fontFamily },
      ) as unknown as OffscreenCanvas;
      const url = URL.createObjectURL(await sheet.convertToBlob({ type: "image/png" }));
      const frame = document.createElement("iframe");
      frame.setAttribute("aria-hidden", "true");
      frame.style.cssText = "position:fixed;width:0;height:0;border:0";
      const done = () => {
        frame.remove();
        URL.revokeObjectURL(url);
      };
      frame.onload = () => {
        const w = frame.contentWindow;
        if (!w) return done();
        w.addEventListener("afterprint", () => setTimeout(done, 0));
        w.print();
      };
      frame.srcdoc = `<!doctype html><title>Tes cetak</title><style>@page{size:4in 6in;margin:0}html,body{margin:0}img{display:block;width:4in;height:6in}</style><img src="${url}">`;
      document.body.append(frame);
    } finally {
      setBusy(false);
    }
  };
  return (
    <button type="button" className={btn} disabled={busy} onClick={print}>
      <Printer className="size-4" /> Tes cetak
    </button>
  );
}

/** Setelan potong DNP untuk format ini + cara membuka Printing Preferences (tidak bisa dari web, DECISIONS #59). */
export function PrinterSettingsButton({ paper }: { paper: LayoutSpec["paper"] }) {
  const anchor = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const cut = paper === "2x6x2";
  return (
    <>
      <button
        ref={anchor}
        type="button"
        className={btn}
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <Settings2 className="size-4" /> Printer
      </button>
      <Popover
        anchor={anchor}
        open={open}
        onClose={() => setOpen(false)}
        width={340}
        align="end"
        label="Pengaturan printer DNP"
      >
        <div className="space-y-3 p-4 text-[13px] leading-5">
          <p className="font-extrabold">Potong 2 inci (DNP)</p>
          <p
            className={`rounded-[10px] border-[1.5px] border-ink px-3 py-2 font-bold ${cut ? "bg-mint-soft" : "bg-paper"}`}
          >
            Template ini: 2inch cut <span className="font-mono">{cut ? "Enable" : "Disable"}</span>
            <span className="block font-normal text-text-2">
              {cut ? "Strip 2R dipotong jadi dua." : "4R & polaroid tidak dipotong."}
            </span>
          </p>
          <p>
            Driver DNP hanya menuruti setelan dari dialog Printing Preferences, jadi setel sekali
            per event di laptop booth:
          </p>
          <ol className="list-decimal space-y-1 pl-5">
            <li>
              Booth: <b>Mode crew → Setel Printer</b>, atau
            </li>
            <li>
              Browser ini: <b>Tes cetak</b> → <b>Cetak menggunakan dialog sistem</b> →{" "}
              <b>Preferences</b>.
            </li>
          </ol>
          <p className="text-text-2">Ubah 2inch cut, klik OK, lalu tes cetak satu lembar.</p>
        </div>
      </Popover>
    </>
  );
}
