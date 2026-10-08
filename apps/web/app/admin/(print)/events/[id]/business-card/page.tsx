import { EventSettingsSchema } from "@tetra/shared";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { BIZ_CARDS, bizCard, bizCardSvg } from "@/lib/biz-card";
import { eventKey } from "@/lib/events";
import { requireMember } from "@/lib/supabase/server";
import { PrintButton } from "./PrintButton";

/**
 * Kartu QR Guest Cam ukuran kartu nama (#225): 90×55 mm + bleed 3 mm, file untuk percetakan (1 box isi 100).
 * `?d=` = desain (bawaan pilihan event / klien di portal Ops). Cetak / simpan PDF dari browser.
 */
export default async function BusinessCardPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ d?: string }>;
}) {
  const { db, orgId } = await requireMember(["owner", "admin"]);
  const { id } = await params;
  const { data: ev } = await db
    .from("events")
    .select("slug, name, event_date, branding, settings, guest_token")
    .eq(eventKey(id), id)
    .eq("organization_id", orgId)
    .maybeSingle();
  if (!ev?.guest_token) notFound();
  const h = await headers();
  const origin = `${h.get("x-forwarded-proto") ?? "https"}://${h.get("host")}`;
  const cam = EventSettingsSchema.parse(ev.settings ?? {}).guestCam;
  const design = bizCard((await searchParams).d ?? cam.cardDesign);
  const svg = bizCardSvg(design.id, {
    name: ev.name,
    date: ev.event_date,
    tagline: ((ev.branding ?? {}) as { tagline?: string }).tagline ?? null,
    url: `${origin}/c/${ev.guest_token}`,
    shots: cam.shots,
  });
  return (
    <>
      <style>{"@page { size: 96mm 61mm; margin: 0 } @media print { body { margin: 0 } }"}</style>
      <div className="flex flex-col items-center gap-5 py-8 print:p-0">
        <div className="flex flex-wrap items-center justify-center gap-2 print:hidden">
          {BIZ_CARDS.map((c) => (
            <a
              key={c.id}
              href={`?d=${c.id}`}
              aria-current={c.id === design.id}
              className={`flex h-10 items-center rounded-[11px] border-[1.5px] border-ink px-3.5 text-sm font-bold no-underline ${c.id === design.id ? "bg-lavender" : "bg-white"}`}
            >
              {c.name}
            </a>
          ))}
          <PrintButton />
        </div>
        <p className="max-w-[460px] text-center text-xs text-text-2 print:hidden">
          Ukuran kartu nama 90×55 mm dengan bleed 3 mm (file 96×61 mm). Di dialog cetak pilih skala
          100% tanpa margin, simpan PDF, lalu kirim ke percetakan untuk 1 box isi 100.
        </p>
        <div
          data-testid="business-card"
          className="shadow-[0_0_0_1.5px_var(--ink)] print:shadow-none [&>svg]:block"
          // biome-ignore lint/security/noDangerouslySetInnerHtml: SVG dibuat server dari data event yang di-escape
          dangerouslySetInnerHTML={{ __html: svg }}
        />
      </div>
    </>
  );
}
