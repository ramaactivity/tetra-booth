import { Button } from "@tetra/ui";
import { ArrowRight, RotateCcw } from "lucide-react";
import type { CSSProperties } from "react";
import { copy } from "../copy";
import type { Photo } from "../session";
import { Logo } from "../ui";

export function Review({
  photos,
  retakesUsed,
  retakeMax,
  onRetake,
  onNext,
}: {
  photos: (Photo | null)[];
  retakesUsed: number[];
  retakeMax: number;
  onRetake: (index: number) => void;
  onNext: () => void;
}) {
  return (
    <main className="flex h-full w-full flex-col bg-paper px-24 py-16 portrait:px-12">
      <div className="flex h-[62px] items-center">
        <Logo />
      </div>
      <div className="mt-9 flex items-end justify-between gap-8 portrait:flex-col portrait:items-start">
        <h1 className="text-[72px] font-extrabold tracking-[-0.035em]">{copy.review.title}</h1>
        {retakeMax > 0 && (
          <p className="flex items-center gap-2 rounded-[18px] border-2 border-dashed border-ink bg-sky px-6 py-4 text-2xl font-semibold whitespace-nowrap">
            <RotateCcw size={22} strokeWidth={2.5} />
            {copy.review.rule(retakeMax)}
          </p>
        )}
      </div>
      <div
        style={{ "--n": photos.length } as CSSProperties}
        className="grid flex-1 grid-cols-[repeat(var(--n),minmax(0,1fr))] items-center gap-10 portrait:grid-cols-2"
      >
        {photos.map((p, i) => {
          const used = retakesUsed[i] ?? 0;
          return (
            // biome-ignore lint/suspicious/noArrayIndexKey: urutan slot tetap
            <div key={i} className="flex flex-col gap-[26px]">
              <div className="layered relative aspect-[3/2] overflow-hidden rounded-[20px] border-[2.5px] border-ink bg-neutral [--under:#fff]">
                {p && <img src={p.url} alt="" className="h-full w-full object-cover" />}
                <span className="absolute top-3.5 left-3.5 flex size-[46px] items-center justify-center rounded-full border-2 border-ink bg-white text-xl font-extrabold">
                  {i + 1}
                </span>
              </div>
              {used < retakeMax ? (
                <Button
                  variant="plain"
                  className="h-[92px] rounded-[22px] bg-white! text-[26px]"
                  onClick={() => onRetake(i)}
                >
                  <RotateCcw size={24} strokeWidth={2.5} />
                  {copy.review.retake}
                </Button>
              ) : (
                used > 0 && (
                  <div className="flex h-[92px] items-center justify-center rounded-[22px] border-[2.5px] border-dashed border-[#9a9892] text-2xl font-bold text-[#7a7873]">
                    {copy.review.retaken(used, retakeMax)}
                  </div>
                )
              )}
            </div>
          );
        })}
      </div>
      <div className="flex justify-end">
        <Button className="h-[108px] w-[520px] rounded-3xl text-[32px]" onClick={onNext}>
          {copy.review.next}
          <ArrowRight size={32} strokeWidth={2.5} />
        </Button>
      </div>
    </main>
  );
}
