"use client";
import {
  type AssetId,
  FONT_IDS,
  LAYOUT_PRESETS,
  type LayoutPaper,
  type LayoutSlot,
  type LayoutSpec,
  type LayoutText,
  paperLabel,
  SAFE_MARGIN_PX,
  type SavedPreset,
} from "@tetra/shared";
import type { ImageLike } from "@tetra/template-engine";
import { ChevronLeft, Eye, EyeOff, Minus, Plus, Redo2, Undo2 } from "lucide-react";
import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { type FontPack, LIB_FONTS, type LibFont } from "./fonts";
import {
  type AlignMode,
  type Arrange,
  alignDelta,
  arrange as arrangeLayers,
  type Key,
  layerStack,
  moveLayer,
  OVERLAY,
  overlayRect,
  QR,
  type Rect,
  rotatedBounds,
  setOverlayRect,
  slotKey,
  textKey,
  union,
} from "./geometry";
import { useHistory } from "./history";
import { Panels, type Tab } from "./Panels";
import { type Box, GEIST, Stage } from "./Stage";
import { Toolbar } from "./Toolbar";

const uid = () => Math.random().toString(36).slice(2, 9);
const withIds = (l: LayoutSpec): LayoutSpec => ({
  ...l,
  texts: l.texts.map((t) => (t.id ? t : { ...t, id: uid() })),
});
const VARS: Record<string, string> = {
  event_name: "Andi & Sari",
  date: "12 Oktober 2026",
  custom: "Teks bebas",
};
const fill = (v: string) =>
  v.replace(/\{(event_name|date|custom)\}/g, (_, k: string) => VARS[k] ?? "");
const SAFE_KEY = "tetra.editor.safe";

export type AlignTo = "page" | "safe" | "selection";

/** Isi yang disimpan host. `layout` lengkap (id/version/paper/canvas lama); `pendingFiles` = file baru per assetId. */
export type SaveInput = {
  layout: LayoutSpec;
  name: string;
  pendingFiles: Partial<Record<AssetId, File>>;
};
export type SaveResult =
  | { ok: true; version: number; message: string }
  | { ok: false; message: string };
export type NewPresetInput = {
  name: string;
  paper: LayoutPaper;
  canvas: { width: number; height: number };
  slots: LayoutSlot[];
};
export type SavePresetResult = { ok: true; preset: SavedPreset } | { ok: false; message: string };
/** Keadaan editor untuk tombol tambahan host di header (mis. tes cetak & bantuan printer admin). */
export type EditorActionsContext = {
  layout: LayoutSpec;
  images: Record<string, ImageLike>;
  fontFamily: (fontAssetId: string) => string;
};

export type TemplateEditorProps = {
  /** Versi layout yang dibuka. */
  initial: LayoutSpec;
  name: string;
  version: number;
  /** ISO waktu versi ini disimpan (label "tersimpan hh:mm"). */
  savedAt: string;
  /** assetId → nama file aset versi ini (`ov.png`, `f1.ttf`, `lib-….woff2`). */
  files: Record<string, string>;
  /** "Tata letak saya" organisasi (semua kertas; editor menyaring yang cocok). */
  presets: SavedPreset[];
  /** URL untuk memuat aset versi ini (gambar/font). Dibaca ulang hanya saat `files` berubah. */
  assetUrl: (assetId: string) => string;
  /** URL file woff2 font pustaka (`LIB_FONTS`). Dibaca ulang hanya saat `files` berubah. */
  fontUrl: (font: LibFont) => string;
  onSave: (input: SaveInput) => Promise<SaveResult>;
  onSavePreset: (input: NewPresetInput) => Promise<SavePresetResult>;
  /** true = terhapus. */
  onDeletePreset: (id: string) => Promise<boolean>;
  onBack: () => void;
  /** Tombol tambahan di header sebelum "Margin aman" (admin: Printer + Tes cetak). Kosong = tidak ada. */
  actions?: (ctx: EditorActionsContext) => ReactNode;
};

/** API editor yang dipakai panel & toolbar. */
export type EditorApi = ReturnType<typeof useEditorApi>;

function useEditorApi(p: TemplateEditorProps) {
  const [presets, setPresets] = useState(p.presets);
  const h = useHistory<LayoutSpec>(withIds(p.initial));
  const layout = h.value;
  const [sel, setSel] = useState<Key[]>([]);
  const [images, setImages] = useState<Record<string, ImageLike>>({});
  const [fonts, setFonts] = useState<Record<string, string>>({});
  const [fontsVersion, setFontsVersion] = useState(0);
  const [fontNames, setFontNames] = useState<Record<string, string>>(
    Object.fromEntries(Object.entries(p.files).filter(([k]) => k.startsWith("f"))),
  );
  const [pending, setPending] = useState<Partial<Record<AssetId, File>>>({});
  const [lockRatio, setLockRatio] = useState(true);
  const [alignTo, setAlignTo] = useState<AlignTo>("page");
  const [showSafe, setShowSafe] = useState(true);
  const W = layout.canvas.width;
  const H = layout.canvas.height;

  useEffect(() => {
    try {
      setShowSafe(localStorage.getItem(SAFE_KEY) !== "0");
    } catch {}
  }, []);
  const toggleSafe = () =>
    setShowSafe((v) => {
      try {
        localStorage.setItem(SAFE_KEY, v ? "0" : "1");
      } catch {}
      return !v;
    });

  const addFont = useCallback(
    async (assetId: string, family: string, src: string | ArrayBuffer) => {
      const f = await new FontFace(family, typeof src === "string" ? `url(${src})` : src).load();
      document.fonts.add(f);
      setFonts((m) => ({ ...m, [assetId]: family }));
      setFontsVersion((v) => v + 1);
    },
    [],
  );

  // Font pustaka + aset versi tersimpan (URL dari host).
  // biome-ignore lint/correctness/useExhaustiveDependencies: URL resolver host boleh fungsi inline; muat ulang hanya saat set file berganti
  useEffect(() => {
    for (const f of LIB_FONTS) addFont(f.id, `tb-${f.id}`, p.fontUrl(f)).catch(() => {});
    for (const [assetId, file] of Object.entries(p.files)) {
      const url = p.assetUrl(assetId);
      if (/\.(png|jpe?g)$/i.test(file))
        fetch(url)
          .then((r) => r.blob())
          .then(createImageBitmap)
          .then((img) => setImages((m) => ({ ...m, [assetId]: img })))
          .catch(() => {});
      else if (!assetId.startsWith("lib-"))
        addFont(assetId, `tpl-${p.initial.id}-${assetId}`, url).catch(() => {});
    }
  }, [p.files, addFont]);

  const fontFamily = useCallback((id: string) => fonts[id] ?? GEIST, [fonts]);

  // Kotak teks = glyph sebenarnya (baseline "top" seperti engine): lebar teks (maks. `w`, engine
  // memampatkan teks yang lebih lebar), diletakkan sesuai rata di dalam `w`.
  const measure = useMemo(() => {
    const c =
      typeof OffscreenCanvas === "undefined" ? null : new OffscreenCanvas(1, 1).getContext("2d");
    return (t: LayoutText) => {
      if (!c) return { top: 0, bottom: t.size * 1.2, width: t.w };
      c.font = `${t.size}px "${fonts[t.fontAssetId] ?? GEIST}"`;
      c.textBaseline = "top";
      const m = c.measureText(fill(t.value) || "Ag");
      const top = -m.actualBoundingBoxAscent;
      const bottom = m.actualBoundingBoxDescent;
      const width = Math.min(t.w, Math.max(m.width, 1));
      return bottom - top > 1 ? { top, bottom, width } : { top: 0, bottom: t.size, width };
    };
  }, [fonts]);

  const keys = useMemo(
    () => [
      ...layerStack(layout).filter((k) => k !== OVERLAY || !!layout.overlay),
      ...(layout.qr ? [QR] : []),
    ],
    [layout],
  );
  const boxOf = useCallback(
    (k: Key): Box | null => {
      if (k === OVERLAY) return layout.overlay ? { ...overlayRect(layout), rot: 0 } : null;
      if (k === QR) {
        const q = layout.qr;
        return q ? { x: q.x, y: q.y, w: q.size, h: q.size, rot: 0 } : null;
      }
      if (k.startsWith("s:")) {
        const s = layout.slots.find((x) => slotKey(x) === k);
        return s ? { x: s.x, y: s.y, w: s.w, h: s.h, rot: s.rotation ?? 0 } : null;
      }
      const t = layout.texts.find((x) => textKey(x) === k);
      if (!t) return null;
      const m = measure(t);
      const slack = t.w - m.width;
      const x = t.x + (t.align === "center" ? slack / 2 : t.align === "right" ? slack : 0);
      return { x, y: t.y + m.top, w: m.width, h: m.bottom - m.top, rot: 0 };
    },
    [layout, measure],
  );

  const selSlots = layout.slots.filter((s) => sel.includes(slotKey(s)));
  const selTexts = layout.texts.filter((t) => sel.includes(textKey(t)));
  const commit = h.commit;

  const patchSlot = (id: string, patch: Partial<LayoutSlot>, tag?: string) =>
    commit(
      (l) => ({ ...l, slots: l.slots.map((s) => (s.id === id ? { ...s, ...patch } : s)) }),
      tag,
    );
  const patchText = (id: string, patch: Partial<LayoutText>, tag?: string) =>
    commit(
      (l) => ({ ...l, texts: l.texts.map((t) => (t.id === id ? { ...t, ...patch } : t)) }),
      tag,
    );
  const patchTexts = (patch: Partial<LayoutText>, tag?: string) =>
    commit(
      (l) => ({
        ...l,
        texts: l.texts.map((t) => (sel.includes(textKey(t)) ? { ...t, ...patch } : t)),
      }),
      tag,
    );

  const topOrder = () => (layerStack(layout).length + 1) * 10;
  const addSlot = (rw: number, rh: number) => {
    const w = Math.round(W * 0.6);
    const hh = Math.round((w * rh) / rw);
    const s: LayoutSlot = {
      id: `s${uid()}`,
      x: Math.round((W - w) / 2),
      y: Math.round((H - hh) / 2),
      w,
      h: hh,
      fit: "cover",
      z: "below_overlay",
    };
    commit((l) => ({ ...l, slots: [...l.slots, s] }));
    setSel([slotKey(s)]);
  };
  const newText = ({
    y,
    ...t
  }: Omit<LayoutText, "id" | "x" | "y" | "w" | "z" | "order"> & { y?: number }): LayoutText => ({
    id: uid(),
    x: Math.round(W * 0.08),
    w: Math.round(W * 0.84),
    y: y ?? Math.round(H * 0.8),
    z: "above_overlay",
    order: topOrder(),
    ...t,
  });
  const addText = (kind: "title" | "sub" | "body") => {
    const spec = {
      title: { size: 96, value: "{event_name}", font: "lib-instrument-serif-400-normal" },
      sub: { size: 48, value: "{date}", font: "lib-figtree-500-normal" },
      body: { size: 30, value: "Terima kasih sudah datang", font: "lib-figtree-500-normal" },
    }[kind];
    const t = newText({
      fontAssetId: spec.font,
      size: spec.size,
      color: "#1d1d1b",
      align: "center",
      value: spec.value,
    });
    commit((l) => ({ ...l, texts: [...l.texts, t] }));
    setSel([textKey(t)]);
  };
  const addPack = (pk: FontPack) => {
    const y = Math.round(H * 0.8);
    const a = newText({
      fontAssetId: pk.title.font,
      size: pk.title.size,
      color: "#1d1d1b",
      align: "center",
      value: pk.title.value,
      y,
    });
    const b = {
      ...newText({
        fontAssetId: pk.sub.font,
        size: pk.sub.size,
        color: "#5f5e5a",
        align: "center",
        value: pk.sub.value,
        y: y + Math.round(pk.title.size * 1.15),
      }),
      order: (a.order ?? 0) + 1,
    };
    commit((l) => ({ ...l, texts: [...l.texts, a, b] }));
    setSel([textKey(a), textKey(b)]);
  };
  /** Terapkan paket ke 2 teks terpilih (atau semua teks): teks pertama = judul, sisanya = keterangan. */
  const applyPack = (pk: FontPack) => {
    const target = (selTexts.length ? selTexts : layout.texts).map((t) => t.id);
    if (!target.length) return addPack(pk);
    commit((l) => ({
      ...l,
      texts: l.texts.map((t) => {
        const i = target.indexOf(t.id);
        if (i < 0) return t;
        const s = i === 0 ? pk.title : pk.sub;
        return { ...t, fontAssetId: s.font, size: s.size };
      }),
    }));
  };

  /** Satu QR per desain: kalau sudah ada, cukup dipilih. Bawaan = kanan bawah di dalam margin aman. */
  const addQr = () => {
    if (!layout.qr) {
      const size = Math.round(Math.min(W, H) * 0.22);
      commit((l) => ({
        ...l,
        qr: { x: W - SAFE_MARGIN_PX - size, y: H - SAFE_MARGIN_PX - size, size },
      }));
    }
    setSel([QR]);
  };
  const patchQr = (patch: Partial<NonNullable<LayoutSpec["qr"]>>, tag?: string) =>
    commit((l) => (l.qr ? { ...l, qr: { ...l.qr, ...patch } } : l), tag);

  /** Tata letak cepat (bawaan atau tersimpan): ganti semua slot, bisa di-urungkan. */
  const applySlots = (slots: LayoutSlot[]) => {
    commit((l) => ({ ...l, slots: slots.map((s) => ({ ...s, id: `s${uid()}` })) }));
    setSel([]);
  };
  const applyPreset = (preset: keyof typeof LAYOUT_PRESETS) =>
    applySlots(LAYOUT_PRESETS[preset].layout.slots);

  const shiftOverlay = (l: LayoutSpec, dx: number, dy: number) => {
    const r = overlayRect(l);
    return setOverlayRect(l, { ...r, x: r.x + dx, y: r.y + dy });
  };
  const shiftQr = (l: LayoutSpec, dx: number, dy: number): LayoutSpec =>
    l.qr ? { ...l, qr: { ...l.qr, x: Math.round(l.qr.x + dx), y: Math.round(l.qr.y + dy) } } : l;
  const moveBy = (keysToMove: Key[], dx: number, dy: number) =>
    commit((l0) => {
      const l = keysToMove.includes(QR) ? shiftQr(l0, dx, dy) : l0;
      return {
        ...(keysToMove.includes(OVERLAY) ? shiftOverlay(l, dx, dy) : l),
        slots: l.slots.map((s) =>
          keysToMove.includes(slotKey(s))
            ? { ...s, x: Math.round(s.x + dx), y: Math.round(s.y + dy) }
            : s,
        ),
        texts: l.texts.map((t) =>
          keysToMove.includes(textKey(t))
            ? { ...t, x: Math.round(t.x + dx), y: Math.round(t.y + dy) }
            : t,
        ),
      };
    });

  const bounds = (k: Key) => {
    const b = boxOf(k);
    return b ? rotatedBounds(b, b.rot) : null;
  };
  const target = (): Rect => {
    const selection = union(sel.map(bounds).filter((b): b is Rect => !!b));
    if (sel.length > 1 && alignTo === "selection" && selection) return selection;
    const m = alignTo === "safe" ? SAFE_MARGIN_PX : 0;
    return { x: m, y: m, w: W - 2 * m, h: H - 2 * m };
  };
  const align = (mode: AlignMode) => {
    const t = target();
    commit((l) => {
      let next = l;
      for (const k of sel) {
        const b = bounds(k);
        if (!b) continue;
        const { dx, dy } = alignDelta(b, t, mode);
        if (k === OVERLAY || k === QR) {
          next = (k === QR ? shiftQr : shiftOverlay)(next, dx, dy);
          continue;
        }
        next = {
          ...next,
          slots: next.slots.map((s) =>
            slotKey(s) === k ? { ...s, x: Math.round(s.x + dx), y: Math.round(s.y + dy) } : s,
          ),
          texts: next.texts.map((x) =>
            textKey(x) === k ? { ...x, x: Math.round(x.x + dx), y: Math.round(x.y + dy) } : x,
          ),
        };
      }
      return next;
    });
  };
  const arrange = (how: Arrange) => commit((l) => arrangeLayers(l, sel, how));
  const reorder = (k: Key, to: number) => commit((l) => moveLayer(l, k, to));

  const remove = () => {
    if (!sel.length) return;
    const keepOne = layout.slots.length - selSlots.length < 1;
    commit(({ overlay, qr, ...l }) => ({
      ...l,
      ...(overlay && !sel.includes(OVERLAY) ? { overlay } : {}),
      ...(qr && !sel.includes(QR) ? { qr } : {}),
      slots: keepOne ? l.slots : l.slots.filter((s) => !sel.includes(slotKey(s))),
      texts: l.texts.filter((t) => !sel.includes(textKey(t))),
    }));
    setSel([]);
  };
  const clipboard = useRef<{ slots: LayoutSlot[]; texts: LayoutText[] } | null>(null);
  const copy = () => {
    clipboard.current = { slots: selSlots, texts: selTexts };
  };
  const paste = (offset = 30) => {
    const c = clipboard.current;
    if (!c || (!c.slots.length && !c.texts.length)) return;
    const o = topOrder();
    const slots = c.slots.map((s, i) => ({
      ...s,
      id: `s${uid()}`,
      x: s.x + offset,
      y: s.y + offset,
      z: "above_overlay" as const,
      order: o + i,
    }));
    const texts = c.texts.map((t, i) => ({
      ...t,
      id: uid(),
      x: t.x + offset,
      y: t.y + offset,
      order: o + slots.length + i,
    }));
    commit((l) => ({ ...l, slots: [...l.slots, ...slots], texts: [...l.texts, ...texts] }));
    setSel([...slots.map(slotKey), ...texts.map(textKey)]);
    clipboard.current = { slots, texts };
  };
  const duplicate = () => {
    copy();
    paste();
  };
  /** Urutan foto = urutan slot di array (pengambilan ke-n). */
  const setPhotoNo = (id: string, n: number) =>
    commit((l) => {
      const slots = [...l.slots];
      const from = slots.findIndex((s) => s.id === id);
      const [s] = slots.splice(from, 1);
      if (s) slots.splice(n - 1, 0, s);
      return { ...l, slots };
    });

  const pick = async (assetId: AssetId, file: File | undefined) => {
    if (!file) return;
    setPending((x) => ({ ...x, [assetId]: file }));
    if (assetId === "ov" || assetId === "bg") {
      const img = await createImageBitmap(file);
      setImages((m) => ({ ...m, [assetId]: img }));
      commit((l) =>
        assetId === "ov"
          ? { ...l, overlay: { assetId: "ov" } }
          : { ...l, background: { ...l.background, assetId: "bg" } },
      );
    } else {
      await addFont(assetId, `tpl-${assetId}-${Date.now()}`, await file.arrayBuffer());
      setFontNames((m) => ({ ...m, [assetId]: file.name }));
    }
  };

  const fontOptions = [
    { value: "geist", label: "Geist", group: "Bawaan", style: { fontFamily: GEIST } },
    ...LIB_FONTS.map((f) => ({
      value: f.id,
      label: f.name,
      group: f.category,
      style: { fontFamily: fonts[f.id] ? `"${fonts[f.id]}"` : undefined },
    })),
    ...FONT_IDS.filter((f) => fontNames[f]).map((f) => ({
      value: f,
      label: (fontNames[f] ?? f).replace(/\.(ttf|otf|woff2)$/i, ""),
      group: "Unggahan",
      style: { fontFamily: fonts[f] ? `"${fonts[f]}"` : undefined },
    })),
  ];
  const docColors = [
    ...(layout.background?.color ? [layout.background.color] : []),
    ...layout.texts.map((t) => t.color),
  ];

  return {
    ...h,
    layout,
    W,
    H,
    sel,
    setSel,
    keys,
    boxOf,
    selSlots,
    selTexts,
    patchSlot,
    patchText,
    patchTexts,
    addSlot,
    addText,
    addPack,
    applyPack,
    addQr,
    patchQr,
    applyPreset,
    applySlots,
    presets,
    setPresets,
    savePreset: p.onSavePreset,
    deletePreset: p.onDeletePreset,
    moveBy,
    align,
    alignTo,
    setAlignTo,
    arrange,
    arrangeOne: (l: LayoutSpec, k: Key, how: Arrange) => arrangeLayers(l, [k], how),
    reorder,
    remove,
    copy,
    paste,
    duplicate,
    setPhotoNo,
    pick,
    pending,
    setPending,
    images,
    fonts,
    fontsVersion,
    fontFamily,
    fontNames,
    fontOptions,
    docColors,
    lockRatio,
    setLockRatio,
    showSafe,
    toggleSafe,
  };
}

/**
 * Editor template gaya Canva (desain v2 E4, DECISIONS #74/#77), dipakai admin & booth (#128). Tanpa Next/Node:
 * penyimpanan, aset, dan navigasi disuntik host lewat props.
 */
export function TemplateEditor(props: TemplateEditorProps) {
  const { name: initialName, onSave, onBack, actions } = props;
  const ed = useEditorApi(props);
  const [name, setName] = useState(initialName);
  const [tab, setTab] = useState<Tab | null>("elemen");
  const [zoom, setZoom] = useState(1);
  const [area, setArea] = useState({ w: 800, h: 700 });
  const [savedLayout, setSavedLayout] = useState(ed.layout);
  const [savedName, setSavedName] = useState(initialName);
  const areaRef = useRef<HTMLDivElement>(null);
  const textInput = useRef<HTMLInputElement>(null);
  const [r, setR] = useState<SaveResult | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState({ version: props.version, at: new Date(props.savedAt) });
  const dirty =
    ed.layout !== savedLayout || name !== savedName || Object.keys(ed.pending).length > 0;

  useEffect(() => {
    const el = areaRef.current;
    if (!el) return;
    const ro = new ResizeObserver(
      ([e]) => e && setArea({ w: e.contentRect.width, h: e.contentRect.height }),
    );
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const fit = Math.min((area.w - 96) / ed.W, (area.h - 96) / ed.H);
  const scale = Math.max(0.05, fit * zoom);

  const save = async () => {
    if (saving) return;
    const input = { layout: ed.layout, name, pendingFiles: ed.pending };
    setSaving(true);
    const res = await onSave(input).catch(
      (): SaveResult => ({ ok: false, message: "Gagal menyimpan, coba lagi" }),
    );
    setSaving(false);
    setR(res);
    if (!res.ok) return;
    setSavedLayout(input.layout);
    setSavedName(input.name);
    ed.setPending({});
    setSaved({ version: res.version, at: new Date() });
  };

  // Peringatan keluar halaman kalau ada perubahan belum disimpan.
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  // Shortcut ala Canva. Diabaikan saat mengetik di input.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      const typing = el.closest(
        "input, textarea, [contenteditable=true], [role=listbox], [role=dialog]",
      );
      const mod = e.metaKey || e.ctrlKey;
      const k = e.key.toLowerCase();
      if (mod && k === "s") {
        e.preventDefault();
        save();
        return;
      }
      if (typing) return;
      if (mod && k === "z") {
        e.preventDefault();
        e.shiftKey ? ed.redo() : ed.undo();
      } else if (mod && k === "y") {
        e.preventDefault();
        ed.redo();
      } else if (mod && k === "d") {
        e.preventDefault();
        ed.duplicate();
      } else if (mod && k === "c") ed.copy();
      else if (mod && k === "v") ed.paste();
      else if (mod && k === "a") {
        e.preventDefault();
        ed.setSel(ed.keys);
      } else if (k === "delete" || k === "backspace") {
        e.preventDefault();
        ed.remove();
      } else if (k === "escape") ed.setSel([]);
      else if (k.startsWith("arrow") && ed.sel.length) {
        e.preventDefault();
        const n = e.shiftKey ? 10 : 1;
        ed.moveBy(
          ed.sel,
          k === "arrowleft" ? -n : k === "arrowright" ? n : 0,
          k === "arrowup" ? -n : k === "arrowdown" ? n : 0,
        );
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const onWheel = (e: React.WheelEvent) => {
    if (!e.ctrlKey && !e.metaKey) return;
    setZoom((z) => Math.min(4, Math.max(0.25, z * (e.deltaY < 0 ? 1.1 : 0.9))));
  };
  const time = new Intl.DateTimeFormat("id-ID", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Jakarta",
  });
  const icon =
    "flex size-9 items-center justify-center rounded-[10px] border-[1.5px] border-transparent hover:border-ink hover:bg-white disabled:opacity-35 disabled:hover:border-transparent disabled:hover:bg-transparent";

  return (
    <div className="flex h-dvh flex-col">
      <header className="flex h-[60px] flex-none items-center gap-3 border-b-[1.5px] border-ink bg-white px-4">
        <button
          type="button"
          onClick={onBack}
          aria-label="Kembali ke daftar template"
          className={icon}
        >
          <ChevronLeft className="size-5" />
        </button>
        <span className="flex size-8 items-center justify-center rounded-[9px] border-[1.5px] border-ink bg-mint text-sm font-extrabold">
          T
        </span>
        <input
          aria-label="Nama template"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="h-9 w-[320px] min-w-0 rounded-[10px] border-[1.5px] border-transparent px-2 text-[15px] font-extrabold hover:border-dashed hover:border-ink focus:border-ink focus:outline-none"
        />
        <div className="flex items-center gap-0.5 border-l-[1.5px] border-dashed border-line-soft pl-3">
          <button
            type="button"
            aria-label="Urungkan"
            title="Urungkan (⌘Z)"
            disabled={!ed.canUndo}
            onClick={ed.undo}
            className={icon}
          >
            <Undo2 className="size-[18px]" />
          </button>
          <button
            type="button"
            aria-label="Ulangi"
            title="Ulangi (⌘⇧Z)"
            disabled={!ed.canRedo}
            onClick={ed.redo}
            className={icon}
          >
            <Redo2 className="size-[18px]" />
          </button>
        </div>
        <span className="font-mono text-[11px] text-text-2">
          {saving
            ? "menyimpan…"
            : dirty
              ? "belum disimpan"
              : `v${saved.version} · tersimpan ${time.format(saved.at)}`}
        </span>
        <div className="ml-auto flex items-center gap-2">
          {actions?.({ layout: ed.layout, images: ed.images, fontFamily: ed.fontFamily })}
          <button
            type="button"
            aria-pressed={ed.showSafe}
            onClick={ed.toggleSafe}
            className="flex h-9 items-center gap-1.5 rounded-[10px] border-[1.5px] border-ink bg-white px-3 text-[13px] font-bold"
          >
            {ed.showSafe ? <Eye className="size-4" /> : <EyeOff className="size-4" />}
            Margin aman
          </button>
          <button
            type="button"
            onClick={save}
            disabled={saving}
            className="pressable layered h-10 rounded-xl border-[1.5px] border-ink bg-butter px-6 text-sm font-extrabold [--lb:1.5px] [--lx:4px]"
          >
            {saving ? "Menyimpan…" : "Simpan"}
          </button>
        </div>
      </header>
      {r && (
        <p
          role="status"
          className={`flex-none border-b-[1.5px] border-dashed border-ink px-4 py-2 text-[13px] font-semibold ${r.ok ? "bg-mint-soft" : "bg-coral"}`}
        >
          {r.message}
        </p>
      )}

      <div className="flex min-h-0 flex-1">
        <Panels ed={ed} tab={tab} setTab={setTab} />
        <div className="flex min-w-0 flex-1 flex-col">
          <Toolbar ed={ed} textInput={textInput} openTab={setTab} />
          <div
            ref={areaRef}
            onWheel={onWheel}
            className="relative min-h-0 flex-1 overflow-auto bg-[radial-gradient(#D6D3CC_1px,transparent_1px)] bg-size-[18px_18px]"
          >
            <Stage
              layout={ed.layout}
              scale={scale}
              keys={ed.keys}
              sel={ed.sel}
              setSel={ed.setSel}
              boxOf={ed.boxOf}
              preview={ed.preview}
              end={ed.end}
              showSafe={ed.showSafe}
              safe={SAFE_MARGIN_PX}
              images={ed.images}
              fontFamily={ed.fontFamily}
              fontsVersion={ed.fontsVersion}
              lockRatio={ed.lockRatio}
              onEditText={() => {
                textInput.current?.focus();
                textInput.current?.select();
              }}
            />
          </div>
          <footer className="flex h-11 flex-none items-center justify-between gap-3 border-t-[1.5px] border-ink bg-white px-4 text-xs">
            <span className="text-text-2">
              {paperLabel(ed.layout.paper, ed.layout.canvas)} · {ed.W}×{ed.H} px · 300 dpi ·
              Alt/Option saat menggeser = tanpa snap
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                aria-label="Perkecil"
                onClick={() => setZoom((z) => Math.max(0.25, z / 1.2))}
                className={icon}
              >
                <Minus className="size-4" />
              </button>
              <input
                type="range"
                aria-label="Zoom"
                min={25}
                max={400}
                value={Math.round(zoom * 100)}
                onChange={(e) => setZoom(Number(e.target.value) / 100)}
                className="w-32 accent-ink"
              />
              <button
                type="button"
                aria-label="Perbesar"
                onClick={() => setZoom((z) => Math.min(4, z * 1.2))}
                className={icon}
              >
                <Plus className="size-4" />
              </button>
              <button
                type="button"
                onClick={() => setZoom(1)}
                className="h-8 w-14 rounded-[9px] border-[1.5px] border-ink font-mono text-[11px]"
                title="Pas di layar"
              >
                {Math.round(zoom * 100)}%
              </button>
            </div>
          </footer>
        </div>
      </div>
    </div>
  );
}
