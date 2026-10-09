import { Button } from "@tetra/ui";
import { X } from "lucide-react";
import { copy } from "./copy";
import { QrCode } from "./ui";

const t = copy.galleryQr;

/**
 * QR galeri online (#240): rekap & ringkasan crew (galeri klien) dan galeri tamu di booth (galeri publik), supaya tamu
 * atau klien bisa langsung scan dari layar. Link ikut ditampilkan; `onCopy` = tombol salin (crew saja).
 */
export function GalleryQr({
  url,
  title = t.title,
  onCopy,
  onClose,
}: {
  url: string;
  title?: string;
  onCopy?: (() => void) | undefined;
  onClose: () => void;
}) {
  return (
    <div
      role="dialog"
      aria-modal
      aria-label={title}
      data-testid="gallery-qr"
      className="fixed inset-0 z-30 flex items-center justify-center bg-ink/45"
      onClick={onClose}
      onKeyDown={(e) => e.key === "Escape" && onClose()}
    >
      {/* biome-ignore lint/a11y/noStaticElementInteractions: hanya menahan klik agar tidak menutup dialog */}
      {/* biome-ignore lint/a11y/useKeyWithClickEvents: idem */}
      <div
        className="layered relative flex w-[760px] flex-col items-center gap-6 rounded-[32px] border-[2.5px] border-ink bg-white p-11 text-center [--lx:10px]"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          aria-label={t.close}
          onClick={onClose}
          className="pressable absolute top-6 right-6 flex size-14 items-center justify-center rounded-full border-2 border-ink bg-white"
        >
          <X size={28} strokeWidth={2.5} />
        </button>
        <h2 className="text-[40px] leading-tight font-extrabold tracking-[-0.03em]">{title}</h2>
        <p className="text-2xl text-text-2">{t.hint}</p>
        <div className="rounded-[24px] border-[2.5px] border-ink bg-white p-5">
          <QrCode url={url} size={420} />
        </div>
        <p className="max-w-full font-mono text-xl break-all" data-testid="gallery-qr-url">
          {url}
        </p>
        {onCopy && (
          <Button className="h-[76px] rounded-[18px] px-10 text-2xl" onClick={onCopy}>
            {t.copy}
          </Button>
        )}
      </div>
    </div>
  );
}
