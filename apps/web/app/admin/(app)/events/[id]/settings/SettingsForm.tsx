"use client";
import {
  EVENT_PRESETS,
  GUEST_PRESETS,
  type GuestCamSettings,
  LAYOUT_PRESETS,
  type LayoutPaper,
  PHOTO_FILTERS,
  paperLabel,
} from "@tetra/shared";
import { ColorPicker, Select } from "@tetra/ui";
import { ArrowRight, Check, Play } from "lucide-react";
import Link from "next/link";
import {
  type InputHTMLAttributes,
  type ReactNode,
  startTransition,
  useActionState,
  useEffect,
  useRef,
  useState,
} from "react";
import { OPS_PAPER, OpsPaperWarning } from "../../OpsPaperWarning";
import { type SaveResult, saveEvent } from "./actions";
import { type DesignOption, DesignPicker, forMode } from "./DesignPicker";
import { StageGroups } from "./StageGroups";
import { useLeaveGuard } from "./useLeaveGuard";

export type SettingsValues = {
  name: string;
  /** Ukuran frame booking Tetra Ops asal event (#162), kosong = bukan dari Ops. */
  opsFrameSize?: string | null;
  event_date: string;
  location: string;
  tagline: string;
  client_name: string;
  /** IG klien untuk kartu promosi tamu (#215). */
  clientInstagram: string[];
  /** Kartu promosi tampil di halaman tamu (#215). */
  promoCard: boolean;
  /** Paket yang dijual (#150): nama + durasi jam, untuk rekap durasi. */
  package_name: string;
  /** Booking Tetra Ops yang ditautkan (#193); "" = belum. */
  opsProjectId: string;
  package_hours: string;
  /** Jadwal booking (#152) "HH:MM", kosong = tidak diisi. */
  scheduled_start: string;
  scheduled_end: string;
  /** Desain frame terpilih, berurutan (pertama = utama): preset id atau `tpl:<layoutId>`. */
  designs: string[];
  designOptions: DesignOption[];
  templates: { id: string; name: string; paper: string; mode: string; version: number }[];
  background: string;
  hasOverlay: boolean;
  /** Layar awal booth (#102). */
  attract: { background: string; cta: string; brand: string; samples: boolean; hasImage: boolean };
  countdownSound: boolean;
  bumper: boolean;
  countdownVideo: boolean;
  /** Polaroid & 2R: sisi kiri/kanan foto berbeda (#207). */
  pairDifferent: boolean;
  /** Filter yang ditawarkan ke tamu (#116). */
  filters: string[];
  promptsBefore: string[];
  promptsAfter: string[];
  /** Daftar grup Photo Stage (#181). */
  stageGroups: string[];
  stageGapSec: number;
  stageTvSec: number;
  /** Guest Cam (#197): kamera HP tamu lewat /c/{slug}. */
  guestCam: GuestCamSettings;
  gc_shots: number;
  /** Batas tamu tier (#221); "" = tak terbatas. */
  gc_max_guests: string;
  /** Usulan daftar grup dari portal Ops saat daftar masih kosong (#182). */
  opsStageGroups: string[];
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
  allDevices: boolean;
  /** Link galeri klien sudah dibuat. */
  hasClientLink: boolean;
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

const input = "h-[42px] w-full rounded-[11px] border-[1.5px] border-ink bg-white px-3 text-sm";
const textarea = "w-full rounded-[11px] border-[1.5px] border-ink bg-white px-3 py-2.5 text-sm";

/** "12 Oktober 2026" (sama dengan tanggal di strip, lib/guest `longDate`). */
export const longDate = (d: string) => {
  const t = new Date(`${d}T00:00:00Z`);
  return Number.isNaN(t.getTime())
    ? ""
    : new Intl.DateTimeFormat("id-ID", { dateStyle: "long", timeZone: "UTC" }).format(t);
};

/** Kotak centang / radio bergaya v2 (input asli, jadi keyboard & label tetap jalan). */
export function Box({ radio, ...p }: InputHTMLAttributes<HTMLInputElement> & { radio?: boolean }) {
  return (
    <span className="relative inline-flex size-5 flex-none">
      <input
        {...p}
        type={radio ? "radio" : "checkbox"}
        className={`peer size-5 cursor-pointer appearance-none border-[1.5px] border-ink bg-white checked:bg-mint focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink ${radio ? "rounded-full" : "rounded-md"}`}
      />
      {radio ? (
        <span className="pointer-events-none absolute inset-[6px] hidden rounded-full bg-ink peer-checked:block" />
      ) : (
        <Check
          aria-hidden
          strokeWidth={3.5}
          className="pointer-events-none absolute inset-0 m-auto hidden size-3 peer-checked:block"
        />
      )}
    </span>
  );
}

/** Saklar nyala/mati (Toggle v2). */
/** Pilihan kartu (E14): dua kartu radio, yang terpilih mint-soft berlapis dengan centang hijau. */
function GcChoice({
  legend,
  name,
  value,
  options,
}: {
  legend: string;
  name: string;
  value: string;
  options: [string, string, string][];
}) {
  return (
    <fieldset className="grid grid-cols-1 gap-3 md:col-span-2 md:grid-cols-2">
      <legend className="mb-2.5 text-sm font-extrabold">{legend}</legend>
      {options.map(([v, t, d]) => (
        <label
          key={v}
          className="flex cursor-pointer gap-3 rounded-[16px] border-[1.5px] border-ink bg-white px-4 py-3.5 has-[:checked]:layered has-[:checked]:bg-mint-soft has-[:checked]:[--lb:1.5px] has-[:checked]:[--lx:4px]"
        >
          <Box radio name={name} value={v} defaultChecked={value === v} />
          <span>
            <span className="block text-[15px] font-extrabold">{t}</span>
            <span className="mt-1 block text-xs leading-normal text-text-2">{d}</span>
          </span>
        </label>
      ))}
    </fieldset>
  );
}

function Switch(p: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <span className="relative inline-flex h-[26px] w-[46px] flex-none">
      <input
        {...p}
        type="checkbox"
        className="peer size-full cursor-pointer appearance-none rounded-full border-[1.5px] border-ink bg-white checked:bg-mint focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
      />
      <span className="pointer-events-none absolute top-[5px] left-[5px] size-4 rounded-full border-[1.5px] border-ink bg-white transition-transform peer-checked:translate-x-5" />
    </span>
  );
}

/** Baris saklar: judul + penjelasan di kiri, saklar di kanan (label = seluruh baris). */
function ToggleRow({
  title,
  hint,
  ...p
}: InputHTMLAttributes<HTMLInputElement> & { title: string; hint: ReactNode }) {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-5 rounded-[14px] border-[1.5px] border-ink bg-white px-4 py-3 md:col-span-2">
      <span>
        <span className="block text-sm font-bold">{title}</span>
        <span className="mt-0.5 block text-xs leading-normal text-text-2">{hint}</span>
      </span>
      <Switch {...p} />
    </label>
  );
}

/** Satu baris suara (#104): saklar, dengar, status, Ganti (upload), kembalikan ke bawaan. */
function SoundRow({ cue, on, custom }: { cue: string; on: boolean; custom: string | null }) {
  const [file, setFile] = useState<string | null>(null);
  const [reset, setReset] = useState(false);
  const label = SOUND_LABELS[cue] ?? cue;
  const pill =
    "inline-flex h-8 cursor-pointer items-center rounded-full border-[1.5px] border-ink px-3 text-xs font-bold";
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 py-2.5">
      <label className="flex min-w-[200px] flex-1 cursor-pointer items-center gap-3 text-sm font-bold">
        <Switch name={`snd_on_${cue}`} defaultChecked={on} aria-label={`Suara ${label}`} />
        {label}
      </label>
      <span className="truncate text-xs text-text-2">
        {file ?? (custom && !reset ? "suara pengganti" : "suara bawaan")}
      </span>
      <button
        type="button"
        aria-label={`Dengar ${label}`}
        onClick={() => void new Audio(custom && !reset ? custom : `/sounds/${cue}.wav`).play()}
        className="pressable flex size-8 items-center justify-center rounded-full border-[1.5px] border-ink bg-mint"
      >
        <Play className="size-3.5 fill-ink" />
      </button>
      <label className={`${pill} bg-white hover:bg-butter`}>
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
    </div>
  );
}

/** Pilih file dengan tombol berbahasa Indonesia (bukan "Choose File" bawaan browser, DECISIONS #77). */
function FilePick({ id, name, accept }: { id: string; name: string; accept: string }) {
  const [file, setFile] = useState<string | null>(null);
  return (
    <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-3">
      <span className="pressable inline-flex h-[42px] shrink-0 items-center rounded-[11px] border-[1.5px] border-ink bg-white px-4 text-sm font-bold hover:bg-butter">
        Pilih file
      </span>
      <span className="truncate text-xs font-semibold text-text-2">
        {file ?? "Belum ada file dipilih"}
      </span>
      <input
        id={id}
        name={name}
        type="file"
        accept={accept}
        aria-describedby={`${id}-hint`}
        className="sr-only"
        onChange={(e) => setFile(e.target.files?.[0]?.name ?? null)}
      />
    </label>
  );
}

type Badge = "ok" | "wajib" | "opsional";

function BadgeMark({ b }: { b: Badge }) {
  if (b === "ok")
    return (
      <span className="flex size-5 flex-none items-center justify-center rounded-full bg-green text-white">
        <Check aria-hidden strokeWidth={3.5} className="size-3" />
        <span className="sr-only">sudah diisi</span>
      </span>
    );
  return b === "wajib" ? (
    <span className="flex-none rounded-full border-[1.5px] border-ink bg-peach px-2 py-px text-[11px] font-bold">
      wajib
    </span>
  ) : (
    <span className="flex-none text-[11px] font-semibold text-muted">opsional</span>
  );
}

function Section({
  id,
  title,
  desc,
  badge,
  hidden,
  children,
}: {
  id: string;
  title: string;
  desc: ReactNode;
  badge: Badge;
  hidden?: boolean;
  children: ReactNode;
}) {
  return (
    <section
      id={id}
      data-section
      hidden={hidden}
      aria-labelledby={`${id}-title`}
      className="scroll-mt-6 rounded-2xl border-[1.5px] border-ink bg-white"
    >
      <header className="flex items-start justify-between gap-4 border-b-[1.5px] border-dashed border-ink px-6 py-4">
        <div>
          <h2 id={`${id}-title`} className="text-base font-extrabold tracking-[-0.02em]">
            {title}
          </h2>
          <p className="mt-1 max-w-[62ch] text-[13px] leading-normal text-text-2">{desc}</p>
        </div>
        <BadgeMark b={badge} />
      </header>
      <div className="grid grid-cols-1 gap-x-5 gap-y-5 px-6 py-5 md:grid-cols-2">{children}</div>
    </section>
  );
}

/**
 * Satu field: label, kontrol, lalu satu kalimat penjelasan + nilai bawaan. `id` = id input (label `htmlFor`);
 * tanpa `id` label hanya teks (kontrol punya nama aksesibel sendiri, mis. ColorPicker).
 */
function Field({
  id,
  label,
  hint,
  def,
  optional,
  unit,
  wide,
  children,
}: {
  id?: string;
  label: string;
  hint?: ReactNode;
  def?: string;
  optional?: boolean;
  unit?: string;
  wide?: boolean;
  children: ReactNode;
}) {
  const text = (
    <>
      {label}
      {optional && <span className="font-semibold text-muted"> · opsional</span>}
    </>
  );
  return (
    <div className={`flex min-w-0 flex-col gap-1.5 ${wide ? "md:col-span-2" : ""}`}>
      {id ? (
        <label htmlFor={id} className="text-[13px] font-bold">
          {text}
        </label>
      ) : (
        <span className="text-[13px] font-bold">{text}</span>
      )}
      <div className="flex items-center gap-2.5">
        {children}
        {unit && <span className="text-[13px] whitespace-nowrap text-text-2">{unit}</span>}
      </div>
      {(hint || def) && (
        <p id={id && `${id}-hint`} className="text-xs leading-normal text-text-2">
          {hint}
          {def && <span className="font-semibold text-text-3"> Bawaan: {def}.</span>}
        </p>
      )}
    </div>
  );
}

/** Tier Guest Cam (#221, rekap pricing 8 Okt). */
const GUEST_TIER_OPTIONS = [
  { value: "100", label: "100 tamu" },
  { value: "200", label: "200 tamu" },
  { value: "300", label: "300 tamu" },
  { value: "500", label: "500 tamu" },
  { value: "", label: "Tak terbatas" },
];

const MODES = [
  {
    v: "event",
    t: "Mode Event",
    d: "Klien sudah bayar paket. Tamu foto dan cetak gratis, bisa memilih 1–3 desain.",
  },
  {
    v: "photobox",
    t: "Mode Photobox",
    d: "Tamu bayar per sesi lewat QRIS sebelum foto. Harga diatur di bagian Photobox.",
  },
] as const;

export function SettingsForm({
  eventId,
  slug,
  v,
  links,
  guestLinks,
}: {
  eventId: string;
  /** Segmen URL saat ini; simpan yang mengganti slug membuka URL barunya. */
  slug: string;
  v: SettingsValues;
  /** Panel link klien (di luar data form, aksi sendiri). */
  links: ReactNode;
  /** Panel link /c Guest Cam + kartu QR meja (#197). */
  guestLinks: ReactNode;
}) {
  const [name, setName] = useState(v.name);
  const [date, setDate] = useState(v.event_date);
  const [mode, setMode] = useState(v.mode);
  const [designs, setDesigns] = useState(v.designs);
  const [background, setBackground] = useState(v.background);
  const [guestColor, setGuestColor] = useState(v.guestColor);
  const [attractBg, setAttractBg] = useState(v.attract.background);
  const [allDevices, setAllDevices] = useState(v.allDevices);
  const [picked, setPicked] = useState(
    () => new Set(v.devices.filter((d) => d.assigned).map((d) => d.id)),
  );
  const [sold, setSold] = useState(() => new Set(Object.keys(v.prices)));
  const [soundOn, setSoundOn] = useState(v.countdownSound);
  const [leadOn, setLeadOn] = useState(!!v.lead?.enabled);
  const [gcOn, setGcOn] = useState(v.guestCam.enabled);
  const [gcMax, setGcMax] = useState(v.gc_max_guests);
  const [gcLen, setGcLen] = useState(v.guestCam.consentText.length);
  const [dirty, setDirty] = useState(false);
  const [active, setActive] = useState("informasi");
  const [r, action, pending] = useActionState<SaveResult, FormData>(
    saveEvent.bind(null, eventId, slug),
    null,
  );
  useEffect(() => {
    if (r?.ok) setDirty(false);
  }, [r]);
  useLeaveGuard(dirty, "Ada perubahan belum disimpan. Tinggalkan halaman ini?");
  const pb = mode === "photobox";

  // Bagian yang sedang terbaca → disorot di navigasi kiri.
  useEffect(() => {
    const io = new IntersectionObserver(
      (es) => {
        for (const e of es) if (e.isIntersecting) setActive(e.target.id);
      },
      { rootMargin: "-15% 0px -75% 0px" },
    );
    for (const el of document.querySelectorAll("[data-section]")) io.observe(el);
    return () => io.disconnect();
  }, []);

  const toggle = (set: Set<string>, id: string, on: boolean) => {
    const n = new Set(set);
    if (on) n.add(id);
    else n.delete(id);
    return n;
  };
  const num = (key: keyof SettingsValues, min: number, max: number) => (
    <input
      id={key}
      name={key}
      type="number"
      min={min}
      max={max}
      required
      defaultValue={v[key] as number}
      aria-describedby={`${key}-hint`}
      className={`${input.replace("w-full", "w-32")} flex-none`}
    />
  );

  const main = v.designOptions.find((o) => o.value === designs[0]);
  const opsPaper = v.opsFrameSize ? OPS_PAPER[v.opsFrameSize] : undefined;
  const ok = {
    informasi: !!name.trim() && !!date,
    template: designs.length > 0,
    device: allDevices || picked.size > 0,
    photobox: sold.size > 0,
  };
  const checks = [
    {
      href: "#informasi",
      label: "Nama & tanggal",
      ok: ok.informasi,
      text: ok.informasi ? `${name.trim()} · ${longDate(date)}` : "Isi nama dan tanggal event",
    },
    {
      href: pb && !ok.photobox ? "#photobox" : "#mode",
      label: "Mode",
      ok: !pb || ok.photobox,
      text: !pb
        ? "Event · cetak gratis"
        : ok.photobox
          ? `Photobox · ${sold.size} layout dijual`
          : "Photobox: centang layout yang dijual",
    },
    {
      href: "#template",
      label: "Desain frame",
      ok: ok.template,
      text: main
        ? `${main.name}${designs.length > 1 ? ` + ${designs.length - 1} lainnya` : ""}`
        : "Pilih minimal satu desain",
    },
    {
      href: "#device",
      label: "Tampil di booth",
      ok: ok.device,
      text: allDevices
        ? v.devices.length
          ? `Semua booth (${v.devices.length})`
          : "Semua booth · belum ada yang terdaftar"
        : picked.size
          ? `${picked.size} booth dipilih`
          : "Centang minimal satu booth",
    },
  ];
  const missing = checks.filter((c) => !c.ok).length;

  const nav: { label: string; items: [string, string, Badge][] }[] = [
    {
      label: "Wajib",
      items: [
        ["informasi", "Informasi", ok.informasi ? "ok" : "wajib"],
        ["mode", "Mode", "ok"],
        ["template", "Desain frame", ok.template ? "ok" : "wajib"],
        ["device", "Tampil di booth", ok.device ? "ok" : "wajib"],
      ],
    },
    {
      label: "Tampilan booth",
      items: [
        ["layar-awal", "Layar awal", "opsional"],
        ["suara", "Suara", soundOn ? "ok" : "opsional"],
      ],
    },
    {
      label: "Sesi & pembayaran",
      items: [
        ["sesi", "Sesi", "ok"],
        ...(!pb
          ? [
              ["photo-stage", "Photo Stage", v.stageGroups.length ? "ok" : "opsional"] as [
                string,
                string,
                Badge,
              ],
            ]
          : []),
        ...(!pb
          ? [["guest-cam", "Guest Cam", gcOn ? "ok" : "opsional"] as [string, string, Badge]]
          : []),
        ...(pb
          ? [["photobox", "Photobox", ok.photobox ? "ok" : "wajib"] as [string, string, Badge]]
          : []),
      ],
    },
    {
      label: "Tamu & data",
      items: [
        ["halaman-tamu", "Halaman tamu", "opsional"],
        ["lead", "Lead", leadOn ? "ok" : "opsional"],
        ["masa-simpan", "Masa simpan", "ok"],
        ["link-klien", "Link klien", v.hasClientLink ? "ok" : "opsional"],
      ],
    },
  ];

  return (
    <form
      // onSubmit, bukan action=: React me-reset form setelah action, isian hilang kalau simpan ditolak.
      onSubmit={(e) => {
        e.preventDefault();
        // submitter: tombol "Salin & sesuaikan" (name=copy) ikut terkirim.
        const data = new FormData(e.currentTarget, (e.nativeEvent as SubmitEvent).submitter);
        startTransition(() => action(data));
      }}
      onChange={() => setDirty(true)}
      className="flex flex-col gap-6"
    >
      {/* Kesiapan event (#128): empat hal wajib, masing-masing lompat ke bagiannya. */}
      <section
        aria-labelledby="siap-title"
        className="rounded-2xl border-[1.5px] border-ink bg-white"
      >
        <header className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b-[1.5px] border-dashed border-ink px-6 py-4">
          <h2 id="siap-title" className="text-base font-extrabold tracking-[-0.02em]">
            Siap dipakai di booth
          </h2>
          <p className="text-[13px] text-text-2">
            {missing
              ? `${missing} hal wajib belum diisi. Lengkapi dulu, lalu Simpan.`
              : "Semua yang wajib sudah diisi. Sisanya opsional."}
          </p>
        </header>
        <ul className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4">
          {checks.map((c, i) => (
            <li
              key={c.label}
              // Garis antar-item: 1 kolom (atas), 2 kolom (kiri untuk kolom kanan, atas untuk baris 2), 4 kolom (kiri).
              className={`border-dashed border-ink ${i ? "max-sm:border-t-[1.5px] xl:border-l-[1.5px]" : ""} ${i % 2 ? "sm:max-xl:border-l-[1.5px]" : ""} ${i > 1 ? "sm:max-xl:border-t-[1.5px]" : ""}`}
            >
              <a
                href={c.href}
                className={`flex h-full flex-col gap-1.5 px-6 py-4 no-underline ${c.ok ? "" : "bg-peach/60 hover:bg-peach"}`}
              >
                <span className="text-xs font-bold text-text-2">{c.label}</span>
                <span className="flex items-start gap-2">
                  {c.ok ? (
                    <span className="mt-px flex size-5 flex-none items-center justify-center rounded-full bg-green text-white">
                      <Check aria-hidden strokeWidth={3.5} className="size-3" />
                    </span>
                  ) : (
                    <span className="flex-none rounded-full border-[1.5px] border-ink bg-white px-2 py-px text-[11px] font-extrabold">
                      Belum diisi
                    </span>
                  )}
                  <span className={`min-w-0 text-sm leading-snug ${c.ok ? "font-semibold" : ""}`}>
                    {c.ok && <span className="sr-only">Sudah: </span>}
                    {c.text}
                    {!c.ok && (
                      <ArrowRight
                        aria-hidden
                        className="ml-1 inline size-3.5 align-[-2px]"
                        strokeWidth={2}
                      />
                    )}
                  </span>
                </span>
              </a>
            </li>
          ))}
        </ul>
      </section>

      <div className="grid grid-cols-1 items-start gap-7 lg:grid-cols-[200px_minmax(0,1fr)]">
        <nav
          aria-label="Bagian pengaturan"
          className="flex flex-col gap-5 lg:sticky lg:top-6 max-lg:hidden"
        >
          {nav.map((g) => (
            <div key={g.label} className="flex flex-col gap-1">
              <span className="px-3 pb-1 text-[11px] font-extrabold tracking-[0.04em] text-text-2 uppercase">
                {g.label}
              </span>
              {g.items.map(([id, label, b]) => (
                <a
                  key={id}
                  href={`#${id}`}
                  aria-current={active === id ? "location" : undefined}
                  className={`flex items-center justify-between gap-2 rounded-[11px] border-[1.5px] px-3 py-2 text-[13px] font-bold no-underline ${active === id ? "border-ink bg-butter" : "border-transparent hover:border-ink hover:bg-white"}`}
                >
                  {label}
                  <BadgeMark b={b} />
                </a>
              ))}
            </div>
          ))}
        </nav>

        <div className="flex min-w-0 flex-col gap-5">
          {/* ── Wajib ───────────────────────────────────────────── */}
          <Section
            id="informasi"
            title="Informasi"
            badge={ok.informasi ? "ok" : "wajib"}
            desc="Nama dan tanggal muncul di layar booth dan di desain yang memakai teks nama/tanggal."
          >
            <Field id="name" label="Nama event" hint="Mis. Andi & Sari Wedding.">
              <input
                id="name"
                name="name"
                required
                maxLength={120}
                value={name}
                onChange={(e) => setName(e.target.value)}
                aria-describedby="name-hint"
                className={input}
              />
            </Field>
            <Field
              id="event_date"
              label="Tanggal"
              hint="Hari acara. Masa simpan foto dihitung dari sini."
            >
              <input
                id="event_date"
                name="event_date"
                type="date"
                required
                value={date}
                onChange={(e) => setDate(e.target.value)}
                aria-describedby="event_date-hint"
                className={input}
              />
            </Field>
            <Field
              id="location"
              label="Lokasi"
              optional
              hint="Gedung atau kota, untuk catatan tim."
            >
              <input
                id="location"
                name="location"
                maxLength={120}
                defaultValue={v.location}
                aria-describedby="location-hint"
                className={input}
              />
            </Field>
            <Field
              id="client_name"
              label="Nama klien"
              optional
              hint="Pemesan paket, mis. keluarga mempelai."
            >
              <input
                id="client_name"
                name="client_name"
                maxLength={120}
                defaultValue={v.client_name}
                aria-describedby="client_name-hint"
                className={input}
              />
            </Field>
            <Field
              id="package_name"
              label="Paket"
              optional
              hint="Nama paket yang dibeli klien, mis. Paket Wedding 3 Jam."
            >
              <input
                id="package_name"
                name="package_name"
                maxLength={80}
                defaultValue={v.package_name}
                aria-describedby="package_name-hint"
                className={input}
              />
            </Field>
            <Field
              id="ops_project_id"
              label="ID booking Tetra Ops"
              optional
              hint="Event yang tidak dibuat dari impor Ops bisa ditautkan di sini (mis. PRJ-20261004-9023), supaya galeri muncul di dashboard klien Ops."
            >
              <input
                id="ops_project_id"
                name="ops_project_id"
                maxLength={64}
                pattern="[A-Za-z0-9_\-]+"
                defaultValue={v.opsProjectId}
                placeholder="PRJ-…"
                aria-describedby="ops_project_id-hint"
                className={`${input} font-mono`}
              />
            </Field>
            <Field
              id="package_hours"
              label="Durasi paket"
              optional
              unit="jam"
              hint="Rekap event membandingkan lama event berjalan dengan durasi ini."
            >
              <input
                id="package_hours"
                name="package_hours"
                type="number"
                inputMode="decimal"
                min={0.5}
                max={48}
                step={0.5}
                defaultValue={v.package_hours}
                aria-describedby="package_hours-hint"
                className={input.replace("w-full", "w-28")}
              />
            </Field>
            <Field
              label="Jadwal"
              optional
              hint="Jam mulai dan selesai menurut booking. Rekap membandingkannya dengan jam nyata, booth tidak dibatasi."
            >
              <input
                name="scheduled_start"
                type="time"
                aria-label="Jadwal mulai"
                defaultValue={v.scheduled_start}
                className={input.replace("w-full", "w-32")}
              />
              <span className="text-[13px] text-text-2">sampai</span>
              <input
                name="scheduled_end"
                type="time"
                aria-label="Jadwal selesai"
                defaultValue={v.scheduled_end}
                className={input.replace("w-full", "w-32")}
              />
            </Field>
            <Field
              id="tagline"
              label="Teks kecil di layar booth"
              optional
              wide
              hint="Tampil kecil di atas nama event di layar awal, mis. The Wedding of. Kosong = tidak tampil. Maks. 40 karakter."
            >
              <input
                id="tagline"
                name="tagline"
                maxLength={40}
                defaultValue={v.tagline}
                aria-describedby="tagline-hint"
                className={input}
              />
            </Field>
          </Section>

          <Section
            id="mode"
            title="Mode"
            badge="ok"
            desc="Menentukan siapa yang membayar. Bisa diganti kapan saja sebelum event."
          >
            {MODES.map((m) => (
              <label
                key={m.v}
                className="flex cursor-pointer items-start gap-3 rounded-[14px] border-[1.5px] border-dashed border-ink p-4 has-checked:border-solid has-checked:bg-mint-soft"
              >
                <span className="mt-0.5">
                  <Box
                    radio
                    name="mode"
                    value={m.v}
                    checked={mode === m.v}
                    onChange={() => setMode(m.v)}
                  />
                </span>
                <span>
                  <span className="block text-sm font-bold">{m.t}</span>
                  <span className="mt-0.5 block text-xs leading-normal text-text-2">{m.d}</span>
                </span>
              </label>
            ))}
          </Section>

          <Section
            id="template"
            title="Desain frame"
            badge={ok.template ? "ok" : "wajib"}
            desc="Bingkai yang tercetak di setiap foto. Pilih 1–3 desain berukuran kertas sama; lebih dari satu = tamu memilih sebelum foto. Desain pertama = utama."
          >
            <DesignPicker
              options={forMode(v.designOptions, mode, (x) => designs.includes(x))}
              value={designs}
              onChange={(d) => {
                setDesigns(d);
                setDirty(true);
              }}
              vars={{ event_name: name, date: longDate(date) }}
              background={background}
              overlayUrl={v.hasOverlay ? `/admin/events/${eventId}/overlay` : undefined}
            />
            {opsPaper && main && main.paper !== opsPaper && (
              <OpsPaperWarning ops={opsPaper} paper={main.paper} />
            )}
            {pb && (
              <p className="rounded-[11px] border-[1.5px] border-dashed border-ink bg-sky px-3.5 py-2.5 text-xs leading-normal md:col-span-2">
                Mode Photobox menjual layout yang dicentang di bagian{" "}
                <a href="#photobox" className="font-bold underline">
                  Photobox
                </a>
                . Desain di sini tetap dipakai untuk pratinjau dan cadangan.
              </p>
            )}
            <div
              hidden={!!main?.template}
              className="grid grid-cols-1 gap-x-5 gap-y-5 rounded-[14px] border-[1.5px] border-dashed border-ink p-4 md:col-span-2 md:grid-cols-2"
            >
              <p className="text-[13px] font-bold md:col-span-2">
                Khusus desain preset utama
                <span className="block text-xs font-normal text-text-2">
                  Template dari menu Template sudah punya latar & overlay sendiri.
                </span>
              </p>
              <Field
                id="overlay"
                label="Overlay"
                optional
                hint="PNG transparan seukuran kanvas, ditempel di atas foto."
              >
                <FilePick id="overlay" name="overlay" accept="image/png" />
              </Field>
              <Field label="Warna latar" hint="Warna di belakang foto." def="putih">
                <ColorPicker
                  name="background"
                  label="Warna latar"
                  value={background}
                  onChange={(c) => {
                    setBackground(c);
                    setDirty(true);
                  }}
                  showHex
                />
              </Field>
              {v.hasOverlay && (
                <label className="flex items-center gap-2.5 text-[13px] font-bold">
                  <Box name="remove_overlay" /> Hapus overlay yang sekarang
                </label>
              )}
            </div>
          </Section>

          {/* Booth (#127): event tanpa booth tidak muncul di booth mana pun. */}
          <Section
            id="device"
            title="Tampil di booth"
            badge={ok.device ? "ok" : "wajib"}
            desc="Booth mana yang boleh membuka event ini. Crew memilih event dari daftar di booth."
          >
            {(
              [
                ["all", "Semua booth", "Termasuk booth yang baru disambungkan nanti."],
                ["pick", "Pilih booth", "Hanya booth yang dicentang di bawah."],
              ] as const
            ).map(([val, title, hint]) => (
              <label
                key={val}
                className="flex cursor-pointer items-start gap-3 rounded-[14px] border-[1.5px] border-dashed border-ink p-4 has-checked:border-solid has-checked:bg-mint-soft"
              >
                <span className="mt-0.5">
                  <Box
                    radio
                    name="deviceScope"
                    value={val}
                    checked={(val === "all") === allDevices}
                    onChange={() => setAllDevices(val === "all")}
                  />
                </span>
                <span>
                  <span className="block text-sm font-bold">{title}</span>
                  <span className="mt-0.5 block text-xs text-text-2">{hint}</span>
                </span>
              </label>
            ))}
            {!allDevices &&
              (v.devices.length ? (
                <fieldset className="grid grid-cols-1 gap-2.5 md:col-span-2 md:grid-cols-2">
                  <legend className="mb-2 text-[13px] font-bold">Booth yang dipakai</legend>
                  {v.devices.map((d) => (
                    <label
                      key={d.id}
                      className="flex cursor-pointer items-center gap-3 rounded-[11px] border-[1.5px] border-ink px-3.5 py-3 text-sm font-semibold has-checked:bg-mint-soft"
                    >
                      <Box
                        name="devices"
                        value={d.id}
                        checked={picked.has(d.id)}
                        onChange={(e) => setPicked((s) => toggle(s, d.id, e.target.checked))}
                      />
                      {d.name}
                    </label>
                  ))}
                </fieldset>
              ) : (
                <p className="text-[13px] text-text-2 md:col-span-2">
                  Belum ada booth. Daftarkan di menu{" "}
                  <Link href="/admin/devices" className="font-bold text-ink underline">
                    Device
                  </Link>
                  .
                </p>
              ))}
            {allDevices &&
              [...picked].map((id) => <input key={id} type="hidden" name="devices" value={id} />)}
          </Section>

          {/* ── Tampilan booth ──────────────────────────────────── */}
          <Section
            id="layar-awal"
            title="Layar awal"
            badge="opsional"
            desc="Layar yang tampil saat booth menunggu tamu. Tanpa diubah pun sudah siap pakai."
          >
            <Field
              id="attract_image"
              label="Gambar atau video latar"
              optional
              wide
              hint="JPG, PNG, GIF, MP4, atau WebM loop, 1920×1080, maks. 4 MB. Kosong = warna latar."
            >
              <FilePick
                id="attract_image"
                name="attract_image"
                accept="image/png,image/jpeg,image/gif,video/mp4,video/webm"
              />
            </Field>
            {v.attract.hasImage && (
              <label className="flex items-center gap-2.5 text-[13px] font-bold md:col-span-2">
                <Box name="remove_attract_image" /> Hapus latar yang sekarang
              </label>
            )}
            <Field label="Warna latar" hint="Dipakai kalau tidak ada gambar latar." def="krem">
              <ColorPicker
                name="attract_bg"
                label="Warna latar layar awal"
                value={attractBg}
                onChange={(c) => {
                  setAttractBg(c);
                  setDirty(true);
                }}
                showHex
              />
            </Field>
            <Field
              id="attract_cta"
              label="Teks tombol mulai"
              hint="Maks. 30 karakter."
              def="Sentuh untuk Mulai"
            >
              <input
                id="attract_cta"
                name="attract_cta"
                maxLength={30}
                placeholder="Sentuh untuk Mulai"
                defaultValue={v.attract.cta}
                aria-describedby="attract_cta-hint"
                className={input}
              />
            </Field>
            <Field
              id="attract_brand"
              label="Label brand"
              optional
              hint="Tampil di layar awal dan layar QR, mis. @tetraphoto."
            >
              <input
                id="attract_brand"
                name="attract_brand"
                maxLength={40}
                defaultValue={v.attract.brand}
                aria-describedby="attract_brand-hint"
                className={input}
              />
            </Field>
            <ToggleRow
              name="attract_samples"
              defaultChecked={v.attract.samples}
              title="Strip contoh bergerak"
              hint="Kolom contoh hasil foto di sisi layar. Bawaan: nyala."
            />
            <ToggleRow
              name="bumper"
              defaultChecked={v.bumper}
              title="Bumper Tetra"
              hint="Video pembuka singkat saat event dibuka di booth. Bawaan: nyala."
            />
          </Section>

          <Section
            id="suara"
            title="Suara"
            badge={soundOn ? "ok" : "opsional"}
            desc="Suara yang diputar booth selama sesi. Nyalakan dulu, lalu atur per momen kalau perlu."
          >
            <ToggleRow
              name="countdownSound"
              checked={soundOn}
              onChange={(e) => setSoundOn(e.target.checked)}
              title="Putar suara di booth"
              hint="Kalimat pemandu, hitung mundur, dan bunyi jepret. Bawaan: mati."
            />
            <div className="flex flex-col divide-y-[1.5px] divide-dashed divide-line-soft md:col-span-2">
              <p className="pb-2 text-xs text-text-2">
                {soundOn
                  ? "Matikan momen yang tidak perlu, atau ganti dengan file WAV/MP3 sendiri (maks. 1 MB)."
                  : "Suara sedang mati. Pengaturan di bawah berlaku setelah dinyalakan."}
              </p>
              {v.sounds.map((snd) => (
                <SoundRow key={snd.cue} {...snd} />
              ))}
            </div>
          </Section>

          {/* ── Sesi & pembayaran ───────────────────────────────── */}
          <Section
            id="sesi"
            title="Sesi"
            badge="ok"
            desc="Alur foto tamu di booth. Semua sudah terisi nilai bawaan; ubah kalau perlu."
          >
            <Field
              id="countdownSec"
              label="Hitung mundur"
              unit="detik"
              hint="Jeda sebelum tiap jepretan."
              def="3 detik"
            >
              {num("countdownSec", 1, 10)}
            </Field>
            <Field
              id="retakeMax"
              label="Retake per foto"
              unit="kali"
              hint="Berapa kali tamu boleh mengulang satu foto. 0 = tanpa tombol Ulangi."
              def="1 kali"
            >
              {num("retakeMax", 0, 5)}
            </Field>
            <Field
              id="maxPrints"
              label="Maks. cetak per sesi"
              unit="lembar"
              hint="Batas lembar yang bisa dipilih tamu dalam satu sesi."
              def="2 lembar"
            >
              {num("maxPrints", 1, 10)}
            </Field>
            <Field
              id="reviewTimeoutSec"
              label="Layar cek foto lanjut sendiri"
              unit="detik"
              hint="Kalau tamu diam, booth lanjut otomatis setelah waktu ini."
              def="20 detik"
            >
              {num("reviewTimeoutSec", 5, 120)}
            </Field>
            <Field
              id="qrScreenSec"
              label="Layar QR tampil"
              unit="detik"
              hint="Lama layar QR unduh foto sebelum kembali ke layar awal."
              def="45 detik"
            >
              {num("qrScreenSec", 10, 300)}
            </Field>
            <div className="hidden md:block" />
            <ToggleRow
              name="countdownVideo"
              defaultChecked={v.countdownVideo}
              title="Rekam video saat hitung mundur"
              hint="Muncul di tab Video di halaman tamu. Bawaan: mati."
            />
            <ToggleRow
              name="pairDifferent"
              defaultChecked={v.pairDifferent}
              title="Polaroid & 2R: kiri dan kanan foto berbeda"
              hint="Satu kertas 4R berisi dua potong. Nyala = tamu foto 2× lebih banyak, sisi kiri & kanan beda foto (GIF ikut jadi). Mati = kedua sisi sama. Tidak berlaku untuk desain 4R."
            />
            <fieldset className="flex flex-col gap-2 md:col-span-2">
              <legend className="mb-1.5 text-[13px] font-bold">
                Filter pilihan tamu <span className="font-semibold text-muted">· opsional</span>
              </legend>
              <div className="flex flex-wrap gap-2">
                {PHOTO_FILTERS.filter((f) => f.id !== "normal").map((f) => (
                  <label
                    key={f.id}
                    className="flex h-9 cursor-pointer items-center gap-2 rounded-full border-[1.5px] border-dashed border-ink bg-white px-3.5 text-[13px] font-bold has-checked:border-solid has-checked:bg-lavender has-focus-visible:outline-2"
                  >
                    <input
                      type="checkbox"
                      name={`filter_${f.id}`}
                      defaultChecked={v.filters.includes(f.id)}
                      className="sr-only"
                    />
                    {f.label}
                  </label>
                ))}
              </div>
              <p className="text-xs text-text-2">
                Tamu memilih filter setelah cek foto. Tidak ada yang dipilih = langkah filter
                dilewati.
              </p>
            </fieldset>
            <Field
              id="prompts_before"
              label="Kalimat sebelum foto"
              optional
              hint="Satu kalimat per baris, urut per foto; baris terakhir untuk foto terakhir. Kosong = kalimat bawaan."
            >
              <textarea
                id="prompts_before"
                name="prompts_before"
                rows={4}
                defaultValue={v.promptsBefore.join("\n")}
                placeholder={
                  "Siap-siap, gaya pertama!\nGaya kedua, lebih seru!\nOke gaya terakhir, cheers!"
                }
                aria-describedby="prompts_before-hint"
                className={textarea}
              />
            </Field>
            <Field
              id="prompts_after"
              label="Kalimat setelah foto"
              optional
              hint="Satu per baris, dipilih acak. Kosong = kalimat bawaan."
            >
              <textarea
                id="prompts_after"
                name="prompts_after"
                rows={4}
                defaultValue={v.promptsAfter.join("\n")}
                placeholder={"Mantap!\nKeren banget!\nCakep!\nWih, kalcer abis!"}
                aria-describedby="prompts_after-hint"
                className={textarea}
              />
            </Field>
          </Section>

          {/* Photo Stage (#181): daftar grup dari klien/WO; disembunyikan di photobox tapi tetap di form. */}
          <Section
            id="photo-stage"
            title="Photo Stage"
            hidden={pb}
            badge={v.stageGroups.length ? "ok" : "opsional"}
            desc="Daftar grup foto pelaminan dari klien atau WO. Muncul di laptop stage sebagai pilihan cepat nama rombongan."
          >
            <StageGroups
              initial={v.stageGroups.length ? v.stageGroups : v.opsStageGroups}
              fromOps={v.stageGroups.length ? 0 : v.opsStageGroups.length}
              onEdit={() => setDirty(true)}
            />
            <Field
              id="stageGapSec"
              label="Pisah otomatis bawaan"
              unit="detik"
              hint="Rombongan ditutup kalau kamera diam selama ini. Laptop stage yang sudah mengatur sendiri tetap memakai setelannya."
              def="45 detik"
            >
              {num("stageGapSec", 15, 180)}
            </Field>
            <Field
              id="stageTvSec"
              label="Lama tampil di TV"
              unit="detik"
              hint="Rombongan terbaru tampil di TV selama ini setelah jepretan terakhir, lalu TV kembali ke galeri."
              def="30 detik"
            >
              {num("stageTvSec", 10, 120)}
            </Field>
          </Section>

          {/* Guest Cam (#197, desain E14 #203): disembunyikan di photobox tapi tetap di form. */}
          <Section
            id="guest-cam"
            title="Guest Cam"
            hidden={pb}
            badge={gcOn ? "ok" : "opsional"}
            desc="Tamu memotret dari HP sendiri lewat QR. Fotonya masuk album yang sama dengan foto booth dan Photo Stage. Eksklusif klien Tetra."
          >
            <input type="hidden" name="gc_present" value="1" />
            <ToggleRow
              name="gc_enabled"
              checked={gcOn}
              onChange={(e) => setGcOn(e.target.checked)}
              title="Nyalakan Guest Cam"
              hint="Tamu mengisi nama + WhatsApp atau Instagram, lalu memotret dengan jatah foto. Bawaan: mati."
            />
            <div hidden={!gcOn} className="md:col-span-2">
              <div className="grid grid-cols-1 gap-x-5 gap-y-6 md:grid-cols-2">
                <Field
                  id="gc_shots"
                  label="Jatah foto per HP"
                  unit="foto"
                  hint="Tanpa hapus atau ulang: setiap jepretan memakai jatah. Maks. 50."
                  def="15"
                >
                  {num("gc_shots", 1, 50)}
                </Field>
                <Field
                  label="Batas tamu (tier paket)"
                  hint="Tamu = HP yang mengirim minimal 1 foto; satu nomor WA/IG dihitung satu. Tamu baru ditolak setelah lewat 10% dari batas."
                  def="tak terbatas"
                >
                  <Select
                    label="Batas tamu"
                    name="gc_max_guests"
                    className="w-full"
                    value={gcMax}
                    onChange={(v) => {
                      setGcMax(v);
                      setDirty(true);
                    }}
                    options={GUEST_TIER_OPTIONS}
                  />
                </Field>
                <div className="flex flex-col gap-1.5">
                  <span className="text-[13px] font-bold">Kamera di HP tamu</span>
                  <div className="flex flex-wrap gap-1.5">
                    {GUEST_PRESETS.map((p) => (
                      <span
                        key={p.id}
                        className="flex h-8 items-center gap-1.5 rounded-full border-[1.5px] border-ink bg-white px-3 text-xs font-bold"
                      >
                        <span
                          className="size-3 rounded-full border border-ink"
                          style={{ background: p.body }}
                        />
                        {p.name}
                      </span>
                    ))}
                  </div>
                  <p className="text-xs text-text-2">
                    Preset film gaya kamera retro (grain, vignette, stempel tanggal). Tamu memilih
                    sendiri di kamera.
                  </p>
                </div>
                <GcChoice
                  legend="Kapan foto tamu terlihat"
                  name="gc_reveal"
                  value={v.guestCam.reveal}
                  options={[
                    [
                      "live",
                      "Langsung",
                      "Tamu melihat fotonya dan album acara saat itu juga. Foto ikut tampil di TV.",
                    ],
                    [
                      "after",
                      "Setelah acara",
                      "Gaya kamera sekali pakai. Tamu hanya melihat hitungan; semua foto terbuka saat acara dihentikan atau lewat tombol di dashboard.",
                    ],
                  ]}
                />
                <GcChoice
                  legend="Moderasi"
                  name="gc_approval"
                  value={v.guestCam.approval}
                  options={[
                    [
                      "auto",
                      "Tampil otomatis",
                      "Foto langsung masuk album dan TV. Kamu tetap bisa menyembunyikannya kapan saja.",
                    ],
                    [
                      "manual",
                      "Perlu disetujui",
                      "Foto masuk antrean di dashboard dulu. Tamu tetap melihat fotonya sendiri dengan label “Ditinjau”.",
                    ],
                  ]}
                />
                <label className="flex cursor-pointer items-center justify-between gap-4 rounded-[14px] border-[1.5px] border-ink bg-white px-4 py-3.5">
                  <span>
                    <span className="block text-sm font-extrabold">Ucapan suara</span>
                    <span className="mt-0.5 block text-xs leading-normal text-text-2">
                      Maks. 30 detik, satu per tamu. Muncul di tab Ucapan galeri.
                    </span>
                  </span>
                  <Switch name="gc_voice" defaultChecked={v.guestCam.voice} />
                </label>
                <label className="flex cursor-pointer items-center justify-between gap-4 rounded-[14px] border-[1.5px] border-ink bg-white px-4 py-3.5">
                  <span>
                    <span className="block text-sm font-extrabold">Strip virtual</span>
                    <span className="mt-0.5 block text-xs leading-normal text-text-2">
                      Pakai desain frame event · {main ? `${main.name}` : "desain utama"}. Maks. 5
                      strip per tamu.
                    </span>
                  </span>
                  <Switch name="gc_strip" defaultChecked={v.guestCam.strip} />
                </label>
                <label className="flex cursor-pointer items-center justify-between gap-4 rounded-[14px] border-[1.5px] border-ink bg-white px-4 py-3.5">
                  <span>
                    <span className="block text-sm font-extrabold">Cetak di lokasi (add-on)</span>
                    <span className="mt-0.5 block text-xs leading-normal text-text-2">
                      Tiap tamu boleh mencetak 1 frame lewat printer booth, mengikuti kertas &
                      desain booth. Butuh Strip virtual.
                    </span>
                  </span>
                  <Switch name="gc_print" defaultChecked={v.guestCam.print} />
                </label>
                <Field
                  id="gc_consent"
                  label="Persetujuan data Guest Cam"
                  wide
                  hint="Tamu wajib mencentang ini sebelum motret (UU PDP). Tamu mengisi nama + WhatsApp atau Instagram, minimal salah satu."
                >
                  <textarea
                    id="gc_consent"
                    name="gc_consent"
                    maxLength={600}
                    rows={3}
                    defaultValue={v.guestCam.consentText}
                    onInput={(e) => setGcLen(e.currentTarget.value.length)}
                    aria-describedby="gc_consent-hint"
                    className={textarea}
                  />
                  <span className="self-start font-mono text-[11px] text-text-2">{gcLen}/600</span>
                </Field>
                <div className="md:col-span-2">{guestLinks}</div>
              </div>
            </div>
          </Section>

          {/* Disembunyikan di Mode Event, tapi tetap di form: harga photobox tidak hilang saat simpan. */}
          <Section
            id="photobox"
            title="Photobox"
            hidden={!pb}
            badge={ok.photobox ? "ok" : "wajib"}
            desc="Tamu bayar lewat QRIS sebelum foto. Centang layout yang dijual dan isi harganya; harga sudah termasuk 1 lembar cetak."
          >
            <fieldset className="grid grid-cols-1 gap-2.5 md:col-span-2 xl:grid-cols-2">
              <legend className="mb-2 text-[13px] font-bold">Layout yang dijual</legend>
              {[
                ...EVENT_PRESETS.map((id) => ({
                  id: id as string,
                  name: LAYOUT_PRESETS[id].name,
                  info: LAYOUT_PRESETS[id].info,
                })),
                // Template photobox saja (#160), kecuali yang sudah dijual event ini.
                ...v.templates
                  .filter((t) => t.mode === "photobox" || sold.has(`tpl-${t.id}`))
                  .map((t) => ({
                    id: `tpl-${t.id}`,
                    name: t.name,
                    info: `${paperLabel(t.paper as LayoutPaper)} · template`,
                  })),
              ].map((p) => (
                <div
                  key={p.id}
                  className={`flex items-center gap-3 rounded-[11px] border-[1.5px] border-ink px-3.5 py-2.5 ${sold.has(p.id) ? "bg-mint-soft" : "border-dashed"}`}
                >
                  <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-3 text-sm font-semibold">
                    <Box
                      name={`pb_${p.id}`}
                      checked={sold.has(p.id)}
                      onChange={(e) => setSold((s) => toggle(s, p.id, e.target.checked))}
                    />
                    <span className="flex min-w-0 flex-col">
                      <span className="truncate">{p.name}</span>
                      <span className="font-mono text-xs text-text-2">{p.info}</span>
                    </span>
                  </label>
                  <span className="shrink-0 text-xs font-semibold text-text-2">Rp</span>
                  <input
                    name={`price_${p.id}`}
                    type="number"
                    min={1500}
                    step={500}
                    aria-label={`Harga ${p.name}`}
                    defaultValue={v.prices[p.id] ?? 25000}
                    className={`${input.replace("w-full", "")} w-28 shrink-0 font-mono`}
                  />
                </div>
              ))}
            </fieldset>
            <Field
              id="extraPrintPrice"
              label="Harga lembar tambahan"
              unit="Rp / lembar"
              hint="Dibayar tamu untuk setiap cetakan setelah lembar pertama."
              def="Rp 10.000"
            >
              {num("extraPrintPrice", 0, 1_000_000)}
            </Field>
            <Field
              id="sessionSec"
              label="Timer sesi setelah bayar"
              unit="detik"
              hint="Waktu tamu untuk foto sampai selesai setelah pembayaran masuk."
              def="180 detik"
            >
              {num("sessionSec", 60, 900)}
            </Field>
          </Section>

          {/* ── Tamu & data ─────────────────────────────────────── */}
          <Section
            id="halaman-tamu"
            title="Halaman tamu"
            badge="opsional"
            desc="Halaman yang dibuka tamu dari QR untuk menyimpan foto."
          >
            <Field
              id="logo"
              label="Logo atau monogram"
              optional
              hint="Tampil di header halaman tamu. PNG, JPG, atau WebP, maks. 1 MB."
            >
              <FilePick id="logo" name="logo" accept="image/png,image/jpeg,image/webp" />
            </Field>
            <Field label="Warna header" hint="Latar bagian atas halaman tamu." def="krem">
              <ColorPicker
                name="guest_color"
                label="Warna header"
                value={guestColor}
                onChange={(c) => {
                  setGuestColor(c);
                  setDirty(true);
                }}
                showHex
              />
            </Field>
            {v.hasLogo && (
              <label className="flex items-center gap-2.5 text-[13px] font-bold md:col-span-2">
                <Box name="remove_logo" /> Hapus logo yang sekarang
              </label>
            )}
            <Field
              id="client_instagram"
              label="Instagram klien"
              optional
              wide
              hint="IG pengantin, perusahaan/acara, atau WO/EO; pisahkan dengan spasi. Tamu diarahkan untuk follow dan tag akun ini (bersama IG Tetra) saat upload foto ke story. Terisi otomatis dari booking Tetra Ops."
            >
              <input
                id="client_instagram"
                name="client_instagram"
                defaultValue={v.clientInstagram.map((h) => `@${h}`).join(" ")}
                placeholder="@dimas @rina @weddingorganizer"
                aria-describedby="client_instagram-hint"
                className={input}
              />
            </Field>
            <input type="hidden" name="promo_card" value="off" />
            <ToggleRow
              name="promo_card"
              value="on"
              defaultChecked={v.promoCard}
              title="Kartu promosi di halaman tamu"
              hint="Follow & tag Instagram, ulasan Google, dan “Mau pakai di acaramu?”. Isinya diatur di menu Promosi. Matikan kalau klien tidak mau ada promosi di galerinya."
            />
          </Section>

          <Section
            id="lead"
            title="Lead capture"
            badge={leadOn ? "ok" : "opsional"}
            desc="Minta data tamu (nama, WhatsApp, email) di halaman tamu sebelum atau saat melihat foto."
          >
            <ToggleRow
              name="lead_enabled"
              checked={leadOn}
              onChange={(e) => setLeadOn(e.target.checked)}
              title="Minta data tamu"
              hint="Tamu mengisi form singkat di halaman tamu. Bawaan: mati."
            />
            <div hidden={!leadOn} className="md:col-span-2">
              <div className="grid grid-cols-1 gap-x-5 gap-y-5 md:grid-cols-2">
                <fieldset className="flex flex-col gap-2.5 text-sm">
                  <legend className="mb-2 text-[13px] font-bold">Cara meminta</legend>
                  {(
                    [
                      ["gate", "Wajib: foto tampil setelah form diisi"],
                      ["optional", "Opsional: tamu bisa melewati"],
                    ] as const
                  ).map(([m, l]) => (
                    <label key={m} className="flex cursor-pointer items-center gap-2.5">
                      <Box
                        radio
                        name="lead_mode"
                        value={m}
                        defaultChecked={(v.lead?.mode ?? "optional") === m}
                      />
                      {l}
                    </label>
                  ))}
                </fieldset>
                <fieldset className="flex flex-col gap-2.5 text-sm">
                  <legend className="mb-2 text-[13px] font-bold">Data yang diminta</legend>
                  {(
                    [
                      ["name", "Nama"],
                      ["whatsapp", "Nomor WhatsApp"],
                      ["email", "Email"],
                    ] as const
                  ).map(([k, l]) => (
                    <label key={k} className="flex cursor-pointer items-center gap-2.5">
                      <Box
                        name={`lead_f_${k}`}
                        defaultChecked={v.lead?.fields ? v.lead.fields.includes(k) : k !== "email"}
                      />
                      {l}
                    </label>
                  ))}
                  <span className="text-xs text-text-2">Yang dicentang wajib diisi tamu.</span>
                </fieldset>
                <Field
                  id="consent_text"
                  label="Teks persetujuan (UU PDP)"
                  wide
                  hint="Sebut siapa yang memakai data dan untuk apa. Wajib diisi kalau lead capture nyala."
                >
                  <textarea
                    id="consent_text"
                    name="consent_text"
                    maxLength={600}
                    rows={3}
                    defaultValue={v.lead?.consentText ?? ""}
                    aria-describedby="consent_text-hint"
                    className={textarea}
                  />
                </Field>
              </div>
            </div>
          </Section>

          <Section
            id="masa-simpan"
            title="Masa simpan foto"
            badge="ok"
            desc="Dihitung dari tanggal event. Setelah lewat, link tidak bisa dibuka dan foto dihapus dari cloud."
          >
            <Field
              id="guest_days"
              label="Halaman tamu"
              unit="hari setelah event"
              hint="Berapa lama tamu bisa membuka fotonya."
              def="30 hari"
            >
              {num("guest_days", 1, 365)}
            </Field>
            <Field
              id="client_days"
              label="Galeri klien"
              unit="hari setelah event"
              hint="Berapa lama klien bisa mengunduh semua foto."
              def="90 hari"
            >
              {num("client_days", 1, 365)}
            </Field>
          </Section>

          <Section
            id="link-klien"
            title="Link klien"
            badge={v.hasClientLink ? "ok" : "opsional"}
            desc="Galeri semua foto untuk klien dan slideshow live untuk layar di venue. Tersimpan langsung, tanpa tombol Simpan."
          >
            <div className="md:col-span-2">{links}</div>
          </Section>

          {/* Bilah simpan lengket (#128): selalu terlihat, tanda ada perubahan belum disimpan. */}
          <div className="layered sticky bottom-4 z-20 flex flex-wrap items-center gap-x-5 gap-y-2 rounded-2xl border-[1.5px] border-ink bg-white px-5 py-3 [--lb:1.5px] [--lx:4px]">
            {dirty ? (
              <span className="flex-none rounded-full border-[1.5px] border-ink bg-peach px-3 py-1 text-xs font-extrabold">
                Ada perubahan belum disimpan
              </span>
            ) : (
              <span className="flex-none text-xs font-semibold text-text-2">
                Tidak ada perubahan
              </span>
            )}
            <p
              role="status"
              className={`min-w-0 flex-1 text-[13px] leading-snug ${r && !r.ok ? "font-bold" : "text-text-2"} ${r ? "max-sm:order-last max-sm:basis-full" : "max-sm:hidden"}`}
            >
              {r && !r.ok && (
                <span className="mr-2 rounded-md border-[1.5px] border-ink bg-coral px-1.5 py-px text-[11px] font-extrabold">
                  Gagal
                </span>
              )}
              {r?.message ??
                "Booth menerima pengaturan baru saat online (atau lewat tombol Ambil event terbaru di mode crew)."}
            </p>
            <button
              type="submit"
              disabled={pending}
              className="pressable layered ml-auto h-11 flex-none rounded-xl border-[1.5px] border-ink bg-butter px-8 text-sm font-extrabold [--lb:1.5px] [--lx:4px] disabled:opacity-50"
            >
              {pending ? "Menyimpan…" : "Simpan"}
            </button>
          </div>
        </div>
      </div>
    </form>
  );
}
