import { Button } from "@tetra/ui";
import { Minus, Plus, Sparkle } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { copy } from "../copy";

/** Tamu pergi tanpa memilih (M-019): tanpa sentuhan selama ini → cetak jumlah yang sedang dipilih. */
export const PRINT_SELECT_IDLE_MS = 30_000;

export function PrintSelect({
  stripUrl,
  max,
  onSelect,
}: {
  stripUrl: string;
  max: number;
  onSelect: (count: number) => void;
}) {
  const [n, setN] = useState(1);
  const select = useRef(onSelect);
  select.current = onSelect;
  useEffect(() => {
    const t = setTimeout(() => select.current(n), PRINT_SELECT_IDLE_MS);
    return () => clearTimeout(t);
  }, [n]);
  const step =
    "flex size-[150px] items-center justify-center border-dashed border-ink disabled:text-muted";
  return (
    <main className="grid h-full w-full grid-cols-2 bg-paper portrait:grid-cols-1 portrait:grid-rows-[45%_1fr]">
      <section className="flex items-center justify-center border-r-[2.5px] border-ink bg-mint-soft p-16 portrait:border-r-0 portrait:border-b-[2.5px]">
        <img
          src={stripUrl}
          alt=""
          className="layered max-h-[840px] max-w-[560px] rounded-[10px] border-[2.5px] border-ink bg-white [--lx:14px] [--under:#fff] portrait:max-h-full"
        />
      </section>
      <section className="flex flex-col justify-center gap-10 px-[110px] py-20 portrait:px-16 portrait:py-10">
        <span className="self-start rounded-full border-2 border-ink bg-mint-soft px-[18px] py-2 text-xl font-bold">
          {copy.print.mode}
        </span>
        <h1 className="max-w-[9ch] text-[80px] leading-none font-extrabold tracking-[-0.04em]">
          {copy.print.title}
        </h1>
        <div className="layered flex items-center self-start rounded-[32px] border-[2.5px] border-ink bg-white">
          <button
            type="button"
            aria-label={copy.print.less}
            className={`${step} border-r-[2.5px]`}
            disabled={n <= 1}
            onClick={() => setN(n - 1)}
          >
            <Minus size={56} strokeWidth={2.5} />
          </button>
          <span className="w-[200px] text-center text-[120px] leading-none font-extrabold tracking-[-0.04em]">
            {n}
          </span>
          <button
            type="button"
            aria-label={copy.print.more}
            className={`${step} rounded-r-[30px] border-l-[2.5px] bg-mint disabled:bg-white`}
            disabled={n >= max}
            onClick={() => setN(n + 1)}
          >
            <Plus size={56} strokeWidth={2.5} />
          </button>
        </div>
        <p className="flex items-center gap-[18px] rounded-[20px] border-2 border-dashed border-ink bg-white px-6 py-5 text-[28px] font-bold">
          <span className="flex size-[52px] items-center justify-center rounded-[14px] border-2 border-dashed border-ink bg-mint-soft">
            <Sparkle size={26} strokeWidth={1.5} fill="currentColor" />
          </span>
          {copy.print.free(max)}
        </p>
        <Button className="h-[116px] rounded-[26px] text-[34px]" onClick={() => onSelect(n)}>
          {copy.print.print}
        </Button>
      </section>
    </main>
  );
}
