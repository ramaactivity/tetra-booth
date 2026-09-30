"use client";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { copy } from "@/lib/copy";

const t = copy.guest;
export type ViewerItem = { src: string; thumb: string };

/**
 * Penampil foto layar penuh: geser (swipe) / panah / ←→, strip thumbnail, Esc & tombol back menutup.
 * `children` = aksi di baris bawah (mis. "Simpan foto ini"). Menutup lewat history.back() agar
 * entri history yang didorong saat buka ikut hilang; popstate yang memanggil `onClose`.
 */
export function PhotoViewer({
  items,
  index,
  onIndex,
  onClose,
  children,
}: {
  items: ViewerItem[];
  index: number;
  onIndex: (i: number) => void;
  onClose: () => void;
  children?: ReactNode;
}) {
  const box = useRef<HTMLDivElement>(null);
  const closeBtn = useRef<HTMLButtonElement>(null);
  const thumbs = useRef<HTMLDivElement>(null);
  const drag = useRef<{ x: number; id: number } | null>(null);
  const [dx, setDx] = useState(0);
  const n = items.length;
  const go = (i: number) => {
    if (i >= 0 && i < n) onIndex(i);
  };
  // Ref agar listener keydown (sekali pasang) selalu memakai index & onIndex terbaru.
  const goRef = useRef(go);
  goRef.current = go;
  const indexRef = useRef(index);
  indexRef.current = index;
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  // Buka: kunci scroll, dorong entri history (back = tutup), fokus ke tombol tutup; tutup: kembalikan fokus.
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    history.pushState({ photoViewer: true }, "");
    const onPop = () => closeRef.current();
    window.addEventListener("popstate", onPop);
    closeBtn.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") history.back();
      else if (e.key === "ArrowLeft") goRef.current(indexRef.current - 1);
      else if (e.key === "ArrowRight") goRef.current(indexRef.current + 1);
      else if (e.key === "Tab" && box.current) {
        // Perangkap fokus di dalam dialog.
        const f = box.current.querySelectorAll<HTMLElement>("button:not(:disabled)");
        const first = f[0];
        const last = f[f.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last?.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first?.focus();
        }
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = overflow;
      window.removeEventListener("popstate", onPop);
      document.removeEventListener("keydown", onKey);
      prev?.focus();
    };
  }, []);

  // biome-ignore lint/correctness/useExhaustiveDependencies: gulir ulang tiap foto aktif berganti
  useEffect(() => {
    thumbs.current
      ?.querySelector("[aria-current=true]")
      ?.scrollIntoView({ block: "nearest", inline: "center", behavior: "smooth" });
  }, [index]);

  const end = () => {
    if (!drag.current) return;
    drag.current = null;
    const w = box.current?.clientWidth ?? 390;
    if (Math.abs(dx) > Math.min(80, w / 5)) go(index + (dx < 0 ? 1 : -1));
    setDx(0);
  };
  const arrow =
    "pressable flex size-12 flex-none items-center justify-center rounded-full border-[1.5px] border-ink bg-white text-2xl leading-none disabled:opacity-30";

  return (
    <div
      ref={box}
      role="dialog"
      aria-modal="true"
      aria-label={t.photoOf(index + 1, n)}
      className="fixed top-0 left-0 z-50 flex h-dvh w-full animate-[fade_150ms_ease-out] flex-col bg-ink pt-[max(12px,env(safe-area-inset-top))] pb-[max(16px,env(safe-area-inset-bottom))] text-paper"
    >
      <div className="flex items-center justify-between px-4 pb-3">
        <span className="font-mono text-sm font-medium" aria-live="polite">
          {n > 1 ? `${index + 1} / ${n}` : ""}
        </span>
        <button
          ref={closeBtn}
          type="button"
          aria-label={t.viewerClose}
          onClick={() => history.back()}
          className="pressable flex size-11 items-center justify-center rounded-full border-[1.5px] border-ink bg-white text-xl leading-none text-ink"
        >
          ✕
        </button>
      </div>

      <div
        className="relative min-h-0 flex-1 touch-pan-y overflow-hidden select-none"
        onPointerDown={(e) => {
          if (n < 2 || e.button !== 0) return;
          drag.current = { x: e.clientX, id: e.pointerId };
          e.currentTarget.setPointerCapture(e.pointerId);
        }}
        onPointerMove={(e) => {
          if (drag.current?.id !== e.pointerId) return;
          const d = e.clientX - drag.current.x;
          // Di ujung set: tarik terasa berat (rubber band).
          setDx((index === 0 && d > 0) || (index === n - 1 && d < 0) ? d / 3 : d);
        }}
        onPointerUp={end}
        onPointerCancel={end}
      >
        <div
          className={`flex h-full ${dx ? "" : "transition-transform duration-300 ease-out motion-reduce:transition-none"}`}
          style={{ transform: `translateX(calc(${-index * 100}% + ${dx}px))` }}
        >
          {items.map((it, i) => (
            <div
              // biome-ignore lint/suspicious/noArrayIndexKey: daftar statis; URL dua foto bisa sama
              key={i}
              className="flex h-full w-full flex-none items-center justify-center px-4"
              aria-hidden={i !== index}
            >
              {/* Hanya foto aktif + tetangganya yang dimuat (preload untuk geser). */}
              {Math.abs(i - index) <= 1 && (
                <img
                  src={it.src}
                  alt={t.photoOf(i + 1, n)}
                  draggable={false}
                  className="max-h-full max-w-full rounded-lg object-contain"
                />
              )}
            </div>
          ))}
        </div>
      </div>

      {n > 1 && (
        <div
          ref={thumbs}
          className="flex justify-center-safe gap-2 overflow-x-auto px-4 pt-4 pb-1 [scrollbar-width:none]"
        >
          {items.map((it, i) => (
            <button
              // biome-ignore lint/suspicious/noArrayIndexKey: daftar statis; URL dua foto bisa sama
              key={i}
              type="button"
              aria-label={t.photoOf(i + 1, n)}
              aria-current={i === index}
              onClick={() => go(i)}
              className={`h-12 w-[72px] flex-none overflow-hidden rounded-md border-[1.5px] ${i === index ? "border-ink outline-[2.5px] outline-offset-0 outline-mint" : "border-transparent opacity-55"}`}
            >
              <img src={it.thumb} alt="" loading="lazy" className="size-full object-cover" />
            </button>
          ))}
        </div>
      )}

      <div className="flex items-center gap-3 px-4 pt-4">
        {n > 1 && (
          <button
            type="button"
            aria-label={t.viewerPrev}
            disabled={index === 0}
            onClick={() => go(index - 1)}
            className={`${arrow} text-ink`}
          >
            ‹
          </button>
        )}
        <div className="flex min-w-0 flex-1 flex-col text-ink">{children}</div>
        {n > 1 && (
          <button
            type="button"
            aria-label={t.viewerNext}
            disabled={index === n - 1}
            onClick={() => go(index + 1)}
            className={`${arrow} text-ink`}
          >
            ›
          </button>
        )}
      </div>
    </div>
  );
}
