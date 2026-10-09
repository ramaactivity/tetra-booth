import { ArrowLeft } from "lucide-react";
import type { ReactNode } from "react";
import { CARD_DESIGNS } from "@/lib/guest-card-art";
import { CARD_FONTS } from "@/lib/guest-card-html";
import { CardFit } from "./CardFit";
import { DownloadPdf } from "./DownloadPdf";
import { FitPreview } from "./FitPreview";
import { PrintLink } from "./PrintLink";

type Kind = "meja" | "nama";

/**
 * Studio cetak kartu QR Snapbook (#230): kiri pratinjau utuh (muat layar), kanan panel: jenis kartu, 10 konsep
 * bergambar, ukuran, tombol cetak + petunjuk. Panel tidak ikut tercetak.
 */
export function CardStudio({
  eventId,
  eventName,
  kind,
  design,
  size,
  page,
  sides,
  file,
  help,
  children,
}: {
  eventId: string;
  eventName: string;
  kind: Kind;
  design: string;
  size?: "a5" | "a6";
  /** Ukuran kertas (mm): `@page` cetak browser + halaman PDF unduhan. */
  page: { w: number; h: number };
  /** `data-testid` sisi kartu, urut halaman PDF. */
  sides: string[];
  file: string;
  help: string;
  children: ReactNode;
}) {
  const base = `/admin/events/${eventId}`;
  const href = (k: Kind, d: string, s = size) =>
    `${base}/${k === "meja" ? "guest-card" : "business-card"}?d=${d}${k === "meja" ? `&size=${s ?? "a5"}` : ""}`;
  const seg = (on: boolean) =>
    `flex h-11 flex-1 flex-col items-center justify-center text-sm font-extrabold no-underline ${on ? "bg-lavender" : "bg-white"}`;
  return (
    <>
      <link rel="stylesheet" href={CARD_FONTS} crossOrigin="anonymous" />
      <style>{`@page { size: ${page.w}mm ${page.h}mm; margin: 0 } @media print { body { margin: 0 } }`}</style>
      <div className="grid h-dvh grid-cols-[minmax(0,1fr)_400px] print:block print:h-auto">
        <FitPreview>{children}</FitPreview>
        <aside className="flex min-h-0 flex-col border-l-[1.5px] border-ink bg-paper print:hidden">
          <div className="flex-none px-6 pt-5 pb-4">
            <a
              href={`${base}/settings`}
              className="inline-flex items-center gap-1.5 text-[13px] font-bold text-text-2 no-underline"
            >
              <ArrowLeft size={15} /> Pengaturan event
            </a>
            <h1 className="mt-3 text-[22px] font-extrabold tracking-[-0.02em]">
              Kartu QR Snapbook
            </h1>
            <p className="truncate text-sm text-text-2">{eventName}</p>
            <div className="mt-4 flex overflow-hidden rounded-[14px] border-[1.5px] border-ink">
              <a
                href={href("meja", design)}
                aria-current={kind === "meja"}
                className={seg(kind === "meja")}
              >
                Kartu meja
                <span className="font-mono text-[10px] font-normal text-text-3">A5 / A6</span>
              </a>
              <a
                href={href("nama", design)}
                aria-current={kind === "nama"}
                className={`${seg(kind === "nama")} border-l-[1.5px] border-ink`}
              >
                Kartu nama
                <span className="font-mono text-[10px] font-normal text-text-3">
                  90×55 · 2 sisi
                </span>
              </a>
            </div>
            {kind === "meja" && (
              <div className="mt-2.5 flex overflow-hidden rounded-[14px] border-[1.5px] border-ink">
                {(["a5", "a6"] as const).map((s, i) => (
                  <a
                    key={s}
                    href={href("meja", design, s)}
                    aria-current={size === s}
                    className={`${seg(size === s)} h-10 ${i ? "border-l-[1.5px] border-ink" : ""}`}
                  >
                    {s === "a5" ? "A5 · akrilik meja" : "A6 · kecil"}
                  </a>
                ))}
              </div>
            )}
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto border-t-[1.5px] border-dashed border-ink px-6 py-4">
            <p className="mb-2.5 font-mono text-[11px] tracking-wide text-text-2">
              PILIH DESAIN · 10
            </p>
            <ul className="grid grid-cols-2 gap-3">
              {CARD_DESIGNS.map((c) => {
                const on = c.id === design;
                return (
                  <li key={c.id}>
                    <a
                      href={href(kind, c.id)}
                      aria-current={on}
                      data-concept
                      title={c.hint}
                      className={`flex h-full flex-col gap-2 rounded-[14px] p-2 no-underline ${on ? "layered border-2 border-ink bg-mint-soft [--lb:2px] [--lx:4px]" : "border-[1.5px] border-line-soft bg-white hover:border-ink"}`}
                    >
                      {/* biome-ignore lint/performance/noImgElement: gambar statis kecil */}
                      <img
                        src={`/snapbook/cards/${c.id}-${kind === "meja" ? "a5" : "front"}.jpg`}
                        alt=""
                        loading="lazy"
                        className={`w-full rounded-[6px] border border-line-soft object-cover ${kind === "meja" ? "aspect-[148/210]" : "aspect-[96/61]"}`}
                      />
                      <span className="px-0.5 text-[13px] leading-tight font-extrabold">
                        {c.name}
                      </span>
                      <span className="-mt-1.5 px-0.5 text-[11px] leading-tight text-text-2">
                        {c.hint}
                      </span>
                    </a>
                  </li>
                );
              })}
            </ul>
          </div>
          <div className="flex flex-none flex-col gap-2.5 border-t-[1.5px] border-ink px-6 py-4">
            <DownloadPdf sides={sides} page={page} file={file} />
            <p className="text-xs leading-snug text-text-2">{help}</p>
            <PrintLink />
          </div>
        </aside>
      </div>
      <CardFit />
    </>
  );
}
