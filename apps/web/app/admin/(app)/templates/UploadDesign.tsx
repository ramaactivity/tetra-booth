"use client";
import { detectSlots } from "@tetra/editor/detect";
import type { LayoutSlot } from "@tetra/shared";
import { ImageUp, TriangleAlert } from "lucide-react";
import { type Dispatch, type SetStateAction, useEffect, useId, useState } from "react";

const MAX_BYTES = 4 * 1024 * 1024; // sama dengan batas server action (next.config)

/** Desain PNG unggahan wizard (#161). `out` = hasil olahan untuk kanvas `W×H` (basi kalau kertas diganti). */
export type Design = {
  file: File;
  /** Rasio beda tapi admin memilih lanjut: desain dimuat utuh di tengah, sisanya putih. */
  fit: boolean;
  out?:
    | {
        W: number;
        H: number;
        file: File;
        slots: LayoutSlot[];
        /** Jumlah area transparan terdeteksi (0 = satu slot contoh). */
        found: number;
        url: string;
        note: string;
      }
    | undefined;
};
type Status = { error?: string; mismatch?: { w: number; h: number } };

/** Gambar desain ke kanvas `W×H`, cek area transparan, deteksi slot, lalu PNG siap unggah (ukuran pas kanvas). */
async function process(
  file: File,
  W: number,
  H: number,
  fit: boolean,
): Promise<Status & { out?: Design["out"] }> {
  let img: ImageBitmap;
  try {
    img = await createImageBitmap(file);
  } catch {
    return { error: "File ini tidak bisa dibaca. Unggah PNG (atau WebP) dengan latar transparan." };
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
  const { data } = g.getImageData(0, 0, W, H);
  let holes = false;
  for (let i = 3; i < data.length && !holes; i += 4) holes = (data[i] ?? 255) < 128;
  if (!holes)
    return {
      error:
        "Desain ini tidak punya area transparan, jadi foto akan tertutup. Hapus kotak foto di Photoshop/Canva lalu ekspor PNG berlatar transparan.",
    };
  const rects = detectSlots(data, W, H);
  // Ukuran & format sudah pas = file asli (tanpa encode ulang); selain itu PNG hasil kanvas.
  const exact = w === W && h === H && file.type === "image/png";
  const blob = exact ? file : await c.convertToBlob({ type: "image/png" });
  if (blob.size > MAX_BYTES)
    return {
      error: `Desain ${(blob.size / 1024 / 1024).toFixed(1)} MB, maksimal 4 MB. Kompres PNG-nya (mis. TinyPNG) lalu unggah lagi.`,
    };
  const slots = (
    rects.length
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
  const note = !rects.length
    ? "Tidak ada area foto yang cukup besar. Satu slot contoh dipasang, atur di editor."
    : !same
      ? `Desain ${w}×${h} px dimuat utuh di tengah kertas, sisanya putih.`
      : !exact
        ? `Desain ${w}×${h} px disesuaikan ke ${W}×${H} px.`
        : "";
  const out = new File([blob], "ov.png", { type: "image/png" });
  return {
    out: { W, H, file: out, slots, found: rects.length, url: URL.createObjectURL(out), note },
  };
}

/** Langkah "Mulai dari" → Upload desain (PNG): unggah, cek ukuran, deteksi slot, pratinjau bernomor. */
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
  const fresh = design?.out && design.out.W === W && design.out.H === H ? design.out : undefined;

  useEffect(() => {
    if (!file || fresh) return;
    let live = true;
    setStatus({});
    process(file, W, H, fit).then(({ out, ...s }) => {
      if (!live) return out && URL.revokeObjectURL(out.url);
      setStatus(s);
      setDesign((d) => (d && d.file === file ? { ...d, out } : d));
    });
    return () => {
      live = false;
    };
  }, [file, fit, W, H, fresh, setDesign]);

  const pick = (f: File | undefined) => {
    if (!f) return;
    if (design?.out) URL.revokeObjectURL(design.out.url);
    setStatus({});
    setDesign({ file: f, fit: false });
    onPick(f);
  };
  const guide = (
    <>
      PNG{" "}
      <b className="font-mono">
        {W}×{H} px
      </b>{" "}
      (kertas {paperText}, 300 dpi), area foto dibuat transparan.
    </>
  );
  const input = (
    <input
      id={inputId}
      type="file"
      accept="image/png,image/webp"
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

  if (!file || (!fresh && !status.mismatch && !status.error))
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
          Desain dulu di Photoshop/Canva, kosongkan kotak foto, lalu ekspor PNG berlatar transparan.
          Slot foto dibuat otomatis mengikuti area transparan.
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

  if (!fresh) return null;
  const pct = (v: number, of: number) => `${(v / of) * 100}%`;
  return (
    <div className="flex flex-col gap-5 sm:flex-row">
      <div
        aria-label="Pratinjau slot terdeteksi"
        role="img"
        className="relative mx-auto h-[300px] flex-none overflow-hidden rounded-[6px] border-[1.5px] border-ink bg-white"
        style={{ aspectRatio: `${W} / ${H}` }}
      >
        {fresh.slots.map((s) => (
          <span
            key={s.id}
            className="absolute bg-sky"
            style={{ left: pct(s.x, W), top: pct(s.y, H), width: pct(s.w, W), height: pct(s.h, H) }}
          />
        ))}
        {/* biome-ignore lint/performance/noImgElement: object URL lokal, bukan aset Next */}
        <img src={fresh.url} alt="" className="absolute inset-0 size-full" />
        {fresh.slots.map((s, i) => (
          <span
            key={s.id}
            className="absolute flex size-7 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border-[1.5px] border-ink bg-white font-mono text-xs font-bold"
            style={{ left: pct(s.x + s.w / 2, W), top: pct(s.y + s.h / 2, H) }}
          >
            {i + 1}
          </span>
        ))}
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-3">
        <p className="text-[15px] font-extrabold">
          {fresh.found ? `${fresh.found} slot foto terdeteksi` : "Slot foto belum terdeteksi"}
        </p>
        <p className="text-[13px] leading-normal text-text-2">
          Nomor = urutan foto diambil (atas ke bawah, kiri ke kanan). Posisi, ukuran, dan urutan
          slot bisa diubah di editor. Overlay ada di atas foto, jadi sudut membulat tetap rapi.
        </p>
        {fresh.note && (
          <p className="rounded-xl border-[1.5px] border-ink bg-sky px-3.5 py-2.5 text-[13px] leading-normal">
            {fresh.note}
          </p>
        )}
        <p className="truncate font-mono text-xs text-text-2">{file.name}</p>
        <div>{again}</div>
      </div>
    </div>
  );
}
