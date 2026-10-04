import { printPaper } from "@tetra/shared";
import { Button } from "@tetra/ui";
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  Images,
  Minus,
  Plus,
  Printer,
  QrCode as QrIcon,
} from "lucide-react";
import { type ReactNode, useCallback, useEffect, useRef, useState } from "react";
import { copy } from "../copy";
import { errText } from "../errors";
import type { BoothEvent } from "../event";
import { encode } from "../finalize";
import {
  byHour,
  clock,
  decodeWidth,
  GALLERY_IDLE_MS,
  GALLERY_PAGE,
  hourCursor,
  hourLabel,
  nextCursor,
  reprintLeft,
} from "../gallery";
import { usePlatform } from "../PlatformContext";
import type { BoothStorage, SessionPiece } from "../platform";
import { QrCode } from "../ui";
import { PRINT_SEC_PER_SHEET } from "./Qr";

type Thumb = { url: string; w: number; h: number };
type PrintState = { jobId: string; copies: number; state: "pending" | "done" | "failed" };

/** Kartu grid: lebar gambar (px kanvas 1920) menurut bentuk potongan; tinggi baris seragam. */
const cardWidth = (aspect: number) => (aspect < 0.5 ? 156 : aspect <= 1 ? 212 : 300);
const SWIPE_PX = 80;

/**
 * Thumbnail tajam (#145): decode penuh sekali, lalu perkecil (resizeQuality high) ke `width` px; file kecil
 * tidak diperbesar. JPEG 0.92 sebagai object URL supaya memori tetap kecil.
 */
async function sharpThumb(
  storage: BoothStorage,
  path: string,
  cssW: number,
  scale: number,
  dpr: number,
): Promise<Thumb> {
  const full = await createImageBitmap(new Blob([await storage.readFile(path)]));
  let bmp = full;
  try {
    const w = decodeWidth(cssW, scale, dpr, full.width);
    if (w < full.width)
      bmp = await createImageBitmap(full, {
        resizeWidth: w,
        resizeHeight: Math.round((full.height * w) / full.width),
        resizeQuality: "high",
      });
    const jpeg = await encode(bmp, bmp.width, bmp.height, 0.92);
    return {
      url: URL.createObjectURL(new Blob([jpeg], { type: "image/jpeg" })),
      w: full.width,
      h: full.height,
    };
  } finally {
    if (bmp !== full) bmp.close();
    full.close();
  }
}

/**
 * Galeri tamu (#145, mode event): sesi selesai event ini dari disk lokal, terbaru dulu, per jam. Detail = potongan
 * resolusi penuh + Scan QR + Cetak lagi (maks. maxPrints lembar per sesi). Tanpa sentuhan 60 dtk → layar awal.
 */
export function Gallery({
  event,
  guestBaseUrl,
  at,
  onClose,
}: {
  event: BoothEvent;
  guestBaseUrl: string;
  /** Dibuka dari kartu di layar awal: langsung detail sesi ini. */
  at?: SessionPiece | undefined;
  onClose: () => void;
}) {
  const p = usePlatform();
  const root = useRef<HTMLDivElement>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const [list, setList] = useState<SessionPiece[]>(at ? [at] : []);
  const [meta, setMeta] = useState<{ total: number; hours: { hour: string; n: number }[] }>({
    total: 0,
    hours: [],
  });
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [thumbs, setThumbs] = useState<Record<string, Thumb>>({});
  const [open, setOpen] = useState<string | null>(at?.sessionId ?? null);
  const [chip, setChip] = useState<string | null>(null);
  const urls = useRef<string[]>([]);
  const busy = useRef(false);
  /** Daftar mulai dari sesi terbaru (bukan hasil lompat ke jam tertentu). */
  const fromStart = useRef(true);
  const aspect = event.layout.canvas.width / event.layout.canvas.height;
  const cardW = cardWidth(aspect);

  // Kembali ke layar awal kalau tidak disentuh (cadangan; tombol kembali selalu ada).
  const close = useRef(onClose);
  close.current = onClose;
  const idle = useRef<ReturnType<typeof setTimeout>>(undefined);
  const touch = useCallback(() => {
    clearTimeout(idle.current);
    idle.current = setTimeout(() => close.current(), GALLERY_IDLE_MS);
  }, []);
  useEffect(() => {
    touch();
    return () => clearTimeout(idle.current);
  }, [touch]);

  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      for (const u of urls.current) URL.revokeObjectURL(u);
    };
  }, []);

  /** Muat satu halaman; `replace` = mulai daftar baru dari kursor (chip jam / Terbaru). */
  const load = useCallback(
    async (before: string | undefined, replace: boolean) => {
      if (busy.current) return;
      busy.current = true;
      setLoading(true);
      if (replace) fromStart.current = before === undefined;
      try {
        const page = await p.events.recentPieces(event.id, GALLERY_PAGE, before);
        setMeta({ total: page.total, hours: page.hours });
        setCursor(nextCursor(page.pieces, GALLERY_PAGE));
        setList((prev) => {
          const base = replace ? [] : prev;
          const seen = new Set(base.map((x) => x.sessionId));
          return [...base, ...page.pieces.filter((x) => !seen.has(x.sessionId))];
        });
      } catch (e) {
        console.warn(`[gallery] gagal memuat: ${errText(e)}`);
      } finally {
        busy.current = false;
        setLoading(false);
      }
    },
    [p, event.id],
  );
  useEffect(() => {
    void load(undefined, true);
  }, [load]);

  // Thumbnail untuk kartu yang belum punya, ukuran = piksel layar sebenarnya × 2 (skala Stage × DPR).
  // Cache per sesi selama galeri terbuka; dilepas semua saat galeri ditutup.
  const requested = useRef(new Set<string>());
  useEffect(() => {
    const el = root.current;
    const scale = el?.offsetWidth ? el.getBoundingClientRect().width / el.offsetWidth : 1;
    for (const x of list) {
      if (requested.current.has(x.sessionId)) continue;
      requested.current.add(x.sessionId);
      sharpThumb(p.storage, x.full, cardW, scale, window.devicePixelRatio || 1).then(
        (t) => {
          if (!alive.current) return URL.revokeObjectURL(t.url);
          urls.current.push(t.url);
          setThumbs((m) => ({ ...m, [x.sessionId]: t }));
        },
        (e: unknown) => console.warn(`[gallery] thumb ${x.sessionId}: ${errText(e)}`),
      );
    }
  }, [list, p, cardW]);

  // Gulir ke bawah → halaman berikutnya.
  const sentinel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const s = sentinel.current;
    if (!s || !cursor) return;
    const io = new IntersectionObserver(
      (e) => {
        if (e.some((x) => x.isIntersecting)) void load(cursor, false);
      },
      { root: scroller.current, rootMargin: "600px" },
    );
    io.observe(s);
    return () => io.disconnect();
  }, [cursor, load]);

  const jump = (hour: string | null) => {
    setChip(hour);
    const sc = scroller.current;
    if (hour === null) {
      sc?.scrollTo({ top: 0, behavior: "smooth" });
      if (!fromStart.current) void load(undefined, true);
      return;
    }
    const sec = document.getElementById(`gallery-h-${hour}`);
    if (sec && sc) sc.scrollTo({ top: sec.offsetTop - 8, behavior: "smooth" });
    else {
      sc?.scrollTo({ top: 0 });
      void load(hourCursor(hour), true);
    }
  };

  const idx = open ? list.findIndex((x) => x.sessionId === open) : -1;
  const current = idx >= 0 ? list[idx] : undefined;

  return (
    <div
      ref={root}
      className="relative h-full w-full overflow-hidden bg-paper"
      onPointerDownCapture={touch}
      onWheelCapture={touch}
    >
      <main inert={current !== undefined} className="flex h-full w-full flex-col">
        <header className="flex shrink-0 items-start gap-10 px-[72px] pt-12 pb-7">
          <Button
            variant="secondary"
            className="h-[88px] shrink-0 rounded-[24px] pr-8 pl-6 text-[28px]"
            onClick={onClose}
          >
            <ArrowLeft size={34} strokeWidth={2.5} />
            {copy.gallery.home}
          </Button>
          <div className="flex min-w-0 flex-1 flex-col gap-2 pt-1">
            <div className="flex items-center gap-5">
              <h1 className="truncate text-[56px] leading-[1.05] font-extrabold tracking-[-0.04em]">
                {copy.gallery.title(event.name)}
              </h1>
              {meta.total > 0 && (
                <span className="shrink-0 rounded-full border-2 border-ink bg-butter px-5 py-1.5 text-2xl font-bold">
                  {copy.gallery.count(meta.total)}
                </span>
              )}
            </div>
            <p className="text-[26px] font-medium text-text-2">{copy.gallery.sub}</p>
          </div>
        </header>

        {meta.hours.length > 1 && (
          <nav className="flex shrink-0 gap-3.5 overflow-x-auto px-[72px] pb-6">
            {[null, ...meta.hours.map((h) => h.hour)].map((h) => (
              <button
                key={h ?? "latest"}
                type="button"
                onClick={() => jump(h)}
                className={`pressable h-[72px] shrink-0 rounded-full border-[2.5px] border-ink px-7 text-[26px] font-bold ${chip === h ? "bg-mint" : "bg-white"}`}
              >
                {h === null ? copy.gallery.latest : hourLabel(h)}
              </button>
            ))}
          </nav>
        )}

        <div
          ref={scroller}
          className="min-h-0 flex-1 overflow-y-auto border-t-[2.5px] border-ink bg-white/40 px-[72px] pt-8 pb-16"
        >
          {list.length === 0 ? (
            <Empty loading={loading} />
          ) : (
            byHour(list).map((g) => (
              <section key={g.hour} id={`gallery-h-${g.hour}`} className="mb-12">
                <h2 className="mb-6 flex items-baseline gap-4 text-[30px] font-extrabold tracking-[-0.02em]">
                  {copy.gallery.hour(hourLabel(g.hour))}
                  <span className="text-[22px] font-semibold text-text-2">
                    {copy.gallery.count(meta.hours.find((h) => h.hour === g.hour)?.n ?? 0)}
                  </span>
                </h2>
                <div className="flex flex-wrap gap-x-9 gap-y-8">
                  {g.pieces.map((x) => (
                    <button
                      key={x.sessionId}
                      type="button"
                      data-testid="gallery-card"
                      aria-label={copy.gallery.session(clock(x.completedAt))}
                      onClick={() => setOpen(x.sessionId)}
                      className="pressable flex flex-col items-center gap-3"
                      style={{ width: cardW }}
                    >
                      <span
                        style={{ height: Math.round(cardW / aspect) }}
                        className="layered flex w-full items-center justify-center overflow-hidden rounded-[14px] border-[2.5px] border-ink bg-white [--lx:6px]"
                      >
                        {thumbs[x.sessionId] ? (
                          <img
                            src={thumbs[x.sessionId]?.url}
                            alt=""
                            draggable={false}
                            className="h-full w-full animate-[fade_200ms_ease-out] object-contain motion-reduce:animate-none"
                          />
                        ) : (
                          <span className="stripes h-full w-full" />
                        )}
                      </span>
                      <span className="font-mono text-[22px] text-text-3">
                        {clock(x.completedAt)}
                      </span>
                    </button>
                  ))}
                </div>
              </section>
            ))
          )}
          <div ref={sentinel} />
          {cursor && list.length > 0 && (
            <p className="py-6 text-center text-2xl font-medium text-text-2">{copy.gallery.more}</p>
          )}
        </div>
      </main>

      {current && (
        <Detail
          event={event}
          guestBaseUrl={guestBaseUrl}
          piece={current}
          thumb={thumbs[current.sessionId]}
          hasPrev={idx > 0}
          hasNext={idx < list.length - 1 || cursor !== null}
          onMove={(d) => {
            const n = list[idx + d];
            if (n) setOpen(n.sessionId);
            if (d > 0 && idx + d >= list.length - 2 && cursor) void load(cursor, false);
          }}
          onUpdate={(s) =>
            setList((l) => l.map((x) => (x.sessionId === s.sessionId ? { ...x, ...s } : x)))
          }
          onAll={() => setOpen(null)}
          onHome={onClose}
        />
      )}
    </div>
  );
}

function Empty({ loading }: { loading: boolean }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-5 text-center">
      <span className="flex size-[120px] items-center justify-center rounded-[32px] border-[2.5px] border-dashed border-ink bg-sky">
        <Images size={56} strokeWidth={2} />
      </span>
      <p className="text-[40px] font-extrabold tracking-[-0.03em]">
        {loading ? copy.gallery.loading : copy.gallery.empty}
      </p>
      {!loading && <p className="text-[26px] font-medium text-text-2">{copy.gallery.emptyBody}</p>}
    </div>
  );
}

/** Detail satu sesi: potongan resolusi penuh (thumb dulu, lalu ditukar), geser/panah ke sesi lain, panel aksi. */
function Detail({
  event,
  guestBaseUrl,
  piece,
  thumb,
  hasPrev,
  hasNext,
  onMove,
  onUpdate,
  onAll,
  onHome,
}: {
  event: BoothEvent;
  guestBaseUrl: string;
  piece: SessionPiece;
  thumb: Thumb | undefined;
  hasPrev: boolean;
  hasNext: boolean;
  onMove: (d: -1 | 1) => void;
  onUpdate: (s: Pick<SessionPiece, "sessionId" | "printCount" | "reprinted">) => void;
  onAll: () => void;
  onHome: () => void;
}) {
  const p = usePlatform();
  const [full, setFull] = useState<string | null>(null);
  const [shown, setShown] = useState(false);
  const [panel, setPanel] = useState<"menu" | "qr" | "print">("menu");
  const [n, setN] = useState(1);
  const [print, setPrint] = useState<PrintState | null>(null);
  const [sending, setSending] = useState(false);
  const max = event.settings.maxPrints;
  const left = reprintLeft(max, piece.reprinted);

  // Ganti sesi: panel kembali ke menu, gambar penuh dimuat ulang (object URL lama dilepas).
  useEffect(() => {
    setPanel("menu");
    setN(1);
    setPrint(null);
    setShown(false);
    setFull(null);
    let url: string | null = null;
    let live = true;
    p.storage.readFile(piece.full).then(
      (b) => {
        if (!live) return;
        url = URL.createObjectURL(new Blob([b], { type: "image/jpeg" }));
        setFull(url);
      },
      (e: unknown) => console.warn(`[gallery] gambar penuh ${piece.sessionId}: ${errText(e)}`),
    );
    return () => {
      live = false;
      if (url) URL.revokeObjectURL(url);
    };
  }, [p, piece.full, piece.sessionId]);

  // Hasil akhir cetak (event Camera Service) → "Sudah tercetak" atau pesan tertunda.
  useEffect(
    () =>
      p.crew.onPrintUpdated((u) =>
        setPrint((s) => (s && u.jobId === s.jobId ? { ...s, state: u.ok ? "done" : "failed" } : s)),
      ),
    [p],
  );

  const reprint = async () => {
    if (sending) return;
    setSending(true);
    const layout =
      event.designs?.find((d) => d.layout.id === piece.layoutId)?.layout ?? event.layout;
    try {
      const r = await p.printer.reprint({
        sessionId: piece.sessionId,
        copies: n,
        max,
        paper: printPaper(layout.paper),
      });
      const added = r.reprinted - piece.reprinted;
      onUpdate({
        sessionId: piece.sessionId,
        reprinted: r.reprinted,
        printCount: piece.printCount + Math.max(0, added),
      });
      if (r.jobId) setPrint({ jobId: r.jobId, copies: n, state: "pending" });
      setN(1);
    } catch (e) {
      console.warn(`[gallery] cetak lagi gagal: ${errText(e)}`);
      setPrint({ jobId: "", copies: n, state: "failed" });
    } finally {
      setSending(false);
    }
  };

  // Geser kiri/kanan di area foto = sesi berikut/sebelumnya.
  const swipe = useRef<number | null>(null);

  return (
    <div className="absolute inset-0 z-20 flex animate-[fade_180ms_ease-out] bg-paper motion-reduce:animate-none">
      <section
        className="relative flex min-w-0 flex-1 touch-pan-y items-center justify-center bg-mint-soft px-[150px] py-14"
        onPointerDown={(e) => {
          swipe.current = e.clientX;
        }}
        onPointerUp={(e) => {
          const x0 = swipe.current;
          swipe.current = null;
          if (x0 === null) return;
          const dx = e.clientX - x0;
          if (dx <= -SWIPE_PX && hasNext) onMove(1);
          if (dx >= SWIPE_PX && hasPrev) onMove(-1);
        }}
      >
        <div
          key={piece.sessionId}
          className="relative flex h-full w-full animate-[enter_220ms_ease-out] items-center justify-center motion-reduce:animate-none"
        >
          {thumb && !shown && (
            <img
              src={thumb.url}
              alt=""
              draggable={false}
              className="layered absolute max-h-full max-w-full rounded-[12px] border-[2.5px] border-ink bg-white object-contain [--lx:12px] [--under:#fff]"
            />
          )}
          {full && (
            <img
              src={full}
              alt=""
              draggable={false}
              data-testid="gallery-full"
              onLoad={() => setShown(true)}
              className={`layered max-h-full max-w-full rounded-[12px] border-[2.5px] border-ink bg-white object-contain transition-opacity duration-200 [--lx:12px] [--under:#fff] ${shown ? "opacity-100" : "opacity-0"}`}
            />
          )}
        </div>
        <Arrow side="left" disabled={!hasPrev} label={copy.gallery.prev} onClick={() => onMove(-1)}>
          <ChevronLeft size={48} strokeWidth={2.5} />
        </Arrow>
        <Arrow side="right" disabled={!hasNext} label={copy.gallery.next} onClick={() => onMove(1)}>
          <ChevronRight size={48} strokeWidth={2.5} />
        </Arrow>
      </section>

      <aside className="flex w-[640px] shrink-0 flex-col gap-8 border-l-[2.5px] border-ink px-14 py-12">
        <div className="flex gap-4">
          <Button
            variant="secondary"
            className="h-[84px] flex-1 rounded-[22px] pr-6 pl-5 text-[26px]"
            onClick={panel === "menu" ? onAll : () => setPanel("menu")}
          >
            <ArrowLeft size={30} strokeWidth={2.5} />
            {panel === "menu" ? copy.gallery.all : copy.gallery.back}
          </Button>
          <Button
            variant="plain"
            className="h-[84px] flex-1 rounded-[22px] px-5 text-[26px]"
            onClick={onHome}
          >
            {copy.gallery.home}
          </Button>
        </div>

        <div className="flex flex-col gap-2">
          <h2 className="text-[52px] leading-[1.05] font-extrabold tracking-[-0.04em]">
            {copy.gallery.session(clock(piece.completedAt))}
          </h2>
          <p className="text-[26px] font-medium text-text-2">
            {copy.gallery.printed(piece.printCount)}
          </p>
        </div>

        <div
          key={panel}
          className="flex min-h-0 flex-1 animate-[enter_200ms_ease-out] flex-col gap-6 motion-reduce:animate-none"
        >
          {panel === "menu" && (
            <>
              <Action
                icon={<QrIcon size={44} strokeWidth={2.25} />}
                tint="bg-sky"
                title={copy.gallery.scan}
                body={copy.gallery.scanBody}
                onClick={() => setPanel("qr")}
              />
              <Action
                icon={<Printer size={44} strokeWidth={2.25} />}
                tint="bg-peach"
                title={copy.gallery.reprint}
                body={left > 0 ? copy.gallery.reprintBody(left) : copy.gallery.limit}
                onClick={() => {
                  setPrint(null);
                  setPanel("print");
                }}
              />
            </>
          )}
          {panel === "qr" && (
            <div className="flex flex-col items-center gap-6 text-center">
              <div className="layered rounded-[32px] border-[2.5px] border-ink bg-white p-6 [--lx:10px] [--under:var(--sky)]">
                <QrCode url={`${guestBaseUrl}/s/${piece.sessionId}`} size={360} />
              </div>
              <p className="text-[34px] font-extrabold tracking-[-0.02em]">
                {copy.gallery.scanTitle}
              </p>
              <p className="text-[24px] font-medium text-text-2">{copy.gallery.scanSub}</p>
            </div>
          )}
          {panel === "print" &&
            (print ? (
              <PrintStatus print={print} />
            ) : left === 0 ? (
              <p
                role="status"
                className="rounded-[24px] border-[2.5px] border-dashed border-ink bg-coral px-8 py-7 text-[30px] leading-snug font-bold"
              >
                {copy.gallery.limit}
              </p>
            ) : (
              <>
                <p className="text-[34px] font-extrabold tracking-[-0.02em]">
                  {copy.gallery.reprintTitle}
                </p>
                <div className="layered flex items-center self-start rounded-[28px] border-[2.5px] border-ink bg-white">
                  <button
                    type="button"
                    aria-label={copy.print.less}
                    className="flex size-[112px] items-center justify-center border-r-[2.5px] border-ink disabled:text-muted"
                    disabled={n <= 1}
                    onClick={() => setN(n - 1)}
                  >
                    <Minus size={44} strokeWidth={2.5} />
                  </button>
                  <span className="w-[150px] text-center text-[84px] leading-none font-extrabold tracking-[-0.04em]">
                    {n}
                  </span>
                  <button
                    type="button"
                    aria-label={copy.print.more}
                    className="flex size-[112px] items-center justify-center rounded-r-[26px] border-l-[2.5px] border-ink bg-mint disabled:bg-white disabled:text-muted"
                    disabled={n >= left}
                    onClick={() => setN(n + 1)}
                  >
                    <Plus size={44} strokeWidth={2.5} />
                  </button>
                </div>
                <p className="text-[24px] font-medium text-text-2">
                  {copy.gallery.reprintBody(left)}
                </p>
                <Button
                  className="mt-auto h-[112px] rounded-[26px] text-[34px]"
                  disabled={sending}
                  onClick={() => void reprint()}
                >
                  <Printer size={38} strokeWidth={2.5} />
                  {copy.gallery.reprintGo(n)}
                </Button>
              </>
            ))}
        </div>
      </aside>
    </div>
  );
}

function Arrow({
  side,
  disabled,
  label,
  onClick,
  children,
}: {
  side: "left" | "right";
  disabled: boolean;
  label: string;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className={`pressable layered absolute top-1/2 flex size-[96px] -translate-y-1/2 items-center justify-center rounded-full border-[2.5px] border-ink bg-white [--lx:6px] disabled:invisible ${side === "left" ? "left-10" : "right-10"}`}
    >
      {children}
    </button>
  );
}

function Action({
  icon,
  tint,
  title,
  body,
  onClick,
}: {
  icon: ReactNode;
  tint: string;
  title: string;
  body: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="pressable layered flex items-center gap-7 rounded-[28px] border-[2.5px] border-ink bg-white p-6 text-left [--lx:8px]"
    >
      <span
        className={`flex size-[96px] shrink-0 items-center justify-center rounded-[22px] border-[2.5px] border-ink ${tint}`}
      >
        {icon}
      </span>
      <span className="flex min-w-0 flex-col gap-1">
        <span className="text-[36px] font-extrabold tracking-[-0.02em]">{title}</span>
        <span className="text-[24px] leading-snug font-medium text-text-2">{body}</span>
      </span>
    </button>
  );
}

/** Sama dengan layar cetak sesi (A8/A11): sedang mencetak → sudah tercetak, atau tertunda. */
function PrintStatus({ print }: { print: PrintState }) {
  if (print.state === "failed")
    return (
      <div role="status" className="flex flex-col gap-4">
        <span className="flex size-[88px] items-center justify-center rounded-[24px] border-[3px] border-dashed border-ink bg-peach text-[44px] font-extrabold">
          !
        </span>
        <p className="text-[40px] leading-[1.1] font-extrabold tracking-[-0.03em]">
          {copy.print.delayed}
        </p>
        <p className="text-[24px] leading-normal font-medium text-text-2">
          {copy.print.delayedBody}
        </p>
      </div>
    );
  const done = print.state === "done";
  return (
    <div
      role="status"
      className="flex flex-col gap-4 rounded-3xl border-[2.5px] border-ink bg-white px-8 py-7"
    >
      <span className="text-[34px] font-extrabold tracking-[-0.02em]">
        {done ? copy.print.done : copy.print.busy}
      </span>
      <div className="h-[22px] overflow-hidden rounded-[11px] border-2 border-ink bg-paper">
        <div
          style={{ animationDuration: `${print.copies * PRINT_SEC_PER_SHEET}s` }}
          className={`h-full border-r-2 border-ink bg-mint ${done ? "w-full" : "w-0 animate-[fill_linear_forwards]"}`}
        />
      </div>
      <span className="text-[24px] font-medium text-text-2">
        {done
          ? copy.print.take(print.copies)
          : copy.print.eta(print.copies, print.copies * PRINT_SEC_PER_SHEET)}
      </span>
    </div>
  );
}
