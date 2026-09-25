"use client";
import type { LayoutSpec } from "@tetra/shared";
import { browserContext, type ImageLike, render } from "@tetra/template-engine";
import { useEffect, useRef, useState } from "react";
import {
  type Guides,
  type Key,
  type Rect,
  resizeRect,
  rotatedBounds,
  rotationAt,
  snapLines,
  snapMove,
  snapValue,
  union,
} from "@/lib/editor/geometry";

export type Box = Rect & { rot: number };
const SAMPLE = ["#CEC8F6", "#D6EEF8", "#FCE3C6", "#D6F1EA", "#F7D5CC", "#EFEDE8"];
const VARS = { event_name: "Andi & Sari", date: "12 Oktober 2026", custom: "Teks bebas" };
export const GEIST = "Geist Variable";
const SNAP_PX = 6; // ambang snap dalam px layar
const HANDLES = [
  [-1, -1],
  [0, -1],
  [1, -1],
  [1, 0],
  [1, 1],
  [0, 1],
  [-1, 1],
  [-1, 0],
] as const;
const CURSOR: Record<string, string> = {
  "-1,-1": "nwse-resize",
  "1,1": "nwse-resize",
  "1,-1": "nesw-resize",
  "-1,1": "nesw-resize",
  "0,-1": "ns-resize",
  "0,1": "ns-resize",
  "-1,0": "ew-resize",
  "1,0": "ew-resize",
};

const samples = new Map<string, ImageLike>();
/** Foto contoh per slot: pastel + nomor foto (urutan pengambilan). */
function samplePhoto(w: number, h: number, i: number): ImageLike {
  const k = `${w}x${h}x${i}`;
  const hit = samples.get(k);
  if (hit) return hit;
  const c = new OffscreenCanvas(w, h);
  const g = c.getContext("2d");
  if (g) {
    g.fillStyle = SAMPLE[i % SAMPLE.length] ?? "#EFEDE8";
    g.fillRect(0, 0, w, h);
    g.fillStyle = "rgba(29,29,27,.55)";
    g.font = `800 ${Math.round(Math.min(w, h) / 4)}px "Plus Jakarta Sans Variable"`;
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.fillText(String(i + 1), w / 2, h / 2);
  }
  if (samples.size > 200) samples.clear();
  samples.set(k, c);
  return c;
}

type Drag =
  | {
      kind: "move";
      start: { x: number; y: number };
      orig: Map<Key, { x: number; y: number }>;
      moved: boolean;
      key: Key;
      wasSelected: boolean;
      additive: boolean;
    }
  | {
      kind: "resize";
      key: Key;
      hx: number;
      hy: number;
      start: { x: number; y: number };
      box: Box;
      size?: number | undefined;
      textY?: number | undefined;
    }
  | { kind: "rotate"; key: Key; box: Box }
  | { kind: "marquee"; start: { x: number; y: number }; additive: boolean; base: Key[] };

/**
 * Kanvas editor: preview engine booth + kotak seleksi, 8 handle, handle putar, marquee, garis snap, margin aman.
 * Koordinat interaksi = px kanvas (px layar / scale). Alt/Option menonaktifkan snap.
 */
export function Stage({
  layout,
  scale,
  keys,
  sel,
  setSel,
  boxOf,
  preview,
  end,
  showSafe,
  safe,
  images,
  fontFamily,
  fontsVersion,
  lockRatio,
  onEditText,
}: {
  layout: LayoutSpec;
  scale: number;
  keys: Key[];
  sel: Key[];
  setSel: (k: Key[]) => void;
  boxOf: (k: Key) => Box | null;
  preview: (fn: (l: LayoutSpec) => LayoutSpec) => void;
  end: () => void;
  showSafe: boolean;
  safe: number;
  images: Record<string, ImageLike>;
  fontFamily: (id: string) => string;
  fontsVersion: number;
  lockRatio: boolean;
  onEditText: (k: Key) => void;
}) {
  const W = layout.canvas.width;
  const H = layout.canvas.height;
  const page = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const drag = useRef<Drag | null>(null);
  const [guides, setGuides] = useState<Guides>({ x: [], y: [] });
  const [marquee, setMarquee] = useState<Rect | null>(null);
  const [angle, setAngle] = useState<number | null>(null);
  const [hover, setHover] = useState<Key | null>(null);

  // Preview = engine yang sama dengan booth (2x6: hanya strip kiri dari lembar ganda).
  // biome-ignore lint/correctness/useExhaustiveDependencies: fontsVersion memicu render ulang saat font selesai dimuat
  useEffect(() => {
    const el = canvas.current;
    const g = el?.getContext("2d");
    if (!el || !g) return;
    const raf = requestAnimationFrame(() => {
      try {
        const ctx = { ...browserContext(GEIST), fontFamily };
        const out = render(
          layout,
          {
            photos: layout.slots.map((s, i) =>
              samplePhoto(Math.max(1, Math.round(s.w)), Math.max(1, Math.round(s.h)), i),
            ),
            assets: images,
            vars: VARS,
          },
          ctx,
        ) as unknown as OffscreenCanvas;
        g.clearRect(0, 0, el.width, el.height);
        g.drawImage(out, 0, 0, W, H, 0, 0, el.width, el.height);
      } catch {
        /* spec sementara tidak valid (mis. sedang mengetik angka); preview terakhir dibiarkan */
      }
    });
    return () => cancelAnimationFrame(raf);
  }, [layout, images, fontFamily, fontsVersion, W, H]);

  const toCanvas = (e: { clientX: number; clientY: number }) => {
    const r = page.current?.getBoundingClientRect();
    return { x: (e.clientX - (r?.left ?? 0)) / scale, y: (e.clientY - (r?.top ?? 0)) / scale };
  };
  const lines = (exclude: Key[]) =>
    snapLines(
      { x: 0, y: 0, w: W, h: H },
      showSafe ? safe : null,
      keys
        .filter((k) => !exclude.includes(k))
        .map((k) => boxOf(k))
        .filter((b): b is Box => !!b)
        .map((b) => rotatedBounds(b, b.rot)),
    );

  const setPos = (l: LayoutSpec, k: Key, x: number, y: number): LayoutSpec =>
    k.startsWith("s:")
      ? {
          ...l,
          slots: l.slots.map((s) =>
            `s:${s.id}` === k ? { ...s, x: Math.round(x), y: Math.round(y) } : s,
          ),
        }
      : {
          ...l,
          texts: l.texts.map((t) =>
            `t:${t.id}` === k ? { ...t, x: Math.round(x), y: Math.round(y) } : t,
          ),
        };
  const posOf = (k: Key) => {
    const it = k.startsWith("s:")
      ? layout.slots.find((s) => `s:${s.id}` === k)
      : layout.texts.find((t) => `t:${t.id}` === k);
    return it ? { x: it.x, y: it.y } : { x: 0, y: 0 };
  };

  const onMove = (e: PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const p = toCanvas(e);
    const threshold = e.altKey ? 0 : SNAP_PX / scale;
    if (d.kind === "move") {
      let dx = p.x - d.start.x;
      let dy = p.y - d.start.y;
      if (!d.moved && Math.hypot(dx, dy) * scale < 3) return;
      d.moved = true;
      const moving = [...d.orig.keys()];
      const start = union(
        moving
          .map((k) => boxOf(k))
          .filter((b): b is Box => !!b)
          .map((b) => rotatedBounds(b, b.rot)),
      );
      if (start) {
        // Closure ini dibuat saat drag dimulai, jadi boxOf() masih memberi posisi asal.
        const s = snapMove(
          { ...start, x: start.x + dx, y: start.y + dy },
          lines(moving),
          threshold,
        );
        dx += s.dx;
        dy += s.dy;
        setGuides(s.guides);
      }
      preview((l) => {
        let next = l;
        for (const [k, o] of d.orig) next = setPos(next, k, o.x + dx, o.y + dy);
        return next;
      });
    } else if (d.kind === "resize") {
      const isText = d.key.startsWith("t:");
      const keep = isText ? true : lockRatio || e.shiftKey;
      let r = resizeRect(
        d.box,
        d.box.rot,
        d.hx,
        d.hy,
        p.x - d.start.x,
        p.y - d.start.y,
        keep,
        isText ? 40 : 40,
      );
      const g: Guides = { x: [], y: [] };
      if (!d.box.rot && threshold && !(keep && d.hx && d.hy)) {
        const ln = lines([d.key]);
        if (d.hx) {
          const edge = d.hx > 0 ? r.x + r.w : r.x;
          const v = snapValue(edge, ln.x, threshold);
          if (v !== null) {
            r = d.hx > 0 ? { ...r, w: v - r.x } : { ...r, x: v, w: r.x + r.w - v };
            g.x.push(v);
          }
        }
        if (d.hy && !isText) {
          const edge = d.hy > 0 ? r.y + r.h : r.y;
          const v = snapValue(edge, ln.y, threshold);
          if (v !== null) {
            r = d.hy > 0 ? { ...r, h: v - r.y } : { ...r, y: v, h: r.y + r.h - v };
            g.y.push(v);
          }
        }
      }
      setGuides(g);
      preview((l) =>
        isText
          ? {
              ...l,
              texts: l.texts.map((t) => {
                if (`t:${t.id}` !== d.key) return t;
                const f = r.w / d.box.w;
                const size = d.hy ? Math.max(8, Math.round((d.size ?? t.size) * f)) : t.size;
                const topOffset = (d.box.y - (d.textY ?? t.y)) * (d.hy ? f : 1);
                return {
                  ...t,
                  x: Math.round(r.x),
                  w: Math.round(r.w),
                  size,
                  y: Math.round(r.y - topOffset),
                };
              }),
            }
          : {
              ...l,
              slots: l.slots.map((s) =>
                `s:${s.id}` === d.key
                  ? {
                      ...s,
                      x: Math.round(r.x),
                      y: Math.round(r.y),
                      w: Math.round(r.w),
                      h: Math.round(r.h),
                    }
                  : s,
              ),
            },
      );
    } else if (d.kind === "rotate") {
      const deg = rotationAt(d.box.x + d.box.w / 2, d.box.y + d.box.h / 2, p.x, p.y);
      setAngle(deg);
      preview((l) => ({
        ...l,
        slots: l.slots.map((s) =>
          `s:${s.id}` === d.key ? { ...s, rotation: deg || undefined } : s,
        ),
      }));
    } else {
      const r = {
        x: Math.min(d.start.x, p.x),
        y: Math.min(d.start.y, p.y),
        w: Math.abs(p.x - d.start.x),
        h: Math.abs(p.y - d.start.y),
      };
      setMarquee(r);
      const hit = keys.filter((k) => {
        const b = boxOf(k);
        if (!b) return false;
        const a = rotatedBounds(b, b.rot);
        return a.x < r.x + r.w && a.x + a.w > r.x && a.y < r.y + r.h && a.y + a.h > r.y;
      });
      setSel(d.additive ? [...new Set([...d.base, ...hit])] : hit);
    }
  };

  const onUp = () => {
    const d = drag.current;
    drag.current = null;
    window.removeEventListener("pointermove", onMove);
    window.removeEventListener("pointerup", onUp);
    setGuides({ x: [], y: [] });
    setMarquee(null);
    setAngle(null);
    if (d?.kind === "move" && !d.moved && d.wasSelected && !d.additive) setSel([d.key]);
    end();
  };
  const listen = () => {
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  };

  const startItem = (e: React.PointerEvent, k: Key) => {
    e.stopPropagation();
    if (e.button !== 0) return;
    const additive = e.shiftKey || e.metaKey || e.ctrlKey;
    const wasSelected = sel.includes(k);
    let next = sel;
    if (additive) next = wasSelected ? sel.filter((x) => x !== k) : [...sel, k];
    else if (!wasSelected) next = [k];
    setSel(next);
    if (!next.includes(k)) return;
    drag.current = {
      kind: "move",
      start: toCanvas(e),
      orig: new Map(next.map((x) => [x, posOf(x)])),
      moved: false,
      key: k,
      wasSelected,
      additive,
    };
    listen();
  };
  const startHandle = (e: React.PointerEvent, k: Key, hx: number, hy: number) => {
    e.stopPropagation();
    const box = boxOf(k);
    if (!box) return;
    const t = layout.texts.find((x) => `t:${x.id}` === k);
    drag.current = {
      kind: "resize",
      key: k,
      hx,
      hy,
      start: toCanvas(e),
      box,
      size: t?.size,
      textY: t?.y,
    };
    listen();
  };
  const startRotate = (e: React.PointerEvent, k: Key) => {
    e.stopPropagation();
    const box = boxOf(k);
    if (!box) return;
    drag.current = { kind: "rotate", key: k, box };
    listen();
  };
  const startMarquee = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    const additive = e.shiftKey || e.metaKey || e.ctrlKey;
    if (!additive) setSel([]);
    drag.current = { kind: "marquee", start: toCanvas(e), additive, base: sel };
    listen();
  };

  const single = sel.length === 1 ? sel[0] : undefined;
  const singleBox = single ? boxOf(single) : null;
  const groupBox =
    sel.length > 1
      ? union(
          sel
            .map((k) => boxOf(k))
            .filter((b): b is Box => !!b)
            .map((b) => rotatedBounds(b, b.rot)),
        )
      : null;
  const px = (n: number) => n * scale;
  // Nomor foto = urutan slot di array (urutan pengambilan), bukan urutan layer.
  const photoNo = (k: Key) => layout.slots.findIndex((s) => `s:${s.id}` === k) + 1;

  return (
    // Area kosong di sekitar halaman juga memulai marquee / mengosongkan seleksi.
    <div
      className="flex min-h-full min-w-full items-center justify-center p-12"
      onPointerDown={startMarquee}
    >
      <div
        ref={page}
        data-testid="stage-page"
        className="relative flex-none bg-white shadow-[0_0_0_1.5px_var(--ink),8px_8px_0_0_var(--ink)]"
        style={{ width: px(W), height: px(H) }}
      >
        <canvas
          ref={canvas}
          width={Math.round(px(W) * 2)}
          height={Math.round(px(H) * 2)}
          className="pointer-events-none absolute inset-0 size-full"
        />
        {showSafe && (
          <div
            aria-hidden
            className="pointer-events-none absolute border border-dashed border-coral-strong"
            style={{ left: px(safe), top: px(safe), right: px(safe), bottom: px(safe) }}
          >
            <span className="absolute -top-[18px] left-0 rounded bg-coral-strong px-1 text-[9px] font-bold text-white">
              Margin aman
            </span>
          </div>
        )}

        {keys.map((k) => {
          const b = boxOf(k);
          if (!b) return null;
          const on = sel.includes(k);
          const slot = k.startsWith("s:");
          return (
            <button
              key={k}
              type="button"
              aria-label={
                slot
                  ? `Foto ${photoNo(k)}`
                  : `Teks ${layout.texts.find((t) => `t:${t.id}` === k)?.value ?? ""}`
              }
              aria-pressed={on}
              onPointerDown={(e) => startItem(e, k)}
              onPointerEnter={() => setHover(k)}
              onPointerLeave={() => setHover(null)}
              onDoubleClick={() => !slot && onEditText(k)}
              className={`absolute cursor-move outline-none ${on ? "ring-2 ring-mint" : hover === k ? "ring-2 ring-lavender" : slot ? "ring-1 ring-ink/25 ring-inset" : ""}`}
              style={{
                left: px(b.x),
                top: px(b.y),
                width: px(b.w),
                height: px(b.h),
                transform: b.rot ? `rotate(${b.rot}deg)` : undefined,
              }}
            >
              {slot && (
                <span className="absolute top-1 left-1 rounded-md border border-ink bg-white/90 px-1.5 text-[10px] leading-4 font-bold">
                  Foto {photoNo(k)}
                </span>
              )}
            </button>
          );
        })}

        {groupBox && (
          <div
            aria-hidden
            className="pointer-events-none absolute border-[1.5px] border-dashed border-mint"
            style={{
              left: px(groupBox.x),
              top: px(groupBox.y),
              width: px(groupBox.w),
              height: px(groupBox.h),
            }}
          />
        )}

        {single && singleBox && (
          <div
            className="pointer-events-none absolute"
            style={{
              left: px(singleBox.x),
              top: px(singleBox.y),
              width: px(singleBox.w),
              height: px(singleBox.h),
              transform: singleBox.rot ? `rotate(${singleBox.rot}deg)` : undefined,
            }}
          >
            {HANDLES.filter(([hx]) => (single.startsWith("t:") ? hx !== 0 : true)).map(
              ([hx, hy]) => (
                <span
                  key={`${hx},${hy}`}
                  data-handle={`${hx},${hy}`}
                  onPointerDown={(e) => startHandle(e, single, hx, hy)}
                  className={`pointer-events-auto absolute border-[1.5px] border-ink bg-white ${hx && hy ? "size-3 rounded-full" : hx ? "h-4 w-1.5 rounded-full" : "h-1.5 w-4 rounded-full"}`}
                  style={{
                    left: `${(hx + 1) * 50}%`,
                    top: `${(hy + 1) * 50}%`,
                    transform: "translate(-50%,-50%)",
                    cursor: CURSOR[`${hx},${hy}`],
                  }}
                />
              ),
            )}
            {single.startsWith("s:") && (
              <span
                data-handle="rotate"
                title="Putar (Shift: bebas snap 45°)"
                onPointerDown={(e) => startRotate(e, single)}
                className="pointer-events-auto absolute left-1/2 flex size-6 -translate-x-1/2 cursor-grab items-center justify-center rounded-full border-[1.5px] border-ink bg-white text-[13px]"
                style={{ top: "calc(100% + 14px)" }}
              >
                ↻
              </span>
            )}
          </div>
        )}

        {guides.x.map((x) => (
          <div
            key={`gx${x}`}
            className="pointer-events-none absolute top-0 bottom-0 w-px bg-coral-strong"
            style={{ left: px(x) }}
          />
        ))}
        {guides.y.map((y) => (
          <div
            key={`gy${y}`}
            className="pointer-events-none absolute right-0 left-0 h-px bg-coral-strong"
            style={{ top: px(y) }}
          />
        ))}
        {marquee && (
          <div
            className="pointer-events-none absolute border border-mint bg-mint/15"
            style={{
              left: px(marquee.x),
              top: px(marquee.y),
              width: px(marquee.w),
              height: px(marquee.h),
            }}
          />
        )}
        {angle !== null && singleBox && (
          <span
            className="pointer-events-none absolute rounded-md bg-ink px-1.5 py-0.5 font-mono text-[11px] text-white"
            style={{ left: px(singleBox.x + singleBox.w / 2), top: px(singleBox.y) - 28 }}
          >
            {angle}°
          </span>
        )}
      </div>
    </div>
  );
}
