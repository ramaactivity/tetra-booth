import { useEffect, useState } from "react";
import { copy } from "../copy";

/** "Cekrek!" di layar putih (A5b); kalau foto belum datang setelah 3 detik (mis. hot folder), beri tahu tamu (W-017). */
export function Capturing({ index, total }: { index: number; total: number }) {
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setSlow(true), 3000);
    return () => clearTimeout(t);
  }, []);
  return (
    <main className="absolute inset-0 flex animate-[fade_150ms_ease-out] items-center justify-center overflow-hidden bg-white">
      <div className="absolute size-[1100px] rounded-full border-2 border-[#edece8]" />
      <div className="absolute size-[800px] rounded-full border-2 border-[#edece8]" />
      <p className="absolute inset-x-0 top-12 text-center text-[28px] font-bold">
        {copy.countdown.progress(index + 1, total)}
      </p>
      <div className="layered relative rounded-[48px] border-4 border-ink bg-butter px-24 py-10 text-[200px] font-extrabold tracking-[-0.05em] [--lb:4px] [--lx:16px] [--under:#fff] portrait:text-[140px]">
        {copy.countdown.snap}
      </div>
      {slow && (
        <p className="absolute inset-x-0 bottom-16 animate-[fade_200ms_ease-out] text-center text-[28px] font-semibold text-text-2">
          {copy.countdown.waiting}
        </p>
      )}
    </main>
  );
}
