"use client";
import { ColorPicker } from "@tetra/ui";
import { Pipette } from "lucide-react";
import { useEffect, useState } from "react";

export type KeySetting = { color: string; tol: number };

/** Latar kotak-kotak untuk area transparan (SVG, bukan gradient). */
export const CHECKER =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16'%3E%3Crect width='16' height='16' fill='%23ffffff'/%3E%3Crect width='8' height='8' fill='%23e4e2dc'/%3E%3Crect x='8' y='8' width='8' height='8' fill='%23e4e2dc'/%3E%3C/svg%3E\")";

/**
 * Kontrol hapus warna penanda (#163), dipakai upload desain & editor: warna (ColorPicker + saran), petunjuk
 * pipet (klik pratinjau), kepekaan. Perubahan dikirim setelah 250 ms diam (proses gambar penuh mahal).
 */
export function ChromaControls({
  value,
  suggested,
  onChange,
}: {
  value: KeySetting;
  suggested?: string | undefined;
  onChange: (v: KeySetting) => void;
}) {
  const [v, setV] = useState(value);
  useEffect(() => setV(value), [value]);
  useEffect(() => {
    if (v.color === value.color && v.tol === value.tol) return;
    const id = setTimeout(() => onChange(v), 250);
    return () => clearTimeout(id);
  }, [v, value, onChange]);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <ColorPicker
          label="Warna penanda"
          value={v.color}
          onChange={(color) => setV((x) => ({ ...x, color }))}
          docColors={suggested ? [suggested] : []}
          showHex
        />
        {suggested && suggested.toLowerCase() !== v.color.toLowerCase() && (
          <button
            type="button"
            onClick={() => setV((x) => ({ ...x, color: suggested }))}
            className="flex h-9 items-center gap-1.5 rounded-[10px] border-[1.5px] border-ink bg-white px-2.5 text-xs font-bold hover:bg-paper"
          >
            <span
              aria-hidden
              className="size-4 rounded-[5px] border-[1.5px] border-ink"
              style={{ background: suggested }}
            />
            Pakai saran
          </button>
        )}
      </div>
      <p className="flex items-center gap-1.5 text-xs text-text-2">
        <Pipette aria-hidden className="size-3.5 flex-none" strokeWidth={2.25} />
        Klik gambar pratinjau untuk mengambil warna penanda.
      </p>
      <label className="flex flex-col gap-1.5 text-xs font-bold">
        <span className="flex justify-between">
          Kepekaan
          <span className="font-mono font-normal text-text-2">{v.tol}</span>
        </span>
        <input
          type="range"
          min={2}
          max={40}
          value={v.tol}
          onChange={(e) => setV((x) => ({ ...x, tol: Number(e.target.value) }))}
          className="w-full accent-ink"
        />
        <span className="font-normal text-text-3">
          Naikkan kalau masih ada sisa warna, turunkan kalau bagian desain ikut terhapus.
        </span>
      </label>
    </div>
  );
}
