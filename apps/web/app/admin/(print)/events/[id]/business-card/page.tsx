import { businessCardSvgs, cardDesign } from "@/lib/guest-card-art";
import { CardPicker } from "../CardPicker";
import { loadCardEvent } from "../card-data";

/**
 * Kartu nama QR Kamera Tamu (#227): 90×55 mm + bleed 3 mm, dua sisi (depan ajakan + QR, belakang cara ikut).
 * PDF 2 halaman untuk percetakan (1 box isi 100). `?d=` desain.
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
  const { front, back } = businessCardSvgs(design, data);
  const side = (testId: string, svg: string) => (
    <div
      data-testid={testId}
      className="shadow-[0_0_0_1.5px_var(--ink)] break-after-page print:shadow-none [&>svg]:block"
      // biome-ignore lint/security/noDangerouslySetInnerHtml: SVG dibuat server dari data event yang di-escape
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
  return (
    <>
      <style>{"@page { size: 96mm 61mm; margin: 0 } @media print { body { margin: 0 } }"}</style>
      <div className="flex flex-col items-center gap-5 py-8 print:gap-0 print:p-0">
        <CardPicker design={design} />
        <p className="max-w-[480px] text-center text-xs text-text-2 print:hidden">
          Kartu nama 90×55 mm, bleed 3 mm (file 96×61 mm), 2 halaman: depan & belakang. Cetak skala
          100% tanpa margin, simpan PDF, kirim ke percetakan (bolak-balik, 1 box isi 100).
        </p>
        {side("business-card", front)}
        {side("business-card-back", back)}
      </div>
    </>
  );
}
