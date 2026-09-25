import type { LayoutSlot, LayoutSpec, LayoutText } from "@tetra/shared";

/** Geometri editor template (DECISIONS #77): murni, tanpa DOM, supaya bisa diuji. Satuan = px kanvas. */
export type Rect = { x: number; y: number; w: number; h: number };
export type Key = `s:${string}` | `t:${string}`;
export const OVERLAY = "overlay" as const;
type Z = LayoutSlot["z"];

export const slotKey = (s: LayoutSlot): Key => `s:${s.id}`;
export const textKey = (t: LayoutText): Key => `t:${t.id ?? ""}`;

export const union = (rs: Rect[]): Rect | null => {
  if (!rs.length) return null;
  const x = Math.min(...rs.map((r) => r.x));
  const y = Math.min(...rs.map((r) => r.y));
  return {
    x,
    y,
    w: Math.max(...rs.map((r) => r.x + r.w)) - x,
    h: Math.max(...rs.map((r) => r.y + r.h)) - y,
  };
};

/** Kotak pembatas sumbu (axis-aligned) dari persegi yang diputar di sekitar pusatnya. */
export const rotatedBounds = (r: Rect, deg = 0): Rect => {
  if (!deg) return r;
  const a = (deg * Math.PI) / 180;
  const c = Math.abs(Math.cos(a));
  const s = Math.abs(Math.sin(a));
  const w = r.w * c + r.h * s;
  const h = r.w * s + r.h * c;
  return { x: r.x + r.w / 2 - w / 2, y: r.y + r.h / 2 - h / 2, w, h };
};

export type Guides = { x: number[]; y: number[] };
export type Snap = { dx: number; dy: number; guides: Guides };

/**
 * Snap kotak yang digeser ke garis kandidat (tepi/tengah halaman, margin aman, tepi/tengah objek lain).
 * Tepi kiri/tengah/kanan (atas/tengah/bawah) kotak dicocokkan ke garis terdekat dalam `threshold`.
 */
export function snapMove(box: Rect, lines: Guides, threshold: number): Snap {
  const axis = (pos: number[], cand: number[]) => {
    let best: { d: number; at: number } | null = null;
    for (const p of pos)
      for (const c of cand) {
        const d = c - p;
        if (Math.abs(d) <= threshold && (!best || Math.abs(d) < Math.abs(best.d)))
          best = { d, at: c };
      }
    return best;
  };
  const bx = axis([box.x, box.x + box.w / 2, box.x + box.w], lines.x);
  const by = axis([box.y, box.y + box.h / 2, box.y + box.h], lines.y);
  const dx = bx?.d ?? 0;
  const dy = by?.d ?? 0;
  const moved = { ...box, x: box.x + dx, y: box.y + dy };
  // Tampilkan semua garis yang tepat berimpit setelah snap (seperti Canva: bisa lebih dari satu).
  const hit = (pos: number[], cand: number[]) => [
    ...new Set(cand.filter((c) => pos.some((p) => Math.abs(p - c) < 0.5))),
  ];
  return {
    dx,
    dy,
    guides: {
      x: bx ? hit([moved.x, moved.x + moved.w / 2, moved.x + moved.w], lines.x) : [],
      y: by ? hit([moved.y, moved.y + moved.h / 2, moved.y + moved.h], lines.y) : [],
    },
  };
}

/** Snap satu nilai (tepi yang sedang di-resize) ke garis terdekat. */
export const snapValue = (v: number, cand: number[], threshold: number) => {
  let best: number | null = null;
  for (const c of cand)
    if (Math.abs(c - v) <= threshold && (best === null || Math.abs(c - v) < Math.abs(best - v)))
      best = c;
  return best;
};

/** Garis kandidat snap dari halaman, margin aman, dan kotak lain. */
export function snapLines(page: Rect, safe: number | null, others: Rect[]): Guides {
  const x = [page.x, page.x + page.w / 2, page.x + page.w];
  const y = [page.y, page.y + page.h / 2, page.y + page.h];
  if (safe) {
    x.push(page.x + safe, page.x + page.w - safe);
    y.push(page.y + safe, page.y + page.h - safe);
  }
  for (const r of others) {
    x.push(r.x, r.x + r.w / 2, r.x + r.w);
    y.push(r.y, r.y + r.h / 2, r.y + r.h);
  }
  return { x, y };
}

export type AlignMode = "left" | "center" | "right" | "top" | "middle" | "bottom";
/** Pergeseran (dx, dy) supaya `box` rata terhadap `target`. */
export function alignDelta(box: Rect, target: Rect, mode: AlignMode) {
  switch (mode) {
    case "left":
      return { dx: target.x - box.x, dy: 0 };
    case "center":
      return { dx: target.x + target.w / 2 - (box.x + box.w / 2), dy: 0 };
    case "right":
      return { dx: target.x + target.w - (box.x + box.w), dy: 0 };
    case "top":
      return { dx: 0, dy: target.y - box.y };
    case "middle":
      return { dx: 0, dy: target.y + target.h / 2 - (box.y + box.h / 2) };
    case "bottom":
      return { dx: 0, dy: target.y + target.h - (box.y + box.h) };
  }
}

/**
 * Resize persegi (boleh berotasi) dari handle `(hx, hy)` ∈ {-1,0,1}: delta pointer diproyeksikan ke sumbu lokal,
 * tepi seberang tetap diam. `keepRatio` = sudut mempertahankan rasio.
 */
export function resizeRect(
  r: Rect,
  deg: number,
  hx: number,
  hy: number,
  dx: number,
  dy: number,
  keepRatio: boolean,
  min = 20,
): Rect {
  const a = (deg * Math.PI) / 180;
  const cos = Math.cos(a);
  const sin = Math.sin(a);
  const lx = dx * cos + dy * sin;
  const ly = -dx * sin + dy * cos;
  let w = Math.max(min, r.w + hx * lx);
  let h = Math.max(min, r.h + hy * ly);
  if (keepRatio && hx && hy) {
    const s = Math.max(w / r.w, h / r.h);
    w = Math.max(min, r.w * s);
    h = Math.max(min, r.h * s);
  }
  const ox = (hx * (w - r.w)) / 2;
  const oy = (hy * (h - r.h)) / 2;
  const cx = r.x + r.w / 2 + ox * cos - oy * sin;
  const cy = r.y + r.h / 2 + ox * sin + oy * cos;
  return { x: cx - w / 2, y: cy - h / 2, w, h };
}

/** Sudut dari pusat ke pointer (0° = atas), snap ke kelipatan 45° dalam 4°. */
export function rotationAt(cx: number, cy: number, px: number, py: number) {
  let deg = (Math.atan2(px - cx, -(py - cy)) * 180) / Math.PI;
  deg = ((deg % 360) + 360) % 360;
  const near = Math.round(deg / 45) * 45;
  if (Math.abs(near - deg) <= 4) deg = near % 360;
  return Math.round(deg > 180 ? deg - 360 : deg);
}

/**
 * Tumpukan layer dari bawah ke atas, termasuk penanda overlay, dengan aturan yang sama dengan engine:
 * `order` bila ada, selain itu urutan array dan slot sebelum teks.
 */
export function layerStack(l: LayoutSpec): (Key | typeof OVERLAY)[] {
  const group = (z: Z) =>
    [
      ...l.slots.map((s, i) => ({ k: slotKey(s), z: s.z, o: s.order ?? i })),
      ...l.texts.map((t, i) => ({
        k: textKey(t),
        z: t.z ?? "above_overlay",
        o: t.order ?? 10_000 + i,
      })),
    ]
      .filter((x) => x.z === z)
      .sort((a, b) => a.o - b.o)
      .map((x) => x.k);
  return [...group("below_overlay"), OVERLAY, ...group("above_overlay")];
}

/** Terapkan tumpukan baru: posisi relatif terhadap overlay menentukan `z`, indeks menjadi `order`. */
export function applyStack(l: LayoutSpec, stack: (Key | typeof OVERLAY)[]): LayoutSpec {
  const ov = stack.indexOf(OVERLAY);
  const at = (k: Key) => {
    const i = stack.indexOf(k);
    return { z: (i < ov ? "below_overlay" : "above_overlay") as Z, order: i };
  };
  return {
    ...l,
    slots: l.slots.map((s) => ({ ...s, ...at(slotKey(s)) })),
    texts: l.texts.map((t) => ({ ...t, ...at(textKey(t)) })),
  };
}

export type Arrange = "forward" | "backward" | "front" | "back";
/** Maju/mundur satu langkah (melewati overlay juga dihitung satu langkah), atau paling depan/belakang. */
export function arrange(l: LayoutSpec, keys: Key[], how: Arrange): LayoutSpec {
  let stack = layerStack(l);
  const sel = new Set<string>(keys);
  if (how === "front" || how === "back") {
    const moving = stack.filter((k) => sel.has(k));
    const rest = stack.filter((k) => !sel.has(k));
    stack = how === "front" ? [...rest, ...moving] : [...moving, ...rest];
  } else {
    const dir = how === "forward" ? 1 : -1;
    const idx = stack.map((_, i) => i);
    const order = dir > 0 ? idx.reverse() : idx;
    for (const i of order) {
      const j = i + dir;
      if (!sel.has(stack[i] ?? "") || j < 0 || j >= stack.length || sel.has(stack[j] ?? ""))
        continue;
      [stack[i], stack[j]] = [stack[j] as Key, stack[i] as Key];
    }
  }
  return applyStack(l, stack);
}

/** Pindahkan satu layer ke posisi `to` di tumpukan (drag di panel Layer). */
export function moveLayer(l: LayoutSpec, key: Key, to: number): LayoutSpec {
  const stack = layerStack(l).filter((k) => k !== key);
  stack.splice(Math.max(0, Math.min(to, stack.length)), 0, key);
  return applyStack(l, stack);
}
