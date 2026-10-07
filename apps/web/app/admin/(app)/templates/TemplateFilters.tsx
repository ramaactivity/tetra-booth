"use client";
import { Select } from "@tetra/ui";
import { LayoutGrid, List, Search, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

/**
 * Cari, arah, urutan (di URL, bisa dibagikan) + tampilan grid/daftar (cookie, diingat per browser) (#160).
 * Kertas difilter dari strip statistik. Cari diketik = URL diperbarui setelah 300 ms.
 */
export function TemplateFilters({
  tab,
  q,
  kertas,
  arah,
  urut,
  view,
  photobox,
}: {
  tab: string;
  q: string;
  kertas: string;
  arah: string;
  urut: string;
  view: "grid" | "list";
  photobox: boolean;
}) {
  const router = useRouter();
  const [text, setText] = useState(q);
  const cur = {
    tab: tab === "event" ? "" : tab,
    q,
    kertas,
    arah,
    urut: urut === "disimpan" ? "" : urut,
  };
  const go = (patch: Partial<typeof cur>) => {
    const p = new URLSearchParams(
      Object.entries({ ...cur, ...patch }).filter(([, v]) => !!v) as [string, string][],
    ).toString();
    router.replace(p ? `/admin/templates?${p}` : "/admin/templates", { scroll: false });
  };
  const goRef = useRef(go);
  goRef.current = go;
  useEffect(() => {
    if (text === q) return;
    const t = setTimeout(() => goRef.current({ q: text.trim() }), 300);
    return () => clearTimeout(t);
  }, [text, q]);
  const setView = (v: "grid" | "list") => {
    // biome-ignore lint/suspicious/noDocumentCookie: preferensi tampilan dibaca server (tanpa kedip)
    document.cookie = `tpl_view=${v}; path=/admin; max-age=31536000; samesite=lax`;
    router.refresh();
  };
  const any = !!(q || kertas || arah);
  return (
    <div className="flex flex-wrap items-center gap-2.5">
      <label className="relative w-full sm:w-[260px]">
        <span className="sr-only">Cari template</span>
        <Search
          aria-hidden
          className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-text-2"
        />
        <input
          type="text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Cari nama template"
          className="h-10 w-full rounded-[11px] border-[1.5px] border-ink bg-white pr-3 pl-9 text-sm"
        />
      </label>
      <Select
        label="Arah"
        className="w-[160px]"
        value={arah}
        onChange={(v) => go({ arah: v })}
        options={[
          { value: "", label: "Semua arah" },
          { value: "portrait", label: "Portrait" },
          { value: "landscape", label: "Landscape" },
        ]}
      />
      <Select
        label="Urutkan"
        className="w-[210px]"
        value={urut}
        onChange={(v) => go({ urut: v === "disimpan" ? "" : v })}
        options={[
          { value: "disimpan", label: "Terakhir disimpan" },
          { value: "nama", label: "Nama A–Z" },
          { value: "dipakai", label: photobox ? "Paling sering dipakai" : "Paling banyak event" },
        ]}
      />
      {any && (
        <button
          type="button"
          onClick={() => {
            setText("");
            go({ q: "", kertas: "", arah: "" });
          }}
          className="inline-flex h-10 items-center gap-1.5 rounded-[11px] px-2.5 text-[13px] font-bold text-text-2 hover:bg-white hover:text-ink"
        >
          <X aria-hidden className="size-4" strokeWidth={2} />
          Hapus filter
        </button>
      )}
      <fieldset
        aria-label="Tampilan"
        className="m-0 ml-auto flex h-10 overflow-hidden rounded-[11px] border-[1.5px] border-ink bg-white p-0"
      >
        {(
          [
            ["grid", "Kartu", LayoutGrid],
            ["list", "Daftar", List],
          ] as const
        ).map(([v, l, I], i) => (
          <button
            key={v}
            type="button"
            aria-pressed={view === v}
            title={`Tampilan ${l.toLowerCase()}`}
            onClick={() => view !== v && setView(v)}
            className={`flex items-center gap-1.5 px-3 text-[13px] font-bold ${i ? "border-l-[1.5px] border-ink" : ""} ${view === v ? "bg-lavender" : "hover:bg-paper"}`}
          >
            <I aria-hidden className="size-4" strokeWidth={2} />
            {l}
          </button>
        ))}
      </fieldset>
    </div>
  );
}
