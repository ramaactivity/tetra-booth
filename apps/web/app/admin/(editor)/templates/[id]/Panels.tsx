"use client";
import { LAYOUT_PRESETS, type LayoutSlot, type PresetId, paperLabel } from "@tetra/shared";
import {
  AlignCenterHorizontal,
  AlignCenterVertical,
  AlignEndHorizontal,
  AlignEndVertical,
  AlignStartHorizontal,
  AlignStartVertical,
  ArrowDown,
  ArrowUp,
  BringToFront,
  ChevronsDown,
  ChevronsUp,
  GripVertical,
  Image as ImageIcon,
  Layers,
  LayoutGrid,
  Move,
  QrCode,
  SendToBack,
  Trash2,
  Type,
  Upload,
} from "lucide-react";
import { type FormEvent, type ReactNode, useState } from "react";
import { deletePreset, savePreset } from "@/app/admin/(app)/templates/actions";
import { type AlignMode, type Key, layerStack, OVERLAY, QR } from "@/lib/editor/geometry";
import { FONT_PACKS } from "@/lib/fonts";
import { FONT_IDS } from "@/lib/layouts";
import type { EditorApi } from "./Editor";

export type Tab = "elemen" | "teks" | "unggahan" | "posisi" | "layer";
const TABS: [Tab, string, typeof Type][] = [
  ["elemen", "Elemen", LayoutGrid],
  ["teks", "Teks", Type],
  ["unggahan", "Unggahan", Upload],
  ["posisi", "Posisi", Move],
  ["layer", "Layer", Layers],
];
const card =
  "flex w-full items-center gap-3 rounded-[14px] border-[1.5px] border-ink bg-white p-3 text-left text-sm font-bold hover:bg-paper";
const small = "font-mono text-[11px] text-text-2";
const seg = "flex overflow-hidden rounded-[10px] border-[1.5px] border-ink text-xs font-bold";

function Section({
  title,
  children,
  aside,
}: {
  title: string;
  children: ReactNode;
  aside?: ReactNode;
}) {
  return (
    <section className="flex flex-col gap-2.5">
      <h3 className="flex items-center justify-between text-[11px] font-bold tracking-wide text-text-2 uppercase">
        {title}
        {aside}
      </h3>
      {children}
    </section>
  );
}

const ALIGNS: [AlignMode, typeof AlignStartVertical, string][] = [
  ["left", AlignStartVertical, "Rata kiri"],
  ["center", AlignCenterVertical, "Tengah horizontal"],
  ["right", AlignEndVertical, "Rata kanan"],
  ["top", AlignStartHorizontal, "Rata atas"],
  ["middle", AlignCenterHorizontal, "Tengah vertikal"],
  ["bottom", AlignEndHorizontal, "Rata bawah"],
];

/** Tombol rata (ke halaman, margin aman, atau sesama elemen terpilih). */
export function AlignButtons({ ed, compact }: { ed: EditorApi; compact?: boolean }) {
  return (
    <div className={compact ? "flex gap-1" : "grid grid-cols-3 gap-1.5"}>
      {ALIGNS.map(([m, Icon, l]) => (
        <button
          key={m}
          type="button"
          aria-label={l}
          title={l}
          disabled={!ed.sel.length}
          onClick={() => ed.align(m)}
          className={
            compact
              ? "flex size-9 items-center justify-center rounded-[10px] border-[1.5px] border-transparent hover:border-ink hover:bg-white"
              : "flex h-10 items-center justify-center gap-1.5 rounded-[10px] border-[1.5px] border-ink bg-white text-[11px] font-bold disabled:opacity-40"
          }
        >
          <Icon className="size-4" />
          {!compact && (
            <span className="capitalize">
              {l.replace("Rata ", "").replace(" horizontal", "").replace(" vertikal", "")}
            </span>
          )}
        </button>
      ))}
    </div>
  );
}

function Num({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (n: number) => void;
}) {
  return (
    <label className="flex flex-col gap-1 text-[11px] font-bold text-text-2">
      {label}
      <input
        type="number"
        value={Math.round(value)}
        onChange={(e) =>
          Number.isFinite(Number(e.target.value)) && onChange(Number(e.target.value))
        }
        className="h-9 w-full rounded-[10px] border-[1.5px] border-ink bg-white px-2 font-mono text-sm"
      />
    </label>
  );
}

function Upload1({
  label,
  hint,
  accept,
  has,
  onPick,
  onRemove,
}: {
  label: string;
  hint: string;
  accept: string;
  has: boolean;
  onPick: (f: File | undefined) => void;
  onRemove?: () => void;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="flex cursor-pointer flex-col items-center gap-1 rounded-[14px] border-[1.5px] border-dashed border-ink bg-paper px-3 py-4 text-center text-sm font-bold hover:bg-white">
        {has ? `Ganti ${label.toLowerCase()}` : `+ ${label}`}
        <span className={small}>{hint}</span>
        <input
          type="file"
          accept={accept}
          aria-label={label}
          className="sr-only"
          onChange={(e) => onPick(e.target.files?.[0])}
        />
      </label>
      {has && onRemove && (
        <button type="button" className="self-start text-xs font-bold underline" onClick={onRemove}>
          Hapus {label.toLowerCase()}
        </button>
      )}
    </div>
  );
}

function LayerRow({
  label,
  sub,
  on,
  onClick,
  draggable,
  onDragStart,
  onDrop,
  up,
  down,
}: {
  label: string;
  sub?: string;
  on?: boolean;
  onClick?: () => void;
  draggable?: boolean;
  onDragStart?: () => void;
  onDrop?: () => void;
  up?: () => void;
  down?: () => void;
}) {
  const [over, setOver] = useState(false);
  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: baris layer = target drag & drop; aksi ada di tombol
    <div
      draggable={draggable}
      onDragStart={onDragStart}
      onDragOver={(e) => {
        if (!onDrop) return;
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        onDrop?.();
      }}
      className={`flex items-center gap-2 rounded-[12px] border-[1.5px] px-2 py-2 text-[13px] ${on ? "border-ink bg-mint-soft font-bold" : "border-dashed border-ink/50 bg-white"} ${over ? "outline-2 outline-mint" : ""}`}
    >
      {draggable ? (
        <GripVertical className="size-4 flex-none cursor-grab text-muted" />
      ) : (
        <span className="w-4" />
      )}
      <button
        type="button"
        className="min-w-0 flex-1 truncate text-left"
        onClick={onClick}
        disabled={!onClick}
      >
        {label}
        {sub && <span className={`ml-1.5 ${small}`}>{sub}</span>}
      </button>
      {up && (
        <button
          type="button"
          aria-label={`Naikkan ${label}`}
          onClick={up}
          className="rounded p-0.5 hover:bg-paper"
        >
          <ArrowUp className="size-3.5" />
        </button>
      )}
      {down && (
        <button
          type="button"
          aria-label={`Turunkan ${label}`}
          onClick={down}
          className="rounded p-0.5 hover:bg-paper"
        >
          <ArrowDown className="size-3.5" />
        </button>
      )}
    </div>
  );
}

/** Miniatur proporsional kanvas + slot foto (muat di kotak 40 px). */
function Mini({ w, h, slots }: { w: number; h: number; slots: LayoutSlot[] }) {
  return (
    <span className="flex size-10 flex-none items-center justify-center">
      <span
        className="relative overflow-hidden rounded-[3px] border-[1.5px] border-ink bg-white"
        style={
          w > h
            ? { width: 40, aspectRatio: `${w} / ${h}` }
            : { height: 40, aspectRatio: `${w} / ${h}` }
        }
      >
        {slots.map((s) => (
          <span
            key={s.id}
            className="absolute rounded-[1px] border border-ink bg-sky"
            style={{
              left: `${(s.x / w) * 100}%`,
              top: `${(s.y / h) * 100}%`,
              width: `${(s.w / w) * 100}%`,
              height: `${(s.h / h) * 100}%`,
              transform: s.rotation ? `rotate(${s.rotation}deg)` : undefined,
            }}
          />
        ))}
      </span>
    </span>
  );
}

/** "Tata letak saya": posisi slot tersimpan organisasi untuk kanvas yang sama (format + orientasi). */
function MyLayouts({ ed }: { ed: EditorApi }) {
  const { paper, canvas, slots } = ed.layout;
  const [name, setName] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const mine = ed.presets.filter(
    (p) => p.paper === paper && p.width === canvas.width && p.height === canvas.height,
  );
  const save = async (e: FormEvent) => {
    e.preventDefault();
    if (!name?.trim() || busy) return;
    setBusy(true);
    setErr("");
    const r = await savePreset({
      name,
      paper,
      canvas: { width: canvas.width, height: canvas.height },
      slots,
    }).catch(() => null);
    setBusy(false);
    if (!r?.ok) return setErr(r?.message ?? "Gagal menyimpan tata letak, coba lagi");
    ed.setPresets((ps) => [r.preset, ...ps]);
    setName(null);
  };
  const remove = async (id: string) => {
    const before = ed.presets;
    ed.setPresets((ps) => ps.filter((p) => p.id !== id));
    setConfirm(null);
    setErr("");
    if (!(await deletePreset(id).catch(() => false))) {
      ed.setPresets(before);
      setErr("Gagal menghapus, coba lagi");
    }
  };

  return (
    <Section title="Tata letak saya">
      {mine.map((p) => (
        <div
          key={p.id}
          className="flex w-full items-center gap-1 rounded-[14px] border-[1.5px] border-ink bg-white text-sm font-bold"
        >
          <button
            type="button"
            aria-label={`Pakai tata letak ${p.name}`}
            onClick={() => ed.applySlots(p.slots)}
            className="flex min-w-0 flex-1 items-center gap-3 rounded-l-[12px] py-2 pl-2 text-left hover:bg-paper"
          >
            <Mini w={p.width} h={p.height} slots={p.slots} />
            <span className="flex min-w-0 flex-col gap-0.5">
              <span className="truncate">{p.name}</span>
              <span className={small}>
                {paperLabel(p.paper, p)} · {p.slots.length} foto
              </span>
            </span>
          </button>
          {confirm === p.id ? (
            <span className="flex flex-none items-center gap-1 pr-2 text-xs">
              Hapus?
              <button
                type="button"
                onClick={() => remove(p.id)}
                className="rounded-[8px] border-[1.5px] border-ink bg-coral px-2 py-1 font-bold"
              >
                Ya
              </button>
              <button
                type="button"
                onClick={() => setConfirm(null)}
                className="rounded-[8px] px-1.5 py-1 font-bold underline"
              >
                Batal
              </button>
            </span>
          ) : (
            <button
              type="button"
              aria-label={`Hapus tata letak ${p.name}`}
              title="Hapus"
              onClick={() => setConfirm(p.id)}
              className="mr-2 flex size-8 flex-none items-center justify-center rounded-[8px] text-text-2 hover:bg-paper hover:text-ink"
            >
              <Trash2 className="size-4" />
            </button>
          )}
        </div>
      ))}
      {!mine.length && (
        <p className={small}>
          Belum ada tata letak tersimpan. Atur slot, lalu Simpan tata letak ini.
        </p>
      )}
      {name === null ? (
        <button
          type="button"
          disabled={!slots.length}
          onClick={() => {
            setErr("");
            setName(`Tata letak ${slots.length} foto`);
          }}
          className="flex h-10 items-center justify-center rounded-[12px] border-[1.5px] border-dashed border-ink bg-white text-[13px] font-bold hover:bg-paper disabled:opacity-40"
        >
          Simpan tata letak ini
        </button>
      ) : (
        <form
          onSubmit={save}
          className="flex flex-col gap-2 rounded-[14px] border-[1.5px] border-ink bg-white p-3"
        >
          <input
            aria-label="Nama tata letak"
            value={name}
            maxLength={60}
            // biome-ignore lint/a11y/noAutofocus: form kecil baru dibuka karena klik
            autoFocus
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === "Escape" && setName(null)}
            className="h-9 rounded-[10px] border-[1.5px] border-ink px-2 text-sm font-semibold"
          />
          <span className={small}>
            {slots.length} slot · {paperLabel(paper, canvas)}. Teks &amp; overlay tidak ikut.
          </span>
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={busy || !name.trim()}
              className="h-9 flex-1 rounded-[10px] border-[1.5px] border-ink bg-butter text-[13px] font-extrabold disabled:opacity-50"
            >
              {busy ? "Menyimpan…" : "Simpan tata letak"}
            </button>
            <button
              type="button"
              onClick={() => setName(null)}
              className="h-9 rounded-[10px] px-3 text-[13px] font-bold underline"
            >
              Batal
            </button>
          </div>
        </form>
      )}
      {err && (
        <p role="alert" className="text-xs font-semibold text-coral-strong">
          {err}
        </p>
      )}
    </Section>
  );
}

/** Rel ikon + panel kiri editor (seperti Canva). */
export function Panels({
  ed,
  tab,
  setTab,
}: {
  ed: EditorApi;
  tab: Tab | null;
  setTab: (t: Tab | null) => void;
}) {
  const [dragKey, setDragKey] = useState<Key | null>(null);
  const presets = (
    Object.entries(LAYOUT_PRESETS) as [PresetId, (typeof LAYOUT_PRESETS)[PresetId]][]
  ).filter(
    ([, p]) =>
      p.layout.paper === ed.layout.paper && p.layout.canvas.width === ed.layout.canvas.width,
  );
  const stack = layerStack(ed.layout);
  const labelOf = (k: Key) => {
    if (k === OVERLAY) return "Overlay PNG";
    if (k.startsWith("s:"))
      return `Foto ${ed.layout.slots.findIndex((s) => `s:${s.id}` === k) + 1}`;
    const t = ed.layout.texts.find((x) => `t:${x.id}` === k);
    return `Teks · ${(t?.value ?? "").replace("{event_name}", "nama event").replace("{date}", "tanggal") || "(kosong)"}`;
  };
  const dropOn = (target: Key) => {
    if (!dragKey || dragKey === target) return;
    const src = stack.indexOf(dragKey);
    const without = stack.filter((k) => k !== dragKey);
    const ti = without.indexOf(target);
    ed.reorder(dragKey, src < stack.indexOf(target) ? ti + 1 : ti);
    setDragKey(null);
  };
  const single = ed.sel.length === 1 ? ed.boxOf(ed.sel[0] as Key) : null;
  const selSlot = ed.selSlots.length === 1 && ed.sel.length === 1 ? ed.selSlots[0] : undefined;
  const selText = ed.selTexts.length === 1 && ed.sel.length === 1 ? ed.selTexts[0] : undefined;
  const selQr = ed.sel.length === 1 && ed.sel[0] === QR ? ed.layout.qr : undefined;

  return (
    <div className="flex flex-none">
      <nav
        aria-label="Panel editor"
        className="flex w-[76px] flex-col items-center gap-1 border-r-[1.5px] border-ink bg-white py-3"
      >
        {TABS.map(([t, label, Icon]) => (
          <button
            key={t}
            type="button"
            aria-pressed={tab === t}
            onClick={() => setTab(tab === t ? null : t)}
            className="flex w-[64px] flex-col items-center gap-1 rounded-[12px] border-[1.5px] border-transparent py-2 text-[11px] font-bold aria-pressed:border-ink aria-pressed:bg-butter"
          >
            <Icon className="size-5" />
            {label}
          </button>
        ))}
      </nav>
      {tab && (
        <aside className="flex w-[300px] flex-col gap-5 overflow-y-auto border-r-[1.5px] border-ink bg-paper p-4">
          {tab === "elemen" && (
            <>
              <Section title="Slot foto">
                {(
                  [
                    [3, 2, "Landscape 3:2", "h-6 w-9"],
                    [2, 3, "Portrait 2:3", "h-9 w-6"],
                    [1, 1, "Persegi 1:1", "size-7"],
                    [4, 5, "Portrait 4:5", "h-8 w-[26px]"],
                  ] as const
                ).map(([a, b, l, box]) => (
                  <button key={l} type="button" className={card} onClick={() => ed.addSlot(a, b)}>
                    <span className="flex size-10 flex-none items-center justify-center rounded-[10px] border-[1.5px] border-dashed border-ink bg-sky">
                      <span className={`${box} rounded-[3px] border-[1.5px] border-ink bg-white`} />
                    </span>
                    {l}
                  </button>
                ))}
                <p className={small}>
                  Nomor slot = urutan foto saat sesi. Ubah di toolbar "Foto ke-".
                </p>
              </Section>
              <MyLayouts ed={ed} />
              <Section title="Tata letak cepat">
                {presets.map(([pid, p]) => (
                  <button
                    key={pid}
                    type="button"
                    className={card}
                    onClick={() => ed.applyPreset(pid)}
                  >
                    <ImageIcon className="size-5 flex-none" />
                    <span className="flex-1">{p.name}</span>
                    <span className={small}>{p.info}</span>
                  </button>
                ))}
                <p className={small}>Mengganti semua slot (bisa di-urungkan dengan ⌘Z).</p>
              </Section>
              <Section title="Tautan tamu">
                <button type="button" className={card} onClick={ed.addQr}>
                  <span className="flex size-10 flex-none items-center justify-center rounded-[10px] border-[1.5px] border-ink bg-lavender">
                    <QrCode className="size-5" />
                  </span>
                  <span className="flex min-w-0 flex-col gap-0.5">
                    QR unduh foto
                    <span className="text-xs font-medium text-text-2">
                      Tamu scan untuk unduh foto &amp; video
                    </span>
                  </span>
                </button>
                <p className={small}>Satu QR per desain, selalu di lapisan paling atas.</p>
              </Section>
            </>
          )}

          {tab === "teks" && (
            <>
              <Section title="Tambah teks">
                <button
                  type="button"
                  className={`${card} text-[22px]`}
                  style={{ fontFamily: `"${ed.fonts["lib-instrument-serif-400-normal"] ?? ""}"` }}
                  onClick={() => ed.addText("title")}
                >
                  Tambah judul
                </button>
                <button
                  type="button"
                  className={`${card} text-base`}
                  onClick={() => ed.addText("sub")}
                >
                  Tambah subjudul
                </button>
                <button
                  type="button"
                  className={`${card} text-xs font-semibold`}
                  onClick={() => ed.addText("body")}
                >
                  Tambah teks kecil
                </button>
              </Section>
              <Section title="Kombinasi font">
                <p className={small}>
                  Klik untuk menambah judul + tanggal. Dengan teks terpilih: terapkan ke teks itu.
                </p>
                <div className="grid grid-cols-2 gap-2">
                  {FONT_PACKS.map((pk) => (
                    <button
                      key={pk.id}
                      type="button"
                      aria-label={`Kombinasi ${pk.name}`}
                      onClick={() => (ed.selTexts.length ? ed.applyPack(pk) : ed.addPack(pk))}
                      title={`${pk.name} · ${pk.use}`}
                      className="flex h-[104px] min-w-0 flex-col items-center justify-center gap-1 overflow-hidden rounded-[14px] border-[1.5px] border-ink bg-white px-2 text-center hover:bg-paper"
                    >
                      <span
                        className="whitespace-nowrap text-[17px] leading-tight"
                        style={{ fontFamily: `"${ed.fonts[pk.title.font] ?? ""}"` }}
                      >
                        Andi &amp; Sari
                      </span>
                      <span
                        className="text-[11px]"
                        style={{ fontFamily: `"${ed.fonts[pk.sub.font] ?? ""}"` }}
                      >
                        12 Oktober 2026
                      </span>
                      <span className="mt-1 w-full truncate text-[10px] font-bold text-text-2">
                        {pk.name} · {pk.use}
                      </span>
                    </button>
                  ))}
                </div>
              </Section>
            </>
          )}

          {tab === "unggahan" && (
            <>
              <Section title="Overlay PNG">
                <Upload1
                  label="Overlay"
                  hint={`${ed.W}×${ed.H} px, transparan`}
                  accept="image/png"
                  has={!!ed.layout.overlay}
                  onPick={(f) => ed.pick("ov", f)}
                  onRemove={() => ed.commit(({ overlay: _o, ...l }) => l)}
                />
              </Section>
              <Section title="Gambar latar">
                <Upload1
                  label="Gambar latar"
                  hint="PNG/JPG, ditarik penuh ke kanvas"
                  accept="image/png,image/jpeg"
                  has={!!ed.layout.background?.assetId}
                  onPick={(f) => ed.pick("bg", f)}
                  onRemove={() =>
                    ed.commit((l) => ({ ...l, background: { color: l.background?.color } }))
                  }
                />
              </Section>
              <Section title="Font sendiri">
                {FONT_IDS.map((f) => (
                  <label key={f} className={`${card} cursor-pointer`}>
                    <Type className="size-4 flex-none" />
                    <span className="min-w-0 flex-1 truncate">
                      {ed.fontNames[f] ?? "+ Upload font"}
                    </span>
                    <span className={small}>TTF/OTF/WOFF2</span>
                    <input
                      type="file"
                      accept=".ttf,.otf,.woff2"
                      aria-label={`Font ${f}`}
                      className="sr-only"
                      onChange={(e) => ed.pick(f, e.target.files?.[0])}
                    />
                  </label>
                ))}
                <p className={small}>Pastikan font boleh dipakai komersial.</p>
              </Section>
            </>
          )}

          {tab === "posisi" && (
            <>
              <Section title="Atur">
                <div className="grid grid-cols-2 gap-1.5">
                  {(
                    [
                      ["forward", ChevronsUp, "Maju"],
                      ["backward", ChevronsDown, "Mundur"],
                      ["front", BringToFront, "Paling depan"],
                      ["back", SendToBack, "Paling belakang"],
                    ] as const
                  ).map(([how, Icon, l]) => (
                    <button
                      key={how}
                      type="button"
                      disabled={!ed.sel.length}
                      onClick={() => ed.arrange(how)}
                      className="flex h-10 items-center justify-center gap-1.5 rounded-[10px] border-[1.5px] border-ink bg-white text-xs font-bold disabled:opacity-40"
                    >
                      <Icon className="size-4" />
                      {l}
                    </button>
                  ))}
                </div>
              </Section>
              <Section title="Ratakan ke">
                <div className={seg}>
                  {(
                    [
                      ["page", "Halaman"],
                      ["safe", "Margin aman"],
                      ...(ed.sel.length > 1 ? ([["selection", "Sesama"]] as const) : []),
                    ] as const
                  ).map(([v, l], i) => (
                    <button
                      key={v}
                      type="button"
                      aria-pressed={ed.alignTo === v}
                      onClick={() => ed.setAlignTo(v)}
                      className={`h-9 flex-1 ${i ? "border-l-[1.5px] border-ink" : ""} ${ed.alignTo === v ? "bg-lavender" : "bg-white"}`}
                    >
                      {l}
                    </button>
                  ))}
                </div>
                <AlignButtons ed={ed} />
                {!ed.sel.length && <p className={small}>Pilih elemen dulu.</p>}
              </Section>
              {single && (selSlot || selText || selQr) && (
                <Section title="Ukuran & posisi">
                  <div className="grid grid-cols-2 gap-2">
                    {selSlot && (
                      <>
                        <Num
                          label="X"
                          value={selSlot.x}
                          onChange={(x) => ed.patchSlot(selSlot.id, { x }, "x")}
                        />
                        <Num
                          label="Y"
                          value={selSlot.y}
                          onChange={(y) => ed.patchSlot(selSlot.id, { y }, "y")}
                        />
                        <Num
                          label="Lebar"
                          value={selSlot.w}
                          onChange={(w) => w >= 20 && ed.patchSlot(selSlot.id, { w }, "w")}
                        />
                        <Num
                          label="Tinggi"
                          value={selSlot.h}
                          onChange={(h) => h >= 20 && ed.patchSlot(selSlot.id, { h }, "h")}
                        />
                        <Num
                          label="Rotasi (°)"
                          value={selSlot.rotation ?? 0}
                          onChange={(r) =>
                            ed.patchSlot(selSlot.id, { rotation: r || undefined }, "r")
                          }
                        />
                      </>
                    )}
                    {selText && (
                      <>
                        <Num
                          label="X"
                          value={selText.x}
                          onChange={(x) => ed.patchText(selText.id ?? "", { x }, "x")}
                        />
                        <Num
                          label="Y"
                          value={selText.y}
                          onChange={(y) => ed.patchText(selText.id ?? "", { y }, "y")}
                        />
                        <Num
                          label="Lebar kotak"
                          value={selText.w}
                          onChange={(w) => w >= 20 && ed.patchText(selText.id ?? "", { w }, "w")}
                        />
                      </>
                    )}
                    {selQr && (
                      <>
                        <Num label="X" value={selQr.x} onChange={(x) => ed.patchQr({ x }, "x")} />
                        <Num label="Y" value={selQr.y} onChange={(y) => ed.patchQr({ y }, "y")} />
                        <Num
                          label="Ukuran"
                          value={selQr.size}
                          onChange={(size) => size > 0 && ed.patchQr({ size }, "size")}
                        />
                      </>
                    )}
                  </div>
                </Section>
              )}
            </>
          )}

          {tab === "layer" && (
            <Section title="Layer" aside={<span className={small}>atas = depan</span>}>
              {ed.layout.qr && (
                <LayerRow
                  label="QR unduh foto"
                  sub="selalu paling atas"
                  on={ed.sel.includes(QR)}
                  onClick={() => ed.setSel([QR])}
                />
              )}
              {[...stack].reverse().map((k) =>
                k === OVERLAY && !ed.layout.overlay ? (
                  <LayerRow
                    key="overlay"
                    label="Overlay (belum ada)"
                    sub="tetap"
                    onDrop={() => dropOn(OVERLAY)}
                  />
                ) : (
                  <LayerRow
                    key={k}
                    label={labelOf(k)}
                    on={ed.sel.includes(k)}
                    onClick={() => ed.setSel([k])}
                    draggable
                    onDragStart={() => setDragKey(k)}
                    onDrop={() => dropOn(k)}
                    up={() => {
                      ed.setSel([k]);
                      ed.commit((l) => ed.arrangeOne(l, k, "forward"));
                    }}
                    down={() => {
                      ed.setSel([k]);
                      ed.commit((l) => ed.arrangeOne(l, k, "backward"));
                    }}
                  />
                ),
              )}
              <LayerRow
                label="Latar"
                sub={ed.layout.background?.assetId ? "gambar + warna" : "warna"}
              />
              <p className={small}>
                Tarik baris untuk mengubah urutan. Melewati overlay = pindah ke depan/belakang
                overlay.
              </p>
            </Section>
          )}
        </aside>
      )}
    </div>
  );
}
