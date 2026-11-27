import type { Metadata } from "next";
import { headers } from "next/headers";
import { after } from "next/server";
import { HelpLink } from "@/app/s/[sessionId]/HelpLink";
import { GuestPromo } from "@/components/GuestPromo";
import { isBot, trackClient } from "@/lib/client-track";
import { loadGallery } from "@/lib/gallery";
import { shortDate } from "@/lib/guest";
import { loadPromo } from "@/lib/promo";
import { createUserClient } from "@/lib/supabase/server";
import { GallerySettings } from "./GallerySettings";
import { GalleryView } from "./GalleryView";

export const metadata: Metadata = {
  title: "Galeri · Tetra Photobooth",
  robots: { index: false, follow: false },
};
export const dynamic = "force-dynamic";

const fmt = (d: string) =>
  new Intl.DateTimeFormat("id-ID", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${d}T00:00:00Z`));

/** Galeri klien (FSD §3, desain v2 C1–C2). Privat: hanya dengan link ber-token. */
export default async function GalleryPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const g = await loadGallery(token);
  const promo = g.state === "ok" ? await loadPromo(g.eventId) : null;
  if (g.state === "gone")
    return (
      <main className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-paper px-8 text-center">
        <span className="flex items-center gap-2.5">
          <span className="flex size-[34px] items-center justify-center rounded-[9px] border-[1.5px] border-ink bg-mint text-[15px] font-extrabold">
            T
          </span>
          <span className="text-lg font-extrabold tracking-[-0.02em]">tetra</span>
        </span>
        <h1 className="text-2xl font-extrabold tracking-[-0.025em] text-balance">
          Mohon maaf, galeri ini sudah tidak tersedia
        </h1>
        <p className="max-w-sm text-sm leading-[1.55] text-pretty text-text-2">
          Link-nya sudah dicabut, atau masa simpan galeri sudah berakhir. Kalau masih butuh fotonya,
          chat kami, nanti kami bantu cek.
        </p>
        <HelpLink className="w-full max-w-xs" />
      </main>
    );
  // "Dibuka klien" di ringkasan event: bukan robot pratinjau link, bukan tim yang sedang login admin.
  if (!isBot((await headers()).get("user-agent"))) {
    const { data } = await (await createUserClient()).auth.getUser();
    if (!data.user) after(() => trackClient(g.eventId, "gallery_open"));
  }
  // Cover lebar = foto original (2400 px), bukan strip sempit yang di-crop & diperbesar (buram, Rama 30 Sep).
  // Foto tamu Guest Cam (#203) bukan sampul: bisa buram/acak; booth & Photo Stage dulu.
  const own = g.photos.filter((p) => p.source !== "guest");
  const cover =
    own.find((p) => p.kind === "original") ??
    own.find((p) => p.kind === "strip") ??
    g.photos.find((p) => p.kind === "original");
  const left = g.expiresAt
    ? Math.max(0, Math.ceil((new Date(g.expiresAt).getTime() - Date.now()) / 86_400_000))
    : null;
  // Jumlah sesi foto, bukan jumlah file (dulu "178 foto" di atas vs "89 foto" di toolbar, audit 27 Nov).
  const count = new Set(g.photos.map((p) => p.sessionId)).size.toLocaleString("id-ID");
  return (
    <main className="mx-auto flex min-h-dvh max-w-[1440px] flex-col gap-4 bg-paper px-3.5 pt-4 pb-16 md:gap-5 md:px-12 md:pt-6">
      <header className="hidden items-center justify-between md:flex">
        <div className="flex items-center gap-2.5">
          <span className="flex size-[34px] items-center justify-center rounded-[9px] border-[1.5px] border-ink bg-mint text-[15px] font-extrabold">
            T
          </span>
          <span className="text-lg font-extrabold tracking-[-0.02em]">tetra</span>
        </div>
        <span className="text-[13px] font-semibold text-text-2">
          Galeri privat · hanya dengan link
        </span>
      </header>
      {/* Kartu judul ringkas: cover kecil + info, tidak mendominasi layar (Rama 30 Sep: galeri kepotong). */}
      <section className="layered grid grid-cols-[auto_1fr] items-center gap-3.5 rounded-[22px] border-[1.5px] border-ink bg-white p-3 [--lb:1.5px] [--lx:6px] [--under:#fff] md:grid-cols-[auto_1fr_auto] md:gap-7 md:p-4">
        <div className="relative size-24 flex-none overflow-hidden rounded-[14px] border-[1.5px] border-ink bg-neutral stripes md:h-[200px] md:w-[300px]">
          {cover && (
            <img
              src={cover.thumb}
              srcSet={`${cover.thumb} 480w, ${cover.full} 2400w`}
              sizes="(min-width:768px) 300px, 96px"
              alt=""
              fetchPriority="high"
              className="absolute inset-0 size-full object-cover"
            />
          )}
        </div>
        <div className="flex min-w-0 flex-1 flex-col items-start gap-2 md:gap-3">
          {g.tagline && (
            <span className="rounded-full border-[1.5px] border-ink bg-lavender px-2.5 py-1 text-[11px] font-bold whitespace-nowrap md:px-3 md:text-xs">
              {g.tagline}
            </span>
          )}
          <h1 className="text-[26px] leading-none font-extrabold tracking-[-0.04em] break-words md:text-[52px] md:leading-[0.95]">
            {g.name}
          </h1>
          <p className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs font-semibold text-text-2 md:text-sm">
            <span>
              {fmt(g.date)}
              {g.location && ` · ${g.location}`}
            </span>
            <span className="font-mono text-ink" data-testid="photo-count">
              {count} sesi foto
            </span>
          </p>
        </div>
        <div className="col-span-2 flex items-center gap-2 md:col-span-1 md:w-[300px] md:flex-col md:items-stretch md:self-stretch md:justify-center">
          {left !== null && g.daysTotal && (
            <div className="flex min-w-0 flex-1 flex-col gap-2 rounded-[14px] border-[1.5px] border-dashed border-ink bg-peach px-3.5 py-2.5 md:flex-none">
              <div className="flex justify-between gap-2 text-xs font-bold">
                <span>Tersedia {left} hari lagi</span>
                {/* Tanggal akhir, bukan pecahan "89/90" yang terbaca seperti progres unduhan (audit 27 Nov). */}
                {g.expiresAt && (
                  <span className="font-normal whitespace-nowrap">
                    s/d {shortDate(g.expiresAt)}
                  </span>
                )}
              </div>
              <div className="h-2 overflow-hidden rounded border-[1.5px] border-ink bg-white">
                <div
                  className="h-full bg-ink"
                  style={{ width: `${Math.min(100, (left / g.daysTotal) * 100)}%` }}
                />
              </div>
            </div>
          )}
          <GallerySettings
            token={token}
            enabled={g.publicGallery}
            deleteOn={g.expiresAt ? shortDate(g.expiresAt) : null}
          />
        </div>
      </section>
      <GalleryView token={token} photos={g.photos} stripRatio={g.stripRatio} />
      {promo && <GuestPromo promo={promo} client />}
    </main>
  );
}
