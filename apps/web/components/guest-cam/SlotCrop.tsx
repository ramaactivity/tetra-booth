"use client";
import { RotateCcw } from "lucide-react";
import { useRef, useState } from "react";
import type { Crop } from "@/app/c/[token]/strip";
import { copy } from "@/lib/copy";
import { Primary } from "./ui";

const t = copy.guestCam;
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
export const NO_CROP: Crop = { z: 1, x: 0, y: 0 };

/**
 * Atur foto di satu slot frame (#247, permintaan tamu Rafi & Dinda): jendela seukuran rasio slot, geser satu jari,
 * cubit dua jari atau slider untuk zoom (1–4×, minimal tetap menutup slot). Matematika potong sama dengan `cropFor`.
 */
export function SlotCrop({
  src,
  ratio,
  value,
  onDone,
  onClose,
}: {
  src: string;
  /** Lebar ÷ tinggi slot. */
  ratio: number;
  value: Crop;
  onDone: (c: Crop) => void;
  onClose: () => void;
}) {
  const box = useRef<HTMLDivElement>(null);
  const pts = useRef(new Map<number, { x: number; y: number }>());
  const [crop, setCrop] = useState(value);
  const [nat, setNat] = useState<{ w: number; h: number } | null>(null);

  // Ukuran tampil: foto menutup jendela × zoom; posisi dari titik tengah potongan.
  const geo = () => {
    const el = box.current;
    if (!el || !nat) return null;
    const Cw = el.clientWidth;
    const Ch = el.clientHeight;
    const s = Math.max(Cw / nat.w, Ch / nat.h) * crop.z;
    const cw = Math.min(nat.w, nat.h * ratio) / crop.z;
    const ch = cw / ratio;
    return { Cw, Ch, s, spanX: (nat.w - cw) / 2, spanY: (nat.h - ch) / 2 };
  };
  const g = geo();
  const left = g && nat ? g.Cw / 2 - (nat.w / 2 + crop.x * g.spanX) * g.s : 0;
  const top = g && nat ? g.Ch / 2 - (nat.h / 2 + crop.y * g.spanY) * g.s : 0;

  const move = (e: React.PointerEvent) => {
    const prev = pts.current.get(e.pointerId);
    if (!prev) return;
    const next = { x: e.clientX, y: e.clientY };
    const all = [...pts.current.entries()];
    if (all.length >= 2) {
      const other = all.find(([id]) => id !== e.pointerId)?.[1];
      if (other) {
        const d0 = Math.hypot(prev.x - other.x, prev.y - other.y);
        const d1 = Math.hypot(next.x - other.x, next.y - other.y);
        if (d0 > 0) setCrop((c) => ({ ...c, z: clamp((c.z * d1) / d0, 1, 4) }));
      }
    } else if (g) {
      const dx = next.x - prev.x;
      const dy = next.y - prev.y;
      setCrop((c) => ({
        ...c,
        x: g.spanX > 0 ? clamp(c.x - dx / g.s / g.spanX, -1, 1) : 0,
        y: g.spanY > 0 ? clamp(c.y - dy / g.s / g.spanY, -1, 1) : 0,
      }));
    }
    pts.current.set(e.pointerId, next);
  };
  const up = (e: React.PointerEvent) => pts.current.delete(e.pointerId);

  return (
    <div
      className="fixed inset-0 z-40 mx-auto flex max-w-[480px] flex-col bg-black px-5 pt-[max(16px,env(safe-area-inset-top))] pb-[max(18px,env(safe-area-inset-bottom))] text-paper motion-safe:animate-[enter_.2s_ease-out]"
      role="dialog"
      aria-label={t.cropTitle}
    >
      <div className="flex items-center justify-between">
        <button type="button" onClick={onClose} className="h-10 text-sm font-bold text-paper/75">
          {t.cancel}
        </button>
        <span className="text-[15px] font-extrabold">{t.cropTitle}</span>
        <button
          type="button"
          onClick={() => setCrop(NO_CROP)}
          className="flex h-10 items-center gap-1.5 text-sm font-bold text-paper/75"
        >
          <RotateCcw size={15} /> {t.reset}
        </button>
      </div>
      <div className="flex min-h-0 flex-1 items-center justify-center py-5 [container-type:size]">
        <div
          ref={box}
          className="relative touch-none overflow-hidden rounded-md bg-white/10 shadow-[0_0_0_2px_var(--butter)] select-none"
          style={{ width: `min(100cqw, ${ratio * 100}cqh)`, aspectRatio: String(ratio) }}
          onPointerDown={(e) => {
            e.currentTarget.setPointerCapture(e.pointerId);
            pts.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
          }}
          onPointerMove={move}
          onPointerUp={up}
          onPointerCancel={up}
        >
          {/* biome-ignore lint/performance/noImgElement: URL R2 bertanda tangan */}
          <img
            src={src}
            alt=""
            draggable={false}
            onLoad={(e) =>
              setNat({ w: e.currentTarget.naturalWidth, h: e.currentTarget.naturalHeight })
            }
            className="pointer-events-none absolute max-w-none origin-top-left"
            style={
              g && nat
                ? { left, top, width: nat.w * g.s, height: nat.h * g.s }
                : { inset: 0, width: "100%", height: "100%", objectFit: "cover" }
            }
          />
        </div>
      </div>
      <p className="text-center text-[13px] text-paper/60">{t.cropHint}</p>
      <input
        type="range"
        min={1}
        max={4}
        step={0.01}
        value={crop.z}
        aria-label="Zoom"
        onChange={(e) => setCrop((c) => ({ ...c, z: Number(e.target.value) }))}
        className="mt-3 w-full accent-[var(--butter)]"
      />
      <Primary className="mt-4" onClick={() => onDone(crop)}>
        {t.cropDone}
      </Primary>
    </div>
  );
}
