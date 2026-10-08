"use client";

export function PrintButton() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="layered pressable h-10 rounded-[11px] border-[1.5px] border-ink bg-butter px-5 text-sm font-extrabold [--lb:1.5px] [--lx:4px]"
    >
      Cetak / Simpan PDF
    </button>
  );
}
