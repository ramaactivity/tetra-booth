import { Button } from "@tetra/ui";
import { copy } from "../copy";
import type { Photo } from "../session";

export function Review({
  photos,
  canRetake,
  onRetake,
  onNext,
}: {
  photos: (Photo | null)[];
  canRetake: (index: number) => boolean;
  onRetake: (index: number) => void;
  onNext: () => void;
}) {
  return (
    <main className="flex h-full w-full flex-col items-center justify-center gap-12 bg-bg p-16 text-fg portrait:p-12">
      <h1 className="text-4xl font-medium tracking-tight">{copy.review.title}</h1>
      <div className="flex w-full max-w-6xl justify-center gap-6 portrait:gap-3">
        {photos.map((p, i) => (
          <figure
            key={p?.path ?? i}
            className="relative flex-1 rounded bg-surface p-2 portrait:w-full portrait:max-w-xl"
          >
            {p && (
              <img src={p.url} alt="" className="aspect-[3/2] w-full rounded-sm object-cover" />
            )}
            <span className="absolute top-4 left-4 rounded-sm bg-surface px-2 text-sm tabular-nums">
              {i + 1}
            </span>
            {canRetake(i) && (
              <button
                type="button"
                onClick={() => onRetake(i)}
                className="mt-2 min-h-16 w-full rounded border-[1.5px] border-fg text-base font-medium uppercase tracking-label"
              >
                ↻ {copy.review.retake}
              </button>
            )}
          </figure>
        ))}
      </div>
      <Button size="booth" onClick={onNext}>
        {copy.review.next}
      </Button>
    </main>
  );
}
