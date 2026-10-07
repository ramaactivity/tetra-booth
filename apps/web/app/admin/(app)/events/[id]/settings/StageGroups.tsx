"use client";
import { useState } from "react";
import { groupLines, groupNames } from "@/lib/stage-groups";

/**
 * Daftar grup Photo Stage di Pengaturan event (#192, desain E10): textarea (urutan = "Berikutnya" di laptop stage),
 * impor CSV/TXT (kolom pertama, baris kosong & judul kolom dilewati), peringatan nama ganda + Hapus ganda,
 * Kosongkan daftar. Nilai tetap dikirim lewat `name="stage_groups"` dan dibersihkan lagi di server.
 */
export function StageGroups({
  initial,
  fromOps,
  onEdit,
}: {
  initial: string[];
  fromOps: number;
  /** Tombol yang mengubah isi tanpa event `change` (Hapus ganda, Kosongkan) → form ditandai belum disimpan. */
  onEdit: () => void;
}) {
  const [text, setText] = useState(initial.join("\n"));
  const [imported, setImported] = useState<string | null>(null);
  const names = groupNames(text);
  const unique = groupLines(text);
  const dupes = [...new Set(names.filter((n, i) => names.indexOf(n) !== i))];

  return (
    <div className="flex flex-col gap-4 md:col-span-2">
      {fromOps > 0 && (
        <p className="rounded-[14px] border-[1.5px] border-dashed border-ink bg-sky px-4 py-3 text-[13px] leading-[1.5]">
          <b>Diisi dari daftar klien di Tetra Ops ({fromOps} grup)</b> · Periksa, lalu Simpan supaya
          terkirim ke laptop stage. Perubahan di sini tidak dikirim balik ke Ops.
        </p>
      )}
      <div className="grid grid-cols-1 gap-5 md:grid-cols-[minmax(0,1fr)_300px]">
        <div className="flex flex-col gap-2">
          <div className="flex items-baseline justify-between gap-3">
            <label htmlFor="stage_groups" className="text-[13px] font-bold">
              Daftar grup
            </label>
            <span className="text-xs text-text-2">
              Satu grup per baris. Urutan = urutan "Berikutnya" di laptop stage.
            </span>
          </div>
          <textarea
            id="stage_groups"
            name="stage_groups"
            value={text}
            // Pesan impor tidak dihapus di sini: `change` saat textarea kehilangan fokus akan menggeser tombol di
            // bawahnya tepat saat diklik (klik pertama "Hapus ganda" meleset).
            onChange={(e) => setText(e.target.value)}
            placeholder={
              "Keluarga Inti\nKeluarga Besar Bpk. Hadi\nTeman Kantor PT ABC\nSahabat SMA Mempelai Wanita"
            }
            className="h-[360px] w-full resize-y rounded-xl border-[1.5px] border-ink bg-white px-3.5 py-3 text-sm leading-[1.7]"
          />
          <span className="text-xs text-text-2">
            <span className="font-mono">{unique.length} grup</span> · maks 120 karakter per nama
          </span>
        </div>
        <div className="flex flex-col gap-3">
          <span className="text-[13px] font-bold">Impor</span>
          <label className="pressable layered flex h-12 cursor-pointer items-center justify-center rounded-xl border-[1.5px] border-ink bg-white text-sm font-bold has-focus-visible:outline-2 [--lb:1.5px] [--lx:4px]">
            Impor CSV / TXT
            <input
              type="file"
              accept=".csv,.txt,text/csv,text/plain"
              className="sr-only"
              onChange={async (e) => {
                const f = e.target.files?.[0];
                e.target.value = "";
                if (!f) return;
                const add = await f.text();
                const before = groupLines(text).length;
                const next = text.trim() ? `${text.trim()}\n${add}` : add;
                setText(next);
                setImported(`${groupLines(next).length - before} grup ditambahkan dari ${f.name}`);
              }}
            />
          </label>
          <span className="text-xs leading-[1.45] text-text-2">
            Kolom pertama dipakai sebagai nama grup. Baris kosong dan judul kolom dilewati.
          </span>
          {imported && (
            <p
              role="status"
              className="rounded-xl border-[1.5px] border-ink bg-mint-soft px-3.5 py-2.5 text-[13px] font-semibold"
            >
              {imported}
            </p>
          )}
          {!!dupes.length && (
            <div className="flex flex-col items-start gap-2.5 rounded-xl border-[1.5px] border-ink bg-peach px-3.5 py-3 text-[13px]">
              <span>
                <b>{dupes.length} nama ganda:</b> {dupes.slice(0, 3).join(", ")}
                {dupes.length > 3 && "…"}
              </span>
              <button
                type="button"
                onClick={() => {
                  setText(unique.join("\n"));
                  onEdit();
                }}
                className="pressable h-9 rounded-[10px] border-[1.5px] border-ink bg-white px-3 text-[13px] font-bold"
              >
                Hapus ganda
              </button>
            </div>
          )}
          <div className="flex-1" />
          {!!text.trim() && (
            <button
              type="button"
              onClick={() => {
                setText("");
                setImported(null);
                onEdit();
              }}
              className="h-11 rounded-xl border-[1.5px] border-dashed border-ink bg-coral text-sm font-bold"
            >
              Kosongkan daftar
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
