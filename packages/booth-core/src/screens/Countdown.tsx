import { useEffect, useState } from "react";
import { copy } from "../copy";

/** Angka besar & tipis di atas live view. Selesai → onDone. */
export function Countdown({
  seconds,
  index,
  total,
  onDone,
}: {
  seconds: number;
  index: number;
  total: number;
  onDone: () => void;
}) {
  const [left, setLeft] = useState(seconds);
  useEffect(() => {
    if (left <= 0) {
      onDone();
      return;
    }
    const t = setTimeout(() => setLeft((n) => n - 1), 1000);
    return () => clearTimeout(t);
  }, [left, onDone]);

  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center text-surface">
      <p className="absolute top-12 text-xl font-medium uppercase tracking-label">
        {copy.countdown.progress(index + 1, total)}
      </p>
      <span className="text-[16rem] leading-none font-extralight tabular-nums drop-shadow-sm">
        {left > 0 ? left : ""}
      </span>
    </div>
  );
}
