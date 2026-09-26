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
  /** Layar awal booth (#102). */
  attract: { background: string; cta: string; samples: boolean; hasImage: boolean };
  countdownSound: boolean;
  bumper: boolean;
  promptsBefore: string[];
  promptsAfter: string[];
  /** Suara per cue (#104): nyala/mati + URL file pengganti (presigned) kalau ada. */
  sounds: { cue: string; on: boolean; custom: string | null }[];
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
  /** Kunci: id preset atau `tpl-<layoutId>` (#108). */
  prices: Record<string, number>;
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

/** Label momen suara (#104). */
const SOUND_LABELS: Record<string, string> = {
  mulai: "Sapaan mulai",
  "foto-1": "Sebelum foto 1",
  "foto-2": "Sebelum foto 2",
  "foto-3": "Sebelum foto 3+",
  "foto-terakhir": "Foto terakhir",
  "3": "Angka 3",
  "2": "Angka 2",
  "1": "Angka 1",
  jepret: "Jepret",
  "keren-1": "Sorakan: Mantap!",
  "keren-2": "Sorakan: Keren banget!",
  "keren-3": "Sorakan: Cakep!",
  "keren-4": "Sorakan: Kalcer abis!",
  review: "Cek foto",
  cetak: "Pilih cetak",
  selesai: "Selesai (QR)",
  bayar: "Bayar QRIS",
  bumper: "Audio bumper",
};

/** Satu baris suara (#104): pill Nyala/Mati, dengar, status, Ganti (upload), kembalikan ke bawaan. */
function SoundRow({ cue, on, custom }: { cue: string; on: boolean; custom: string | null }) {
  const [file, setFile] = useState<string | null>(null);
  const [reset, setReset] = useState(false);
  const pill = "cursor-pointer rounded-full border-[1.5px] border-ink px-3 py-1 text-xs font-bold";
  return (
    <div className="grid grid-cols-[180px_auto_auto_1fr] items-center gap-3 py-2 text-sm">
      <span className="font-bold">{SOUND_LABELS[cue] ?? cue}</span>
      <label
        className={`${pill} border-dashed bg-white has-checked:border-solid has-checked:bg-mint-soft`}
      >
        <input
          type="checkbox"
          name={`snd_on_${cue}`}
          defaultChecked={on}
          className="peer sr-only"
        />
        <span className="hidden peer-checked:inline">Nyala</span>
        <span className="peer-checked:hidden">Mati</span>
      </label>
      <button
        type="button"
        aria-label={`Dengar ${SOUND_LABELS[cue] ?? cue}`}
        onClick={() => void new Audio(custom && !reset ? custom : `/sounds/${cue}.wav`).play()}
        className="pressable flex size-8 items-center justify-center rounded-full border-[1.5px] border-ink bg-mint text-xs font-bold"
      >
        ▶
      </button>
      <span className="flex items-center justify-end gap-2 text-xs">
        <span className="truncate text-text-2">
          {file ?? (custom && !reset ? "suara pengganti" : "suara bawaan")}
        </span>
        <label className={`${pill} bg-white`}>
          Ganti
          <input
            name={`snd_file_${cue}`}
            type="file"
            accept="audio/wav,audio/x-wav,audio/mpeg"
            className="sr-only"
            onChange={(e) => setFile(e.target.files?.[0]?.name ?? null)}
          />
        </label>
        {custom && (
          <label className={`${pill} bg-white has-checked:bg-peach`}>
            <input
              type="checkbox"
              name={`snd_reset_${cue}`}
              className="sr-only"
              onChange={(e) => setReset(e.target.checked)}
            />
            Pakai bawaan
          </label>
        )}
      </span>
    </div>
  );
}

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
  const [attractBg, setAttractBg] = useState(v.attract.background);
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

        <Section title="Layar awal booth">
          <Field label="Gambar latar (JPG/PNG, 1920×1080; maks. 4 MB)">
            <input
              name="attract_image"
              type="file"
              accept="image/png,image/jpeg"
              className="text-sm"
            />
          </Field>
          <Field label="Warna latar">
            <ColorPicker
              name="attract_bg"
              label="Warna latar layar awal"
              value={attractBg}
              onChange={setAttractBg}
              showHex
            />
          </Field>
          <Field label="Teks tombol mulai">
            <input
              name="attract_cta"
              maxLength={30}
              placeholder="Sentuh untuk Mulai"
              defaultValue={v.attract.cta}
              className={input}
            />
          </Field>
          <label className="flex items-center gap-2 self-end text-xs font-bold">
            <input type="checkbox" name="attract_samples" defaultChecked={v.attract.samples} />{" "}
            Tampilkan strip contoh bergerak
          </label>
          <label className="flex items-center gap-2 self-end text-xs font-bold">
            <input type="checkbox" name="bumper" defaultChecked={v.bumper} /> Putar bumper Tetra
            saat event dibuka di booth
          </label>
          {v.attract.hasImage && (
            <label className="flex items-center gap-2 text-xs font-bold">
              <input type="checkbox" name="remove_attract_image" /> Hapus gambar latar sekarang
            </label>
          )}
        </Section>

        <Section title="Suara (berlaku kalau Suara di bagian Sesi dinyalakan)">
          <div className="col-span-full flex flex-col divide-y-[1.5px] divide-dashed divide-line-soft">
            {v.sounds.map((snd) => (
              <SoundRow key={snd.cue} {...snd} />
            ))}
          </div>
        </Section>

        <Section title="Photobox (berlaku di Mode Photobox)">
          <fieldset className="col-span-full grid grid-cols-1 gap-2.5 lg:grid-cols-2">
            <legend className="mb-1.5 text-xs font-bold">
              Layout yang dijual · harga termasuk 1 lembar cetak
            </legend>
            {[
              ...EVENT_PRESETS.map((id) => ({
                id: id as string,
                name: LAYOUT_PRESETS[id].name,
                info: LAYOUT_PRESETS[id].info,
              })),
              ...v.templates.map((t) => ({
                id: `tpl-${t.id}`,
                name: t.name,
                info: `${paperLabel(t.paper as LayoutPaper)} · template`,
              })),
            ].map((p) => (
              <div
                key={p.id}
                className="flex items-center gap-3 rounded-[11px] border-[1.5px] border-ink px-3 py-2"
              >
                <label className="flex flex-1 items-center gap-2.5 text-sm font-semibold">
                  <input type="checkbox" name={`pb_${p.id}`} defaultChecked={p.id in v.prices} />
                  {p.name} <span className="font-mono text-xs text-text-2">{p.info}</span>
                </label>
                <span className="text-xs font-semibold text-text-2">Rp</span>
                <input
                  name={`price_${p.id}`}
                  type="number"
                  min={1500}
                  step={500}
                  aria-label={`Harga ${p.name}`}
                  defaultValue={v.prices[p.id] ?? 25000}
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
          <label className="flex items-center gap-2 self-end text-xs font-bold">
            <input type="checkbox" name="countdownSound" defaultChecked={v.countdownSound} /> Suara
            (kalimat, hitung mundur & jepret)
          </label>
          <Field label="Kalimat sebelum foto (satu per baris; baris terakhir = foto terakhir; kosong = bawaan)">
            <textarea
              name="prompts_before"
              rows={4}
              defaultValue={v.promptsBefore.join("\n")}
              placeholder={
                "Siap-siap, gaya pertama!\nGaya kedua, lebih seru!\nOke gaya terakhir, cheers!"
              }
              className="w-full rounded-[11px] border-[1.5px] border-ink bg-white px-3 py-2 text-sm"
            />
          </Field>
          <Field label="Kalimat setelah foto (dipilih acak; kosong = bawaan)">
            <textarea
              name="prompts_after"
              rows={4}
              defaultValue={v.promptsAfter.join("\n")}
              placeholder={"Mantap!\nKeren banget!\nCakep!\nWih, kalcer abis!"}
              className="w-full rounded-[11px] border-[1.5px] border-ink bg-white px-3 py-2 text-sm"
            />
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
