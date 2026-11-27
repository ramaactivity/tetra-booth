import { Button } from "@tetra/ui";
import { X, ZoomIn } from "lucide-react";
import { useState } from "react";
import { copy } from "../copy";

/**
 * Hasil foto berframe di layar pilih cetak & QR: ketuk → layar penuh (masukan Rama 27 Nov 2026).
 * Overlay sama dengan zoom foto mentah di Review.
 */
export function StripZoom({
  src,
  className,
  frameClass = "",
  onZoom,
}: {
  src: string;
  /** Kelas ukuran gambar kecilnya (sama seperti sebelum bisa diperbesar). */
  className: string;
  /** Kelas tambahan tombol pembungkus, mis. `portrait:h-full` supaya `max-h-full` gambar tetap terhitung. */
  frameClass?: string;
  onZoom?: ((open: boolean) => void) | undefined;
}) {
  const [open, setOpen] = useState(false);
  const toggle = (v: boolean) => {
    setOpen(v);
    onZoom?.(v);
  };
  return (
    <>
      <button
        type="button"
        aria-label={copy.stripZoom.open}
        onClick={() => toggle(true)}
        className={`relative inline-flex min-h-0 shrink-0 cursor-zoom-in items-center p-0 ${frameClass}`}
      >
        <img src={src} alt="" className={className} />
        <span className="pointer-events-none absolute -bottom-6 left-1/2 flex -translate-x-1/2 items-center gap-2 rounded-full border-2 border-ink bg-white px-4 py-1.5 text-lg font-bold whitespace-nowrap portrait:px-2.5">
          <ZoomIn size={20} strokeWidth={2.5} />
          {/* Layar berdiri: strip sempit di tepi kiri, label teks terpotong → ikon saja. */}
          <span className="portrait:hidden">{copy.stripZoom.hint}</span>
        </span>
      </button>
      {open && (
        <div
          data-testid="strip-zoom"
          className="fixed inset-0 z-40 flex items-center justify-center p-12"
        >
          <button
            type="button"
            aria-label={copy.stripZoom.back}
            className="absolute inset-0 bg-ink/85"
            onClick={() => toggle(false)}
          />
          <img
            src={src}
            alt=""
            className="pointer-events-none relative max-h-full max-w-full rounded-[14px] border-[2.5px] border-white bg-white object-contain"
          />
          <Button
            variant="plain"
            className="absolute top-10 right-10 h-[88px] rounded-[22px] bg-white! px-8 text-[28px]"
            onClick={() => toggle(false)}
          >
            <X size={28} strokeWidth={2.5} />
            {copy.stripZoom.close}
          </Button>
        </div>
      )}
    </>
  );
}
