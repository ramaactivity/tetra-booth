import type { LayoutSpec } from "@tetra/shared";
import { Button } from "@tetra/ui";
import { ArrowRight, Images } from "lucide-react";
import { type CSSProperties, useEffect, useLayoutEffect, useRef, useState } from "react";
import { copy } from "../copy";
import { createTapDetector } from "../crew/taps";
import type { BoothEvent } from "../event";
import { encode } from "../finalize";
import { usePlatform } from "../PlatformContext";
import type { BoothStorage, SessionPiece } from "../platform";
import { Logo } from "../ui";

export const START_GUARD_MS = 800;
/** Tahan logo selama ini untuk membuka mode crew. */
export const LOGO_HOLD_MS = 2000;

/** Ukuran awal judul menurut panjang nama event, supaya kolom kiri muat di bawah logo (maks ±3 baris). */
function titleSize(name: string) {
  if (name.length <= 11) return 176;
  if (name.length <= 18) return 132;
  return 100;
}
const TITLE_MIN = 56;
const TITLE_LINES = 3;

/**
 * Kecilkan judul sampai setiap kata muat utuh dan paling banyak 3 baris. Kata tidak pernah dipotong di
 * tengah (Rama 2026-09-30: "Captain barbersho/p"); ukuran dihitung ulang setelah font termuat.
 */
function useFitTitle(name: string) {
  const ref = useRef<HTMLHeadingElement>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const fit = () => {
      let px = titleSize(name);
      const fits = () =>
        el.scrollWidth <= el.clientWidth + 1 && el.scrollHeight <= px * 0.92 * TITLE_LINES + 2;
      for (;;) {
        el.style.fontSize = `${px}px`;
        if (px <= TITLE_MIN || fits()) break;
        px = Math.max(TITLE_MIN, px - 6);
      }
    };
    fit();
    let live = true;
    document.fonts?.ready.then(() => live && fit());
    return () => {
      live = false;
    };
  }, [name]);
  return ref;
}

// Kolom hasil di kanan: offset vertikal & warna lapisan belakang per kartu (A1).
const UNDER = ["var(--peach)", "var(--sky)", "var(--lavender)", "var(--mint-soft)"];
const COLUMNS = [0, -180, -60];
/** Lebar total kolom (px kanvas 1920); kartu dibagi rata, jarak antar kolom 44. */
const AREA_W = 748;
const GAP = 44;
/** Tinggi minimum setengah isi kolom (loop drift -50%) supaya layar tidak pernah kosong. */
const HALF_MIN_H = 1300;
/** Kecepatan geser kolom, px per detik. */
const DRIFT_PX_S = 20;
/** Hasil sesi asli di layar awal (#143): maks. kartu, lebar decode, dan interval cek sesi baru. */
const MAX_PIECES = 24;
const PIECE_W = 400;
const REFRESH_MS = 15_000;

/** Strip 2R (tinggi) 3 kolom sempit; 4R/polaroid 2 kolom lebih lebar; potongan sangat lebar 1 kolom. */
export function columnsFor(aspect: number) {
  const n = aspect < 0.5 ? 3 : aspect < 2 ? 2 : 1;
  return { n, width: Math.floor((AREA_W - (n - 1) * GAP) / n) };
}

/**
 * Isi satu kolom: kartu ke-c, c+n, … (terbaru di atas kolom pertama); kolom tanpa kartu meminjam satu.
 * Diulang sampai setengah isi ≥ HALF_MIN_H lalu digandakan, supaya drift -50% berulang mulus.
 */
export function columnItems<T>(items: T[], c: number, n: number, height: (x: T) => number): T[] {
  if (!items.length) return [];
  const own = items.filter((_, i) => i % n === c);
  const col = own.length ? own : [items[c % items.length] as T];
  const h = col.reduce((a, x) => a + height(x) + 48, 0);
  const half = Array.from({ length: Math.ceil(HALF_MIN_H / h) }, () => col).flat();
  return [...half, ...half];
}

/** Layar awal dibangun bertahap (#105), kurva sama dengan bumper: masuk cepat, sedikit overshoot. */
const rise = (ms: number) =>
  ({
    animation: `rise 560ms cubic-bezier(.34,1.56,.64,1) ${ms}ms both`,
  }) as const;
const pop = (ms: number) =>
  ({ animation: `pop 700ms cubic-bezier(.34,1.56,.64,1) ${ms}ms both` }) as const;

type Piece = { url: string; w: number; h: number; session?: SessionPiece };

/** Potongan desain sesi → JPEG kecil (lebar PIECE_W) sebagai object URL, supaya memori tetap kecil. */
async function pieceThumb(storage: BoothStorage, path: string): Promise<Piece> {
  const bmp = await createImageBitmap(new Blob([await storage.readFile(path)]), {
    resizeWidth: PIECE_W,
    resizeQuality: "high",
  });
  try {
    const jpeg = await encode(bmp, bmp.width, bmp.height);
    return {
      url: URL.createObjectURL(new Blob([jpeg], { type: "image/jpeg" })),
      w: bmp.width,
      h: bmp.height,
    };
  } finally {
    bmp.close();
  }
}

/**
 * Hasil desain sesi selesai event ini dari disk lokal (offline), terbaru dulu. Dicek ulang tiap REFRESH_MS
 * (output sesi terakhir selesai di belakang layar setelah layar QR); object URL dilepas saat diganti/unmount.
 * `eventId` kosong = tidak memuat (photobox: foto tamu lain tidak ditampilkan di tempat umum).
 */
function useRecentPieces(eventId: string | undefined, thumbs: boolean) {
  const { events, storage } = usePlatform();
  const [pieces, setPieces] = useState<Piece[]>([]);
  const [total, setTotal] = useState(0);
  useEffect(() => {
    if (!eventId) return;
    let live = true;
    let busy = false;
    let key = "";
    let urls: string[] = [];
    const load = async () => {
      const page = await events.recentPieces(eventId, MAX_PIECES);
      if (live) setTotal(page.total);
      const paths = thumbs ? page.pieces.map((x) => x.path) : [];
      if (!live || paths.join("|") === key) return;
      key = paths.join("|");
      const next = (
        await Promise.all(
          (thumbs ? page.pieces : []).map((x) =>
            pieceThumb(storage, x.path).then(
              (t): Piece => ({ ...t, session: x }),
              () => null,
            ),
          ),
        )
      ).filter((x): x is Piece => x !== null);
      for (const u of live ? urls : next.map((x) => x.url)) URL.revokeObjectURL(u);
      if (!live) return;
      urls = next.map((x) => x.url);
      setPieces(next);
    };
    const run = () => {
      if (busy) return;
      busy = true;
      load()
        .catch((e: unknown) => console.warn("[attract] hasil sesi tidak terbaca", e))
        .finally(() => {
          busy = false;
        });
    };
    run();
    const t = setInterval(run, REFRESH_MS);
    return () => {
      live = false;
      clearInterval(t);
      for (const u of urls) URL.revokeObjectURL(u);
    };
  }, [eventId, thumbs, events, storage]);
  return { pieces, total };
}

/**
 * Contoh sebelum ada sesi: bentuk = kanvas kertas event, kotak foto bergaris di posisi slot desain.
 * Juga pratinjau kecil di daftar event (StartScreen), tanpa nama.
 */
export function SampleCard({ name, layout }: { name?: string; layout: LayoutSpec }) {
  const { width: cw, height: ch } = layout.canvas;
  const pct = (v: number, of: number) => `${(v / of) * 100}%`;
  return (
    <div style={{ aspectRatio: `${cw} / ${ch}` }} className="relative bg-white">
      {layout.slots.map((s) => (
        <div
          key={s.id}
          className="stripes absolute rounded-lg"
          style={{
            left: pct(s.x, cw),
            top: pct(s.y, ch),
            width: pct(s.w, cw),
            height: pct(s.h, ch),
          }}
        />
      ))}
      {name && (
        <div className="absolute bottom-3 left-1/2 max-w-[88%] -translate-x-1/2 truncate rounded-full border-2 border-ink bg-white px-3.5 py-1 text-[15px] font-extrabold tracking-[-0.01em]">
          {name}
        </div>
      )}
    </div>
  );
}

export function Attract({
  eventName,
  tagline,
  date,
  theme,
  layout,
  photosOf,
  onStart,
  onGallery,
  onCrew,
}: {
  eventName: string;
  tagline?: string | undefined;
  date: string;
  /** Layar awal per event (#102): warna/gambar latar, teks tombol, strip contoh. */
  theme?: BoothEvent["attract"];
  /** Desain utama event: bentuk kartu contoh & jumlah kolom. */
  layout: LayoutSpec;
  /** ID event yang hasil sesinya boleh tampil (#143); kosong = hanya contoh (photobox). */
  photosOf?: string | undefined;
  onStart: () => void;
  /** Galeri tamu (#145), mode event saja; dengan sesi = langsung buka foto itu. */
  onGallery?: ((at?: SessionPiece) => void) | undefined;
  /** `"exit"` = Ctrl+Shift+Q: setelah PIN langsung konfirmasi Tutup Aplikasi. */
  onCrew?: ((intent?: "exit") => void) | undefined;
}) {
  const tap = useRef(createTapDetector());
  // Tombol mulai baru aktif sebentar setelah layar muncul: sentuhan ganda dari layar QR ("Selesai") atau
  // input tertunda setelah reload tidak boleh langsung memulai sesi baru (catatan W-016).
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setReady(true), START_GUARD_MS);
    return () => clearTimeout(t);
  }, []);
  const titleRef = useFitTitle(eventName);
  // Hasil asli sesi event ini (#143); sebelum ada sesi: kartu contoh berbentuk kertas event.
  const { pieces, total } = useRecentPieces(photosOf, theme?.samples !== false);
  const cols = columnsFor(layout.canvas.width / layout.canvas.height);
  const sample = { url: "", w: layout.canvas.width, h: layout.canvas.height };
  const cards: Piece[] = pieces.length ? pieces : [sample];

  // Jalan lain ke mode crew selain 5 ketukan pojok (UX, masukan Rama): tahan logo 2 detik, atau Ctrl+Shift+M
  // di keyboard laptop. Hanya di layar ini, jadi sesi tamu tidak pernah terpotong.
  const hold = useRef<ReturnType<typeof setTimeout> | null>(null);
  const holdStart = () => {
    if (hold.current) clearTimeout(hold.current);
    hold.current = setTimeout(() => onCrew?.(), LOGO_HOLD_MS);
  };
  const holdEnd = () => {
    if (hold.current) clearTimeout(hold.current);
    hold.current = null;
  };
  useEffect(
    () => () => {
      if (hold.current) clearTimeout(hold.current);
    },
    [],
  );
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === "m") {
        e.preventDefault();
        onCrew?.();
      }
      // Tutup aplikasi dari keyboard laptop tetap lewat PIN crew (Alt+F4 diblokir di kiosk).
      if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === "q") {
        e.preventDefault();
        onCrew?.("exit");
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCrew]);

  // Petunjuk cara masuk crew hanya selama PIN belum dibuat (setup pertama).
  const { crew } = usePlatform();
  const [needsSetup, setNeedsSetup] = useState(false);
  useEffect(() => {
    crew.pinStatus().then(
      (s) => setNeedsSetup(!s.hasPin),
      () => {},
    );
  }, [crew]);

  return (
    <main
      className="relative h-full w-full overflow-hidden bg-paper"
      style={theme?.background ? { background: theme.background } : undefined}
    >
      {theme?.imageUrl && theme.video ? (
        <video
          src={theme.imageUrl}
          autoPlay
          loop
          muted
          playsInline
          className="absolute inset-0 h-full w-full object-cover"
        />
      ) : theme?.imageUrl ? (
        <img src={theme.imageUrl} alt="" className="absolute inset-0 h-full w-full object-cover" />
      ) : (
        <>
          <div
            style={pop(0)}
            className="absolute -bottom-[260px] -left-[220px] size-[760px] rounded-full bg-mint-soft"
          />
          <div
            style={pop(90)}
            className="absolute -bottom-[160px] -left-[120px] size-[560px] rounded-full border-2 border-white"
          />
          <div
            style={pop(180)}
            className="absolute -bottom-[60px] -left-5 size-[360px] rounded-full border-2 border-white"
          />
          <div
            style={pop(120)}
            className="absolute -top-[120px] right-[560px] size-[280px] rounded-full bg-peach portrait:hidden"
          />
        </>
      )}

      {/* Kolom hasil sesi asli (atau contoh sebelum ada sesi), bergerak lambat (loop vertikal). */}
      <div
        hidden={theme?.samples === false}
        data-testid="attract-columns"
        className="absolute -top-[60px] -bottom-[60px] right-[110px] flex gap-11 portrait:hidden"
      >
        {COLUMNS.slice(0, cols.n).map((offset, c) => {
          const items = columnItems(cards, c, cols.n, (x) => cols.width * (x.h / x.w));
          const half = items.reduce((a, x) => a + cols.width * (x.h / x.w) + 48, 0) / 2;
          return (
            <div
              key={offset}
              style={{ marginTop: offset, ...rise(260 + c * 90) }}
              className="overflow-visible"
            >
              <div
                style={{ animationDuration: `${Math.round(half / DRIFT_PX_S)}s` }}
                className="flex animate-[drift_linear_infinite] flex-col gap-12 pb-12 motion-reduce:animate-none"
              >
                {items.map((x, i) => (
                  <div
                    // biome-ignore lint/suspicious/noArrayIndexKey: daftar diulang (loop), urutan tetap
                    key={i}
                    style={{ width: cols.width, "--under": UNDER[(c + i) % 4] } as CSSProperties}
                    className="layered shrink-0 overflow-hidden rounded-2xl border-[2.5px] border-ink bg-white"
                  >
                    {x.url ? (
                      <button
                        type="button"
                        aria-label={copy.attract.openPiece}
                        disabled={!onGallery}
                        className="block w-full"
                        onClick={() => ready && onGallery?.(x.session)}
                      >
                        <img
                          src={x.url}
                          alt=""
                          decoding="async"
                          draggable={false}
                          data-testid="attract-piece"
                          style={{ aspectRatio: `${x.w} / ${x.h}` }}
                          className="block w-full"
                        />
                      </button>
                    ) : (
                      <SampleCard name={eventName} layout={layout} />
                    )}
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      <button
        type="button"
        aria-label="logo (tahan untuk mode crew)"
        data-testid="crew-logo"
        style={rise(0)}
        className="absolute top-20 left-24 select-none"
        onPointerDown={holdStart}
        onPointerUp={holdEnd}
        onPointerLeave={holdEnd}
        onPointerCancel={holdEnd}
        onContextMenu={(e) => e.preventDefault()}
      >
        <Logo />
      </button>
      {/* Setup pertama (PIN belum dibuat): tombol jelas ke Mode Crew, plus cara masuk lagi nanti. */}
      {needsSetup && (
        <div className="absolute right-6 bottom-6 z-10 flex max-w-[760px] items-center gap-6 rounded-[22px] border-[2.5px] border-ink bg-white p-5">
          <p className="text-xl font-semibold text-text-2">{copy.attract.crewHint}</p>
          <Button
            className="h-[76px] shrink-0 rounded-[18px] px-7 text-2xl"
            onClick={() => onCrew?.()}
          >
            {copy.attract.setup} <ArrowRight size={24} strokeWidth={2.5} />
          </Button>
        </div>
      )}
      {/* Pojok kanan atas tak terlihat: tap 5x dalam 3 detik → mode crew (FSD §1.3). */}
      <button
        type="button"
        aria-label="crew"
        data-testid="crew-hotspot"
        className="absolute top-6 right-6 size-[72px] rounded-[14px] border-[1.5px] border-dashed border-ink/[0.08]"
        onClick={() => tap.current(Date.now()) && onCrew?.()}
      />

      {/* Kolom judul mulai di bawah logo (top 168 px) supaya tagline/judul panjang tidak menimpa logo. */}
      {/* Di atas gambar latar: kolom judul di kartu putih supaya tetap terbaca. */}
      <div
        className={`absolute top-[168px] bottom-16 left-24 flex w-[860px] flex-col justify-center gap-8 portrait:right-24 portrait:w-auto ${theme?.imageUrl ? "my-auto h-fit rounded-[40px] border-[3px] border-ink bg-white/92 p-14" : ""}`}
      >
        {tagline && (
          <span
            style={rise(80)}
            className="flex items-center gap-3.5 self-start rounded-full border-[2.5px] border-ink bg-white py-3 pr-[26px] pl-3.5 text-[26px] font-bold whitespace-nowrap"
          >
            <span className="size-9 rounded-full border-2 border-ink bg-lavender" />
            {tagline}
          </span>
        )}
        <h1
          ref={titleRef}
          style={rise(150)}
          className="max-w-[680px] overflow-hidden leading-[0.92] font-extrabold tracking-[-0.05em] [overflow-wrap:normal]"
        >
          {eventName}
        </h1>
        <p style={rise(220)} className="font-mono text-[40px] text-text-3">
          {date}
          {theme?.brand && <span className="text-ink"> · {theme.brand}</span>}
        </p>
        <Button
          style={rise(300)}
          className="mt-7 h-[136px] w-[680px] justify-between! rounded-[28px] border-[3px]! pr-5 pl-[52px] text-[44px] tracking-[-0.02em] [--lb:3px] [--lx:10px]"
          onClick={() => ready && onStart()}
        >
          {theme?.cta ?? copy.attract.cta}
          <span className="flex size-24 items-center justify-center rounded-full border-[3px] border-ink bg-mint">
            <ArrowRight size={44} strokeWidth={2.5} />
          </span>
        </Button>
        {onGallery && total > 0 && (
          <Button
            variant="secondary"
            style={rise(360)}
            className="h-24 self-start rounded-[24px] pr-4 pl-7 text-[30px]"
            onClick={() => ready && onGallery()}
          >
            <Images size={34} strokeWidth={2.25} />
            {copy.attract.gallery}
            <span
              data-testid="gallery-count"
              className="ml-2 rounded-full border-2 border-ink bg-butter px-4 py-1 text-2xl"
            >
              {copy.attract.galleryCount(total)}
            </span>
          </Button>
        )}
      </div>
    </main>
  );
}
