"use client";
import { LAYOUT_PRESETS, type LayoutSpec, PAPER_CANVAS, type PresetId } from "@tetra/shared";
import { Select } from "@tetra/ui";
import { ArrowLeft, ArrowRight, CalendarHeart, Check, Plus, Store, X } from "lucide-react";
import { useActionState, useRef, useState } from "react";
import { DesignPreview } from "../events/[id]/settings/DesignPreview";
import { createTemplate } from "./actions";
import type { AssignEvent, WizardPreset, WizardTemplate } from "./types";
import { type Design, UploadDesign } from "./UploadDesign";

type Mode = "event" | "photobox";
type Orient = "portrait" | "landscape";
const PAPERS = [
  {
    id: "2x6x2",
    label: "2R",
    title: "Strip 2R",
    desc: "Strip 2×6 inci, satu lembar jadi dua strip (dipotong printer).",
  },
  { id: "4R", label: "4R", title: "Foto 4R", desc: "Satu foto penuh 4×6 inci." },
  {
    id: "3x4x2",
    label: "Polaroid",
    title: "Polaroid",
    desc: "Dua potong 3×4 inci per lembar, disobek crew.",
  },
] as const;
type Paper = (typeof PAPERS)[number]["id"];
const STEPS = [
  ["Mode", "Template ini untuk acara klien atau booth berbayar?"],
  ["Ukuran kertas", "Pilih ukuran cetak dan arah kertas."],
  [
    "Mulai dari",
    "Unggah desain sendiri atau pilih susunan foto awal. Semua bisa diubah lagi di editor.",
  ],
  ["Nama", "Nama yang mudah dicari, mis. nama klien atau konsep desain."],
  ["Pasang ke event", "Opsional. Bisa juga nanti dari menu template."],
] as const;
const VARS = { event_name: "Andi & Sari", date: "12 Oktober 2026" };
/** Tata letak awal per kertas & arah: 4R portrait = 4R Grid (bawaan lama), lainnya yang pertama. */
const firstPreset = (paper: Paper, orient: Orient) => {
  const label = PAPERS.find((p) => p.id === paper)?.label;
  const ids = (Object.keys(LAYOUT_PRESETS) as PresetId[]).filter(
    (id) => LAYOUT_PRESETS[id].group === `${label} ${orient}`,
  );
  return ids.includes("4r-grid") ? "4r-grid" : (ids[0] ?? "");
};
const isLand = (l: { canvas: { width: number; height: number } }) =>
  l.canvas.width > l.canvas.height;
const dateText = (ymd: string) =>
  new Intl.DateTimeFormat("id-ID", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${ymd}T00:00:00Z`));

/** Kertas mini: potongan per lembar 4R sesuai format & arah (2R = dua strip, polaroid = dua potong). */
function PaperMock({ paper, orient }: { paper: Paper; orient: Orient }) {
  const land = orient === "landscape";
  const split = paper !== "4R";
  // Lembar 4R: polaroid portrait (3×4) = dua potong berdampingan di lembar mendatar; 2R portrait = dua strip
  // berdampingan di lembar tegak. Landscape = potongan bertumpuk.
  const sheetLand = paper === "3x4x2" ? !land : land;
  const sheet = sheetLand ? "h-[52px] w-[78px]" : "h-[78px] w-[52px]";
  const row = !land;
  return (
    <span
      aria-hidden
      className={`flex ${sheet} ${row ? "flex-row" : "flex-col"} gap-[3px] rounded-[5px] border-[1.5px] border-ink bg-white p-[3px]`}
    >
      {(split ? [0, 1] : [0]).map((i) => (
        <span key={i} className="flex-1 rounded-[2px] bg-sky" />
      ))}
    </span>
  );
}

const choice =
  "flex cursor-pointer gap-3 rounded-[14px] border-[1.5px] border-dashed border-ink p-4 text-left has-checked:border-solid has-checked:bg-mint-soft";

/** Wizard Buat Template (#160): mode → kertas & arah → mulai dari → nama → (opsional) pasang ke event → editor. */
export function NewTemplateWizard({
  mode: initialMode,
  templates,
  presets,
  events,
}: {
  mode: Mode;
  templates: WizardTemplate[];
  presets: WizardPreset[];
  events: AssignEvent[];
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [error, action, pending] = useActionState(createTemplate, null);
  const [step, setStep] = useState(0);
  const [mode, setMode] = useState<Mode>(initialMode);
  const [paper, setPaper] = useState<Paper>("4R");
  const [orient, setOrient] = useState<Orient>("portrait");
  // Upload desain = alur utama owner (#161): tab pertama & bawaan.
  const [from, setFrom] = useState<"upload" | "preset" | "copy">("upload");
  const [source, setSource] = useState("upload");
  const [design, setDesign] = useState<Design | null>(null);
  const [name, setName] = useState("");
  const [event, setEvent] = useState("");

  const label = PAPERS.find((p) => p.id === paper)?.label ?? "4R";
  const quick = (Object.entries(LAYOUT_PRESETS) as [PresetId, (typeof LAYOUT_PRESETS)[PresetId]][])
    .filter(([, p]) => p.group === `${label} ${orient}`)
    .map(([id, p]) => ({
      value: id,
      name: p.name,
      // Template baru dari preset berlatar putih (copyLayout); tanpa latar JPEG pratinjau jadi hitam.
      layout: { id, version: 1, ...p.layout, background: { color: "#ffffff" } } as LayoutSpec,
    }));
  const base = quick[0]?.layout;
  const mine = base
    ? presets
        .filter(
          (p) =>
            p.paper === paper && p.width === base.canvas.width && p.height === base.canvas.height,
        )
        .map((p) => ({
          value: `lp:${p.id}`,
          name: p.name,
          layout: { ...base, slots: p.slots } as LayoutSpec,
        }))
    : [];
  const copies = templates.filter(
    (t) => t.layout.paper === paper && isLand(t.layout) === (orient === "landscape"),
  );
  const myEvents = events.filter((e) => e.mode === mode);

  const reset = () => {
    setStep(0);
    setMode(initialMode);
    setSource("upload");
    setName("");
    setEvent("");
    setFrom("upload");
    setDesign(null);
  };
  const pickPaper = (p: Paper, o: Orient) => {
    setPaper(p);
    setOrient(o);
    if (from !== "upload") setSource(firstPreset(p, o));
  };
  const pc = PAPER_CANVAS[paper];
  const [W, H] = orient === "landscape" ? [pc.height, pc.width] : [pc.width, pc.height];
  const ready = from === "upload" ? design?.out?.W === W && design.out.H === H : !!source;
  const ok = [true, true, ready, !!name.trim(), true][step];
  const last = step === STEPS.length - 1;

  const card = (o: { value: string; name: string; layout: LayoutSpec; t?: WizardTemplate }) => (
    <label key={o.value} className={`${choice} flex-col items-center gap-2 p-3`}>
      <input
        type="radio"
        name="src"
        value={o.value}
        checked={source === o.value}
        onChange={() => {
          setSource(o.value);
          if (o.t && !name) setName(`${o.t.name} (salinan)`);
        }}
        className="sr-only"
      />
      <span className="flex h-[132px] w-full items-center justify-center">
        <DesignPreview
          layout={o.layout}
          template={o.t && { id: o.t.id, version: o.t.version, files: o.t.files }}
          vars={VARS}
          alt=""
          className="rounded-[3px]"
        />
      </span>
      <span className="flex w-full items-center gap-1.5 text-[13px] font-bold">
        <span className="min-w-0 flex-1 truncate">{o.name}</span>
        <span className="font-mono text-[11px] font-medium text-text-2">
          {o.layout.slots.length} foto
        </span>
        {source === o.value && <Check aria-hidden className="size-4 flex-none" strokeWidth={2.5} />}
      </span>
    </label>
  );

  return (
    <>
      <button
        type="button"
        className="pressable layered inline-flex h-11 items-center justify-center gap-2 rounded-xl border-[1.5px] border-ink bg-butter px-[18px] text-sm font-extrabold [--lb:1.5px] [--lx:4px]"
        onClick={() => {
          reset();
          ref.current?.showModal();
        }}
      >
        <Plus aria-hidden className="size-4" strokeWidth={2} />
        Buat Template
      </button>
      <dialog
        ref={ref}
        aria-label="Buat template"
        className="m-auto w-[720px] max-w-[calc(100vw-32px)] rounded-[22px] border-[1.5px] border-ink bg-white p-0 backdrop:bg-ink/40"
      >
        <form
          action={(fd) => {
            const out = from === "upload" ? design?.out : undefined;
            if (out) {
              fd.set("ov", out.file);
              fd.set("slots", JSON.stringify(out.slots));
            }
            action(fd);
          }}
          className="flex max-h-[min(760px,calc(100dvh-48px))] flex-col"
        >
          <input type="hidden" name="mode" value={mode} />
          <input type="hidden" name="source" value={source} />
          <input type="hidden" name="event" value={event} />
          <input type="hidden" name="paper" value={paper} />
          <input type="hidden" name="orient" value={orient} />
          <header className="flex items-start justify-between gap-4 border-b-[1.5px] border-dashed border-line-soft px-6 pt-5 pb-4">
            <div>
              <p className="text-xs font-bold text-text-2">
                Langkah {step + 1} dari {STEPS.length}
              </p>
              <h2 className="mt-0.5 text-xl font-extrabold tracking-[-0.02em]">
                {STEPS[step]?.[0]}
              </h2>
              <p className="mt-0.5 text-sm text-text-2">{STEPS[step]?.[1]}</p>
            </div>
            <button
              type="button"
              aria-label="Tutup"
              onClick={() => ref.current?.close()}
              className="flex size-9 flex-none items-center justify-center rounded-full border-[1.5px] border-ink hover:bg-paper"
            >
              <X aria-hidden className="size-4" strokeWidth={2} />
            </button>
          </header>
          <div aria-hidden className="flex gap-1 px-6 pt-3">
            {STEPS.map(([s], i) => (
              <span
                key={s}
                className={`h-1.5 flex-1 rounded-full ${i <= step ? "bg-mint" : "bg-neutral"}`}
              />
            ))}
          </div>

          <div className="min-h-[300px] flex-1 overflow-y-auto px-6 py-5">
            {step === 0 && (
              <fieldset className="m-0 grid grid-cols-1 gap-3 border-0 p-0 sm:grid-cols-2">
                <legend className="sr-only">Mode</legend>
                {(
                  [
                    [
                      "event",
                      "Event",
                      CalendarHeart,
                      "Untuk acara klien: nikahan, kantor, ulang tahun. Nama & tanggal acara tercetak di desain.",
                    ],
                    [
                      "photobox",
                      "Photobox",
                      Store,
                      "Untuk booth berbayar di tempat umum. Tamu memilih desain, lalu bayar QRIS.",
                    ],
                  ] as const
                ).map(([v, t, I, d]) => (
                  <label key={v} className={choice}>
                    <input
                      type="radio"
                      name="m"
                      value={v}
                      checked={mode === v}
                      onChange={() => {
                        setMode(v);
                        setEvent("");
                      }}
                      className="sr-only"
                    />
                    <span className="flex size-10 flex-none items-center justify-center rounded-xl border-[1.5px] border-ink bg-white">
                      <I aria-hidden className="size-5" strokeWidth={2} />
                    </span>
                    <span>
                      <span className="block text-[15px] font-extrabold">{t}</span>
                      <span className="mt-0.5 block text-[13px] leading-normal text-text-2">
                        {d}
                      </span>
                    </span>
                  </label>
                ))}
              </fieldset>
            )}

            {step === 1 && (
              <div className="flex flex-col gap-5">
                <fieldset className="m-0 grid grid-cols-1 gap-3 border-0 p-0 sm:grid-cols-3">
                  <legend className="sr-only">Ukuran kertas</legend>
                  {PAPERS.map((p) => (
                    <label key={p.id} className={`${choice} flex-col items-center text-center`}>
                      <input
                        type="radio"
                        name="paper"
                        value={p.id}
                        checked={paper === p.id}
                        onChange={() => pickPaper(p.id, orient)}
                        className="sr-only"
                      />
                      <span className="flex h-[84px] items-center">
                        <PaperMock paper={p.id} orient={orient} />
                      </span>
                      <span className="text-[15px] font-extrabold">{p.title}</span>
                      <span className="text-xs leading-normal text-text-2">{p.desc}</span>
                    </label>
                  ))}
                </fieldset>
                <fieldset className="m-0 flex flex-wrap items-center gap-3 border-0 p-0">
                  <legend className="mb-2 text-[13px] font-bold">Arah kertas</legend>
                  <div className="flex h-10 overflow-hidden rounded-[11px] border-[1.5px] border-ink bg-white text-[13px] font-bold">
                    {(
                      [
                        ["portrait", "Portrait (tegak)"],
                        ["landscape", "Landscape (mendatar)"],
                      ] as const
                    ).map(([v, l], i) => (
                      <button
                        key={v}
                        type="button"
                        aria-pressed={orient === v}
                        onClick={() => pickPaper(paper, v)}
                        className={`px-4 ${i ? "border-l-[1.5px] border-ink" : ""} ${orient === v ? "bg-lavender" : "hover:bg-paper"}`}
                      >
                        {l}
                      </button>
                    ))}
                  </div>
                </fieldset>
              </div>
            )}

            {step === 2 && (
              <div className="flex flex-col gap-4">
                <div className="flex h-10 w-fit overflow-hidden rounded-[11px] border-[1.5px] border-ink bg-white text-[13px] font-bold">
                  {(
                    [
                      ["upload", "Upload desain (PNG)"],
                      ["preset", "Tata letak cepat"],
                      ["copy", `Salin template (${copies.length})`],
                    ] as const
                  ).map(([v, l], i) => (
                    <button
                      key={v}
                      type="button"
                      aria-pressed={from === v}
                      onClick={() => {
                        setFrom(v);
                        setSource(
                          v === "preset" ? firstPreset(paper, orient) : v === "upload" ? v : "",
                        );
                      }}
                      className={`px-4 ${i ? "border-l-[1.5px] border-ink" : ""} ${from === v ? "bg-lavender" : "hover:bg-paper"}`}
                    >
                      {l}
                    </button>
                  ))}
                </div>
                <fieldset className="m-0 border-0 p-0">
                  <legend className="sr-only">Mulai dari</legend>
                  {from === "upload" ? (
                    <UploadDesign
                      W={W}
                      H={H}
                      paperText={`${PAPERS.find((p) => p.id === paper)?.title} ${orient}`}
                      design={design}
                      setDesign={setDesign}
                      // Nama awal dari nama file (bisa diganti di langkah Nama).
                      onPick={(f) =>
                        name || setName(f.name.replace(/\.[a-z0-9]+$/i, "").slice(0, 80))
                      }
                      onChangePaper={() => setStep(1)}
                      match={(w, h) => {
                        for (const p of PAPERS)
                          for (const o of ["portrait", "landscape"] as const) {
                            const c = PAPER_CANVAS[p.id];
                            const r = o === "landscape" ? c.height / c.width : c.width / c.height;
                            if (Math.abs(w / h / r - 1) < 0.01 && (p.id !== paper || o !== orient))
                              return { label: `${p.title} ${o}`, apply: () => pickPaper(p.id, o) };
                          }
                      }}
                    />
                  ) : from === "preset" ? (
                    <div className="flex flex-col gap-4">
                      {!!mine.length && (
                        <div>
                          <p className="mb-2 text-xs font-bold text-text-2">Tata letak saya</p>
                          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                            {mine.map(card)}
                          </div>
                        </div>
                      )}
                      <div>
                        {!!mine.length && (
                          <p className="mb-2 text-xs font-bold text-text-2">Bawaan</p>
                        )}
                        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                          {quick.map(card)}
                        </div>
                      </div>
                    </div>
                  ) : copies.length ? (
                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                      {copies.map((t) =>
                        card({ value: `tpl:${t.id}`, name: t.name, layout: t.layout, t }),
                      )}
                    </div>
                  ) : (
                    <p className="rounded-xl border-[1.5px] border-dashed border-ink px-4 py-6 text-center text-sm text-text-2">
                      Belum ada template {label} {orient}. Mulai dari tata letak cepat.
                    </p>
                  )}
                </fieldset>
              </div>
            )}

            {step === 3 && (
              <label className="flex flex-col gap-1.5 text-xs font-bold">
                Nama template
                <input
                  name="name"
                  autoFocus
                  required
                  maxLength={80}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key !== "Enter") return;
                    e.preventDefault();
                    if (name.trim()) setStep(4);
                  }}
                  placeholder={mode === "photobox" ? "mis. Retro Pink 2R" : "mis. Andi & Sari"}
                  className="h-12 rounded-xl border-[1.5px] border-ink px-3.5 text-[15px] font-semibold outline-none focus:shadow-[0_0_0_3px_var(--mint)]"
                />
              </label>
            )}
            {step !== 3 && <input type="hidden" name="name" value={name} />}

            {step === 4 && (
              <div className="flex flex-col gap-4">
                {myEvents.length ? (
                  <>
                    <div className="flex flex-col gap-1.5 text-xs font-bold">
                      {mode === "photobox" ? "Photobox" : "Event mendatang"}
                      <Select
                        label="Pasang ke event"
                        searchable
                        value={event}
                        onChange={setEvent}
                        options={[
                          { value: "", label: "Jangan pasang dulu" },
                          ...myEvents.map((e) => ({
                            value: e.id,
                            label: e.name,
                            hint: dateText(e.date),
                          })),
                        ]}
                      />
                    </div>
                    {event && (
                      <p className="rounded-xl border-[1.5px] border-ink bg-sky px-3.5 py-2.5 text-[13px] leading-normal">
                        {mode === "photobox"
                          ? "Template ditambahkan ke desain yang dijual. Isi harga paketnya:"
                          : "Template jadi desain utama event ini. Desain lain berkertas sama tetap jadi pilihan tamu."}
                      </p>
                    )}
                    {event && mode === "photobox" && (
                      <label className="flex flex-col gap-1.5 text-xs font-bold">
                        Harga paket (Rp)
                        <input
                          name="price"
                          type="number"
                          min={1500}
                          step={500}
                          defaultValue={25000}
                          className="h-10 w-40 rounded-[11px] border-[1.5px] border-ink px-3 font-mono text-sm font-normal outline-none focus:shadow-[0_0_0_3px_var(--mint)]"
                        />
                      </label>
                    )}
                  </>
                ) : (
                  <p className="rounded-xl border-[1.5px] border-dashed border-ink px-4 py-6 text-center text-sm text-text-2">
                    {mode === "photobox"
                      ? "Belum ada photobox yang berjalan. Lewati saja, pasang nanti."
                      : "Belum ada event mendatang. Lewati saja, pasang nanti."}
                  </p>
                )}
              </div>
            )}
            {error && (
              <p role="alert" className="mt-4 text-sm font-semibold text-coral-strong">
                {error}
              </p>
            )}
          </div>

          <footer className="flex items-center justify-between gap-3 border-t-[1.5px] border-dashed border-line-soft px-6 py-4">
            {step ? (
              <button
                type="button"
                onClick={() => setStep(step - 1)}
                className="inline-flex h-11 items-center gap-1.5 rounded-xl border-[1.5px] border-ink bg-white px-4 text-sm font-bold hover:bg-paper"
              >
                <ArrowLeft aria-hidden className="size-4" strokeWidth={2} />
                Kembali
              </button>
            ) : (
              <span />
            )}
            {last ? (
              // key beda: tombol Lanjut tidak dipakai ulang jadi submit di tengah klik (form terkirim dini).
              <button
                key="submit"
                type="submit"
                disabled={pending}
                className="pressable layered inline-flex h-11 items-center gap-2 rounded-xl border-[1.5px] border-ink bg-butter px-5 text-sm font-extrabold [--lb:1.5px] [--lx:4px] disabled:opacity-50"
              >
                {pending ? "Membuat…" : "Buat & buka editor"}
              </button>
            ) : (
              <button
                key="next"
                type="button"
                disabled={!ok}
                onClick={() => setStep(step + 1)}
                className="pressable layered inline-flex h-11 items-center gap-2 rounded-xl border-[1.5px] border-ink bg-butter px-5 text-sm font-extrabold [--lb:1.5px] [--lx:4px] disabled:opacity-50"
              >
                Lanjut
                <ArrowRight aria-hidden className="size-4" strokeWidth={2} />
              </button>
            )}
          </footer>
        </form>
      </dialog>
    </>
  );
}
