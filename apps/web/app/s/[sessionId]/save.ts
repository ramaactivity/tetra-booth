import { PROMO_SAVED } from "@/components/GuestPromo";
import type { GuestAsset } from "@/lib/guest";

/**
 * Simpan foto tamu ke galeri HP (revisi 29 Okt, Rama: "langsung tersimpan ke galeri, bukan file manager, bukan zip").
 * - iPhone/iPad: satu-satunya jalan web ke app Foto = share sheet berisi file → "Simpan N Item" (GIF & video ikut).
 * - Android & desktop: unduh langsung per file. Android memasukkan unduhan gambar/video ke Galeri (album Download);
 *   share sheet Android tidak punya pilihan "simpan ke galeri", jadi tidak dipakai.
 * iPhone: file diambil duluan di latar (prefetch) supaya share sheet terbuka langsung di dalam ketukan: Safari menolak
 * share yang menunggu unduhan terlalu lama (NotAllowedError) → `"retry"`, tombol meminta ketukan sekali lagi. Android
 * tidak di-prefetch (hemat kuota tamu yang tidak menyimpan); unduhan tidak butuh ketukan yang masih "hangat".
 */

const EXT: Record<string, [string, string]> = {
  animation: ["gif", "image/gif"],
  video: ["mp4", "video/mp4"],
};
const extOf = (a: GuestAsset) => EXT[a.kind] ?? ["jpg", "image/jpeg"];

/** "Wedding Adel & Alpi" → "wedding-adel-alpi" (nama file yang rapi di galeri). */
const slug = (s: string) =>
  s
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40) || "tetra";

export function fileName(a: GuestAsset, event: string, sessionId: string) {
  const what =
    a.kind === "strip_web"
      ? "strip"
      : a.kind === "original"
        ? `foto-${a.idx}`
        : a.kind === "animation"
          ? "animasi"
          : a.kind;
  return `${slug(event)}-${sessionId.slice(0, 4)}-${what}.${extOf(a)[0]}`;
}

const cache = new Map<string, Promise<Blob>>();
/** Ambil isi file sekali per URL (dipakai ulang untuk simpan semua & simpan satuan); nama diberi saat disimpan. */
export function prefetch(a: GuestAsset): Promise<Blob> {
  let p = cache.get(a.url);
  if (!p) {
    // no-store: gambar yang sudah tampil lewat <img> tersimpan di cache TANPA header CORS; fetch biasa memakai cache itu
    // dan ditolak browser → dulu selalu jatuh ke unduhan biasa (iPhone: masuk app File, bukan Foto).
    p = fetch(a.url, { cache: "no-store" })
      .then(async (res) => {
        if (!res.ok) throw new Error(`unduh ${res.status}`);
        return res.blob();
      })
      .catch((e: unknown) => {
        cache.delete(a.url);
        throw e;
      });
    cache.set(a.url, p);
  }
  return p;
}

export const isApple = () =>
  /iPhone|iPad|iPod/.test(navigator.userAgent) ||
  (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);

const click = (href: string, name?: string) => {
  const link = document.createElement("a");
  link.href = href;
  if (name) link.download = name;
  link.rel = "noopener";
  document.body.append(link);
  link.click();
  link.remove();
};
const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));

export type SaveResult = "saved" | "cancelled" | "retry";

export async function saveToPhone(
  assets: GuestAsset[],
  event: string,
  sessionId: string,
): Promise<SaveResult> {
  const names = assets.map((a) => fileName(a, event, sessionId));
  let files: File[];
  try {
    files = await Promise.all(
      assets.map(async (a, i) => {
        const blob = await prefetch(a);
        return new File([blob], names[i] ?? "", { type: blob.type || extOf(a)[1] });
      }),
    );
  } catch {
    // Tanpa CORS / gagal ambil: unduh lewat URL attachment bertanda tangan (tetap file, bukan tab baru).
    for (const a of assets) {
      click(a.download);
      await pause(350);
    }
    window.dispatchEvent(new Event(PROMO_SAVED));
    return "saved";
  }
  if (isApple() && navigator.canShare?.({ files })) {
    try {
      await navigator.share({ files });
    } catch (e) {
      if (e instanceof DOMException && e.name === "NotAllowedError") return "retry";
      return "cancelled";
    }
  } else {
    // Jeda antar unduhan: Chrome Android menahan unduhan beruntun tanpa jeda (minta izin sekali di awal).
    for (const f of files) {
      const url = URL.createObjectURL(f);
      click(url, f.name);
      setTimeout(() => URL.revokeObjectURL(url), 20_000);
      await pause(350);
    }
  }
  window.dispatchEvent(new Event(PROMO_SAVED));
  return "saved";
}
