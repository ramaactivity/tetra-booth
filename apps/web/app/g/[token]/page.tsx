import type { Metadata } from "next";
import { loadGallery } from "@/lib/gallery";
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
  const cover = g.photos.find((p) => p.kind === "strip");
  const left = g.expiresAt
    ? Math.max(0, Math.ceil((new Date(g.expiresAt).getTime() - Date.now()) / 86_400_000))
    : null;
  const count = g.photos.length.toLocaleString("id-ID");
  return (
    <main className="mx-auto flex min-h-dvh max-w-[1440px] flex-col gap-5 bg-paper px-3.5 pt-6 pb-16 md:px-12">
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
      <section className="relative h-[420px] overflow-hidden rounded-[26px] border-[1.5px] border-ink bg-neutral stripes md:h-[560px] md:rounded-[28px]">
        {cover && (
          <img
            src={cover.full}
            alt=""
            fetchPriority="high"
            className="absolute inset-0 size-full object-cover"
          />
        )}
        <div className="layered absolute right-3 bottom-3 left-3 rounded-[18px] border-[1.5px] border-ink bg-white p-4 [--lb:1.5px] [--lx:6px] [--under:#fff] md:right-auto md:bottom-7 md:left-7 md:w-[560px] md:rounded-[22px] md:p-7">
          {g.tagline && (
            <span className="rounded-full border-[1.5px] border-ink bg-lavender px-3 py-[5px] text-xs font-bold whitespace-nowrap">
              {g.tagline}
            </span>
          )}
          <h1 className="mt-4 text-[30px] leading-none font-extrabold tracking-[-0.04em] md:text-[72px] md:leading-[0.95]">
            {g.name}
          </h1>
          <div className="mt-3 flex justify-between border-t-[1.5px] border-dashed border-ink pt-2.5 text-xs font-semibold md:mt-5 md:grid md:grid-cols-3 md:pt-3.5 md:text-[13px]">
            <span>
              {fmt(g.date)}
              {g.location ? <span className="md:hidden"> · {g.location}</span> : null}
            </span>
            <span className="hidden md:block">{g.location ?? "—"}</span>
            <span className="font-mono" data-testid="photo-count">
              {count} foto
            </span>
          </div>
        </div>
      </section>
      {left !== null && g.daysTotal && (
        <div className="flex flex-col gap-2 rounded-[14px] border-[1.5px] border-dashed border-ink bg-peach px-3.5 py-3 md:max-w-sm">
          <div className="flex justify-between text-xs font-bold">
            <span>Galeri tersedia {left} hari lagi</span>
            <span className="font-mono font-normal">
              {left}/{g.daysTotal}
            </span>
          </div>
          <div className="h-2 overflow-hidden rounded border-[1.5px] border-ink bg-white">
            <div
              className="h-full bg-ink"
              style={{ width: `${Math.min(100, (left / g.daysTotal) * 100)}%` }}
            />
          </div>
        </div>
      )}
      <GalleryView token={token} photos={g.photos} />
    </main>
  );
}
