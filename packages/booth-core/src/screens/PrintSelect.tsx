import { Button } from "@tetra/ui";
import { useState } from "react";
import { copy } from "../copy";

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
  const step =
    "flex size-20 items-center justify-center rounded border-[1.5px] border-fg text-4xl font-light disabled:opacity-30";
  return (
    <main className="flex h-full w-full items-center justify-center gap-20 bg-bg p-16 text-fg portrait:flex-col portrait:gap-12">
      <img
        src={stripUrl}
        alt=""
        className="max-h-[80vh] rounded border border-line bg-surface p-2 portrait:max-h-[50vh]"
      />
      <section className="flex flex-col items-center gap-10">
        <h1 className="text-4xl font-medium tracking-tight">{copy.print.title}</h1>
        <div className="flex items-center gap-10">
          <button
            type="button"
            aria-label={copy.print.less}
            className={step}
            disabled={n <= 1}
            onClick={() => setN(n - 1)}
          >
            −
          </button>
          <span className="w-24 text-center text-8xl font-extralight tabular-nums">{n}</span>
          <button
            type="button"
            aria-label={copy.print.more}
            className={step}
            disabled={n >= max}
            onClick={() => setN(n + 1)}
          >
            +
          </button>
        </div>
        <Button size="booth" onClick={() => onSelect(n)}>
          {copy.print.print}
        </Button>
      </section>
    </main>
  );
}
