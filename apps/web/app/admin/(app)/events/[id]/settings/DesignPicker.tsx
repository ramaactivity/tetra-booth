"use client";
import { type LayoutPaper, paperLabel } from "@tetra/shared";
import Link from "next/link";
import { useState } from "react";

/** Satu pilihan desain frame: preset (`value` = id preset) atau template editor (`value` = `tpl:<id>`). */
export type DesignOption = {
  value: string;
  name: string;
  paper: LayoutPaper;
  info: string;
  canvas: { width: number; height: number };
  slots: { x: number; y: number; w: number; h: number }[];
  /** Template editor: versi terbaru + versi yang dikunci event (null = belum dipakai). */
  template?: { id: string; version: number; pinned: number | null };
};

export const MAX_DESIGNS = 3;

/** Miniatur proporsional: kertas + slot foto (seperti Mini di layar Pilih desain booth). */
function Mini({ o }: { o: DesignOption }) {
  const s = 56 / Math.max(o.canvas.width, o.canvas.height);
  return (
    <span className="flex size-16 flex-none items-center justify-center rounded-[10px] bg-paper">
      <span
        className="relative block border-[1.5px] border-ink bg-white"
        style={{ width: o.canvas.width * s, height: o.canvas.height * s }}
      >
        {o.slots.map((r) => (
          <span
            key={`${r.x}-${r.y}`}
            className="absolute bg-sky"
            style={{ left: r.x * s, top: r.y * s, width: r.w * s, height: r.h * s }}
          />
        ))}
      </span>
    </span>
  );
}

const act =
  "rounded-full border-[1.5px] border-ink bg-white px-3 py-1 text-xs font-bold no-underline hover:bg-butter";

/**
 * Desain frame event (permintaan Rama 30 Sep): 1–3 desain dengan ukuran kertas sama; urutan = urutan pilih,
 * pertama = utama. Dikirim sebagai `design` berurutan; "Salin & sesuaikan" = tombol submit `copy`.
 */
export function DesignPicker({ options, initial }: { options: DesignOption[]; initial: string[] }) {
  const [sel, setSel] = useState(initial);
  const paper = options.find((o) => o.value === sel[0])?.paper;
  return (
    <div className="col-span-full flex flex-col gap-3">
      <p className="text-xs leading-normal text-text-2">
        Pilih 1–{MAX_DESIGNS} desain dengan ukuran kertas yang sama. Lebih dari satu = tamu memilih
        desain sebelum foto (Mode Event). Mode Photobox memakai daftar di bagian Photobox.
      </p>
      <p className="text-sm font-bold">
        {sel.length
          ? `Dipakai: ${sel.map((v, i) => `${options.find((o) => o.value === v)?.name ?? v}${i === 0 ? " (utama)" : ""}`).join(", ")}`
          : "Belum ada desain dipilih"}
      </p>
      {sel.map((v) => (
        <input key={v} type="hidden" name="design" value={v} />
      ))}
      <fieldset
        aria-label="Desain frame"
        className="grid grid-cols-1 gap-3 lg:grid-cols-2 2xl:grid-cols-3"
      >
        {options.map((o) => {
          const i = sel.indexOf(o.value);
          const on = i >= 0;
          const reason = on
            ? null
            : paper && o.paper !== paper
              ? `Ukuran harus sama: ${paperLabel(paper)}`
              : sel.length >= MAX_DESIGNS
                ? `Maks. ${MAX_DESIGNS} desain`
                : null;
          const t = o.template;
          return (
            <div
              key={o.value}
              className={`flex flex-col gap-3 rounded-[14px] border-[1.5px] border-ink p-3.5 ${on ? "bg-sky" : "border-dashed bg-white"}`}
            >
              <label
                className={`flex items-center gap-3 ${reason ? "cursor-not-allowed" : "cursor-pointer"}`}
              >
                <input
                  type="checkbox"
                  checked={on}
                  disabled={!!reason}
                  onChange={() =>
                    setSel((s) => (on ? s.filter((x) => x !== o.value) : [...s, o.value]))
                  }
                  className="peer sr-only"
                />
                <span className={`contents ${reason ? "[&>*]:opacity-45" : ""}`}>
                  <Mini o={o} />
                  <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span className="truncate text-sm font-bold">{o.name}</span>
                    <span className="font-mono text-xs text-text-2">{o.info}</span>
                  </span>
                </span>
                <span
                  aria-hidden
                  className={`flex size-7 flex-none items-center justify-center rounded-full border-[1.5px] border-ink text-xs font-extrabold peer-focus-visible:outline-2 ${on ? "bg-ink text-white" : "bg-white"} ${reason ? "opacity-45" : ""}`}
                >
                  {on ? i + 1 : ""}
                </span>
              </label>
              {(on || reason || (t?.pinned != null && t.pinned < t.version)) && (
                <div className="flex flex-wrap items-center gap-2 text-[11px] font-semibold text-text-2">
                  {on && (
                    <span
                      className={`rounded-md border-[1.5px] border-ink px-2 py-0.5 font-bold text-ink ${i === 0 ? "bg-butter" : "bg-white"}`}
                    >
                      {i === 0 ? "Utama" : `Desain ${i + 1}`}
                    </span>
                  )}
                  {reason && <span>{reason}</span>}
                  {t?.pinned != null && t.pinned < t.version && (
                    <span>
                      Event memakai v{t.pinned}. Simpan untuk memakai v{t.version}.
                    </span>
                  )}
                </div>
              )}
              <div className="flex flex-wrap gap-2">
                {on && i > 0 && (
                  <button
                    type="button"
                    className={act}
                    onClick={() => setSel((s) => [o.value, ...s.filter((x) => x !== o.value)])}
                  >
                    Jadikan utama
                  </button>
                )}
                {t && (
                  <Link
                    href={`/admin/templates/${t.id}`}
                    aria-label={`Edit desain ${o.name}`}
                    className={act}
                  >
                    Edit desain
                  </Link>
                )}
                {!reason && (
                  <button
                    type="submit"
                    name="copy"
                    value={o.value}
                    aria-label={`Salin & sesuaikan ${o.name}`}
                    title="Buat salinan khusus event ini, pakai untuk event, lalu buka editornya"
                    className={act}
                  >
                    Salin & sesuaikan
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </fieldset>
      <Link href="/admin/templates" className="self-start text-xs font-bold underline">
        Kelola template
      </Link>
    </div>
  );
}
