import { cardDesign } from "@/lib/guest-card-art";
import { CARD_FONTS, cardHtml } from "@/lib/guest-card-html";
import { CardFit } from "../CardFit";
import { CardPicker } from "../CardPicker";
import { loadCardEvent } from "../card-data";

/**
 * Kartu nama QR Snapbook (#230): 90×55 mm + bleed 3 mm, dua sisi. PDF 2 halaman untuk percetakan (1 box isi 100).
 * `?d=` konsep.
 */
export default async function BusinessCardPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ d?: string }>;
}) {
  const { data, design: saved } = await loadCardEvent((await params).id);
  const design = cardDesign((await searchParams).d ?? saved);
  const side = async (testId: string, face: "front" | "back") => (
    <div
      data-testid={testId}
      className="shadow-[0_0_0_1.5px_var(--ink)] break-after-page print:shadow-none"
      // biome-ignore lint/security/noDangerouslySetInnerHtml: template desainer + data event yang di-escape
      dangerouslySetInnerHTML={{ __html: await cardHtml(design, face, data) }}
    />
  );
  return (
    <>
      <link rel="stylesheet" href={CARD_FONTS} />
      <style>{"@page { size: 96mm 61mm; margin: 0 } @media print { body { margin: 0 } }"}</style>
      <div className="flex flex-col items-center gap-5 py-8 print:gap-0 print:p-0">
        <CardPicker design={design} />
        <p className="max-w-[480px] text-center text-xs text-text-2 print:hidden">
          Kartu nama 90×55 mm, bleed 3 mm (file 96×61 mm), 2 halaman: depan & belakang. Cetak skala
          100% tanpa margin, centang grafik latar, simpan PDF, kirim ke percetakan (bolak-balik, 1
          box isi 100).
        </p>
        {await side("business-card", "front")}
        {await side("business-card-back", "back")}
      </div>
      <CardFit />
    </>
  );
}
