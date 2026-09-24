import { copy } from "../copy";

/** Hasil foto barusan, sebentar sebelum foto berikutnya. */
export function PhotoPreview({ url, index, total }: { url: string; index: number; total: number }) {
  return (
    <main className="flex h-full w-full flex-col items-center justify-center gap-8 bg-bg p-16">
      <img
        src={url}
        alt=""
        className="max-h-[75vh] max-w-full animate-[fade_200ms_ease-out] rounded border border-line bg-surface p-2"
      />
      <p className="text-xl font-medium uppercase tracking-label text-muted">
        {copy.countdown.progress(index + 1, total)}
      </p>
    </main>
  );
}
