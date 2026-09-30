"use client";
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  Copy,
  Lock,
  Minus,
  Move,
  Plus,
  Trash2,
  Unlock,
} from "lucide-react";
import type { ReactNode, RefObject } from "react";
import { ColorPicker } from "@/components/ColorPicker";
import { Select } from "@/components/Select";
import { OVERLAY, QR, setOverlayRect } from "@/lib/editor/geometry";
import type { EditorApi } from "./Editor";
import type { Tab } from "./Panels";
import { AlignButtons } from "./Panels";
import { QR_MIN } from "./Stage";

const btn =
  "flex h-9 items-center gap-1.5 rounded-[10px] border-[1.5px] border-transparent px-2 text-[13px] font-bold hover:border-ink hover:bg-white aria-pressed:border-ink aria-pressed:bg-lavender";
const RATIOS = [
  [3, 2],
  [2, 3],
  [1, 1],
  [4, 5],
] as const;

function Sep() {
  return <span className="mx-1 h-6 w-px bg-line-soft" />;
}
function Group({ children }: { children: ReactNode }) {
  return <div className="flex items-center gap-1">{children}</div>;
}

/** Toolbar kontekstual di atas kanvas (seperti Canva): isinya mengikuti objek yang dipilih. */
export function Toolbar({
  ed,
  textInput,
  openTab,
}: {
  ed: EditorApi;
  textInput: RefObject<HTMLInputElement | null>;
  openTab: (t: Tab) => void;
}) {
  const text = ed.selTexts.length === 1 && ed.sel.length === 1 ? ed.selTexts[0] : undefined;
  const slot = ed.selSlots.length === 1 && ed.sel.length === 1 ? ed.selSlots[0] : undefined;
  const allTexts = ed.sel.length > 0 && ed.selTexts.length === ed.sel.length;
  const qr = ed.sel.length === 1 && ed.sel[0] === QR ? ed.layout.qr : undefined;
  const common = (
    <>
      <div className="flex-1" />
      <button type="button" className={btn} onClick={() => openTab("posisi")}>
        <Move className="size-4" /> Posisi
      </button>
      <button
        type="button"
        aria-label="Duplikat"
        title="Duplikat (⌘D)"
        className={btn}
        onClick={ed.duplicate}
      >
        <Copy className="size-4" />
      </button>
      <button
        type="button"
        aria-label="Hapus elemen"
        title="Hapus (Delete)"
        className={btn}
        onClick={ed.remove}
        disabled={ed.selSlots.length >= ed.layout.slots.length && ed.selTexts.length === 0}
      >
        <Trash2 className="size-4" />
      </button>
    </>
  );

  let body: ReactNode;
  if (!ed.sel.length) {
    body = (
      <>
        <span className="text-[13px] font-bold">Latar</span>
        <ColorPicker
          label="Warna latar"
          value={ed.layout.background?.color ?? "#ffffff"}
          docColors={ed.docColors}
          onChange={(c) =>
            ed.commit((l) => ({ ...l, background: { ...l.background, color: c } }), "bg")
          }
        />
        <Sep />
        <span className="text-[13px] text-text-2">
          Klik elemen untuk mengedit · Shift+klik / tarik area untuk memilih banyak · ⌘Z urungkan
        </span>
      </>
    );
  } else if (text || allTexts) {
    const t = text ?? ed.selTexts[0];
    if (!t) return null;
    const set = (patch: Parameters<EditorApi["patchTexts"]>[0], tag?: string) =>
      ed.patchTexts(patch, tag);
    body = (
      <>
        <div className="w-[210px]">
          <Select
            label="Font"
            size="sm"
            searchable
            menuWidth={280}
            value={t.fontAssetId}
            options={ed.fontOptions}
            onChange={(v) => set({ fontAssetId: v })}
          />
        </div>
        <Group>
          <button
            type="button"
            aria-label="Perkecil huruf"
            className={btn}
            onClick={() => set({ size: Math.max(8, t.size - 2) }, "size")}
          >
            <Minus className="size-3.5" />
          </button>
          <input
            aria-label="Ukuran huruf"
            type="number"
            value={Math.round(t.size)}
            onChange={(e) =>
              Number(e.target.value) >= 8 && set({ size: Number(e.target.value) }, "size")
            }
            className="h-9 w-14 rounded-[10px] border-[1.5px] border-ink text-center font-mono text-[13px]"
          />
          <button
            type="button"
            aria-label="Perbesar huruf"
            className={btn}
            onClick={() => set({ size: t.size + 2 }, "size")}
          >
            <Plus className="size-3.5" />
          </button>
        </Group>
        <ColorPicker
          label="Warna teks"
          value={t.color}
          docColors={ed.docColors}
          onChange={(c) => set({ color: c }, "color")}
        />
        <Group>
          {(
            [
              ["left", AlignLeft, "Rata kiri"],
              ["center", AlignCenter, "Rata tengah"],
              ["right", AlignRight, "Rata kanan"],
            ] as const
          ).map(([a, Icon, l]) => (
            <button
              key={a}
              type="button"
              aria-label={l}
              aria-pressed={t.align === a}
              className={btn}
              onClick={() => set({ align: a })}
            >
              <Icon className="size-4" />
            </button>
          ))}
        </Group>
        {text && (
          <>
            <Sep />
            <input
              ref={textInput}
              aria-label="Isi teks"
              value={text.value}
              onChange={(e) =>
                ed.patchText(text.id ?? "", { value: e.target.value }, `value-${text.id}`)
              }
              className="h-9 w-[200px] rounded-[10px] border-[1.5px] border-ink px-2.5 text-[13px]"
            />
            {(["{event_name}", "{date}"] as const).map((v) => (
              <button
                key={v}
                type="button"
                className="h-7 whitespace-nowrap rounded-md border-[1.5px] border-dashed border-ink px-1.5 font-mono text-[11px]"
                onClick={() => ed.patchText(text.id ?? "", { value: `${text.value}${v}` })}
              >
                + {v === "{event_name}" ? "nama event" : "tanggal"}
              </button>
            ))}
          </>
        )}
        {common}
      </>
    );
  } else if (qr) {
    body = (
      <>
        <span className="text-[13px] font-bold whitespace-nowrap">QR unduh foto</span>
        <label className="flex items-center gap-1.5 text-[13px] font-bold">
          Ukuran
          <input
            aria-label="Ukuran QR"
            type="number"
            min={QR_MIN}
            value={Math.round(qr.size)}
            onChange={(e) =>
              Number(e.target.value) > 0 && ed.patchQr({ size: Number(e.target.value) }, "size")
            }
            className="h-9 w-20 rounded-[10px] border-[1.5px] border-ink text-center font-mono text-[13px]"
          />
          px
        </label>
        <ColorPicker
          label="Warna QR"
          value={qr.color ?? "#1d1d1b"}
          docColors={ed.docColors}
          onChange={(c) => ed.patchQr({ color: c }, "color")}
        />
        <Sep />
        <span
          className="text-[13px] whitespace-nowrap text-text-2"
          title={`Kotak QR berlatar putih. Pakai warna gelap dan ukuran minimal ${QR_MIN} px.`}
        >
          Perlu latar terang agar bisa dipindai
        </span>
        <div className="flex-1" />
        <button type="button" className={btn} onClick={() => openTab("posisi")}>
          <Move className="size-4" /> Posisi
        </button>
        <button
          type="button"
          aria-label="Hapus elemen"
          title="Hapus (Delete)"
          className={btn}
          onClick={ed.remove}
        >
          <Trash2 className="size-4" />
        </button>
      </>
    );
  } else if (slot) {
    const n = ed.layout.slots.indexOf(slot) + 1;
    body = (
      <>
        <div className="w-[128px]">
          <Select
            label="Urutan foto"
            size="sm"
            value={String(n)}
            options={ed.layout.slots.map((_, i) => ({
              value: String(i + 1),
              label: `Foto ke-${i + 1}`,
            }))}
            onChange={(v) => ed.setPhotoNo(slot.id, Number(v))}
          />
        </div>
        <Sep />
        <Group>
          {RATIOS.map(([a, b]) => (
            <button
              key={`${a}:${b}`}
              type="button"
              className={btn}
              aria-pressed={Math.abs(slot.w / slot.h - a / b) < 0.01}
              onClick={() => ed.patchSlot(slot.id, { h: Math.round((slot.w * b) / a) })}
            >
              {a}:{b}
            </button>
          ))}
          <button
            type="button"
            aria-label="Kunci rasio"
            aria-pressed={ed.lockRatio}
            title="Kunci rasio saat menarik sudut (Shift juga mengunci)"
            className={btn}
            onClick={() => ed.setLockRatio(!ed.lockRatio)}
          >
            {ed.lockRatio ? <Lock className="size-4" /> : <Unlock className="size-4" />}
          </button>
        </Group>
        <Sep />
        <label className="flex items-center gap-1.5 text-[13px] font-bold">
          Putar
          <input
            aria-label="Rotasi"
            type="number"
            value={slot.rotation ?? 0}
            onChange={(e) =>
              ed.patchSlot(slot.id, { rotation: Number(e.target.value) || undefined }, "rot")
            }
            className="h-9 w-16 rounded-[10px] border-[1.5px] border-ink text-center font-mono text-[13px]"
          />
          °
        </label>
        {common}
      </>
    );
  } else {
    body = (
      <>
        <span className="text-[13px] font-bold">
          {ed.sel.length === 1 && ed.sel[0] === OVERLAY ? "Overlay" : `${ed.sel.length} elemen`}
        </span>
        {ed.sel.includes(OVERLAY) && (
          <button
            type="button"
            className={btn}
            title="Kembalikan overlay ke ukuran penuh kanvas"
            onClick={() =>
              ed.commit((l) =>
                setOverlayRect(l, { x: 0, y: 0, w: l.canvas.width, h: l.canvas.height }),
              )
            }
          >
            Penuhkan
          </button>
        )}
        <Sep />
        <AlignButtons ed={ed} compact />
        {common}
      </>
    );
  }

  return (
    <div className="flex h-[52px] flex-none items-center gap-2 overflow-x-auto border-b-[1.5px] border-ink bg-paper px-3">
      {body}
    </div>
  );
}
