"use client";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { type PointerEvent, type ReactNode, useEffect, useRef, useState } from "react";
import { copy } from "@/lib/copy";

const t = copy.guest;
export type ViewerItem = { src: string; thumb: string };
const HINT_KEY = "tetra.viewerZoomHint";

type Zoom = { s: number; x: number; y: number };
const NO_ZOOM: Zoom = { s: 1, x: 0, y: 0 };
const clampS = (s: number) => Math.min(4, Math.max(1, s));

/** Titik layar relatif terhadap pojok kiri-atas <img> sebelum transform (slide = offsetParent). */
function rel(el: HTMLImageElement, cx: number, cy: number) {
  const p = el.parentElement?.getBoundingClientRect();
  return { x: cx - (p?.left ?? 0) - el.offsetLeft, y: cy - (p?.top ?? 0) - el.offsetTop };
}

/**
 * Jepit skala ke 1–4× dan geseran agar tepi foto tidak masuk melewati tepi layar (sisi yang
 * lebih kecil dari layar ditengahkan), lalu tulis transform langsung ke <img> — tanpa state
 * React per gerakan agar tetap 60fps. transform-origin 0 0.
 */
function place(el: HTMLImageElement, scale: number, x: number, y: number, animate = false): Zoom {
  const s = clampS(scale);
  const p = el.parentElement?.getBoundingClientRect();
  const fit = (v: number, off: number, len: number, room: number) =>
    len <= room ? (room - len) / 2 - off : Math.min(-off, Math.max(room - len - off, v));
  const z =
    s === 1 || !p
      ? NO_ZOOM
      : {
          s,
          x: fit(x, el.offsetLeft, el.offsetWidth * s, p.width),
          y: fit(y, el.offsetTop, el.offsetHeight * s, p.height),
        };
  el.style.transition =
    animate && !matchMedia("(prefers-reduced-motion: reduce)").matches
      ? "transform 250ms ease-out"
      : "";
  el.style.transform = z.s === 1 ? "" : `translate(${z.x}px, ${z.y}px) scale(${z.s})`;
  return z;
}

/** Zoom ke `scale` dengan titik layar (cx, cy) tetap di bawah jari/kursor. */
function zoomAt(
  el: HTMLImageElement,
  z: Zoom,
  scale: number,
  cx: number,
  cy: number,
  animate = false,
) {
  const r = rel(el, cx, cy);
  const k = clampS(scale) / z.s;
  return place(el, scale, r.x - k * (r.x - z.x), r.y - k * (r.y - z.y), animate);
}

/**
 * Penampil foto layar penuh: geser (swipe) / panah / ←→, strip thumbnail, Esc & tombol back menutup.
 * Zoom: cubit 1–4× (seret satu jari = geser foto, bukan pindah slide), ketuk/klik dua kali 1× ↔ 2,5×,
 * ctrl + roda (pinch trackpad). Ganti foto = zoom kembali 1×.
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
  const area = useRef<HTMLDivElement>(null);
  const img = useRef<HTMLImageElement>(null);
  const drag = useRef<{ x: number; id: number } | null>(null);
  const [dx, setDx] = useState(0);
  // Crossfade (revisi 10 Okt): foto lama (`base`) tetap tampil sampai foto baru termuat, lalu memudar 200 ms.
  // Dulu seluruh rel foto bergeser dan hanya ±1 tetangga yang dirender → lompat jauh berkedip (slide kosong).
  const [base, setBase] = useState(index);
  const [ready, setReady] = useState(true);
  const [hint, setHint] = useState(false);
  // Gestur zoom — semua di ref agar gerakan tidak me-render ulang React.
  const z = useRef<Zoom>(NO_ZOOM);
  const pts = useRef(new Map<number, { x: number; y: number }>());
  const pinch = useRef<{ d0: number; s0: number; ux: number; uy: number } | null>(null);
  const pan = useRef<{ px: number; py: number; x0: number; y0: number } | null>(null);
  const tap = useRef<{ x: number; y: number; t: number } | null>(null);
  const lastTap = useRef<{ x: number; y: number; t: number } | null>(null);
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
    // ctrl + roda = pinch trackpad di desktop; non-passive agar zoom halaman browser dicegah.
    const a = area.current;
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey || !img.current) return;
      e.preventDefault();
      z.current = zoomAt(
        img.current,
        z.current,
        z.current.s * Math.exp(-e.deltaY / 100),
        e.clientX,
        e.clientY,
      );
    };
    a?.addEventListener("wheel", onWheel, { passive: false });
    // Petunjuk zoom sekali saja, hanya di layar sentuh.
    try {
      if (matchMedia("(pointer: coarse)").matches && !localStorage.getItem(HINT_KEY)) {
        localStorage.setItem(HINT_KEY, "1");
        setHint(true);
      }
    } catch {
      // localStorage diblokir: lewati petunjuk.
    }
    return () => {
      document.body.style.overflow = overflow;
      window.removeEventListener("popstate", onPop);
      document.removeEventListener("keydown", onKey);
      a?.removeEventListener("wheel", onWheel);
      prev?.focus();
    };
  }, []);

  // Foto baru: tunggu termuat (cache = langsung), preload tetangga supaya geser berikutnya instan.
  // biome-ignore lint/correctness/useExhaustiveDependencies: hanya saat foto aktif berganti
  useEffect(() => {
    if (index === base) return;
    setReady(!!img.current?.complete);
    for (const i of [index - 1, index + 1]) {
      const it = items[i];
      if (it) new Image().src = it.src;
    }
  }, [index]);
  useEffect(() => {
    if (!ready || index === base) return;
    const t = setTimeout(() => setBase(index), 220);
    return () => clearTimeout(t);
  }, [ready, index, base]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: gulir ulang tiap foto aktif berganti
  useEffect(() => {
    thumbs.current
      ?.querySelector("[aria-current=true]")
      ?.scrollIntoView({ block: "nearest", inline: "center", behavior: "smooth" });
    // Foto berganti (panah, thumbnail, keyboard, geser): zoom foto lama dikembalikan ke 1×.
    const el = img.current;
    return () => {
      z.current = NO_ZOOM;
      pinch.current = null;
      pan.current = null;
      if (el) {
        el.style.transition = "";
        el.style.transform = "";
      }
    };
  }, [index]);

  const down = (e: PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    pts.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const [a, b] = [...pts.current.values()];
    const el = img.current;
    if (a && b && el) {
      // Jari kedua: mulai cubit, batalkan geser slide / geser foto / ketuk.
      drag.current = null;
      setDx(0);
      pan.current = null;
      tap.current = null;
      lastTap.current = null;
      setHint(false);
      const { s, x, y } = z.current;
      const r = rel(el, (a.x + b.x) / 2, (a.y + b.y) / 2);
      pinch.current = {
        d0: Math.hypot(a.x - b.x, a.y - b.y) || 1,
        s0: s,
        ux: (r.x - x) / s,
        uy: (r.y - y) / s,
      };
    } else if (pts.current.size === 1) {
      tap.current = { x: e.clientX, y: e.clientY, t: e.timeStamp };
      const { s, x, y } = z.current;
      if (s > 1) pan.current = { px: e.clientX, py: e.clientY, x0: x, y0: y };
      else if (n > 1) drag.current = { x: e.clientX, id: e.pointerId };
    }
  };

  const move = (e: PointerEvent<HTMLDivElement>) => {
    const p = pts.current.get(e.pointerId);
    if (!p) return;
    p.x = e.clientX;
    p.y = e.clientY;
    const t = tap.current;
    if (t && Math.hypot(e.clientX - t.x, e.clientY - t.y) > 10) tap.current = null;
    const el = img.current;
    const [a, b] = [...pts.current.values()];
    if (pinch.current && a && b && el) {
      const { d0, s0, ux, uy } = pinch.current;
      const s = clampS((s0 * Math.hypot(a.x - b.x, a.y - b.y)) / d0);
      const r = rel(el, (a.x + b.x) / 2, (a.y + b.y) / 2);
      z.current = place(el, s, r.x - s * ux, r.y - s * uy);
    } else if (pan.current && el) {
      const { px, py, x0, y0 } = pan.current;
      z.current = place(el, z.current.s, x0 + e.clientX - px, y0 + e.clientY - py);
    } else if (drag.current?.id === e.pointerId) {
      const d = e.clientX - drag.current.x;
      // Di ujung set: tarik terasa berat (rubber band).
      setDx((index === 0 && d > 0) || (index === n - 1 && d < 0) ? d / 3 : d);
    }
  };

  const end = (e: PointerEvent<HTMLDivElement>) => {
    if (!pts.current.delete(e.pointerId)) return;
    const el = img.current;
    if (pinch.current) {
      if (pts.current.size >= 2) return;
      pinch.current = null;
      // Hampir 1×: kembali pas 1× (swipe aktif lagi); jari yang tersisa lanjut menggeser foto.
      if (el && z.current.s < 1.05) z.current = place(el, 1, 0, 0, true);
      const [rest] = [...pts.current.values()];
      if (rest && z.current.s > 1)
        pan.current = { px: rest.x, py: rest.y, x0: z.current.x, y0: z.current.y };
      return;
    }
    pan.current = null;
    // Ketuk / klik dua kali: 1× ↔ 2,5× di titik ketuk.
    const t = tap.current;
    tap.current = null;
    if (t && el && e.type === "pointerup" && e.timeStamp - t.t < 300) {
      const l = lastTap.current;
      if (l && t.t - l.t < 400 && Math.hypot(t.x - l.x, t.y - l.y) < 30) {
        lastTap.current = null;
        z.current =
          z.current.s > 1 ? place(el, 1, 0, 0, true) : zoomAt(el, z.current, 2.5, t.x, t.y, true);
        setHint(false);
      } else lastTap.current = t;
    }
    if (drag.current?.id !== e.pointerId) return;
    drag.current = null;
    const w = box.current?.clientWidth ?? 390;
    if (Math.abs(dx) > Math.min(80, w / 5)) go(index + (dx < 0 ? 1 : -1));
    setDx(0);
  };
  const arrow =
    "absolute top-1/2 z-10 flex size-12 -translate-y-1/2 items-center justify-center rounded-full bg-white/90 text-ink shadow-[0_2px_10px_rgba(0,0,0,.25)] transition-[opacity,transform] duration-200 hover:bg-white active:scale-90 disabled:pointer-events-none disabled:opacity-0 sm:size-14";
  const fade = "transition-opacity duration-200 ease-out motion-reduce:transition-none";
  const cur = items[index];
  const old = base !== index ? items[base] : undefined;

  return (
    <div
      ref={box}
      role="dialog"
      aria-modal="true"
      aria-label={t.photoOf(index + 1, n)}
      className="fixed top-0 left-0 z-50 flex h-dvh w-full animate-[fade_150ms_ease-out] flex-col bg-ink pt-[max(12px,env(safe-area-inset-top))] pb-[max(16px,env(safe-area-inset-bottom))] text-paper"
    >
      <div className="flex items-center justify-between px-4 pb-3">
        <div className="flex items-baseline gap-3">
          <span className="font-mono text-sm font-medium" aria-live="polite">
            {n > 1 ? `${index + 1} / ${n}` : ""}
          </span>
          {hint && <span className="text-xs text-paper/70">{copy.guest.zoomHint}</span>}
        </div>
        <button
          ref={closeBtn}
          type="button"
          aria-label={t.viewerClose}
          onClick={() => history.back()}
          className="flex size-11 items-center justify-center rounded-full bg-white text-ink transition active:scale-90"
        >
          <X size={22} strokeWidth={2.5} />
        </button>
      </div>

      <div className="relative min-h-0 flex-1">
        <div
          ref={area}
          className="absolute inset-0 touch-none overflow-hidden select-none"
          onPointerDown={down}
          onPointerMove={move}
          onPointerUp={end}
          onPointerCancel={end}
        >
          <div
            className={`relative flex h-full w-full items-center justify-center px-4 sm:px-20 ${dx ? "" : "transition-transform duration-300 ease-out motion-reduce:transition-none"}`}
            style={{ transform: dx ? `translateX(${dx}px)` : undefined }}
          >
            {old && (
              // biome-ignore lint/performance/noImgElement: URL R2 bertanda tangan
              <img
                src={old.src}
                alt=""
                aria-hidden
                draggable={false}
                className={`absolute inset-0 m-auto max-h-full max-w-[calc(100%-2rem)] rounded-lg object-contain sm:max-w-[calc(100%-10rem)] ${fade} ${ready ? "opacity-0" : "opacity-100"}`}
              />
            )}
            {cur && (
              // biome-ignore lint/performance/noImgElement: URL R2 bertanda tangan
              <img
                key={index}
                ref={img}
                src={cur.src}
                alt={t.photoOf(index + 1, n)}
                draggable={false}
                onLoad={() => setReady(true)}
                onError={() => setReady(true)}
                className={`relative max-h-full max-w-full origin-top-left rounded-lg object-contain ${fade} ${ready || !old ? "opacity-100" : "opacity-0"}`}
              />
            )}
          </div>
        </div>
        {n > 1 && (
          <>
            <button
              type="button"
              aria-label={t.viewerPrev}
              disabled={index === 0}
              onClick={() => go(index - 1)}
              className={`${arrow} left-3 sm:left-6`}
            >
              <ChevronLeft size={26} strokeWidth={2.5} className="-ml-0.5" />
            </button>
            <button
              type="button"
              aria-label={t.viewerNext}
              disabled={index === n - 1}
              onClick={() => go(index + 1)}
              className={`${arrow} right-3 sm:right-6`}
            >
              <ChevronRight size={26} strokeWidth={2.5} className="-mr-0.5" />
            </button>
          </>
        )}
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

      {children && (
        <div className="mx-auto flex w-full max-w-xl flex-col px-4 pt-4 text-ink">{children}</div>
      )}
    </div>
  );
}
