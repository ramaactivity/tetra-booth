"use client";
import { Select, type SelectOption } from "@tetra/ui";
import { Search, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

/**
 * Filter daftar Event / Photobox (DECISIONS #156): semua di URL (bisa dibagikan, tombol Kembali jalan).
 * Cari diketik = URL diperbarui setelah 300 ms.
 */
export function EventFilters({
  base,
  q,
  bulan,
  booth,
  urut,
  tab,
  months,
  devices,
}: {
  base: string;
  q: string;
  bulan: string;
  booth: string;
  urut: string;
  tab: string;
  months: SelectOption[];
  devices: SelectOption[];
}) {
  const router = useRouter();
  const [text, setText] = useState(q);
  const cur = { tab, q, bulan, booth, urut: urut === "terbaru" ? "" : urut };
  // q terakhir yang dikirim ke URL: tanpa ini, debounce cari bisa menembak dengan props lama setelah Hapus filter
  // (server belum selesai render) dan mengembalikan filter bulan/booth yang baru dihapus.
  const sent = useRef(q);
  useEffect(() => {
    sent.current = q;
  }, [q]);
  const go = (patch: Partial<typeof cur>) => {
    if (patch.q !== undefined) sent.current = patch.q;
    const p = new URLSearchParams(
      Object.entries({ ...cur, ...patch }).filter(([, v]) => !!v) as [string, string][],
    );
    const s = p.toString();
    router.replace(s ? `${base}?${s}` : base, { scroll: false });
  };
  const goRef = useRef(go);
  goRef.current = go;
  useEffect(() => {
    if (text.trim() === sent.current) return;
    const t = setTimeout(() => goRef.current({ q: text.trim() }), 300);
    return () => clearTimeout(t);
  }, [text]);
  const any = !!(q || bulan || booth || urut !== "terbaru");
  return (
    <div className="flex flex-wrap items-center gap-2.5">
      <label className="relative w-full sm:w-[280px]">
        <span className="sr-only">Cari event</span>
        <Search
          aria-hidden
          className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-text-2"
        />
        <input
          type="text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Cari nama, lokasi, atau klien"
          className="h-10 w-full rounded-[11px] border-[1.5px] border-ink bg-white pr-3 pl-9 text-sm"
        />
      </label>
      <Select
        label="Bulan"
        className="w-[180px]"
        value={bulan}
        onChange={(v) => go({ bulan: v })}
        options={[{ value: "", label: "Semua bulan" }, ...months]}
      />
      <Select
        label="Booth"
        className="w-[180px]"
        value={booth}
        onChange={(v) => go({ booth: v })}
        options={[{ value: "", label: "Semua booth" }, ...devices]}
      />
      <Select
        label="Urutkan"
        className="w-[190px]"
        value={urut}
        onChange={(v) => go({ urut: v === "terbaru" ? "" : v })}
        options={[
          { value: "terbaru", label: "Tanggal terbaru" },
          { value: "terdekat", label: "Terdekat dari hari ini" },
        ]}
      />
      {any && (
        <button
          type="button"
          onClick={() => {
            setText("");
            go({ q: "", bulan: "", booth: "", urut: "" });
          }}
          className="inline-flex h-10 items-center gap-1.5 rounded-[11px] px-2.5 text-[13px] font-bold text-text-2 hover:bg-white hover:text-ink"
        >
          <X aria-hidden className="size-4" strokeWidth={2} />
          Hapus filter
        </button>
      )}
    </div>
  );
}
