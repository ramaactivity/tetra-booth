import { cardDesign, tableCardSvg } from "@/lib/guest-card-art";
import { CardPicker } from "../CardPicker";
import { loadCardEvent } from "../card-data";

const SIZES = [
  { id: "a6", label: "A6 · 10,5×14,8 cm" },
  { id: "a5", label: "A5 · 14,8×21 cm (akrilik meja)" },
];

/**
 * Kartu QR meja Kamera Tamu (#227): standing akrilik A5 (umum di meja) atau A6, 5 desain. `?d=` desain, `?size=`.
 * Cetak / simpan PDF dari browser.
 */
export default async function GuestCardPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ d?: string; size?: string }>;
}) {
  const { data, design: saved } = await loadCardEvent((await params).id);
  const sp = await searchParams;
  const design = cardDesign(sp.d ?? saved);
  const a5 = sp.size === "a5";
  return (
    <>
      <style>{`@page { size: ${a5 ? "148mm 210mm" : "105mm 148mm"}; margin: 0 } @media print { body { margin: 0 } }`}</style>
      <div className="flex flex-col items-center gap-5 py-8 print:p-0">
        <CardPicker design={design} sizes={SIZES} size={a5 ? "a5" : "a6"} />
        <p className="max-w-[460px] text-center text-xs text-text-2 print:hidden">
          Di dialog cetak pilih ukuran kertas {a5 ? "A5" : "A6"}, skala 100%, tanpa margin. Untuk
          akrilik meja biasanya A5.
        </p>
        <div
          data-testid="table-card"
          className="shadow-[0_0_0_1.5px_var(--ink)] print:shadow-none [&>svg]:block"
          // biome-ignore lint/security/noDangerouslySetInnerHtml: SVG dibuat server dari data event yang di-escape
          dangerouslySetInnerHTML={{ __html: tableCardSvg(design, data, a5) }}
        />
      </div>
    </>
  );
}
