"use client";
import { type LayoutPaper, paperLabel } from "@tetra/shared";
import { ArrowLeft, ArrowRight, Check, ExternalLink } from "lucide-react";
import Link from "next/link";
import { type ReactNode, startTransition, useActionState, useState } from "react";
import { type DesignOption, DesignPicker } from "../[id]/settings/DesignPicker";
import { DesignPreview } from "../[id]/settings/DesignPreview";
import { Box, longDate } from "../[id]/settings/SettingsForm";
import { useLeaveGuard } from "../[id]/settings/useLeaveGuard";
import { type CreateResult, createEventWizard } from "../actions";

type Device = { id: string; name: string; status: "online" | "offline" | "unpaired" };
type Mode = "event" | "photobox";

const STEPS = ["Info", "Mode", "Desain", "Booth", "Selesai"] as const;
const MIN_PRICE = 1500;
/** Latar preset bawaan event baru (DEFAULT_TEMPLATE). */
const BG = "#ffffff";

const input =
  "h-11 w-full rounded-xl border-[1.5px] border-ink bg-white px-3.5 text-sm aria-invalid:border-coral-strong aria-invalid:bg-coral/40";
const primary =
  "pressable layered inline-flex h-11 items-center justify-center gap-2 rounded-xl border-[1.5px] border-ink bg-butter px-6 text-sm font-extrabold no-underline [--lb:1.5px] [--lx:4px] disabled:opacity-50";
const secondary =
  "inline-flex h-11 items-center justify-center gap-2 rounded-xl border-[1.5px] border-ink bg-white px-5 text-sm font-bold no-underline hover:bg-mint-soft";
const rupiah = (n: number) => `Rp ${n.toLocaleString("id-ID")}`;

/** Kertas: ukuran potong dalam inci (proporsi asli), jumlah per cetak, dan penjelasan untuk orang awam. */
const PAPERS: {
  id: LayoutPaper;
  title: string;
  size: string;
  piece: [number, number];
  count: number;
  slots: [number, number, number, number][];
  gets: string;
  use: string;
}[] = [
  {
    id: "2x6x2",
    title: "Strip 2R",
    size: "2×6 inci · 5×15 cm",
    piece: [2, 6],
    count: 2,
    slots: [
      [0.1, 0.07, 0.8, 0.26],
      [0.1, 0.36, 0.8, 0.26],
      [0.1, 0.65, 0.8, 0.26],
    ],
    gets: "2 strip kembar per cetak (satu lembar 4R dipotong printer).",
    use: "Paling umum di pernikahan; strip bisa dibagi berdua.",
  },
  {
    id: "4R",
    title: "Foto 4R",
    size: "4×6 inci · 10×15 cm",
    piece: [4, 6],
    count: 1,
    slots: [
      [0.06, 0.05, 0.42, 0.38],
      [0.52, 0.05, 0.42, 0.38],
      [0.06, 0.46, 0.42, 0.38],
      [0.52, 0.46, 0.42, 0.38],
    ],
    gets: "1 lembar foto besar per cetak.",
    use: "Ruang paling luas untuk 1–4 foto, logo, dan teks.",
  },
  {
    id: "3x4x2",
    title: "Polaroid",
    size: "3×4 inci · 7,5×10 cm",
    piece: [3, 4],
    count: 2,
    slots: [[0.08, 0.06, 0.84, 0.66]],
    gets: "2 kartu gaya polaroid per cetak (kertas berperforasi, disobek crew).",
    use: "Kesan retro; satu foto besar dengan bingkai bawah tebal.",
  },
];
/** Skala pratinjau kertas: px per inci, sama untuk semua kartu supaya ukurannya bisa dibandingkan. */
const PX = 20;

const MODES: { v: Mode; t: string; d: string; use: string[] }[] = [
  {
    v: "event",
    t: "Event",
    d: "Klien sudah bayar paket. Tamu foto dan cetak gratis.",
    use: [
      "Pernikahan, ulang tahun, acara kantor",
      "Desain frame dari klien atau dibuat khusus",
      "Tamu bisa memilih 1–3 desain",
    ],
  },
  {
    v: "photobox",
    t: "Photobox",
    d: "Tamu bayar sendiri lewat QRIS sebelum foto.",
    use: [
      "Booth di mal, bazar, atau tempat umum",
      "Tiap layout punya harga sendiri",
      "Lembar tambahan dibayar per lembar",
    ],
  },
];

const STATUS: Record<Device["status"], [string, string]> = {
  online: ["Online", "bg-mint-soft"],
  offline: ["Offline", "bg-neutral"],
  unpaired: ["Belum tersambung", "bg-peach"],
};

/** Kunci layout photobox (sama dengan Pengaturan): id preset atau `tpl-<layoutId>`. */
const pbKey = (value: string) => value.replace(/^tpl:/, "tpl-");

/**
 * Wizard Buat event (DECISIONS #144): lima langkah dengan validasi per langkah; isian disimpan di state
 * (Kembali tidak menghapus), event baru dibuat di langkah terakhir lewat jalur simpan Pengaturan.
 */
export function EventWizard({
  designOptions,
  devices,
}: {
  designOptions: DesignOption[];
  devices: Device[];
}) {
  const [step, setStep] = useState(1);
  const [name, setName] = useState("");
  const [date, setDate] = useState("");
  const [location, setLocation] = useState("");
  const [tagline, setTagline] = useState("");
  const [mode, setMode] = useState<Mode | null>(null);
  const [paper, setPaper] = useState<LayoutPaper | null>(null);
  const [designs, setDesigns] = useState<string[]>([]);
  const [copy, setCopy] = useState<string | null>(null);
  const [sold, setSold] = useState<Record<string, number>>({});
  const [extraPrice, setExtraPrice] = useState(10000);
  const [allDevices, setAllDevices] = useState(true);
  const [picked, setPicked] = useState<string[]>([]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [r, action, pending] = useActionState<CreateResult, FormData>(createEventWizard, null);
  const done = r?.ok ? r : null;
  const dirty = !done && (step > 1 || !!(name || date || location || tagline));
  useLeaveGuard(dirty, "Event belum dibuat. Isian di wizard akan hilang. Tinggalkan halaman ini?");

  const byValue = new Map(designOptions.map((o) => [o.value, o]));
  const chosen = designs.flatMap((v) => byValue.get(v) ?? []);
  const basics = chosen.filter((o) => o.copyOnly);
  // Bentuk dasar hanya bisa dipakai sebagai salinan: salinan otomatis jatuh padanya.
  const copyValue = basics[0]?.value ?? copy;
  const sellable = designOptions.filter((o) => !o.copyOnly);
  const soldKeys = Object.keys(sold);
  const vars = { event_name: name.trim() || "Nama Event", date: longDate(date) };

  const check = (s: number): Record<string, string> => {
    const e: Record<string, string> = {};
    if (s === 1) {
      if (!name.trim()) e.name = "Isi nama event.";
      if (!date) e.date = "Pilih tanggal event.";
    } else if (s === 2) {
      if (!mode) e.mode = "Pilih salah satu mode.";
    } else if (s === 3 && mode === "event") {
      if (!paper) e.paper = "Pilih ukuran kertas dulu.";
      else if (!designs.length) e.designs = "Tambah minimal satu desain frame.";
      else if (basics.length > 1)
        e.designs =
          "Bentuk dasar hanya bisa satu per event (disalin jadi template). Lepas salah satu.";
    } else if (s === 3 && mode === "photobox") {
      if (!soldKeys.length) e.sold = "Centang minimal satu layout yang dijual.";
      else if (
        Object.values(sold).some((p) => !Number.isInteger(p) || p < MIN_PRICE || p > 10_000_000)
      )
        e.sold = `Harga tiap layout minimal ${rupiah(MIN_PRICE)}.`;
      else if (!Number.isInteger(extraPrice) || extraPrice < 0 || extraPrice > 1_000_000)
        e.extra = "Harga lembar tambahan 0 sampai Rp 1.000.000.";
    } else if (s === 4) {
      if (!allDevices && !picked.length)
        e.devices = "Centang minimal satu booth, atau pilih Semua booth.";
    }
    return e;
  };

  const go = (to: number) => {
    setErrors({});
    setStep(to);
    window.scrollTo({ top: 0 });
  };
  const next = () => {
    const e = check(step);
    setErrors(e);
    if (Object.keys(e).length) return;
    if (step < 5) return go(step + 1);
    const fd = new FormData();
    fd.set("name", name.trim());
    fd.set("event_date", date);
    fd.set("location", location.trim());
    fd.set("tagline", tagline.trim());
    fd.set("mode", mode ?? "event");
    fd.set("deviceScope", allDevices ? "all" : "pick");
    for (const id of picked) fd.append("devices", id);
    if (mode === "photobox") {
      // Desain frame = layout pertama yang dijual (pratinjau & cadangan, seperti Pengaturan).
      const first = sellable.find((o) => pbKey(o.value) in sold);
      if (first) fd.set("design", first.value);
      // Urutan jual = urutan daftar layout.
      for (const o of sellable) {
        const k = pbKey(o.value);
        if (!(k in sold)) continue;
        fd.set(`pb_${k}`, "on");
        fd.set(`price_${k}`, String(sold[k]));
      }
      fd.set("extraPrintPrice", String(extraPrice));
    } else {
      for (const d of designs) fd.append("design", d);
      if (copyValue) fd.set("copy", copyValue);
    }
    startTransition(() => action(fd));
  };

  const clear = (k: string) => setErrors(({ [k]: _, ...rest }) => rest);
  const err = (k: string) =>
    errors[k] ? <ErrorText id={`${k}-err`}>{errors[k]}</ErrorText> : null;
  const invalid = (k: string) =>
    errors[k] ? { "aria-invalid": true as const, "aria-describedby": `${k}-err` } : {};

  const choosePaper = (p: LayoutPaper) => {
    if (p === paper) return;
    setPaper(p);
    setDesigns([]);
    setCopy(null);
    setErrors({});
  };

  const titles: Record<number, [string, ReactNode]> = {
    1: ["Info event", "Nama dan tanggal tampil di layar booth dan di desain yang memakai teks."],
    2: ["Siapa yang membayar?", "Bisa diganti nanti di Pengaturan, selama event belum berjalan."],
    3:
      mode === "photobox"
        ? [
            "Layout & harga",
            "Centang layout yang dijual ke tamu dan isi harganya. Harga sudah termasuk 1 lembar cetak.",
          ]
        : [
            "Ukuran & desain frame",
            "Pilih ukuran kertas dulu, lalu 1–3 desain. Lebih dari satu = tamu memilih sebelum foto.",
          ],
    4: ["Booth mana yang dipakai?", "Event hanya muncul di booth yang boleh membukanya."],
    5: done
      ? ["Event siap", "Event sudah tersimpan dan dikirim ke booth saat booth online."]
      : ["Ringkasan", "Periksa sekali lagi. Semua masih bisa diubah nanti di Pengaturan."],
  };
  const [title, desc] = titles[step] ?? ["", ""];

  return (
    <form
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        if (!pending && !done) next();
      }}
      className="mx-auto flex w-full max-w-[1040px] flex-col gap-6"
    >
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <Link href="/admin" className="text-[13px] font-semibold text-text-2 no-underline">
            Event ›
          </Link>
          <h1 className="mt-1 text-[28px] font-extrabold tracking-[-0.03em]">Buat event</h1>
        </div>
        {!done && (
          <Link href="/admin" className={secondary}>
            Batal
          </Link>
        )}
      </header>

      {/* Progres: langkah yang sudah lewat bisa diklik untuk kembali. */}
      <nav aria-label="Langkah buat event">
        <ol className="grid grid-cols-5 gap-2">
          {STEPS.map((label, i) => {
            const n = i + 1;
            const state = n < step || done ? "done" : n === step ? "now" : "next";
            const body = (
              <>
                <span
                  className={`flex size-7 flex-none items-center justify-center rounded-full border-[1.5px] border-ink text-xs font-extrabold ${state === "done" ? "bg-green text-white" : state === "now" ? "bg-ink text-white" : "bg-white"}`}
                >
                  {state === "done" ? (
                    <Check aria-hidden strokeWidth={3.5} className="size-3.5" />
                  ) : (
                    n
                  )}
                </span>
                <span className="truncate">{label}</span>
              </>
            );
            const cls = `flex h-12 w-full items-center gap-2.5 rounded-xl border-[1.5px] px-3 text-[13px] font-bold ${state === "now" ? "border-ink bg-butter" : state === "done" ? "border-ink bg-white" : "border-dashed border-ink/40 bg-transparent text-text-2"}`;
            return (
              <li key={label} aria-current={state === "now" ? "step" : undefined}>
                {state === "done" && !done ? (
                  <button
                    type="button"
                    onClick={() => go(n)}
                    className={`${cls} hover:bg-mint-soft`}
                  >
                    {body}
                  </button>
                ) : (
                  <div className={cls}>{body}</div>
                )}
              </li>
            );
          })}
        </ol>
      </nav>

      <section
        aria-labelledby="step-title"
        className="rounded-2xl border-[1.5px] border-ink bg-white"
      >
        <header className="border-b-[1.5px] border-dashed border-ink px-7 py-5">
          <p className="text-xs font-extrabold tracking-[0.04em] text-text-2 uppercase">
            Langkah {step} dari {STEPS.length}
          </p>
          <h2 id="step-title" className="mt-1 text-xl font-extrabold tracking-[-0.02em]">
            {title}
          </h2>
          <p className="mt-1 max-w-[64ch] text-sm leading-normal text-text-2">{desc}</p>
        </header>

        <div className="px-7 py-6">
          {step === 1 && (
            <div className="grid grid-cols-1 gap-x-6 gap-y-5 md:grid-cols-2">
              <Field id="name" label="Nama event" error={errors.name}>
                <input
                  id="name"
                  maxLength={120}
                  value={name}
                  onChange={(e) => {
                    setName(e.target.value);
                    clear("name");
                  }}
                  placeholder="Mis. Andi & Sari Wedding"
                  className={input}
                  {...invalid("name")}
                />
              </Field>
              <Field id="date" label="Tanggal event" error={errors.date}>
                <input
                  id="date"
                  type="date"
                  value={date}
                  onChange={(e) => {
                    setDate(e.target.value);
                    clear("date");
                  }}
                  className={input}
                  {...invalid("date")}
                />
              </Field>
              <Field
                id="location"
                label="Lokasi"
                optional
                hint="Catatan untuk tim, tidak tampil ke tamu."
              >
                <input
                  id="location"
                  maxLength={120}
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  placeholder="Gedung atau kota"
                  aria-describedby="location-hint"
                  className={input}
                />
              </Field>
              <Field
                id="tagline"
                label="Teks kecil di layar booth"
                optional
                hint="Tampil kecil di atas nama event di layar awal. Maks. 40 karakter."
              >
                <input
                  id="tagline"
                  maxLength={40}
                  value={tagline}
                  onChange={(e) => setTagline(e.target.value)}
                  placeholder="Mis. The Wedding of"
                  aria-describedby="tagline-hint"
                  className={input}
                />
              </Field>
            </div>
          )}

          {step === 2 && (
            <fieldset className="flex flex-col gap-3">
              <legend className="sr-only">Mode event</legend>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                {MODES.map((m) => (
                  <label
                    key={m.v}
                    className="flex cursor-pointer flex-col gap-4 rounded-2xl border-[1.5px] border-dashed border-ink p-5 has-checked:border-solid has-checked:bg-mint-soft has-focus-visible:outline-2 has-focus-visible:outline-offset-2"
                  >
                    <span className="flex items-start gap-3">
                      <span className="mt-0.5">
                        <Box
                          radio
                          name="mode"
                          value={m.v}
                          checked={mode === m.v}
                          onChange={() => {
                            setMode(m.v);
                            setErrors({});
                          }}
                        />
                      </span>
                      <span>
                        <span className="block text-lg font-extrabold tracking-[-0.02em]">
                          {m.t}
                        </span>
                        <span className="mt-0.5 block text-sm text-text-3">{m.d}</span>
                      </span>
                    </span>
                    <span className="flex flex-col gap-2 border-t-[1.5px] border-dashed border-ink/40 pt-3.5">
                      <span className="text-xs font-extrabold text-text-2">Pakai ini kalau…</span>
                      {m.use.map((u) => (
                        <span key={u} className="flex items-start gap-2 text-sm">
                          <Check aria-hidden strokeWidth={3} className="mt-0.5 size-4 flex-none" />
                          {u}
                        </span>
                      ))}
                    </span>
                  </label>
                ))}
              </div>
              {err("mode")}
            </fieldset>
          )}

          {step === 3 && mode === "event" && (
            <div className="flex flex-col gap-7">
              <fieldset className="flex flex-col gap-3">
                <legend className="mb-3 text-[15px] font-extrabold">1. Ukuran kertas</legend>
                <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                  {PAPERS.map((p) => {
                    const n = designOptions.filter((o) => o.paper === p.id && !o.copyOnly).length;
                    return (
                      <label
                        key={p.id}
                        className="flex cursor-pointer flex-col overflow-hidden rounded-2xl border-[1.5px] border-dashed border-ink has-checked:border-solid has-checked:bg-mint-soft has-focus-visible:outline-2 has-focus-visible:outline-offset-2"
                      >
                        <span className="flex h-[156px] items-end justify-center gap-2 border-b-[1.5px] border-dashed border-ink bg-paper px-4 pb-4">
                          {Array.from({ length: p.count }, (_, i) => (
                            <span
                              // biome-ignore lint/suspicious/noArrayIndexKey: potongan kembar, urutan tetap
                              key={i}
                              aria-hidden
                              style={{ width: p.piece[0] * PX, height: p.piece[1] * PX }}
                              className="relative block rounded-[3px] border-[1.5px] border-ink bg-white"
                            >
                              {p.slots.map(([x, y, w, h]) => (
                                <span
                                  key={`${x}-${y}`}
                                  style={{
                                    left: `${x * 100}%`,
                                    top: `${y * 100}%`,
                                    width: `${w * 100}%`,
                                    height: `${h * 100}%`,
                                  }}
                                  className="absolute rounded-[2px] bg-[#c9c5bd]"
                                />
                              ))}
                            </span>
                          ))}
                        </span>
                        <span className="flex flex-1 flex-col gap-2 p-4">
                          <span className="flex items-center gap-2.5">
                            <Box
                              radio
                              name="paper"
                              value={p.id}
                              checked={paper === p.id}
                              onChange={() => choosePaper(p.id)}
                            />
                            <span className="text-base font-extrabold">{p.title}</span>
                          </span>
                          <span className="font-mono text-xs text-text-2">{p.size}</span>
                          <span className="text-[13px] leading-snug">
                            <b>Tamu dapat:</b> {p.gets}
                          </span>
                          <span className="text-[13px] leading-snug text-text-2">{p.use}</span>
                          <span className="mt-auto pt-1 text-xs font-semibold text-text-2">
                            {n ? `${n} desain siap pakai` : "Mulai dari bentuk dasar"}
                          </span>
                        </span>
                      </label>
                    );
                  })}
                </div>
                {err("paper")}
              </fieldset>

              {paper && (
                <section aria-labelledby="designs-title" className="flex flex-col gap-3">
                  <div>
                    <h3 id="designs-title" className="text-[15px] font-extrabold">
                      2. Desain frame
                    </h3>
                    <p className="mt-1 max-w-[70ch] text-[13px] leading-normal text-text-2">
                      Pakai desain yang ada apa adanya, atau tekan <b>Salin & sesuaikan</b> untuk
                      membuat salinan khusus event ini (editor dibuka setelah event dibuat). Bentuk
                      dasar selalu disalin jadi template baru.
                    </p>
                  </div>
                  <DesignPicker
                    options={designOptions.filter((o) => o.paper === paper)}
                    value={designs}
                    onChange={(d) => {
                      setDesigns(d);
                      if (copy && !d.includes(copy)) setCopy(null);
                      setErrors({});
                    }}
                    vars={vars}
                    background={BG}
                    paper={paper}
                    copy={{ value: copyValue, onChange: (v) => !basics.length && setCopy(v) }}
                  />
                  {err("designs")}
                </section>
              )}
            </div>
          )}

          {step === 3 && mode === "photobox" && (
            <div className="flex flex-col gap-6">
              {(["2x6x2", "4R", "3x4x2"] as const).map((pp) => {
                const list = sellable.filter((o) => o.paper === pp);
                if (!list.length) return null;
                return (
                  <fieldset key={pp} className="flex flex-col gap-3">
                    <legend className="mb-3 text-[15px] font-extrabold">{paperLabel(pp)}</legend>
                    <div className="grid grid-cols-[repeat(auto-fill,minmax(210px,1fr))] gap-4">
                      {list.map((o) => {
                        const k = pbKey(o.value);
                        const on = k in sold;
                        return (
                          <div
                            key={o.value}
                            className={`flex flex-col overflow-hidden rounded-2xl border-[1.5px] border-ink ${on ? "bg-mint-soft" : "border-dashed bg-white"}`}
                          >
                            <div className="flex h-[200px] items-center justify-center border-b-[1.5px] border-dashed border-ink bg-paper p-3">
                              <DesignPreview
                                layout={
                                  o.template ? o.layout : { ...o.layout, background: { color: BG } }
                                }
                                template={o.template}
                                vars={vars}
                                alt={`Pratinjau ${o.name}`}
                              />
                            </div>
                            <label className="flex min-h-11 cursor-pointer items-center gap-3 px-4 pt-3 text-sm font-bold">
                              <Box
                                name={`pb_${k}`}
                                aria-label={`Jual ${o.name}`}
                                checked={on}
                                onChange={(e) => {
                                  const { [k]: _, ...rest } = sold;
                                  setSold(e.target.checked ? { ...sold, [k]: 25000 } : rest);
                                  setErrors({});
                                }}
                              />
                              <span className="min-w-0">
                                <span className="block truncate">{o.name}</span>
                                <span className="block font-mono text-[11px] font-normal text-text-2">
                                  {o.info}
                                </span>
                              </span>
                            </label>
                            <label className="flex items-center gap-2 px-4 pt-2 pb-4">
                              <span className="text-[13px] font-semibold text-text-2">Rp</span>
                              <input
                                type="number"
                                min={MIN_PRICE}
                                step={500}
                                disabled={!on}
                                aria-label={`Harga ${o.name}`}
                                value={sold[k] ?? 25000}
                                onChange={(e) => setSold({ ...sold, [k]: Number(e.target.value) })}
                                className={`${input} font-mono disabled:border-dashed disabled:bg-transparent disabled:text-muted`}
                              />
                            </label>
                          </div>
                        );
                      })}
                    </div>
                  </fieldset>
                );
              })}
              {err("sold")}
              <label className="flex max-w-md flex-col gap-1.5">
                <span className="text-[13px] font-bold">Harga lembar tambahan</span>
                <span className="flex items-center gap-2.5">
                  <input
                    type="number"
                    min={0}
                    step={500}
                    value={extraPrice}
                    onChange={(e) => setExtraPrice(Number(e.target.value))}
                    className={`${input.replace("w-full", "w-40")} font-mono`}
                    {...invalid("extra")}
                  />
                  <span className="text-[13px] whitespace-nowrap text-text-2">Rp / lembar</span>
                </span>
                <span className="text-xs text-text-2">
                  Dibayar tamu untuk setiap cetakan setelah lembar pertama. Bawaan: Rp 10.000.
                </span>
                {err("extra")}
              </label>
              <p className="text-xs text-text-2">
                Layout baru dibuat dulu di menu Template; harga bisa diubah nanti di Pengaturan.
              </p>
            </div>
          )}

          {step === 4 && (
            <div className="flex flex-col gap-5">
              <fieldset className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <legend className="sr-only">Booth</legend>
                {(
                  [
                    [
                      true,
                      "Semua booth",
                      "Termasuk booth yang baru disambungkan nanti. Cocok kalau hanya punya satu-dua booth.",
                    ],
                    [
                      false,
                      "Pilih booth",
                      "Hanya booth yang dicentang. Cocok kalau beberapa event berjalan bersamaan.",
                    ],
                  ] as const
                ).map(([all, t, h]) => (
                  <label
                    key={t}
                    className={`flex items-start gap-3 rounded-2xl border-[1.5px] border-dashed border-ink p-5 has-checked:border-solid has-checked:bg-mint-soft has-focus-visible:outline-2 ${!all && !devices.length ? "cursor-not-allowed opacity-50" : "cursor-pointer"}`}
                  >
                    <span className="mt-0.5">
                      <Box
                        radio
                        name="deviceScope"
                        checked={allDevices === all}
                        disabled={!all && !devices.length}
                        onChange={() => {
                          setAllDevices(all);
                          setErrors({});
                        }}
                      />
                    </span>
                    <span>
                      <span className="block text-base font-extrabold">{t}</span>
                      <span className="mt-1 block text-[13px] leading-snug text-text-2">{h}</span>
                    </span>
                  </label>
                ))}
              </fieldset>
              {devices.length ? (
                <fieldset className="flex flex-col gap-2.5" disabled={allDevices}>
                  <legend className="mb-2.5 text-[13px] font-bold">
                    {allDevices ? `Booth terdaftar (${devices.length})` : "Booth yang dipakai"}
                  </legend>
                  <div className="grid grid-cols-1 gap-2.5 md:grid-cols-2">
                    {devices.map((d) => {
                      const [label, bg] = STATUS[d.status];
                      return (
                        <label
                          key={d.id}
                          className={`flex min-h-12 items-center gap-3 rounded-xl border-[1.5px] border-ink px-4 py-2.5 text-sm font-semibold ${allDevices ? "border-dashed" : "cursor-pointer has-checked:bg-mint-soft"}`}
                        >
                          {/* Semua booth: tercentang & terkunci (semua ikut); pilihan lama tetap disimpan. */}
                          <Box
                            aria-label={d.name}
                            checked={allDevices || picked.includes(d.id)}
                            onChange={(e) => {
                              setPicked(
                                e.target.checked
                                  ? [...picked, d.id]
                                  : picked.filter((x) => x !== d.id),
                              );
                              setErrors({});
                            }}
                          />
                          <span className="min-w-0 flex-1 truncate">{d.name}</span>
                          <span
                            className={`flex-none rounded-full border-[1.5px] border-ink px-2.5 py-0.5 text-[11px] font-bold ${bg}`}
                          >
                            {label}
                          </span>
                        </label>
                      );
                    })}
                  </div>
                </fieldset>
              ) : (
                <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border-[1.5px] border-dashed border-ink bg-sky p-5">
                  <div className="max-w-[60ch]">
                    <p className="text-sm font-extrabold">Belum ada booth yang tersambung</p>
                    <p className="mt-1 text-[13px] leading-snug">
                      Event tetap bisa dibuat sekarang. Booth yang disambungkan nanti otomatis bisa
                      membuka event ini (Semua booth).
                    </p>
                  </div>
                  <a href="/admin/devices" target="_blank" rel="noreferrer" className={secondary}>
                    Tambah booth <ExternalLink aria-hidden className="size-4" />
                  </a>
                </div>
              )}
              {err("devices")}
            </div>
          )}

          {step === 5 && (
            <Summary
              name={name.trim()}
              date={date}
              location={location.trim()}
              tagline={tagline.trim()}
              mode={mode ?? "event"}
              paper={paper}
              designs={chosen}
              copy={copyValue}
              sold={sellable
                .filter((o) => pbKey(o.value) in sold)
                .map((o) => [o.name, sold[pbKey(o.value)] ?? 0])}
              extraPrice={extraPrice}
              booth={
                allDevices
                  ? devices.length
                    ? `Semua booth (${devices.length})`
                    : "Semua booth · belum ada yang tersambung"
                  : devices
                      .filter((d) => picked.includes(d.id))
                      .map((d) => d.name)
                      .join(", ")
              }
              edit={done ? undefined : go}
              slug={done?.slug}
              copied={done?.copied}
            />
          )}
        </div>
      </section>

      {/* Bilah navigasi lengket: satu tombol utama per langkah. */}
      {!done && (
        <div className="layered sticky bottom-4 z-20 flex flex-wrap items-center gap-x-4 gap-y-2 rounded-2xl border-[1.5px] border-ink bg-white px-5 py-3 [--lb:1.5px] [--lx:4px]">
          {step > 1 ? (
            <button type="button" onClick={() => go(step - 1)} className={secondary}>
              <ArrowLeft aria-hidden className="size-4" /> Kembali
            </button>
          ) : (
            <span />
          )}
          <p role="status" className="min-w-0 flex-1 text-[13px] leading-snug">
            {r && !r.ok ? (
              <>
                <span className="mr-2 rounded-md border-[1.5px] border-ink bg-coral px-1.5 py-px text-[11px] font-extrabold">
                  Gagal
                </span>
                <b>{r.message}</b>
              </>
            ) : Object.keys(errors).length ? (
              <b>Lengkapi yang ditandai dulu.</b>
            ) : (
              <span className="text-text-2">
                {step < 5
                  ? `Berikutnya: ${STEPS[step]}`
                  : "Event dibuat dan langsung dikirim ke booth."}
              </span>
            )}
          </p>
          <button type="submit" disabled={pending} className={primary}>
            {step < 5 ? (
              <>
                Lanjut <ArrowRight aria-hidden className="size-4" />
              </>
            ) : pending ? (
              "Membuat event…"
            ) : (
              "Buat event"
            )}
          </button>
        </div>
      )}
    </form>
  );
}

function ErrorText({ id, children }: { id: string; children: ReactNode }) {
  return (
    <p id={id} className="flex items-start gap-2 text-[13px] font-bold">
      <span aria-hidden className="mt-1 size-2.5 flex-none rounded-full bg-coral-strong" />
      {children}
    </p>
  );
}

function Field({
  id,
  label,
  optional,
  hint,
  error,
  children,
}: {
  id: string;
  label: string;
  optional?: boolean;
  hint?: string;
  error?: string | undefined;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-[13px] font-bold">
        {label}
        {optional && <span className="font-semibold text-muted"> · opsional</span>}
      </label>
      {children}
      {hint && (
        <p id={`${id}-hint`} className="text-xs text-text-2">
          {hint}
        </p>
      )}
      {error && <ErrorText id={`${id}-err`}>{error}</ErrorText>}
    </div>
  );
}

function Row({
  label,
  children,
  onEdit,
}: {
  label: string;
  children: ReactNode;
  onEdit?: (() => void) | undefined;
}) {
  return (
    <div className="grid grid-cols-[150px_minmax(0,1fr)_auto] items-start gap-4 border-b-[1.5px] border-dashed border-line-soft py-3.5 last:border-b-0">
      <dt className="pt-0.5 text-[13px] font-bold text-text-2">{label}</dt>
      <dd className="min-w-0 text-sm leading-normal">{children}</dd>
      {onEdit ? (
        <button
          type="button"
          onClick={onEdit}
          aria-label={`Ubah ${label.toLowerCase()}`}
          className="-my-2 h-11 rounded-xl px-3 text-[13px] font-bold underline hover:bg-mint-soft"
        >
          Ubah
        </button>
      ) : (
        <span />
      )}
    </div>
  );
}

function Summary({
  name,
  date,
  location,
  tagline,
  mode,
  paper,
  designs,
  copy,
  sold,
  extraPrice,
  booth,
  edit,
  slug,
  copied,
}: {
  name: string;
  date: string;
  location: string;
  tagline: string;
  mode: Mode;
  paper: LayoutPaper | null;
  designs: DesignOption[];
  copy: string | null;
  sold: [string, number][];
  extraPrice: number;
  booth: string;
  edit: ((step: number) => void) | undefined;
  slug: string | undefined;
  copied: string | undefined;
}) {
  const at = (n: number) => (edit ? () => edit(n) : undefined);
  const crew = [
    "Di laptop booth, buka Mode Crew (tahan logo 2 detik atau Ctrl+Shift+M, lalu PIN).",
    "Buka Ringkasan, lalu tekan Pilih event.",
    "Tekan Ambil event terbaru supaya daftar event diperbarui.",
    `Pilih “${name}”.`,
    "Cek kamera, lalu Cek printer.",
    "Tekan Buka untuk Tamu. Booth siap dipakai.",
  ];
  return (
    <div className="flex flex-col gap-6">
      {slug && (
        <div className="flex flex-wrap items-center gap-x-5 gap-y-4 rounded-2xl border-[1.5px] border-ink bg-mint-soft px-5 py-4">
          <div role="status" className="flex min-w-[280px] flex-1 items-center gap-3">
            <span className="flex size-8 flex-none items-center justify-center rounded-full bg-green text-white">
              <Check aria-hidden strokeWidth={3.5} className="size-4" />
            </span>
            <p className="text-sm leading-snug">
              <b>{name}</b> sudah dibuat. Booth menerimanya saat online.
              {copied && " Salinan desain siap disesuaikan di editor."}
            </p>
          </div>
          <div className="flex flex-wrap gap-2.5">
            {copied && (
              <Link href={`/admin/templates/${copied}`} className={primary}>
                Edit desain
              </Link>
            )}
            <Link href={`/admin/events/${slug}`} className={copied ? secondary : primary}>
              Buka event
            </Link>
            <Link href={`/admin/events/${slug}/settings`} className={secondary}>
              Pengaturan lanjutan
            </Link>
          </div>
        </div>
      )}
      <dl className="rounded-2xl border-[1.5px] border-ink px-5">
        <Row label="Nama" onEdit={at(1)}>
          <b>{name}</b>
          {tagline && <span className="block text-text-2">Teks kecil: {tagline}</span>}
        </Row>
        <Row label="Tanggal & lokasi" onEdit={at(1)}>
          {longDate(date)}
          {location && <span className="text-text-2"> · {location}</span>}
        </Row>
        <Row label="Mode" onEdit={at(2)}>
          {mode === "photobox" ? "Photobox · tamu bayar QRIS" : "Event · cetak gratis untuk tamu"}
        </Row>
        {mode === "event" ? (
          <Row label="Desain frame" onEdit={at(3)}>
            {paper && <span className="block text-text-2">{paperLabel(paper)}</span>}
            {designs.map((d, i) => (
              <span key={d.value} className="block">
                <b>{d.name}</b>
                {i === 0 && designs.length > 1 && <span className="text-text-2"> · utama</span>}
                {d.value === copy && (
                  <span className="text-text-2"> · disalin jadi template baru</span>
                )}
              </span>
            ))}
          </Row>
        ) : (
          <Row label="Layout dijual" onEdit={at(3)}>
            {sold.map(([n, p]) => (
              <span key={n} className="block">
                <b>{n}</b> <span className="font-mono">{rupiah(p)}</span>
              </span>
            ))}
            <span className="block text-text-2">
              Lembar tambahan <span className="font-mono">{rupiah(extraPrice)}</span>
            </span>
          </Row>
        )}
        <Row label="Booth" onEdit={at(4)}>
          {booth}
        </Row>
      </dl>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)]">
        <section
          aria-labelledby="next-admin"
          className="flex flex-col gap-3 rounded-2xl border-[1.5px] border-dashed border-ink p-5"
        >
          <h3 id="next-admin" className="text-[15px] font-extrabold">
            Setelah ini · di admin
          </h3>
          <ol className="flex flex-col gap-2.5 text-sm leading-snug">
            {copy && (
              <li>
                <b>Sesuaikan desain salinan</b> di editor: ganti foto latar, teks, dan warna.
              </li>
            )}
            <li>
              <span className="font-semibold text-muted">Opsional · </span>
              <b>Pengaturan lanjutan</b>: suara, layar awal, halaman tamu, data tamu (lead), masa
              simpan foto.
            </li>
          </ol>
        </section>
        <section
          aria-labelledby="next-crew"
          className="flex flex-col gap-3 rounded-2xl border-[1.5px] border-dashed border-ink bg-paper p-5"
        >
          <h3 id="next-crew" className="text-[15px] font-extrabold">
            Setelah ini · di booth (crew)
          </h3>
          <ol className="flex flex-col gap-2.5">
            {crew.map((c, i) => (
              <li key={c} className="flex items-start gap-3 text-sm leading-snug">
                <span className="flex size-6 flex-none items-center justify-center rounded-full border-[1.5px] border-ink bg-white font-mono text-xs font-bold">
                  {i + 1}
                </span>
                <span className="pt-0.5">{c}</span>
              </li>
            ))}
          </ol>
        </section>
      </div>
    </div>
  );
}
