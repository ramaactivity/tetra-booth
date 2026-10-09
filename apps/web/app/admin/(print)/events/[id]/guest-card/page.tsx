import type { CSSProperties } from "react";
import { cardDesign } from "@/lib/guest-card-art";
import { cardHtml } from "@/lib/guest-card-html";
import { CardStudio } from "../CardStudio";
import { loadCardEvent } from "../card-data";

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
  const { id } = await params;
  const { data, design: saved } = await loadCardEvent(id);
  const sp = await searchParams;
  const design = cardDesign(sp.d ?? saved);
  const a6 = sp.size === "a6";
  return (
    <CardStudio
      eventId={id}
      eventName={data.name}
      kind="meja"
      design={design}
      size={a6 ? "a6" : "a5"}
      page={a6 ? { w: 105, h: 148 } : { w: 148, h: 210 }}
      sides={["table-card"]}
      file={`kartu-qr-meja-${design}-${a6 ? "a6" : "a5"}.pdf`}
      help={`PDF ${a6 ? "A6 (10,5×14,8 cm)" : "A5 (14,8×21 cm)"}, siap dikirim ke percetakan. Untuk standing akrilik meja biasanya A5.`}
    >
      <div
        data-testid="table-card"
        className="shadow-[0_0_0_1.5px_var(--ink),12px_12px_0_rgba(29,29,27,.12)] print:shadow-none print:[zoom:var(--print-zoom)]"
        style={{ "--print-zoom": a6 ? 105 / 148 : 1 } as CSSProperties}
        // biome-ignore lint/security/noDangerouslySetInnerHtml: template desainer + data event yang di-escape
        dangerouslySetInnerHTML={{ __html: await cardHtml(design, "a5", data) }}
      />
    </CardStudio>
  );
}
