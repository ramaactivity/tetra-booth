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
    <main className="flex h-full w-full flex-col items-center justify-center gap-12 bg-bg p-16 text-fg portrait:gap-6 portrait:p-6">
      <h1 className="text-4xl font-medium tracking-tight">{copy.review.title}</h1>
      <div className="flex w-full max-w-6xl justify-center gap-6 portrait:flex-col portrait:items-center portrait:gap-3">
        {photos.map((p, i) => (
          <figure
            key={p?.path ?? i}
            className="relative min-w-0 flex-1 rounded bg-surface p-2 portrait:flex portrait:w-full portrait:flex-none portrait:items-center portrait:gap-3"
          >
            {p && (
              <img
                src={p.url}
                alt=""
                className="aspect-[3/2] w-full rounded-sm object-cover portrait:h-[20vh] portrait:w-auto"
              />
            )}
            <span className="absolute top-4 left-4 rounded-sm bg-surface px-2 text-sm tabular-nums">
              {i + 1}
            </span>
            {canRetake(i) && (
              <button
                type="button"
                onClick={() => onRetake(i)}
                className="mt-2 min-h-16 w-full rounded border-[1.5px] border-fg text-base font-medium uppercase tracking-label portrait:mt-0 portrait:min-w-16 portrait:flex-1"
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
