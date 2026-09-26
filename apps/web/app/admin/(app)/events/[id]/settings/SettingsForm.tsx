"use client";
import {
  EVENT_PRESETS,
  LAYOUT_PRESETS,
  type LayoutPaper,
  type PresetId,
  paperLabel,
} from "@tetra/shared";
import Link from "next/link";
import { type ReactNode, startTransition, useActionState, useState } from "react";
import { ColorPicker } from "@/components/ColorPicker";
import { type SaveResult, saveEvent } from "./actions";

export type SettingsValues = {
  name: string;
  event_date: string;
  location: string;
  tagline: string;
  client_name: string;
  /** Preset id, atau `tpl:<layoutId>` untuk template editor. */
  preset: string;
  pinnedVersion: number | null;
  /** Desain tambahan pilihan tamu (mode event, DECISIONS #99): nilai sama dengan `preset`. */
  extras: string[];
  templates: { id: string; name: string; paper: string; version: number }[];
  background: string;
  hasOverlay: boolean;
  /** Header halaman tamu. */
  guestColor: string;
  hasLogo: boolean;
  countdownSec: number;
  retakeMax: number;
  maxPrints: number;
  reviewTimeoutSec: number;
  qrScreenSec: number;
  mode: "event" | "photobox";
  sessionSec: number;
  extraPrintPrice: number;
  /** Harga per preset yang dijual di photobox (tidak ada = tidak dijual). */
  prices: Partial<Record<PresetId, number>>;
  lead: {
    enabled?: boolean;
    mode?: "gate" | "optional";
    fields?: string[];
    consentText?: string;
  } | null;
  guest_days: number;
  client_days: number;
  devices: { id: string; name: string; assigned: boolean }[];
};

const MODES = [
  { v: "event", i: "♥", t: "Mode Event", d: "Klien bayar paket, 1 layout, cetak gratis" },
  { v: "photobox", i: "▣", t: "Mode Photobox", d: "Tamu bayar per sesi via QRIS" },
] as const;

const input = "h-[42px] w-full rounded-[11px] border-[1.5px] border-ink bg-white px-3 text-sm";

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="overflow-hidden rounded-2xl border-[1.5px] border-ink bg-white">
      <h2 className="border-b-[1.5px] border-dashed border-ink px-5 py-3.5 text-[15px] font-extrabold">
        {title}
      </h2>
      <div className="grid grid-cols-1 gap-3 px-5 py-[18px] md:grid-cols-2">{children}</div>
    </section>
  );
}

function Field({ label, unit, children }: { label: string; unit?: string; children: ReactNode }) {
  return (
    // biome-ignore lint/a11y/noLabelWithoutControl: input dikirim lewat children
    <label className="flex flex-col gap-1.5 text-xs font-bold">
      {label}
      <span className="flex items-center gap-2">
        {children}
        {unit && (
          <span className="text-xs font-semibold whitespace-nowrap text-text-2">{unit}</span>
        )}
      </span>
    </label>
  );
}

export function SettingsForm({ eventId, v }: { eventId: string; v: SettingsValues }) {
  const [background, setBackground] = useState(v.background);
  const [guestColor, setGuestColor] = useState(v.guestColor);
  const [r, action, pending] = useActionState<SaveResult, FormData>(
    saveEvent.bind(null, eventId),
    null,
  );
  const num = (name: keyof SettingsValues, min: number, max: number) => (
    <input
      name={name}
      type="number"
      min={min}
      max={max}
      required
      defaultValue={v[name] as number}
      className={input}
    />
  );
  return (
    <form
      // onSubmit, bukan action=: React me-reset form setelah action, isian hilang kalau simpan ditolak.
      onSubmit={(e) => {
        e.preventDefault();
        const data = new FormData(e.currentTarget);
        startTransition(() => action(data));
      }}
      className="grid grid-cols-1 items-start gap-7 xl:grid-cols-[1fr_280px]"
    >
      <div className="flex flex-col gap-4">
        <Section title="Informasi">
          <Field label="Nama event">
            <input name="name" required defaultValue={v.name} className={input} />
          </Field>
          <Field label="Tanggal">
            <input
              name="event_date"
              type="date"
              required
              defaultValue={v.event_date}
              className={input}
            />
          </Field>
          <Field label="Venue">
            <input name="location" defaultValue={v.location} className={input} />
          </Field>
          <Field label="Nama klien">
            <input name="client_name" defaultValue={v.client_name} className={input} />
          </Field>
          <Field label="Teks kecil di layar booth (mis. The Wedding of)">
            <input name="tagline" maxLength={40} defaultValue={v.tagline} className={input} />
          </Field>
        </Section>

        <Section title="Mode">
          {MODES.map((m) => (
            <label
              key={m.v}
              className="flex cursor-pointer items-center gap-3 rounded-[14px] border-[1.5px] border-dashed border-ink p-3.5 has-checked:border-solid has-checked:bg-mint-soft"
            >
              <input
                type="radio"
                name="mode"
                value={m.v}
                defaultChecked={v.mode === m.v}
                className="sr-only"
              />
              <span className="flex size-10 flex-none items-center justify-center rounded-xl border-[1.5px] border-ink bg-white text-lg">
                {m.i}
              </span>
              <span>
                <span className="block text-sm font-bold">{m.t}</span>
                <span className="block text-xs font-normal text-text-2">{m.d}</span>
              </span>
            </label>
          ))}
        </Section>

        <Section title="Template">
          <fieldset className="col-span-full grid grid-cols-2 gap-3 lg:grid-cols-4">
            <legend className="mb-1.5 text-xs font-bold">Layout</legend>
            {EVENT_PRESETS.map((id) => [id, LAYOUT_PRESETS[id]] as const).map(([id, p]) => (
              <label
                key={id}
                className="flex cursor-pointer flex-col gap-0.5 rounded-[14px] border-[1.5px] border-dashed border-ink bg-white p-3.5 has-checked:border-solid has-checked:bg-sky"
              >
                <input
                  type="radio"
                  name="preset"
                  value={id}
                  defaultChecked={v.preset === id}
                  className="sr-only"
                />
                <span className="text-sm font-bold">{p.name}</span>
                <span className="font-mono text-xs text-text-2">{p.info}</span>
              </label>
            ))}
            {v.templates.map((t) => {
              const value = `tpl:${t.id}`;
              const pinned = v.preset === value ? v.pinnedVersion : null;
              return (
                <label
                  key={t.id}
                  className="flex cursor-pointer flex-col gap-0.5 rounded-[14px] border-[1.5px] border-dashed border-ink bg-white p-3.5 has-checked:border-solid has-checked:bg-sky"
                >
                  <input
                    type="radio"
                    name="preset"
                    value={value}
                    defaultChecked={v.preset === value}
                    className="sr-only"
                  />
                  <span className="text-sm font-bold">{t.name}</span>
                  <span className="font-mono text-xs text-text-2">
                    {paperLabel(t.paper as LayoutPaper)} · template v{t.version}
                  </span>
                  {pinned !== null && pinned < t.version && (
                    <span className="text-[11px] font-semibold text-text-2">
                      Event memakai v{pinned}. Simpan untuk memakai v{t.version}.
                    </span>
                  )}
                </label>
              );
            })}
            <Link href="/admin/templates" className="self-center text-xs font-bold underline">
              + Buat / edit template
            </Link>
          </fieldset>
          <fieldset className="col-span-full flex flex-col gap-2">
            <legend className="mb-1.5 text-xs font-bold">
              Desain lain untuk tamu (Mode Event, opsional, maks. 4) · tamu memilih sebelum foto
            </legend>
            <div className="flex flex-wrap gap-2">
              {[
                ...EVENT_PRESETS.map((id) => ({ value: id, name: LAYOUT_PRESETS[id].name })),
                ...v.templates.map((t) => ({
                  value: `tpl:${t.id}`,
                  name: `${t.name} · ${paperLabel(t.paper as LayoutPaper)}`,
                })),
              ].map((d) => (
                <label
                  key={d.value}
                  className="flex cursor-pointer items-center gap-2 rounded-full border-[1.5px] border-dashed border-ink bg-white px-3 py-1.5 text-xs font-bold has-checked:border-solid has-checked:bg-lavender"
                >
                  <input
                    type="checkbox"
                    name="extra"
                    value={d.value}
                    defaultChecked={v.extras.includes(d.value)}
                    className="sr-only"
                  />
                  {d.name}
                </label>
              ))}
            </div>
          </fieldset>
          <Field label="Overlay (PNG transparan, ukuran kanvas layout; hanya untuk layout preset)">
            <input name="overlay" type="file" accept="image/png" className="text-sm" />
          </Field>
          <Field label="Warna latar">
            <ColorPicker
              name="background"
              label="Warna latar"
              value={background}
              onChange={setBackground}
              showHex
            />
          </Field>
          {v.hasOverlay && (
            <label className="flex items-center gap-2 text-xs font-bold">
              <input type="checkbox" name="remove_overlay" /> Hapus overlay sekarang
            </label>
          )}
        </Section>

        <Section title="Photobox (berlaku di Mode Photobox)">
          <fieldset className="col-span-full grid grid-cols-1 gap-2.5 lg:grid-cols-2">
            <legend className="mb-1.5 text-xs font-bold">
              Layout yang dijual · harga termasuk 1 lembar cetak
            </legend>
            {EVENT_PRESETS.map((id) => [id, LAYOUT_PRESETS[id]] as const).map(([id, p]) => (
              <div
                key={id}
                className="flex items-center gap-3 rounded-[11px] border-[1.5px] border-ink px-3 py-2"
              >
                <label className="flex flex-1 items-center gap-2.5 text-sm font-semibold">
                  <input type="checkbox" name={`pb_${id}`} defaultChecked={id in v.prices} />
                  {p.name} <span className="font-mono text-xs text-text-2">{p.info}</span>
                </label>
                <span className="text-xs font-semibold text-text-2">Rp</span>
                <input
                  name={`price_${id}`}
                  type="number"
                  min={1500}
                  step={500}
                  aria-label={`Harga ${p.name}`}
                  defaultValue={v.prices[id] ?? 25000}
                  className={`${input} w-28`}
                />
              </div>
            ))}
          </fieldset>
          <Field label="Harga lembar tambahan" unit="Rp / lembar">
            {num("extraPrintPrice", 0, 1_000_000)}
          </Field>
          <Field label="Timer sesi setelah bayar" unit="detik">
            {num("sessionSec", 60, 900)}
          </Field>
        </Section>

        <Section title="Sesi">
          <Field label="Hitung mundur" unit="detik">
            {num("countdownSec", 1, 10)}
          </Field>
          <Field label="Retake per foto" unit="kali">
            {num("retakeMax", 0, 5)}
          </Field>
          <Field label="Maks. cetak per sesi" unit="lembar">
            {num("maxPrints", 1, 10)}
          </Field>
          <Field label="Layar review otomatis lanjut" unit="detik">
            {num("reviewTimeoutSec", 5, 120)}
          </Field>
          <Field label="Layar QR tampil" unit="detik">
            {num("qrScreenSec", 10, 300)}
          </Field>
        </Section>

        <Section title="Halaman tamu">
          <Field label="Logo / monogram (PNG, JPG, WebP; maks. 1 MB)">
            <input
              name="logo"
              type="file"
              accept="image/png,image/jpeg,image/webp"
              className="text-sm"
            />
          </Field>
          <Field label="Warna header">
            <ColorPicker
              name="guest_color"
              label="Warna header"
              value={guestColor}
              onChange={setGuestColor}
              showHex
            />
          </Field>
          {v.hasLogo && (
            <label className="flex items-center gap-2 text-xs font-bold">
              <input type="checkbox" name="remove_logo" /> Hapus logo sekarang
            </label>
          )}
        </Section>

        <Section title="Lead capture (halaman tamu)">
          <label className="col-span-full flex items-center gap-2.5 text-sm font-bold">
            <input type="checkbox" name="lead_enabled" defaultChecked={!!v.lead?.enabled} />
            Minta data tamu sebelum / saat melihat foto
          </label>
          <fieldset className="flex flex-col gap-2 text-sm">
            <legend className="mb-1.5 text-xs font-bold">Mode</legend>
            {(
              [
                ["gate", "Wajib: foto tampil setelah form diisi"],
                ["optional", "Opsional: tamu bisa melewati"],
              ] as const
            ).map(([m, l]) => (
              <label key={m} className="flex items-center gap-2.5">
                <input
                  type="radio"
                  name="lead_mode"
                  value={m}
                  defaultChecked={(v.lead?.mode ?? "optional") === m}
                />
                {l}
              </label>
            ))}
          </fieldset>
          <fieldset className="flex flex-col gap-2 text-sm">
            <legend className="mb-1.5 text-xs font-bold">Field (semua wajib diisi)</legend>
            {(
              [
                ["name", "Nama"],
                ["whatsapp", "Nomor WhatsApp"],
                ["email", "Email"],
              ] as const
            ).map(([k, l]) => (
              <label key={k} className="flex items-center gap-2.5">
                <input
                  type="checkbox"
                  name={`lead_f_${k}`}
                  defaultChecked={v.lead?.fields ? v.lead.fields.includes(k) : k !== "email"}
                />
                {l}
              </label>
            ))}
          </fieldset>
          <label className="col-span-full flex flex-col gap-1.5 text-xs font-bold">
            Teks persetujuan (UU PDP) · sebut siapa yang memakai data dan untuk apa
            <textarea
              name="consent_text"
              maxLength={600}
              rows={3}
              defaultValue={v.lead?.consentText ?? ""}
              className="rounded-[11px] border-[1.5px] border-ink bg-white p-3 text-sm font-normal"
            />
          </label>
        </Section>

        <Section title="Masa simpan foto">
          <Field label="Halaman tamu" unit="hari setelah event">
            {num("guest_days", 1, 365)}
          </Field>
          <Field label="Galeri klien" unit="hari setelah event">
            {num("client_days", 1, 365)}
          </Field>
        </Section>

        <Section title="Device">
          {v.devices.length ? (
            v.devices.map((d) => (
              <label
                key={d.id}
                className="flex items-center gap-2.5 rounded-[11px] border-[1.5px] border-ink px-3 py-2.5 text-sm font-semibold"
              >
                <input type="checkbox" name="devices" value={d.id} defaultChecked={d.assigned} />
                {d.name}
              </label>
            ))
          ) : (
            <p className="text-sm text-text-2">Belum ada booth. Daftarkan di menu Device.</p>
          )}
        </Section>
      </div>

      <aside className="layered sticky top-7 flex flex-col gap-3 rounded-2xl border-[1.5px] border-ink bg-peach p-[18px] [--lb:1.5px] [--lx:5px] xl:mt-0">
        <div className="text-sm font-extrabold">Simpan pengaturan</div>
        <p className="text-xs leading-normal text-text-3" role="status">
          {r?.message ??
            "Booth menerima pengaturan baru saat online (atau lewat Sync dari Cloud di mode crew)."}
        </p>
        <button
          type="submit"
          disabled={pending}
          className="pressable h-11 rounded-xl border-[1.5px] border-ink bg-butter text-sm font-extrabold disabled:opacity-50"
        >
          {pending ? "Menyimpan…" : "Simpan"}
        </button>
      </aside>
    </form>
  );
}
