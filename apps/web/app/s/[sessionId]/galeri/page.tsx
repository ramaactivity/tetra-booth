import type { Metadata } from "next";
import { GalleryView } from "@/app/g/[token]/GalleryView";
import { copy } from "@/lib/copy";
import { loadPublicGallery } from "@/lib/gallery";
import { longDate } from "@/lib/guest";

export const metadata: Metadata = {
  title: "Galeri acara · Tetra Photobooth",
  robots: { index: false, follow: false },
};
export const dynamic = "force-dynamic";

const t = copy.publicGallery;

/** Galeri publik untuk tamu (FSD §3, DECISIONS #72): read-only, dibuka dari halaman foto tamu. */
export default async function PublicGalleryPage({
  params,
}: {
  params: Promise<{ sessionId: string }>;
}) {
  const { sessionId } = await params;
  const g = await loadPublicGallery(sessionId);
  return (
    <main className="mx-auto flex min-h-dvh max-w-[1440px] flex-col gap-5 bg-paper px-3.5 pt-6 pb-16 md:px-12">
      <a href={`/s/${sessionId}`} className="self-start text-[13px] font-bold no-underline">
        {t.back}
      </a>
      {g.state === "gone" ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center">
          <h1 className="text-2xl font-extrabold tracking-[-0.025em]">{t.gone}</h1>
          <p className="max-w-sm text-sm text-text-2">{t.goneBody}</p>
        </div>
      ) : (
        <>
          <header>
            <p className="text-xs font-bold text-text-2">{t.title}</p>
            <h1 className="mt-1 text-[30px] leading-none font-extrabold tracking-[-0.04em] md:text-[56px]">
              {g.name}
            </h1>
            <p className="mt-2 font-mono text-xs text-text-2">
              {longDate(g.date)} · {g.photos.length.toLocaleString("id-ID")} foto
            </p>
          </header>
          <GalleryView token="" photos={g.photos} readOnly />
        </>
      )}
    </main>
  );
}
