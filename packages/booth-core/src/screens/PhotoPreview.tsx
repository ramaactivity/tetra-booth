import { ShotProgress } from "./Countdown";

/** Hasil foto barusan, sebentar sebelum foto berikutnya. */
export function PhotoPreview({ url, index, total }: { url: string; index: number; total: number }) {
  return (
    <main className="relative flex h-full w-full items-center justify-center bg-paper px-24 pt-40 pb-24">
      <ShotProgress index={index} total={total} taken />
      <img
        src={url}
        alt=""
        className="layered max-h-full max-w-full animate-[fade_200ms_ease-out] rounded-[20px] border-[2.5px] border-ink bg-white"
      />
    </main>
  );
}
