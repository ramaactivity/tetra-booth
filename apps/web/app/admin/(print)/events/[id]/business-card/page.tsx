import { cardDesign } from "@/lib/guest-card-art";
import { cardHtml } from "@/lib/guest-card-html";
import { readableLink } from "@/lib/guest-link";
import { CardStudio } from "../CardStudio";
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
  const { id } = await params;
  const { data, design: saved } = await loadCardEvent(id);
  const design = cardDesign((await searchParams).d ?? saved);
  const side = async (testId: string, face: "front" | "back", label: string) => (
    <figure className="m-0 flex flex-col gap-2 break-after-page">
      <figcaption className="font-mono text-[11px] tracking-wide text-text-2 print:hidden">
        {label}
      </figcaption>
      <div
        data-testid={testId}
        className="shadow-[0_0_0_1.5px_var(--ink),10px_10px_0_rgba(29,29,27,.12)] print:shadow-none"
        // biome-ignore lint/security/noDangerouslySetInnerHtml: template desainer + data event yang di-escape
        dangerouslySetInnerHTML={{ __html: await cardHtml(design, face, data) }}
      />
    </figure>
  );
  return (
    <CardStudio
      eventId={id}
      eventName={data.name}
      kind="nama"
      design={design}
      page={{ w: 96, h: 61 }}
      sides={["business-card", "business-card-back"]}
      file={`kartu-qr-nama-${readableLink(data.name)}-${design}.pdf`}
      help="PDF 2 halaman (depan & belakang), 90×55 mm + bleed 3 mm. Kirim ke percetakan: cetak bolak-balik, 1 box isi 100."
    >
      <div className="flex flex-col gap-6 print:block">
        {await side("business-card", "front", "DEPAN")}
        {await side("business-card-back", "back", "BELAKANG")}
      </div>
    </CardStudio>
  );
}
