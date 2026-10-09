import type { LayoutSpec } from "@tetra/shared";
import { useEffect, useState } from "react";
import { usePlatform } from "../PlatformContext";

/** URL gambar aset bundle (dimuat sekali per event+aset selama app jalan). */
const cache = new Map<string, Promise<string | null>>();

/**
 * Thumbnail desain frame sebenarnya di Pilih Event (#242): latar (warna/gambar), slot foto bergaris, overlay desain
 * klien dari aset bundle laptop ini. Tanpa aset = kerangka slot saja.
 */
export function DesignThumb({ eventId, layout }: { eventId: string; layout: LayoutSpec }) {
  const p = usePlatform();
  const [urls, setUrls] = useState<{ bg?: string | null; overlay?: string | null }>({});
  useEffect(() => {
    if (eventId === "local") return;
    let live = true;
    const load = (assetId: string | undefined) => {
      if (!assetId) return Promise.resolve(null);
      const key = `${eventId}/${assetId}`;
      let u = cache.get(key);
      if (!u) {
        u = p.events
          .asset(eventId, assetId)
          .then((b) => URL.createObjectURL(new Blob([b])))
          .catch(() => null);
        cache.set(key, u);
      }
      return u;
    };
    void Promise.all([load(layout.background?.assetId), load(layout.overlay?.assetId)]).then(
      ([bg, overlay]) => live && setUrls({ bg, overlay }),
    );
    return () => {
      live = false;
    };
  }, [p, eventId, layout]);
  const { width: cw, height: ch } = layout.canvas;
  const pct = (v: number, of: number) => `${(v / of) * 100}%`;
  const o = layout.overlay;
  return (
    <div
      style={{ aspectRatio: `${cw} / ${ch}`, background: layout.background?.color ?? "#fff" }}
      className="relative h-full overflow-hidden"
    >
      {urls.bg && <img src={urls.bg} alt="" className="absolute inset-0 size-full object-cover" />}
      {layout.slots.map((s) => (
        <div
          key={s.id}
          className="stripes absolute"
          style={{
            left: pct(s.x, cw),
            top: pct(s.y, ch),
            width: pct(s.w, cw),
            height: pct(s.h, ch),
          }}
        />
      ))}
      {urls.overlay && (
        <img
          src={urls.overlay}
          alt=""
          className="absolute"
          style={{
            left: pct(o?.x ?? 0, cw),
            top: pct(o?.y ?? 0, ch),
            width: pct(o?.w ?? cw, cw),
            height: pct(o?.h ?? ch, ch),
          }}
        />
      )}
    </div>
  );
}
