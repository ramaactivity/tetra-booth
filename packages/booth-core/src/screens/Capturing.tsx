import { useEffect, useState } from "react";
import { copy } from "../copy";

/** Flash putih singkat; kalau foto belum datang setelah 3 detik (mis. hot folder), beri tahu tamu (temuan W-017). */
export function Capturing() {
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setSlow(true), 3000);
    return () => clearTimeout(t);
  }, []);
  return (
    <>
      <div className="absolute inset-0 animate-[flash_120ms_ease-out_forwards] bg-surface" />
      {slow && (
        <p className="absolute inset-x-0 bottom-16 animate-[fade_200ms_ease-out] text-center text-2xl font-medium text-surface">
          {copy.countdown.waiting}
        </p>
      )}
    </>
  );
}
