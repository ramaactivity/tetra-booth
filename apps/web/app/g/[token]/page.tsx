import type { Metadata } from "next";
import { loadGallery } from "@/lib/gallery";
import { shortDate } from "@/lib/guest";
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
  if (g.state === "gone")
    return (
      <main className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-paper px-8 text-center">
        <span className="flex size-20 items-center justify-center rounded-[22px] border-[1.5px] border-dashed border-ink bg-peach text-[34px] font-extrabold">
          !
        </span>
        <h1 className="text-2xl font-extrabold tracking-[-0.025em]">Galeri tidak tersedia</h1>
        <p className="max-w-sm text-sm text-text-2">
          Link sudah dicabut atau masa simpan galeri sudah berakhir. Hubungi penyelenggara acara.
        </p>
      </main>
    );
  // Cover lebar = foto original (2400 px), bukan strip sempit yang di-crop & diperbesar (buram, Rama 30 Sep).
  const cover =
    g.photos.find((p) => p.kind === "original") ?? g.photos.find((p) => p.kind === "strip");
  const left = g.expiresAt
    ? Math.max(0, Math.ceil((new Date(g.expiresAt).getTime() - Date.now()) / 86_400_000))
    : null;
  const count = g.photos.length.toLocaleString("id-ID");
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
              {count} foto
            </span>
          </p>
        </div>
        <div className="col-span-2 flex items-center gap-2 md:col-span-1 md:w-[300px] md:flex-col md:items-stretch md:self-stretch md:justify-center">
          {left !== null && g.daysTotal && (
            <div className="flex min-w-0 flex-1 flex-col gap-2 rounded-[14px] border-[1.5px] border-dashed border-ink bg-peach px-3.5 py-2.5 md:flex-none">
              <div className="flex justify-between text-xs font-bold">
                <span>Tersedia {left} hari lagi</span>
                {/* Event belum lewat: sisa hari > masa simpan, pecahan "60/49" membingungkan. */}
                {left <= g.daysTotal && (
                  <span className="font-mono font-normal">
                    {left}/{g.daysTotal}
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
      <GalleryView token={token} photos={g.photos} />
    </main>
  );
}
