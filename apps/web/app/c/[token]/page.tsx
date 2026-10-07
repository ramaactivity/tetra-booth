import type { Metadata, Viewport } from "next";
import { shortDateId } from "@/components/guest-cam/ui";
import { copy } from "@/lib/copy";
import { guestEvent, guestInfo, guestMe, guestSession } from "@/lib/guest-cam";
import { GuestCam } from "./GuestCam";

const t = copy.guestCam;

export const metadata: Metadata = { title: t.meta, robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";
/** Gelap penuh seperti aplikasi kamera (#209): status bar hitam; color-scheme dark mencegah dark mode paksa
 * Samsung Internet/Chrome membalik warna. */
export const viewport: Viewport = {
  themeColor: "#000000",
  colorScheme: "dark",
  viewportFit: "cover",
  width: "device-width",
  initialScale: 1,
};

/** A10: link tidak bisa dipakai (diganti/dicabut, atau acara selesai). Pil bertulisan, tanpa kode error. */
function LinkState({
  name,
  date,
  pill,
  bg,
  title,
  body,
  gallery,
}: {
  name?: string;
  date?: string;
  pill: string;
  bg: string;
  title: string;
  body: string;
  gallery?: { href: string; sub: string; cover: string | null } | null;
}) {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-[480px] flex-col bg-black px-5 pt-[max(24px,env(safe-area-inset-top))] pb-[max(24px,env(safe-area-inset-bottom))] text-paper">
      <div className="flex items-center justify-between">
        <div className="flex flex-col gap-0.5">
          <span className="text-[15px] font-extrabold tracking-[-0.02em]">
            {name ?? "Tetra Photobooth"}
          </span>
          {date && (
            <span className="font-mono text-[11px] text-muted">
              {date.split("-").reverse().join(".")}
            </span>
          )}
        </div>
        <span className="flex size-8 items-center justify-center rounded-[10px] border-[1.5px] border-ink bg-mint text-sm font-extrabold">
          T
        </span>
      </div>
      <span
        className={`mt-[18dvh] flex h-7 items-center self-start rounded-full px-3 text-xs font-extrabold text-ink ${bg}`}
      >
        {pill}
      </span>
      <h1 className="mt-4 text-[30px] leading-[1.06] font-extrabold tracking-[-0.035em]">
        {title}
      </h1>
      <p className="mt-3 text-[15px] leading-[1.55] text-paper/70">{body}</p>
      {gallery && (
        <a
          href={gallery.href}
          className="mt-7 flex items-center gap-3.5 rounded-3xl bg-text-3 p-3.5 text-paper no-underline"
        >
          <span className="size-14 flex-none overflow-hidden rounded-2xl bg-ink">
            {/* biome-ignore lint/performance/noImgElement: URL R2 bertanda tangan */}
            {gallery.cover && <img src={gallery.cover} alt="" className="size-full object-cover" />}
          </span>
          <span className="flex-1">
            <span className="block text-[15px] font-extrabold">{t.gallery}</span>
            <span className="mt-0.5 block text-xs text-muted">{gallery.sub}</span>
          </span>
          <span className="text-lg font-extrabold">›</span>
        </a>
      )}
      <div className="flex-1" />
      <p className="text-center text-[11px] text-muted">{t.powered}</p>
    </main>
  );
}

/** Guest Cam (#197): tamu memotret dari HP lewat QR. Desain G5 (docs/design/guest-cam, DECISIONS #203). */
export default async function GuestCamPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const ev = await guestEvent(token);
  if (!ev)
    return (
      <LinkState
        pill={t.replacedPill}
        bg="bg-coral"
        title={t.replacedTitle}
        body={t.replacedBody}
      />
    );
  const [info, session] = await Promise.all([guestInfo(ev), guestSession(ev)]);
  const me = session ? await guestMe(ev, session) : null;
  // Acara selesai: tamu yang belum ikut melihat A10; yang sudah ikut tetap bisa membuka foto, ucapan, strip.
  if (info.closed && !me)
    return (
      <LinkState
        name={info.name}
        date={info.date}
        pill={t.closedPill}
        bg="bg-neutral"
        title={t.closedTitle}
        body={t.closedBody}
        gallery={
          info.eventGallery
            ? {
                href: info.eventGallery,
                sub: info.galleryUntil ? t.galleryUntil(shortDateId(info.galleryUntil)) : "",
                cover: info.coverUrl,
              }
            : null
        }
      />
    );
  return <GuestCam token={token} info={info} initialMe={me} />;
}
