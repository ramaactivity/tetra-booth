import { Button } from "@tetra/ui";
import { Minus, Plus, Sparkle } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { copy } from "../copy";
import { rupiah } from "../format";

/** Tamu pergi tanpa memilih (M-019): tanpa sentuhan selama ini → lanjut ke QR tanpa cetak (masukan Rama). */
export const PRINT_SELECT_IDLE_MS = 30_000;

export function PrintSelect({
  stripUrl,
  max,
  extraPrice,
  onSelect,
}: {
  stripUrl: string;
  max: number;
  /** Photobox (A7b): harga per lembar tambahan; lembar pertama termasuk paket. */
  extraPrice?: number | undefined;
  onSelect: (count: number) => void;
}) {
  const [n, setN] = useState(1);
  const photobox = extraPrice !== undefined;
  const select = useRef(onSelect);
  select.current = onSelect;
  // biome-ignore lint/correctness/useExhaustiveDependencies: n sengaja, supaya timer mulai ulang saat tamu memilih
  useEffect(() => {
    // Hitung ulang tiap kali tamu mengubah jumlah; waktu habis = tidak cetak (tidak pernah cetak otomatis).
    const t = setTimeout(() => select.current(0), PRINT_SELECT_IDLE_MS);
    return () => clearTimeout(t);
  }, [n]);
  const step =
    "flex size-[150px] items-center justify-center border-dashed border-ink disabled:text-muted";
  return (
    <main className="grid h-full w-full grid-cols-2 bg-paper portrait:grid-cols-1 portrait:grid-rows-[45%_1fr]">
      <section
        className={`flex items-center justify-center border-r-[2.5px] border-ink p-16 ${photobox ? "bg-lavender" : "bg-mint-soft"} portrait:border-r-0 portrait:border-b-[2.5px]`}
      >
        <img
          src={stripUrl}
          alt=""
          className="layered max-h-[840px] max-w-[560px] rounded-[10px] border-[2.5px] border-ink bg-white [--lx:14px] [--under:#fff] portrait:max-h-full"
        />
      </section>
      <section
        className={`flex flex-col justify-center px-[110px] portrait:px-16 portrait:py-10 ${photobox ? "gap-7 py-12" : "gap-10 py-20"}`}
      >
        <span
          className={`self-start rounded-full border-2 border-ink px-[18px] py-2 text-xl font-bold ${photobox ? "bg-lavender" : "bg-mint-soft"}`}
        >
          {photobox ? copy.photobox.mode : copy.print.mode}
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
        {photobox ? (
          <>
            <div className="overflow-hidden rounded-[24px] border-[2.5px] border-ink bg-white text-[28px]">
              <div className="flex justify-between px-7 py-5">
                <span>{copy.photobox.includedLine}</span>
                <span className="text-text-2">{rupiah(0)}</span>
              </div>
              {n > 1 && (
                <div className="flex justify-between border-t-2 border-dashed border-ink px-7 py-5">
                  <span>{copy.payment.extraLine(n - 1, rupiah(extraPrice))}</span>
                  <span>{rupiah((n - 1) * extraPrice)}</span>
                </div>
              )}
              <div className="flex justify-between border-t-[2.5px] border-ink bg-peach px-7 py-5 text-[34px] font-extrabold">
                <span>{copy.photobox.extraTotal}</span>
                <span data-testid="extra-total">{rupiah((n - 1) * extraPrice)}</span>
              </div>
            </div>
            <div className="flex gap-6">
              <Button
                variant="secondary"
                className="h-[116px] flex-1 rounded-[26px] text-[32px]"
                onClick={() => onSelect(1)}
              >
                {copy.photobox.printOne}
              </Button>
              <Button
                className="h-[116px] flex-[1.4] rounded-[26px] text-[34px]"
                disabled={n <= 1}
                onClick={() => onSelect(n)}
              >
                {copy.photobox.payPrint}
              </Button>
            </div>
          </>
        ) : (
          <>
            <p className="flex items-center gap-[18px] rounded-[20px] border-2 border-dashed border-ink bg-white px-6 py-5 text-[28px] font-bold">
              <span className="flex size-[52px] items-center justify-center rounded-[14px] border-2 border-dashed border-ink bg-mint-soft">
                <Sparkle size={26} strokeWidth={1.5} fill="currentColor" />
              </span>
              {copy.print.free(max)}
            </p>
            <div className="flex gap-6">
              <Button
                variant="secondary"
                className="h-[116px] flex-1 rounded-[26px] text-[32px]"
                onClick={() => onSelect(0)}
              >
                {copy.print.skip}
              </Button>
              <Button
                className="h-[116px] flex-[1.6] rounded-[26px] text-[34px]"
                onClick={() => onSelect(n)}
              >
                {copy.print.print}
              </Button>
            </div>
          </>
        )}
      </section>
    </main>
  );
}
