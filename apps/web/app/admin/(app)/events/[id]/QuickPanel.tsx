"use client";
import type { GuestCamSettings } from "@tetra/shared";
import { Settings } from "lucide-react";
import Link from "next/link";
import { type ReactNode, useState, useTransition } from "react";
import { type QuickSet, quickSet } from "./actions";
import { Switch } from "./settings/SettingsForm";

type Values = Pick<GuestCamSettings, "enabled" | "approval" | "reveal" | "print" | "voice"> & {
  promo: boolean;
  lead: boolean;
};

/**
 * Akses cepat (ringkasan event): setelan yang sering diubah saat acara, tersimpan langsung tanpa membuka
 * Pengaturan. Crew hanya melihat.
 */
export function QuickPanel({
  eventId,
  slug,
  values,
  canEdit,
}: {
  eventId: string;
  slug: string;
  values: Values;
  canEdit: boolean;
}) {
  const [v, setV] = useState(values);
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const set = (q: QuickSet) => {
    const prev = v;
    setV({ ...v, [q.key]: q.value });
    setErr(null);
    start(async () => {
      const e = await quickSet(eventId, q);
      if (e) {
        setV(prev);
        setErr(e);
      }
    });
  };
  const off = !canEdit || pending;
  const row = (title: string, hint: string, control: ReactNode) => (
    <div className="flex items-center justify-between gap-4 py-2.5">
      <span className="min-w-0">
        <span className="block text-sm font-bold">{title}</span>
        <span className="mt-0.5 block text-xs leading-normal text-text-2">{hint}</span>
      </span>
      {control}
    </div>
  );
  const toggle = (key: "enabled" | "print" | "voice" | "promo" | "lead", label: string) => (
    <Switch
      aria-label={label}
      checked={v[key]}
      disabled={off}
      onChange={(e) => set({ key, value: e.target.checked } as QuickSet)}
    />
  );
  const seg = <K extends "approval" | "reveal">(key: K, opts: [Values[K], string][]) => (
    <fieldset className="flex flex-none rounded-full border-[1.5px] border-ink bg-white p-0.5">
      {opts.map(([val, label]) => (
        <label
          key={val}
          className="flex h-7 cursor-pointer items-center rounded-full px-3 text-xs font-bold has-checked:bg-mint has-disabled:cursor-default has-focus-visible:outline-2 has-focus-visible:outline-ink"
        >
          <input
            type="radio"
            name={`quick-${key}`}
            className="sr-only"
            checked={v[key] === val}
            disabled={off}
            onChange={() => set({ key, value: val } as QuickSet)}
          />
          {label}
        </label>
      ))}
    </fieldset>
  );
  const head = (t: string) => (
    <span className="mt-2 text-[11px] font-bold tracking-[0.08em] text-text-3 uppercase">{t}</span>
  );

  return (
    <section
      aria-label="Akses cepat"
      className="flex flex-col rounded-2xl border-[1.5px] border-ink bg-white px-5 py-4"
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-[15px] font-extrabold">Akses cepat</span>
        {canEdit && (
          <Link
            href={`/admin/events/${slug}/settings`}
            className="inline-flex items-center gap-1 text-xs font-bold text-text-2 no-underline hover:text-ink"
          >
            <Settings aria-hidden className="size-3.5" strokeWidth={2} />
            Semua pengaturan
          </Link>
        )}
      </div>
      <p className="text-xs text-text-2">
        {canEdit
          ? "Tersimpan langsung. Booth menerima perubahan saat online."
          : "Hanya owner/admin yang bisa mengubah."}
      </p>

      {head("Guest Cam · Snapbook")}
      <div className="divide-y-[1.5px] divide-dashed divide-line-soft">
        {row(
          "Snapbook aktif",
          "Tamu memotret & kirim ucapan dari HP lewat QR meja.",
          toggle("enabled", "Snapbook aktif"),
        )}
        {v.enabled && (
          <>
            {row(
              "Persetujuan foto",
              v.approval === "manual"
                ? "Foto tamu tampil setelah kamu setujui."
                : "Foto tamu langsung masuk album.",
              seg("approval", [
                ["auto", "Otomatis"],
                ["manual", "Manual"],
              ]),
            )}
            {row(
              "Album tamu terbuka",
              v.reveal === "live"
                ? "Tamu & galeri melihat foto selama acara."
                : "Terbuka saat acara dihentikan.",
              seg("reveal", [
                ["live", "Langsung"],
                ["after", "Setelah acara"],
              ]),
            )}
            {row(
              "Cetak dari HP tamu",
              "Strip tamu masuk antrean printer booth.",
              toggle("print", "Cetak dari HP tamu"),
            )}
            {row("Ucapan suara", "Tamu bisa merekam voice note.", toggle("voice", "Ucapan suara"))}
          </>
        )}
      </div>

      {head("Halaman tamu")}
      <div className="divide-y-[1.5px] divide-dashed divide-line-soft">
        {row(
          "Form data tamu",
          "Minta nama/kontak sebelum foto diunduh.",
          toggle("lead", "Form data tamu"),
        )}
        {row(
          "Kartu promosi",
          "Kartu promo Tetra & IG klien di halaman tamu.",
          toggle("promo", "Kartu promosi"),
        )}
      </div>
      {err && <p className="mt-2 text-xs font-bold text-coral-strong">{err}</p>}
    </section>
  );
}
