"use client";
import { DEFAULT_TOLERANCE, keyColor, rgbToHex, suggestKeyColor } from "@tetra/editor/chroma";
import { CHECKER, ChromaControls, type KeySetting } from "@tetra/editor/chroma-controls";
import { detectSlots } from "@tetra/editor/detect";
import type { LayoutSlot } from "@tetra/shared";
import { ImageUp, Pipette, TriangleAlert } from "lucide-react";
import {
  type Dispatch,
  type MouseEvent,
  type SetStateAction,
  useCallback,
  useEffect,
  useId,
  useState,
} from "react";

const MAX_BYTES = 4 * 1024 * 1024; // sama dengan batas server action (next.config)

/** Hasil olahan desain untuk kanvas `W×H` (basi kalau kertas diganti). */
type Out = {
  W: number;
  H: number;
  /** Setelan hapus warna yang dipakai (identitas sama dengan `Design.key` = segar). */
  key: KeySetting | undefined;
  /** PNG siap unggah. Kosong = belum ada area transparan (warna penanda belum kena). */
  file?: File | undefined;
  slots: LayoutSlot[];
  /** Jumlah area transparan terdeteksi (0 = satu slot contoh). */
  found: number;
  url: string;
  note: string;
  /** Piksel asli `W×H` (sebelum warna dihapus) untuk pipet. */
  src: Uint8ClampedArray;
  /** Desain asli tanpa transparansi (hapus warna wajib). */
  opaque: boolean;
  /** Saran warna penanda (#163). */
  suggested: string;
};
/** Desain unggahan wizard (#161, #163). */
export type Design = {
  file: File;
  /** Rasio beda tapi admin memilih lanjut: desain dimuat utuh di tengah, sisanya putih. */
  fit: boolean;
  /** Hapus warna penanda (#163). Kosong = pakai transparansi file. */
  key?: KeySetting | undefined;
  out?: Out | undefined;
};
type Status = { error?: string; mismatch?: { w: number; h: number } };

const hasHoles = (data: Uint8ClampedArray) => {
  for (let i = 3; i < data.length; i += 4) if ((data[i] ?? 255) < 128) return true;
  return false;
};

/**
 * Gambar desain ke kanvas `W×H` (selalu ukuran kertas 300 dpi), hapus warna penanda kalau diminta, deteksi slot,
 * lalu PNG siap unggah. Desain tanpa transparansi & tanpa `key` = `needKey` (saran warna).
 */
async function process(
  file: File,
  W: number,
  H: number,
  fit: boolean,
  key: KeySetting | undefined,
): Promise<Status & { out?: Out; needKey?: string }> {
  let img: ImageBitmap;
  try {
    img = await createImageBitmap(file);
  } catch {
    return { error: "File ini tidak bisa dibaca. Unggah PNG, JPG, atau WebP." };
  }
  const { width: w, height: h } = img;
  const same = Math.abs(w / h / (W / H) - 1) < 0.01;
  if (!same && !fit) return { mismatch: { w, h } };
  const c = new OffscreenCanvas(W, H);
  const g = c.getContext("2d");
  if (!g) return { error: "Browser tidak mendukung pengolahan gambar" };
  if (same) g.drawImage(img, 0, 0, W, H);
  else {
    const s = Math.min(W / w, H / h);
    const [dw, dh] = [Math.round(w * s), Math.round(h * s)];
    const [dx, dy] = [Math.round((W - dw) / 2), Math.round((H - dh) / 2)];
    g.fillStyle = "#ffffff";
    g.fillRect(0, 0, W, H);
    g.clearRect(dx, dy, dw, dh);
    g.drawImage(img, dx, dy, dw, dh);
  }
  const image = g.getImageData(0, 0, W, H);
  const { data } = image;
  const src = data.slice();
  const opaque = !hasHoles(data);
  const suggested = suggestKeyColor(data, W, H);
  if (opaque && !key) return { needKey: suggested };
  if (key) {
    keyColor(data, W, H, { color: key.color, tolerance: key.tol });
    g.putImageData(image, 0, 0);
  }
  const holes = !key || hasHoles(data);
  const rects = holes ? detectSlots(data, W, H) : [];
  // Ukuran & format sudah pas tanpa hapus warna = file asli (tanpa encode ulang); selain itu PNG hasil kanvas.
  const exact = !key && w === W && h === H && file.type === "image/png";
  const blob = exact ? file : await c.convertToBlob({ type: "image/png" });
  if (holes && blob.size > MAX_BYTES)
    return {
      error: `Desain ${(blob.size / 1024 / 1024).toFixed(1)} MB, maksimal 4 MB. Kompres gambarnya (mis. TinyPNG) lalu unggah lagi.`,
    };
  const slots = (
    rects.length || !holes
      ? rects
      : [
          {
            x: Math.round(W * 0.1),
            y: Math.round(H * 0.1),
            w: Math.round(W * 0.8),
            h: Math.round(H * 0.8),
          },
        ]
  ).map((r, i) => ({ id: `s${i + 1}`, ...r, fit: "cover" as const, z: "below_overlay" as const }));
  const note = !holes
    ? "Belum ada bagian yang jadi transparan. Klik warna penanda di pratinjau, atau naikkan kepekaan."
    : !rects.length
      ? "Tidak ada area foto yang cukup besar. Satu slot contoh dipasang, atur di editor."
      : !same
        ? `Desain ${w}×${h} px dimuat utuh di tengah kertas, sisanya putih.`
        : w !== W || h !== H
          ? `Desain ${w}×${h} px disesuaikan ke ${W}×${H} px.`
          : "";
  const out = new File([blob], "ov.png", { type: "image/png" });
  return {
    out: {
      W,
      H,
      key,
      file: holes ? out : undefined,
      slots,
      found: rects.length,
      url: URL.createObjectURL(out),
      note,
      src,
      opaque,
      suggested,
    },
  };
}

/** Langkah "Mulai dari" → Upload desain: unggah, cek ukuran, hapus warna penanda, deteksi slot, pratinjau bernomor. */
export function UploadDesign({
  W,
  H,
  paperText,
  design,
  setDesign,
  onChangePaper,
  onPick,
  match,
}: {
  W: number;
  H: number;
  /** mis. "Foto 4R portrait". */
  paperText: string;
  design: Design | null;
  setDesign: Dispatch<SetStateAction<Design | null>>;
  /** Tombol "Ganti ukuran kertas" (wizard Template: kembali ke langkah kertas). Kosong = tidak ada. */
  onChangePaper?: () => void;
  /** File baru dipilih (wizard mengisi nama awal dari nama file). */
  onPick: (f: File) => void;
  /** Kertas lain yang rasionya cocok dengan desain, untuk tombol "Pakai …". */
  match: (w: number, h: number) => { label: string; apply: () => void } | undefined;
}) {
  const [status, setStatus] = useState<Status>({});
  const [drag, setDrag] = useState(false);
  const inputId = useId();
  const file = design?.file;
  const fit = !!design?.fit;
  const key = design?.key;
  // `view` = hasil terakhir untuk kertas ini (tetap tampil selama diproses ulang); `fresh` = sesuai setelan.
  const view = design?.out && design.out.W === W && design.out.H === H ? design.out : undefined;
  const fresh = view && view.key === key ? view : undefined;

  useEffect(() => {
    if (!file || fresh) return;
    let live = true;
    setStatus({});
    process(file, W, H, fit, key).then(({ out, needKey, ...s }) => {
      if (!live) return out && URL.revokeObjectURL(out.url);
      if (needKey) {
        setDesign((d) =>
          d && d.file === file ? { ...d, key: { color: needKey, tol: DEFAULT_TOLERANCE } } : d,
        );
        return;
      }
      setStatus(s);
      setDesign((d) => {
        if (!d || d.file !== file) return d;
        if (d.out && d.out.url !== out?.url) URL.revokeObjectURL(d.out.url);
        return { ...d, out };
      });
    });
    return () => {
      live = false;
    };
  }, [file, fit, W, H, fresh, key, setDesign]);

  // Setelan baru: file lama tidak boleh ikut terkirim selama diproses ulang.
  const setKey = useCallback(
    (k: KeySetting | undefined) =>
      setDesign((d) => d && { ...d, key: k, out: d.out && { ...d.out, file: undefined } }),
    [setDesign],
  );

  const pick = (f: File | undefined) => {
    if (!f) return;
    if (design?.out) URL.revokeObjectURL(design.out.url);
    setStatus({});
    setDesign({ file: f, fit: false });
    onPick(f);
  };
  const guide = (
    <>
      PNG/JPG{" "}
      <b className="font-mono">
        {W}×{H} px
      </b>{" "}
      (kertas {paperText}, 300 dpi). Kotak foto dibuat transparan atau diisi satu warna penanda.
    </>
  );
  const input = (
    <input
      id={inputId}
      type="file"
      accept="image/png,image/jpeg,image/webp"
      aria-label="Desain PNG"
      className="sr-only"
      onChange={(e) => {
        pick(e.target.files?.[0]);
        e.target.value = "";
      }}
    />
  );
  const again = (
    <label
      htmlFor={inputId}
      className="inline-flex h-10 cursor-pointer items-center gap-1.5 rounded-[11px] border-[1.5px] border-ink bg-white px-3.5 text-[13px] font-bold hover:bg-paper"
    >
      Ganti file
      {input}
    </label>
  );

  if (!file || (!view && !status.mismatch && !status.error))
    return (
      <label
        htmlFor={inputId}
        onDragOver={(e) => {
          e.preventDefault();
          setDrag(true);
        }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDrag(false);
          pick(e.dataTransfer.files[0]);
        }}
        className={`flex min-h-[260px] cursor-pointer flex-col items-center justify-center gap-2 rounded-[18px] border-[1.5px] border-dashed border-ink px-6 py-8 text-center ${drag ? "bg-mint-soft" : "bg-paper hover:bg-white"}`}
      >
        <span className="flex size-12 items-center justify-center rounded-2xl border-[1.5px] border-ink bg-butter">
          <ImageUp aria-hidden className="size-6" strokeWidth={2} />
        </span>
        <span className="text-[15px] font-extrabold">
          {file ? "Membaca desain…" : "Tarik desain ke sini atau pilih file"}
        </span>
        <span className="max-w-[440px] text-[13px] leading-normal text-text-2">{guide}</span>
        <span className="max-w-[440px] text-xs leading-normal text-text-3">
          Desain dulu di Photoshop/Canva. Kotak foto boleh dikosongkan (PNG transparan) atau diisi
          satu warna polos, misalnya kuning; warnanya dihapus di sini. Slot foto dibuat otomatis.
        </span>
        {input}
      </label>
    );

  if (status.error || status.mismatch) {
    const m = status.mismatch;
    const alt = m && match(m.w, m.h);
    return (
      <div
        role="alert"
        className="flex flex-col gap-3 rounded-[18px] border-[1.5px] border-ink bg-peach p-5"
      >
        <p className="flex items-start gap-2 text-sm font-bold leading-normal">
          <TriangleAlert aria-hidden className="mt-0.5 size-4 flex-none" strokeWidth={2.25} />
          {m
            ? `Ukuran desain ${m.w}×${m.h} px tidak sebanding dengan kertas ${paperText} (${W}×${H} px).`
            : status.error}
        </p>
        <p className="text-[13px] leading-normal">{guide}</p>
        <div className="flex flex-wrap gap-2">
          {alt && (
            <button
              type="button"
              onClick={alt.apply}
              className="h-10 rounded-[11px] border-[1.5px] border-ink bg-butter px-3.5 text-[13px] font-extrabold"
            >
              Pakai {alt.label}
            </button>
          )}
          {m && (
            <>
              {onChangePaper && (
                <button
                  type="button"
                  onClick={onChangePaper}
                  className="h-10 rounded-[11px] border-[1.5px] border-ink bg-white px-3.5 text-[13px] font-bold hover:bg-paper"
                >
                  Ganti ukuran kertas
                </button>
              )}
              <button
                type="button"
                onClick={() => setDesign((d) => d && { ...d, fit: true })}
                className="h-10 rounded-[11px] border-[1.5px] border-ink bg-white px-3.5 text-[13px] font-bold hover:bg-paper"
              >
                Tetap lanjut, muatkan ke kertas
              </button>
            </>
          )}
          {again}
        </div>
      </div>
    );
  }

  if (!view) return null;
  const busy = !fresh;
  const pct = (v: number, of: number) => `${(v / of) * 100}%`;
  /** Pipet: warna asli di titik klik pratinjau. */
  const eyedrop = (e: MouseEvent<HTMLButtonElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const x = Math.min(W - 1, Math.floor(((e.clientX - r.left) / r.width) * W));
    const y = Math.min(H - 1, Math.floor(((e.clientY - r.top) / r.height) * H));
    const o = (y * W + x) * 4;
    const d = view.src;
    setKey({
      color: rgbToHex(d[o] ?? 0, d[o + 1] ?? 0, d[o + 2] ?? 0),
      tol: key?.tol ?? DEFAULT_TOLERANCE,
    });
  };
  return (
    <div className="flex flex-col gap-5 sm:flex-row">
      <div
        aria-label="Pratinjau slot terdeteksi"
        role="img"
        className="relative mx-auto h-[300px] flex-none overflow-hidden rounded-[6px] border-[1.5px] border-ink bg-white"
        style={{ aspectRatio: `${W} / ${H}`, backgroundImage: key ? CHECKER : undefined }}
      >
        {!key &&
          view.slots.map((s) => (
            <span
              key={s.id}
              className="absolute bg-sky"
              style={{
                left: pct(s.x, W),
                top: pct(s.y, H),
                width: pct(s.w, W),
                height: pct(s.h, H),
              }}
            />
          ))}
        {/* biome-ignore lint/performance/noImgElement: object URL lokal, bukan aset Next */}
        <img src={view.url} alt="" className="absolute inset-0 size-full" />
        {key &&
          view.slots.map((s) => (
            <span
              key={s.id}
              className="absolute border-[1.5px] border-dashed border-ink"
              style={{
                left: pct(s.x, W),
                top: pct(s.y, H),
                width: pct(s.w, W),
                height: pct(s.h, H),
              }}
            />
          ))}
        {view.slots.map((s, i) => (
          <span
            key={s.id}
            className="absolute flex size-7 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border-[1.5px] border-ink bg-white font-mono text-xs font-bold"
            style={{ left: pct(s.x + s.w / 2, W), top: pct(s.y + s.h / 2, H) }}
          >
            {i + 1}
          </span>
        ))}
        {key && (
          <button
            type="button"
            aria-label="Ambil warna penanda dari gambar"
            onClick={eyedrop}
            className="absolute inset-0 cursor-crosshair"
          />
        )}
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-3">
        <p className="text-[15px] font-extrabold" aria-live="polite">
          {busy
            ? "Memproses…"
            : view.found
              ? `${view.found} slot foto terdeteksi`
              : "Slot foto belum terdeteksi"}
        </p>
        <p className="text-[13px] leading-normal text-text-2">
          Nomor = urutan foto diambil (atas ke bawah, kiri ke kanan). Posisi, ukuran, dan urutan
          slot bisa diubah di editor. Overlay ada di atas foto, jadi sudut membulat tetap rapi.
        </p>
        {view.note && (
          <p className="rounded-xl border-[1.5px] border-ink bg-sky px-3.5 py-2.5 text-[13px] leading-normal">
            {view.note}
          </p>
        )}
        {key ? (
          <section
            aria-label="Hapus warna penanda"
            className="flex flex-col gap-3 rounded-[14px] border-[1.5px] border-ink bg-paper p-4"
          >
            <div>
              <p className="text-sm font-extrabold">Hapus warna penanda</p>
              <p className="mt-0.5 text-[13px] leading-normal text-text-2">
                Warna penanda slot foto akan dihapus jadi transparan. Kotak-kotak di pratinjau =
                tempat foto.
              </p>
            </div>
            <ChromaControls value={key} suggested={view.suggested} onChange={setKey} />
            {!view.opaque && (
              <button
                type="button"
                onClick={() => setKey(undefined)}
                className="self-start text-xs font-bold underline"
              >
                Jangan hapus warna
              </button>
            )}
          </section>
        ) : (
          <button
            type="button"
            onClick={() => setKey({ color: view.suggested, tol: DEFAULT_TOLERANCE })}
            className="inline-flex h-10 items-center gap-1.5 self-start rounded-[11px] border-[1.5px] border-ink bg-white px-3.5 text-[13px] font-bold hover:bg-paper"
          >
            <Pipette aria-hidden className="size-4" strokeWidth={2.25} />
            Hapus warna penanda
          </button>
        )}
        <p className="truncate font-mono text-xs text-text-2">{file.name}</p>
        <div>{again}</div>
      </div>
    </div>
  );
}
