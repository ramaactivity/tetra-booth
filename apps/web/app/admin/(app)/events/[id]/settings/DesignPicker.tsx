"use client";
import { type LayoutPaper, type LayoutSpec, paperLabel } from "@tetra/shared";
import { ArrowLeft, Check, Plus, Search, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { DesignPreview, type PreviewTemplate, type PreviewVars } from "./DesignPreview";

/** Satu pilihan desain frame: preset (`value` = id preset) atau template editor (`value` = `tpl:<id>`). */
export type DesignOption = {
  value: string;
  name: string;
  paper: LayoutPaper;
  info: string;
  /** Layout lengkap untuk pratinjau (preset: latar diisi warna latar event). */
  layout: LayoutSpec;
  /** Template editor: versi terbaru + versi yang dikunci event (null = belum dipakai) + file aset. */
  template?: PreviewTemplate & { pinned: number | null };
  /** Bentuk dasar di luar preset event (wizard): hanya bisa dipakai lewat "Salin & sesuaikan". */
  copyOnly?: boolean;
  /** Template editor: untuk mode Event atau Photobox (layouts.mode, #160); preset = semua mode. */
  mode?: "event" | "photobox";
};

/** Pilihan untuk satu mode event: preset + template mode itu, plus yang sudah terpasang (`keep`) walau beda mode. */
export const forMode = (options: DesignOption[], mode: string, keep: (v: string) => boolean) =>
  options.filter((o) => !o.mode || o.mode === mode || keep(o.value));

export const MAX_DESIGNS = 3;
const PAGE = 12;

const pill =
  "inline-flex h-11 items-center rounded-full border-[1.5px] border-ink bg-white px-3.5 text-xs font-bold no-underline hover:bg-butter";

/** Layout untuk pratinjau: preset memakai warna latar event (seperti bundle). */
const layoutOf = (o: DesignOption, background: string): LayoutSpec =>
  o.template ? o.layout : { ...o.layout, background: { color: background } };

/**
 * Desain frame event (#125, dirombak #128): hanya desain terpilih yang tampil, dengan pratinjau besar dari
 * template engine. "+ Tambah desain" membuka pemilih (cari, filter kertas, halaman 12 per muat). Urutan =
 * urutan pilih, pertama = utama. Dikirim sebagai `design` berurutan; "Salin & sesuaikan" = tombol submit `copy`.
 */
export function DesignPicker({
  options,
  value,
  onChange,
  vars,
  background,
  overlayUrl,
  copy,
  paper: fixedPaper,
}: {
  options: DesignOption[];
  value: string[];
  onChange: (next: string[]) => void;
  vars: PreviewVars;
  background: string;
  /** Overlay PNG event; dipakai di pratinjau desain utama kalau preset. */
  overlayUrl?: string | undefined;
  /**
   * Wizard: "Salin & sesuaikan" menandai satu desain (disalin saat event dibuat) alih-alih submit form.
   * Tanpa prop ini = perilaku Pengaturan (tombol submit `copy`).
   */
  copy?: { value: string | null; onChange: (v: string | null) => void };
  /** Wizard: kertas sudah dipilih lebih dulu, pemilih hanya menampilkan ukuran ini. */
  paper?: LayoutPaper;
}) {
  const [open, setOpen] = useState(false);
  const byValue = new Map(options.map((o) => [o.value, o]));
  const picked = value.flatMap((v) => byValue.get(v) ?? []);
  const paper = picked[0]?.paper ?? fixedPaper;
  return (
    <div className="flex flex-col gap-4 md:col-span-2">
      {value.map((v) => (
        <input key={v} type="hidden" name="design" value={v} />
      ))}
      {paper && (
        <p className="text-[13px] text-text-2">
          Ukuran kertas: <b className="text-ink">{paperLabel(paper)}</b>. Desain tambahan harus
          berukuran sama.
        </p>
      )}
      <fieldset
        aria-label="Desain frame"
        className="grid grid-cols-[repeat(auto-fill,minmax(200px,1fr))] gap-4"
      >
        {picked.map((o, i) => {
          const t = o.template;
          return (
            <article
              key={o.value}
              aria-label={o.name}
              className={`flex flex-col overflow-hidden rounded-2xl border-[1.5px] border-ink bg-white ${i === 0 ? "layered [--lb:1.5px] [--lx:5px] [--under:var(--butter)]" : ""}`}
            >
              <div className="flex h-[300px] items-center justify-center border-b-[1.5px] border-dashed border-ink bg-paper p-4">
                <DesignPreview
                  layout={layoutOf(o, background)}
                  template={t}
                  vars={vars}
                  alt={`Pratinjau ${o.name}`}
                  overlayUrl={i === 0 ? overlayUrl : undefined}
                />
              </div>
              <div className="flex flex-1 flex-col gap-3 p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-extrabold" title={o.name}>
                      {o.name}
                    </div>
                    <div className="mt-0.5 font-mono text-xs text-text-2">{o.info}</div>
                  </div>
                  {i === 0 ? (
                    <span className="flex-none rounded-md border-[1.5px] border-ink bg-butter px-2 py-0.5 text-[11px] font-extrabold">
                      Utama
                    </span>
                  ) : (
                    <span className="flex-none rounded-md border-[1.5px] border-ink bg-white px-2 py-0.5 text-[11px] font-bold">
                      Desain {i + 1}
                    </span>
                  )}
                </div>
                {t?.pinned != null && t.pinned < t.version && (
                  <p className="rounded-lg border-[1.5px] border-dashed border-ink bg-sky px-2.5 py-1.5 text-xs leading-snug">
                    Event memakai v{t.pinned}. Simpan untuk memakai v{t.version}.
                  </p>
                )}
                <div className="mt-auto flex flex-wrap gap-2">
                  {i > 0 && (
                    <button
                      type="button"
                      className={pill}
                      onClick={() => onChange([o.value, ...value.filter((x) => x !== o.value)])}
                    >
                      Jadikan utama
                    </button>
                  )}
                  {t && !copy && (
                    <Link
                      href={`/admin/templates/${t.id}`}
                      aria-label={`Edit desain ${o.name}`}
                      className={pill}
                    >
                      Edit desain
                    </Link>
                  )}
                  {copy ? (
                    <button
                      type="button"
                      aria-pressed={copy.value === o.value}
                      aria-label={`Salin & sesuaikan ${o.name}`}
                      title="Buat salinan khusus event ini saat event dibuat, lalu sesuaikan di editor"
                      disabled={o.copyOnly}
                      onClick={() => copy.onChange(copy.value === o.value ? null : o.value)}
                      className={`${pill} aria-pressed:bg-mint disabled:cursor-default`}
                    >
                      {copy.value === o.value ? (
                        <>
                          <Check aria-hidden className="mr-1 size-4" strokeWidth={2} />
                          Akan disalin
                        </>
                      ) : (
                        "Salin & sesuaikan"
                      )}
                    </button>
                  ) : (
                    <button
                      type="submit"
                      name="copy"
                      value={o.value}
                      aria-label={`Salin & sesuaikan ${o.name}`}
                      title="Buat salinan khusus event ini, pakai untuk event, lalu buka editornya"
                      className={pill}
                    >
                      Salin & sesuaikan
                    </button>
                  )}
                  <button
                    type="button"
                    aria-label={`Lepas ${o.name}`}
                    className={`${pill} border-dashed hover:bg-coral`}
                    onClick={() => onChange(value.filter((x) => x !== o.value))}
                  >
                    Lepas
                  </button>
                </div>
              </div>
            </article>
          );
        })}
        {value.length < MAX_DESIGNS && (
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="flex min-h-[300px] flex-col items-center justify-center gap-3 rounded-2xl border-[1.5px] border-dashed border-ink bg-white p-6 text-center hover:bg-mint-soft"
          >
            <span className="flex size-11 items-center justify-center rounded-full border-[1.5px] border-ink bg-butter">
              <Plus className="size-5" strokeWidth={2} />
            </span>
            <span className="text-sm font-extrabold">Tambah desain</span>
            <span className="max-w-[200px] text-xs leading-snug text-text-2">
              {value.length
                ? `Tamu memilih salah satu sebelum foto. Maks. ${MAX_DESIGNS} desain.`
                : "Belum ada desain. Pilih minimal satu."}
            </span>
          </button>
        )}
      </fieldset>
      <p className="text-xs text-text-2">
        Desain baru dibuat di menu{" "}
        <Link href="/admin/templates" className="font-bold text-ink underline">
          Template
        </Link>
        .
      </p>
      {open && (
        <PickerDialog
          options={options.filter((o) => !value.includes(o.value))}
          paper={paper}
          vars={vars}
          background={background}
          onClose={() => setOpen(false)}
          onPick={(v) => {
            onChange([...value, v]);
            setOpen(false);
          }}
        />
      )}
    </div>
  );
}

/**
 * Pemilih desain (modal): `<dialog>` + showModal = fokus terkunci di dalam & Esc menutup (bawaan browser).
 * Kertas lain disembunyikan (bukan dinonaktifkan) kalau sudah ada desain utama.
 */
function PickerDialog({
  options,
  paper,
  vars,
  background,
  onClose,
  onPick,
}: {
  options: DesignOption[];
  /** Kertas desain utama: filter terkunci ke ukuran ini. */
  paper: LayoutPaper | undefined;
  vars: PreviewVars;
  background: string;
  onClose: () => void;
  onPick: (value: string) => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [q, setQ] = useState("");
  const [size, setSize] = useState<LayoutPaper | "all">(paper ?? "all");
  const [tab, setTab] = useState<"new" | "all">("new");
  const [shown, setShown] = useState(PAGE);
  const [detail, setDetail] = useState<DesignOption | null>(null);
  useEffect(() => {
    ref.current?.showModal();
  }, []);

  const papers = [...new Set(options.map((o) => o.paper))];
  const want = paper ?? size;
  const needle = q.trim().toLowerCase();
  const list = options.filter(
    (o) => (want === "all" || o.paper === want) && o.name.toLowerCase().includes(needle),
  );
  if (tab === "all") list.sort((a, b) => a.name.localeCompare(b.name, "id"));
  const seg = (on: boolean) =>
    `h-9 rounded-full border-[1.5px] border-ink px-3.5 text-[13px] font-bold ${on ? "bg-ink text-white" : "bg-white hover:bg-mint-soft"}`;

  return (
    <dialog
      ref={ref}
      aria-labelledby="design-picker-title"
      onClose={onClose}
      // Kotak cari bukan isian pengaturan: jangan menandai form "ada perubahan".
      onChange={(e) => e.stopPropagation()}
      onClick={(e) => e.target === e.currentTarget && ref.current?.close()}
      onKeyDown={(e) => {
        // Enter di kotak cari tidak boleh mengirim form pengaturan.
        if (e.key === "Enter" && e.target instanceof HTMLInputElement) e.preventDefault();
      }}
      className="m-auto h-[min(820px,calc(100dvh-48px))] w-[min(1040px,calc(100vw-48px))] overflow-hidden rounded-[22px] border-[1.5px] border-ink bg-paper p-0 text-ink backdrop:bg-ink/45"
    >
      <div className="flex h-full flex-col">
        <header className="flex items-center justify-between gap-4 border-b-[1.5px] border-ink bg-white px-6 py-4">
          <div>
            <h2 id="design-picker-title" className="text-lg font-extrabold tracking-[-0.02em]">
              Tambah desain frame
            </h2>
            <p className="text-[13px] text-text-2">
              {paper
                ? `Hanya desain ${paperLabel(paper)} yang ditampilkan, sama dengan desain utama.`
                : "Pilih desain utama event. Desain berikutnya harus berukuran kertas sama."}
            </p>
          </div>
          <button
            type="button"
            aria-label="Tutup"
            onClick={() => ref.current?.close()}
            className="flex size-10 flex-none items-center justify-center rounded-full border-[1.5px] border-ink bg-white hover:bg-coral"
          >
            <X className="size-5" />
          </button>
        </header>

        {detail ? (
          <div className="grid min-h-0 flex-1 grid-cols-1 gap-6 p-6 md:grid-cols-[1fr_300px]">
            <div className="flex min-h-0 items-center justify-center rounded-2xl border-[1.5px] border-ink bg-white p-6">
              <DesignPreview
                layout={layoutOf(detail, background)}
                template={detail.template}
                vars={vars}
                alt={`Pratinjau ${detail.name}`}
              />
            </div>
            <div className="flex flex-col gap-4">
              <div>
                <h3 className="text-xl font-extrabold tracking-[-0.02em]">{detail.name}</h3>
                <p className="mt-1 font-mono text-[13px] text-text-2">{detail.info}</p>
              </div>
              <p className="text-[13px] leading-normal text-text-2">
                Pratinjau memakai foto contoh dan nama & tanggal event ini. Foto tamu mengisi kotak
                abu-abu.
              </p>
              <button
                type="button"
                onClick={() => onPick(detail.value)}
                className="pressable layered h-12 rounded-xl border-[1.5px] border-ink bg-butter text-sm font-extrabold [--lb:1.5px] [--lx:4px]"
              >
                Pakai desain ini
              </button>
              <button
                type="button"
                onClick={() => setDetail(null)}
                className="flex h-11 items-center justify-center gap-2 rounded-xl border-[1.5px] border-ink bg-white text-sm font-bold"
              >
                <ArrowLeft className="size-4" /> Kembali ke daftar
              </button>
            </div>
          </div>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-3 border-b-[1.5px] border-dashed border-ink px-6 py-4">
              <label className="flex h-10 min-w-[240px] flex-1 items-center gap-2 rounded-[11px] border-[1.5px] border-ink bg-white px-3 focus-within:outline-2 focus-within:outline-mint">
                <Search className="size-4 flex-none text-text-2" />
                <input
                  autoFocus
                  value={q}
                  onChange={(e) => {
                    setQ(e.target.value);
                    setShown(PAGE);
                  }}
                  placeholder="Cari nama desain"
                  aria-label="Cari nama desain"
                  className="h-full min-w-0 flex-1 bg-transparent text-sm outline-none"
                />
              </label>
              {!paper && papers.length > 1 && (
                <fieldset aria-label="Ukuran kertas" className="flex flex-wrap gap-1.5">
                  {(["all", ...papers] as const).map((p) => (
                    <button
                      key={p}
                      type="button"
                      aria-pressed={size === p}
                      className={seg(size === p)}
                      onClick={() => {
                        setSize(p);
                        setShown(PAGE);
                      }}
                    >
                      {p === "all" ? "Semua ukuran" : paperLabel(p)}
                    </button>
                  ))}
                </fieldset>
              )}
              <div role="tablist" aria-label="Urutan" className="flex gap-1.5">
                {(
                  [
                    ["new", "Terbaru"],
                    ["all", "Semua A–Z"],
                  ] as const
                ).map(([k, l]) => (
                  <button
                    key={k}
                    type="button"
                    role="tab"
                    aria-selected={tab === k}
                    className={`h-9 rounded-full border-[1.5px] border-ink px-3.5 text-[13px] font-bold ${tab === k ? "bg-lavender" : "bg-white hover:bg-mint-soft"}`}
                    onClick={() => {
                      setTab(k);
                      setShown(PAGE);
                    }}
                  >
                    {l}
                  </button>
                ))}
              </div>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
              {list.length ? (
                <>
                  <ul className="grid grid-cols-[repeat(auto-fill,minmax(180px,1fr))] gap-4">
                    {list.slice(0, shown).map((o) => (
                      <li key={o.value}>
                        <button
                          type="button"
                          onClick={() => setDetail(o)}
                          className="flex w-full flex-col overflow-hidden rounded-2xl border-[1.5px] border-ink bg-white text-left hover:bg-mint-soft"
                        >
                          <span className="flex h-[220px] w-full items-center justify-center border-b-[1.5px] border-dashed border-ink bg-paper p-3">
                            <DesignPreview
                              layout={layoutOf(o, background)}
                              template={o.template}
                              vars={vars}
                              alt=""
                            />
                          </span>
                          <span className="flex flex-col gap-0.5 px-3.5 py-3">
                            <span className="truncate text-sm font-bold">{o.name}</span>
                            <span className="font-mono text-[11px] text-text-2">{o.info}</span>
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                  <div className="mt-5 flex items-center justify-center gap-3 text-[13px] text-text-2">
                    <span>
                      {Math.min(shown, list.length)} dari {list.length} desain
                    </span>
                    {shown < list.length && (
                      <button
                        type="button"
                        onClick={() => setShown((n) => n + PAGE)}
                        className="h-10 rounded-full border-[1.5px] border-ink bg-white px-4 text-[13px] font-bold text-ink hover:bg-butter"
                      >
                        Muat lebih banyak
                      </button>
                    )}
                  </div>
                </>
              ) : (
                <div className="mx-auto mt-10 max-w-sm rounded-2xl border-[1.5px] border-dashed border-ink bg-white p-6 text-center">
                  <p className="text-sm font-bold">Tidak ada desain yang cocok</p>
                  <p className="mt-1 text-[13px] text-text-2">
                    {needle ? "Coba kata lain, atau buat" : "Buat"} desain baru di menu{" "}
                    <Link href="/admin/templates" className="font-bold text-ink underline">
                      Template
                    </Link>
                    .
                  </p>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </dialog>
  );
}
