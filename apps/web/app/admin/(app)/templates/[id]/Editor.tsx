"use client";
import type { LayoutSlot, LayoutSpec, LayoutText } from "@tetra/shared";
import { browserContext, type ImageLike, render } from "@tetra/template-engine";
import Link from "next/link";
import {
  type PointerEvent,
  type ReactNode,
  startTransition,
  useActionState,
  useEffect,
  useRef,
  useState,
} from "react";
import { type AssetId, FONT_IDS } from "@/lib/layouts";
import { type SaveTemplateResult, saveTemplate } from "../actions";

type Sel = { kind: "slot" | "text"; i: number } | null;
const H = 620; // tinggi kanvas di layar (px)
const SAMPLE = ["#CEC8F6", "#D6EEF8", "#FCE3C6", "#D6F1EA", "#F7D5CC", "#EFEDE8"];
const VARS = { event_name: "Andi & Sari", date: "12 Oktober 2026", custom: "Teks bebas" };
const GEIST = "Geist Variable";
const input = "h-9 w-full rounded-[10px] border-[1.5px] border-ink bg-white px-2.5 text-sm";
const small = "font-mono text-[11px] text-text-2";
const round = (n: number) => Math.round(n);

/** Foto contoh per slot: warna pastel + nomor slot. */
function samplePhoto(w: number, h: number, i: number): ImageLike {
  const c = new OffscreenCanvas(w, h);
  const g = c.getContext("2d");
  if (g) {
    g.fillStyle = SAMPLE[i % SAMPLE.length] ?? "#EFEDE8";
    g.fillRect(0, 0, w, h);
    g.fillStyle = "#1D1D1B";
    g.font = `800 ${Math.min(w, h) / 3}px "Plus Jakarta Sans Variable"`;
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.fillText(String(i + 1), w / 2, h / 2);
  }
  return c;
}

function Panel({
  title,
  children,
  aside,
}: {
  title: string;
  children: ReactNode;
  aside?: ReactNode;
}) {
  return (
    <section className="flex flex-col gap-2.5 rounded-2xl border-[1.5px] border-ink bg-white p-4">
      <h2 className="flex items-center justify-between text-[13px] font-extrabold">
        {title}
        {aside}
      </h2>
      {children}
    </section>
  );
}

function Num({
  label,
  value,
  onChange,
  min,
}: {
  label: string;
  value: number;
  onChange: (n: number) => void;
  min?: number;
}) {
  return (
    <label className="flex flex-col gap-1 text-[11px] font-bold text-text-2">
      {label}
      <input
        type="number"
        className={`${input} font-mono`}
        value={round(value)}
        min={min}
        onChange={(e) => {
          const n = Number(e.target.value);
          if (Number.isFinite(n)) onChange(min !== undefined ? Math.max(min, n) : n);
        }}
      />
    </label>
  );
}

export function Editor({
  id,
  name: initialName,
  version: initialVersion,
  savedAt,
  initial,
  files,
}: {
  id: string;
  name: string;
  version: number;
  savedAt: string;
  initial: LayoutSpec;
  files: Record<string, string>;
}) {
  const [layout, setLayout] = useState<LayoutSpec>(initial);
  const [name, setName] = useState(initialName);
  const [sel, setSel] = useState<Sel>({ kind: "slot", i: 0 });
  const [pending, setPending] = useState<Partial<Record<AssetId, File>>>({});
  const [images, setImages] = useState<Record<string, ImageLike>>({});
  const [fonts, setFonts] = useState<Record<string, string>>({});
  const [fontNames, setFontNames] = useState<Record<string, string>>(files);
  const [lockRatio, setLockRatio] = useState(true);
  const [dirty, setDirty] = useState(false);
  const [r, action, saving] = useActionState<SaveTemplateResult, FormData>(
    saveTemplate.bind(null, id),
    null,
  );
  const version = r?.version ?? initialVersion;
  const canvas = useRef<HTMLCanvasElement>(null);
  const scale = H / layout.canvas.height;

  // Aset versi tersimpan dimuat lewat route admin (origin sama, font tidak butuh CORS).
  useEffect(() => {
    for (const [assetId, file] of Object.entries(files)) {
      const url = `/admin/templates/${id}/asset/${assetId}?v=${initialVersion}`;
      if (/\.(png|jpe?g)$/i.test(file))
        fetch(url)
          .then((res) => res.blob())
          .then(createImageBitmap)
          .then((img) => setImages((m) => ({ ...m, [assetId]: img })))
          .catch(() => {});
      else
        new FontFace(`tpl-${id}-${assetId}`, `url(${url})`)
          .load()
          .then((f) => {
            document.fonts.add(f);
            setFonts((m) => ({ ...m, [assetId]: f.family }));
          })
          .catch(() => {});
    }
  }, [files, id, initialVersion]);

  // Preview = engine yang sama dengan booth (strip tunggal untuk 2x6, bukan lembar ganda).
  useEffect(() => {
    const el = canvas.current;
    const g = el?.getContext("2d");
    if (!el || !g) return;
    let stop = false;
    document.fonts.load(`40px "${GEIST}"`).then(() => {
      if (stop) return;
      try {
        const ctx = { ...browserContext(GEIST), fontFamily: (f: string) => fonts[f] ?? GEIST };
        const out = render(
          layout,
          {
            photos: layout.slots.map((s, i) =>
              samplePhoto(Math.max(1, round(s.w)), Math.max(1, round(s.h)), i),
            ),
            assets: images,
            vars: VARS,
          },
          ctx,
        ) as unknown as OffscreenCanvas;
        const { width: w, height: h } = layout.canvas; // 2x6x2: cukup strip kiri
        g.clearRect(0, 0, el.width, el.height);
        g.drawImage(out, 0, 0, w, h, 0, 0, el.width, el.height);
      } catch {
        /* spec sementara tidak valid (mis. saat mengetik); preview terakhir dibiarkan */
      }
    });
    return () => {
      stop = true;
    };
  }, [layout, images, fonts]);

  const update = (fn: (l: LayoutSpec) => LayoutSpec) => {
    setLayout(fn);
    setDirty(true);
  };
  const setSlot = (i: number, patch: Partial<LayoutSlot>) =>
    update((l) => ({ ...l, slots: l.slots.map((s, j) => (j === i ? { ...s, ...patch } : s)) }));
  const setText = (i: number, patch: Partial<LayoutText>) =>
    update((l) => ({ ...l, texts: l.texts.map((t, j) => (j === i ? { ...t, ...patch } : t)) }));

  const pick = async (assetId: AssetId, file: File | undefined) => {
    if (!file) return;
    setPending((p) => ({ ...p, [assetId]: file }));
    setDirty(true);
    if (assetId === "ov" || assetId === "bg") {
      const img = await createImageBitmap(file);
      setImages((m) => ({ ...m, [assetId]: img }));
      update((l) =>
        assetId === "ov"
          ? { ...l, overlay: { assetId: "ov" } }
          : { ...l, background: { ...l.background, assetId: "bg" } },
      );
    } else {
      const f = await new FontFace(
        `tpl-${id}-${assetId}-${Date.now()}`,
        await file.arrayBuffer(),
      ).load();
      document.fonts.add(f);
      setFonts((m) => ({ ...m, [assetId]: f.family }));
      setFontNames((m) => ({ ...m, [assetId]: file.name }));
    }
  };

  const save = () => {
    const fd = new FormData();
    const { id: _i, version: _v, paper: _p, canvas: _c, ...rest } = layout;
    fd.set("layout", JSON.stringify(rest));
    fd.set("name", name);
    for (const [k, f] of Object.entries(pending)) if (f) fd.set(k, f);
    startTransition(() => action(fd));
  };
  useEffect(() => {
    if (r?.ok) {
      setPending({});
      setDirty(false);
    }
  }, [r]);

  // Geser / ubah ukuran kotak slot atau teks di kanvas (koordinat kanvas = px layar / scale).
  const drag = (e: PointerEvent, kind: "slot" | "text", i: number, mode: "move" | "resize") => {
    e.preventDefault();
    e.stopPropagation();
    setSel({ kind, i });
    const start = { x: e.clientX, y: e.clientY };
    const item = kind === "slot" ? layout.slots[i] : layout.texts[i];
    if (!item) return;
    const orig = { ...item };
    const ratio = kind === "slot" ? (orig as LayoutSlot).h / (orig as LayoutSlot).w : 1;
    const target = e.currentTarget as HTMLElement;
    target.setPointerCapture(e.pointerId);
    const move = (ev: globalThis.PointerEvent) => {
      const dx = (ev.clientX - start.x) / scale;
      const dy = (ev.clientY - start.y) / scale;
      if (mode === "move") {
        const patch = { x: round(orig.x + dx), y: round(orig.y + dy) };
        kind === "slot" ? setSlot(i, patch) : setText(i, patch);
      } else if (kind === "slot") {
        const w = Math.max(40, round((orig as LayoutSlot).w + dx));
        setSlot(i, {
          w,
          h: lockRatio ? round(w * ratio) : Math.max(40, round((orig as LayoutSlot).h + dy)),
        });
      } else setText(i, { w: Math.max(40, round(orig.w + dx)) });
    };
    const up = () => {
      target.removeEventListener("pointermove", move);
      target.removeEventListener("pointerup", up);
    };
    target.addEventListener("pointermove", move);
    target.addEventListener("pointerup", up);
  };

  const slot = sel?.kind === "slot" ? layout.slots[sel.i] : undefined;
  const text = sel?.kind === "text" ? layout.texts[sel.i] : undefined;
  const fontOptions = [
    { id: "geist", label: "Geist (bawaan)" },
    ...FONT_IDS.filter((f) => fontNames[f]).map((f) => ({ id: f, label: fontNames[f] ?? f })),
  ];
  const ext = (f?: string) => f?.split(".").pop()?.toUpperCase();

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <Link
          href="/admin/templates"
          className="text-[13px] font-semibold text-text-2 no-underline"
        >
          ‹ Template
        </Link>
        <input
          aria-label="Nama template"
          value={name}
          onChange={(e) => {
            setName(e.target.value);
            setDirty(true);
          }}
          className="h-10 min-w-0 flex-1 rounded-xl border-[1.5px] border-transparent bg-transparent px-2 text-[22px] font-extrabold tracking-[-0.03em] hover:border-dashed hover:border-ink focus:border-ink focus:bg-white"
        />
        <span className={small}>
          {dirty
            ? "belum disimpan"
            : `v${version} · tersimpan ${new Intl.DateTimeFormat("id-ID", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Jakarta" }).format(r?.ok ? new Date() : new Date(savedAt))}`}
        </span>
        <button
          type="button"
          onClick={save}
          disabled={saving}
          className="pressable layered h-11 rounded-xl border-[1.5px] border-ink bg-butter px-6 text-sm font-extrabold [--lb:1.5px] [--lx:4px]"
        >
          {saving ? "Menyimpan…" : "Simpan"}
        </button>
      </div>
      {r && (
        <p
          role="status"
          className={`rounded-xl border-[1.5px] border-dashed border-ink px-3.5 py-2.5 text-sm font-semibold ${r.ok ? "bg-mint-soft" : "bg-coral"}`}
        >
          {r.message}
        </p>
      )}

      <div className="grid grid-cols-[240px_minmax(0,1fr)_290px] items-start gap-4">
        {/* Kiri: format, latar, overlay, font */}
        <div className="flex flex-col gap-4">
          <Panel title="Format">
            <p className="flex gap-2 text-xs font-bold">
              <span className="rounded-lg border-[1.5px] border-ink bg-sky px-2.5 py-1">
                {layout.paper === "4R" ? "4x6" : "2x6 strip"}
              </span>
              <span className="rounded-lg border-[1.5px] border-dashed border-ink px-2.5 py-1">
                Portrait
              </span>
            </p>
            <p className={small}>
              {layout.canvas.width}×{layout.canvas.height} px · 300 dpi
              {layout.paper === "2x6x2" ? " · dicetak 2 strip per lembar" : ""}
            </p>
          </Panel>
          <Panel title="Overlay PNG">
            <label className="flex cursor-pointer flex-col items-center gap-1 rounded-xl border-[1.5px] border-dashed border-ink bg-paper px-3 py-4 text-center text-sm font-bold">
              {layout.overlay ? "Ganti overlay" : "+ Upload Overlay PNG"}
              <span className={small}>
                {layout.canvas.width}×{layout.canvas.height} px, transparan
              </span>
              <input
                type="file"
                accept="image/png"
                aria-label="Overlay PNG"
                className="sr-only"
                onChange={(e) => pick("ov", e.target.files?.[0])}
              />
            </label>
            {layout.overlay && (
              <button
                type="button"
                className="self-start text-xs font-bold underline"
                onClick={() => update(({ overlay: _o, ...l }) => l)}
              >
                Hapus overlay
              </button>
            )}
          </Panel>
          <Panel title="Latar">
            <label className="flex items-center justify-between text-xs font-bold">
              Warna
              <input
                type="color"
                aria-label="Warna latar"
                value={layout.background?.color ?? "#ffffff"}
                onChange={(e) =>
                  update((l) => ({ ...l, background: { ...l.background, color: e.target.value } }))
                }
                className="h-9 w-16 rounded-[10px] border-[1.5px] border-ink"
              />
            </label>
            <label className="cursor-pointer text-xs font-bold underline">
              {layout.background?.assetId ? "Ganti gambar latar" : "+ Gambar latar (PNG/JPG)"}
              <input
                type="file"
                accept="image/png,image/jpeg"
                aria-label="Gambar latar"
                className="sr-only"
                onChange={(e) => pick("bg", e.target.files?.[0])}
              />
            </label>
            {layout.background?.assetId && (
              <button
                type="button"
                className="self-start text-xs font-bold underline"
                onClick={() =>
                  update((l) => ({ ...l, background: { color: l.background?.color } }))
                }
              >
                Hapus gambar latar
              </button>
            )}
          </Panel>
          <Panel title="Font">
            {FONT_IDS.map((f) => (
              <label
                key={f}
                className="flex cursor-pointer items-center justify-between gap-2 text-xs font-bold"
              >
                <span className="truncate">{fontNames[f] ?? "+ Upload font"}</span>
                <span className={small}>{fontNames[f] ? ext(fontNames[f]) : "TTF/OTF/WOFF2"}</span>
                <input
                  type="file"
                  accept=".ttf,.otf,.woff2"
                  aria-label={`Font ${f}`}
                  className="sr-only"
                  onChange={(e) => pick(f, e.target.files?.[0])}
                />
              </label>
            ))}
          </Panel>
        </div>

        {/* Tengah: kanvas berpola titik */}
        <div
          className="flex min-h-[680px] items-center justify-center rounded-2xl border-[1.5px] border-ink bg-paper bg-[radial-gradient(#D6D3CC_1px,transparent_1px)] bg-size-[16px_16px] p-6"
          onPointerDown={() => setSel(null)}
        >
          <div
            className="relative border-[1.5px] border-ink bg-white"
            style={{ width: layout.canvas.width * scale, height: H }}
          >
            <canvas
              ref={canvas}
              width={round(layout.canvas.width * scale * 2)}
              height={H * 2}
              className="absolute inset-0 size-full"
            />
            {layout.slots.map((s, i) => {
              const on = sel?.kind === "slot" && sel.i === i;
              return (
                <button
                  // biome-ignore lint/suspicious/noArrayIndexKey: urutan slot = identitas slot
                  key={i}
                  type="button"
                  aria-label={`Slot ${i + 1}`}
                  onPointerDown={(e) => drag(e, "slot", i, "move")}
                  className={`absolute cursor-move border-2 ${on ? "border-mint" : "border-dashed border-ink/40"}`}
                  style={{
                    left: s.x * scale,
                    top: s.y * scale,
                    width: s.w * scale,
                    height: s.h * scale,
                    transform: s.rotation ? `rotate(${s.rotation}deg)` : undefined,
                  }}
                >
                  <span
                    className={`absolute top-1 left-1 rounded-md border-[1.5px] border-ink px-1.5 text-[10px] font-bold ${on ? "bg-mint" : "bg-white"}`}
                  >
                    Slot {i + 1}
                  </span>
                  {on && (
                    <span
                      aria-hidden
                      onPointerDown={(e) => drag(e, "slot", i, "resize")}
                      className="absolute -right-1.5 -bottom-1.5 size-3 cursor-nwse-resize rounded-sm border-[1.5px] border-ink bg-mint"
                    />
                  )}
                </button>
              );
            })}
            {layout.texts.map((t, i) => {
              const on = sel?.kind === "text" && sel.i === i;
              return (
                <button
                  // biome-ignore lint/suspicious/noArrayIndexKey: urutan teks = identitas teks
                  key={i}
                  type="button"
                  aria-label={`Teks ${i + 1}`}
                  onPointerDown={(e) => drag(e, "text", i, "move")}
                  className={`absolute cursor-move border-2 ${on ? "border-lavender" : "border-transparent hover:border-dashed hover:border-ink/40"}`}
                  style={{
                    left: t.x * scale,
                    top: t.y * scale,
                    width: t.w * scale,
                    height: t.size * 1.25 * scale,
                  }}
                >
                  {on && (
                    <span
                      aria-hidden
                      onPointerDown={(e) => drag(e, "text", i, "resize")}
                      className="absolute -right-1.5 -bottom-1.5 size-3 cursor-ew-resize rounded-sm border-[1.5px] border-ink bg-lavender"
                    />
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Kanan: properti, urutan layer, daftar slot, teks dinamis */}
        <div className="flex flex-col gap-4">
          {slot && sel && (
            <Panel
              title={`Slot ${sel.i + 1}`}
              aside={
                <span className="rounded-md border-[1.5px] border-ink bg-mint px-1.5 text-[10px]">
                  terpilih
                </span>
              }
            >
              <div className="grid grid-cols-2 gap-2">
                <Num label="X" value={slot.x} onChange={(x) => setSlot(sel.i, { x })} />
                <Num label="Y" value={slot.y} onChange={(y) => setSlot(sel.i, { y })} />
                <Num
                  label="Lebar"
                  min={40}
                  value={slot.w}
                  onChange={(w) =>
                    setSlot(sel.i, lockRatio ? { w, h: round((w * slot.h) / slot.w) } : { w })
                  }
                />
                <Num
                  label="Tinggi"
                  min={40}
                  value={slot.h}
                  onChange={(h) =>
                    setSlot(sel.i, lockRatio ? { h, w: round((h * slot.w) / slot.h) } : { h })
                  }
                />
                <Num
                  label="Rotasi (°)"
                  value={slot.rotation ?? 0}
                  onChange={(rotation) => setSlot(sel.i, { rotation })}
                />
                <label className="flex items-end gap-1.5 pb-2 text-[11px] font-bold">
                  <input
                    type="checkbox"
                    checked={lockRatio}
                    onChange={(e) => setLockRatio(e.target.checked)}
                  />
                  Kunci rasio
                </label>
              </div>
              <div className="flex gap-1.5">
                {(
                  [
                    [3, 2, "3:2"],
                    [2, 3, "2:3"],
                  ] as const
                ).map(([a, b, l]) => (
                  <button
                    key={l}
                    type="button"
                    onClick={() => setSlot(sel.i, { h: round((slot.w * b) / a) })}
                    className="h-8 flex-1 rounded-lg border-[1.5px] border-ink bg-white text-xs font-bold"
                  >
                    Rasio {l}
                  </button>
                ))}
              </div>
              <p className="text-[11px] font-bold text-text-2">Urutan layer</p>
              <div className="flex overflow-hidden rounded-lg border-[1.5px] border-ink text-xs font-bold">
                {(
                  [
                    ["above_overlay", "Di atas overlay"],
                    ["below_overlay", "Di bawah overlay"],
                  ] as const
                ).map(([z, l], k) => (
                  <button
                    key={z}
                    type="button"
                    aria-pressed={slot.z === z}
                    onClick={() => setSlot(sel.i, { z })}
                    className={`h-8 flex-1 ${k ? "border-l-[1.5px] border-ink" : ""} ${slot.z === z ? "bg-lavender" : "bg-white"}`}
                  >
                    {l}
                  </button>
                ))}
              </div>
            </Panel>
          )}

          {text && sel && (
            <Panel title={`Teks ${sel.i + 1}`}>
              <label className="flex flex-col gap-1 text-[11px] font-bold text-text-2">
                Isi teks
                <input
                  className={input}
                  value={text.value}
                  onChange={(e) => setText(sel.i, { value: e.target.value })}
                />
              </label>
              <p className="flex flex-wrap gap-1">
                {(["{event_name}", "{date}"] as const).map((v) => (
                  <button
                    key={v}
                    type="button"
                    onClick={() => setText(sel.i, { value: `${text.value}${v}` })}
                    className="rounded-md border-[1.5px] border-dashed border-ink px-1.5 font-mono text-[11px]"
                  >
                    + {v}
                  </button>
                ))}
              </p>
              <label className="flex flex-col gap-1 text-[11px] font-bold text-text-2">
                Font
                <select
                  className={input}
                  value={text.fontAssetId}
                  onChange={(e) => setText(sel.i, { fontAssetId: e.target.value })}
                >
                  {fontOptions.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.label}
                    </option>
                  ))}
                </select>
              </label>
              <div className="grid grid-cols-2 gap-2">
                <Num
                  label="Ukuran"
                  min={8}
                  value={text.size}
                  onChange={(size) => setText(sel.i, { size })}
                />
                <label className="flex flex-col gap-1 text-[11px] font-bold text-text-2">
                  Warna
                  <input
                    type="color"
                    value={text.color}
                    onChange={(e) => setText(sel.i, { color: e.target.value })}
                    className="h-9 w-full rounded-[10px] border-[1.5px] border-ink"
                  />
                </label>
                <Num label="X" value={text.x} onChange={(x) => setText(sel.i, { x })} />
                <Num label="Y" value={text.y} onChange={(y) => setText(sel.i, { y })} />
                <Num
                  label="Lebar"
                  min={40}
                  value={text.w}
                  onChange={(w) => setText(sel.i, { w })}
                />
              </div>
              <div className="flex overflow-hidden rounded-lg border-[1.5px] border-ink text-xs font-bold">
                {(
                  [
                    ["left", "Kiri"],
                    ["center", "Tengah"],
                    ["right", "Kanan"],
                  ] as const
                ).map(([a, l], k) => (
                  <button
                    key={a}
                    type="button"
                    aria-pressed={text.align === a}
                    onClick={() => setText(sel.i, { align: a })}
                    className={`h-8 flex-1 ${k ? "border-l-[1.5px] border-ink" : ""} ${text.align === a ? "bg-lavender" : "bg-white"}`}
                  >
                    {l}
                  </button>
                ))}
              </div>
            </Panel>
          )}

          <Panel
            title="Slot"
            aside={
              <button
                type="button"
                className="text-xs font-bold underline"
                onClick={() => {
                  const i = layout.slots.length;
                  const w = round(layout.canvas.width / 2);
                  update((l) => ({
                    ...l,
                    slots: [
                      ...l.slots,
                      {
                        id: `s${Date.now().toString(36)}`,
                        x: round(w / 2),
                        y: round(layout.canvas.height / 3),
                        w,
                        h: round((w * 2) / 3),
                        fit: "cover",
                        z: "below_overlay",
                      },
                    ],
                  }));
                  setSel({ kind: "slot", i });
                }}
              >
                + Tambah slot
              </button>
            }
          >
            {layout.slots.map((s, i) => (
              <div
                key={s.id}
                className={`flex items-center justify-between rounded-lg border-[1.5px] px-2.5 py-1.5 text-xs font-bold ${sel?.kind === "slot" && sel.i === i ? "border-ink bg-mint-soft" : "border-dashed border-ink"}`}
              >
                <button
                  type="button"
                  className="flex-1 text-left"
                  onClick={() => setSel({ kind: "slot", i })}
                >
                  Slot {i + 1}{" "}
                  <span className={small}>
                    {round(s.w)}×{round(s.h)}
                  </span>
                </button>
                {layout.slots.length > 1 && (
                  <button
                    type="button"
                    aria-label={`Hapus slot ${i + 1}`}
                    className="text-[11px] underline"
                    onClick={() => {
                      update((l) => ({ ...l, slots: l.slots.filter((_, j) => j !== i) }));
                      setSel(null);
                    }}
                  >
                    Hapus
                  </button>
                )}
              </div>
            ))}
            <p className={small}>Urutan slot = urutan foto yang diambil.</p>
          </Panel>

          <Panel
            title="Teks dinamis"
            aside={
              <button
                type="button"
                className="text-xs font-bold underline"
                onClick={() => {
                  const i = layout.texts.length;
                  update((l) => ({
                    ...l,
                    texts: [
                      ...l.texts,
                      {
                        x: 30,
                        y: round(layout.canvas.height - 200),
                        w: layout.canvas.width - 60,
                        fontAssetId: "geist",
                        size: 48,
                        color: "#1d1d1b",
                        align: "center",
                        value: "{event_name}",
                      },
                    ],
                  }));
                  setSel({ kind: "text", i });
                }}
              >
                + Tambah teks
              </button>
            }
          >
            {layout.texts.map((t, i) => (
              <div
                // biome-ignore lint/suspicious/noArrayIndexKey: urutan teks = identitas teks
                key={i}
                className={`flex items-center justify-between gap-2 rounded-lg border-[1.5px] px-2.5 py-1.5 text-xs font-bold ${sel?.kind === "text" && sel.i === i ? "border-ink bg-lavender" : "border-dashed border-ink"}`}
              >
                <button
                  type="button"
                  className="min-w-0 flex-1 truncate text-left"
                  onClick={() => setSel({ kind: "text", i })}
                >
                  {t.value || "(kosong)"}
                </button>
                <span className={small}>
                  X {round(t.x)} · Y {round(t.y)}
                </span>
                <button
                  type="button"
                  aria-label={`Hapus teks ${i + 1}`}
                  className="text-[11px] underline"
                  onClick={() => {
                    update((l) => ({ ...l, texts: l.texts.filter((_, j) => j !== i) }));
                    setSel(null);
                  }}
                >
                  Hapus
                </button>
              </div>
            ))}
            {!layout.texts.length && <p className={small}>Belum ada teks.</p>}
          </Panel>
        </div>
      </div>
    </div>
  );
}
