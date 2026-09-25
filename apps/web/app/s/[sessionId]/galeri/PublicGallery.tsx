import { GalleryView } from "@/app/g/[token]/GalleryView";
import { copy } from "@/lib/copy";
import type { Gallery } from "@/lib/gallery";
import { longDate } from "@/lib/guest";

const t = copy.publicGallery;

/** Galeri publik read-only (DECISIONS #72); `back` = link kembali ke halaman foto tamu. */
export function PublicGallery({ g, back }: { g: Gallery; back?: string }) {
  return (
    <main className="mx-auto flex min-h-dvh max-w-[1440px] flex-col gap-5 bg-paper px-3.5 pt-6 pb-16 md:px-12">
      {back && (
        <a href={back} className="self-start text-[13px] font-bold no-underline">
          {t.back}
        </a>
      )}
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
