import { ShotProgress } from "./Countdown";

/** Hasil foto barusan, sebentar sebelum foto berikutnya. */
export function PhotoPreview({
  url,
  index,
  total,
  cheer = "",
}: {
  url: string;
  index: number;
  total: number;
  /** Sorakan setelah foto, mis. "Mantap!" (#103). */
  cheer?: string;
}) {
  return (
    <main className="relative flex h-full w-full items-center justify-center bg-paper px-24 pt-40 pb-24">
      <ShotProgress index={index} total={total} taken />
      {cheer && (
        <p className="absolute right-24 bottom-20 z-10 -rotate-3 animate-[tick_300ms_ease-out] rounded-[28px] border-[3px] border-ink bg-mint px-10 py-4 text-[56px] leading-none font-extrabold">
          {cheer}
        </p>
      )}
      <img
        src={url}
        alt=""
        className="layered max-h-full max-w-full animate-[fade_200ms_ease-out] rounded-[20px] border-[2.5px] border-ink bg-white"
      />
    </main>
  );
}
