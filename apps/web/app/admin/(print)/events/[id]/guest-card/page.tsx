import { cardDesign } from "@/lib/guest-card-art";
import { CARD_FONTS, cardHtml } from "@/lib/guest-card-html";
import { CardFit } from "../CardFit";
import { CardPicker } from "../CardPicker";
import { loadCardEvent } from "../card-data";

const SIZES = [
  { id: "a5", label: "A5 · 14,8×21 cm (akrilik meja)" },
  { id: "a6", label: "A6 · 10,5×14,8 cm" },
];

/**
 * Kartu QR meja Snapbook (#230): standing akrilik A5 (bawaan) atau A6 (skala sama, rasio identik), 10 konsep.
 * `?d=` konsep, `?size=`. Cetak / simpan PDF dari browser (vektor, teks tetap teks).
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
  const a6 = sp.size === "a6";
  return (
    <>
      <link rel="stylesheet" href={CARD_FONTS} />
      <style>{`@page { size: ${a6 ? "105mm 148mm" : "148mm 210mm"}; margin: 0 } @media print { body { margin: 0 } }`}</style>
      <div className="flex flex-col items-center gap-5 py-8 print:p-0">
        <CardPicker design={design} sizes={SIZES} size={a6 ? "a6" : "a5"} />
        <p className="max-w-[460px] text-center text-xs text-text-2 print:hidden">
          Di dialog cetak pilih ukuran kertas {a6 ? "A6" : "A5"}, skala 100%, tanpa margin, centang
          grafik latar. Untuk akrilik meja biasanya A5.
        </p>
        <div
          data-testid="table-card"
          className="shadow-[0_0_0_1.5px_var(--ink)] print:shadow-none"
          style={a6 ? { zoom: 105 / 148 } : undefined}
          // biome-ignore lint/security/noDangerouslySetInnerHtml: template desainer + data event yang di-escape
          dangerouslySetInnerHTML={{ __html: await cardHtml(design, "a5", data) }}
        />
      </div>
      <CardFit />
    </>
  );
}
