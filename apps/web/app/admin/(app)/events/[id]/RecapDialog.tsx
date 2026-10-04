"use client";
import { durationText } from "@tetra/shared";
import {
  CalendarDays,
  Check,
  CircleCheck,
  ClipboardList,
  Clock,
  ClockArrowDown,
  ClockArrowUp,
  Copy,
  Download,
  type LucideIcon,
  MapPin,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { copy } from "@/lib/copy";
import {
  clockWib,
  dateLong,
  type RecapData,
  type RecapView,
  recapText,
  recapView,
} from "@/lib/recap";

const t = copy.admin.recap;
const btn =
  "pressable inline-flex h-11 items-center justify-center gap-2 rounded-xl border-[1.5px] border-ink px-4 text-sm font-extrabold";
const primary = `${btn} layered bg-butter [--lb:1.5px] [--lx:4px]`;
const secondary = `${btn} bg-white hover:bg-mint-soft`;

/** Warna & ikon vonis durasi: sesuai = mint, lebih = peach (lembur), kurang = coral, belum bisa dinilai = neutral. */
const TONE = {
  ok: { bg: "--mint-soft", icon: CircleCheck },
  over: { bg: "--peach", icon: ClockArrowUp },
  under: { bg: "--coral", icon: ClockArrowDown },
  none: { bg: "--neutral", icon: Clock },
} satisfies Record<string, { bg: string; icon: LucideIcon }>;
const toneOf = (v: RecapView) => TONE[v.verdict?.kind ?? "none"];
const time = (ts: string | null) => (ts ? clockWib(ts) : "–");
const timeline = (v: RecapView): [string, string][] => [
  [t.start, time(v.startAt)],
  [t.end, v.running ? t.running : time(v.endAt)],
  [t.paused, v.source === "timer" ? durationText(v.pausedMs / 60_000) : "–"],
];

/**
 * Tombol "Rekap event" + kartu bukti (DECISIONS #148): satu kartu tanpa scroll untuk difoto/screenshot,
 * Salin teks (WhatsApp) dan Unduh gambar (PNG digambar ulang di canvas dari data yang sama, tanpa dependensi).
 */
export function RecapDialog({ data, slug }: { data: RecapData; slug: string }) {
  const ref = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState(false);
  const [now, setNow] = useState(0);
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    const d = ref.current;
    if (open && d && !d.open) d.showModal();
    if (!open && d?.open) d.close();
  }, [open]);
  const v = open ? recapView(data, now) : null;

  const download = async () => {
    if (!v) return;
    await document.fonts.ready;
    const c = renderPng(data, v, await iconImage(ref.current));
    const url = c.toDataURL("image/png");
    const a = document.createElement("a");
    a.href = url;
    a.download = `rekap-${slug}.png`;
    a.click();
  };

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setNow(Date.now());
          setCopied(false);
          setOpen(true);
        }}
        className="flex h-10 items-center gap-2 rounded-[11px] border-[1.5px] border-ink bg-butter px-3.5 text-[13px] font-bold"
      >
        <ClipboardList aria-hidden className="size-4" strokeWidth={2} /> {t.open}
      </button>
      <dialog
        ref={ref}
        aria-label={t.title}
        onClose={() => setOpen(false)}
        className="m-auto max-h-[calc(100dvh-24px)] w-[640px] max-w-[calc(100vw-24px)] rounded-[22px] border-[1.5px] border-ink bg-white p-0 text-ink backdrop:bg-ink/40"
      >
        {v && (
          <div className="flex flex-col gap-3 p-3">
            <RecapCard data={data} v={v} />
            <div className="flex flex-wrap items-center justify-end gap-2 px-1 pb-1">
              <button
                type="button"
                onClick={() => setOpen(false)}
                className={`${secondary} mr-auto`}
              >
                {t.close}
              </button>
              <button
                type="button"
                onClick={async () => {
                  await navigator.clipboard.writeText(recapText(data, now)).catch(() => {});
                  setCopied(true);
                }}
                className={secondary}
              >
                {copied ? (
                  <Check aria-hidden className="size-4" strokeWidth={2} />
                ) : (
                  <Copy aria-hidden className="size-4" strokeWidth={2} />
                )}
                {copied ? t.copied : t.copyText}
              </button>
              <button type="button" onClick={download} className={primary}>
                <Download aria-hidden className="size-4" strokeWidth={2} /> {t.download}
              </button>
            </div>
          </div>
        )}
      </dialog>
    </>
  );
}

function RecapCard({ data, v }: { data: RecapData; v: RecapView }) {
  const tone = toneOf(v);
  const Icon = tone.icon;
  return (
    <article
      data-testid="recap-card"
      className="flex flex-col gap-4 rounded-[18px] border-[1.5px] border-ink bg-paper p-6"
    >
      <header className="flex flex-col gap-1.5">
        <div className="flex items-center justify-between gap-3 text-xs font-extrabold tracking-[0.06em] text-text-2 uppercase">
          <span>{t.title}</span>
          <span className="tracking-normal normal-case text-ink">{t.brand}</span>
        </div>
        <h2 className="text-[26px] leading-tight font-extrabold tracking-[-0.03em] text-balance">
          {data.name}
        </h2>
        <p className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm font-semibold text-text-2">
          <span className="flex items-center gap-1.5">
            <CalendarDays aria-hidden className="size-4" /> {dateLong(data.date)}
          </span>
          {data.venue && (
            <span className="flex items-center gap-1.5">
              <MapPin aria-hidden className="size-4" /> {data.venue}
            </span>
          )}
        </p>
      </header>

      <section
        data-testid="recap-verdict"
        data-kind={v.verdict?.kind ?? "none"}
        style={{ background: `var(${tone.bg})` }}
        className="flex flex-col gap-3 rounded-2xl border-[1.5px] border-ink px-5 py-4"
      >
        <div className="flex items-start gap-3">
          <span className="flex size-10 flex-none items-center justify-center rounded-full border-[1.5px] border-ink bg-white">
            <Icon aria-hidden className="size-5" strokeWidth={2} />
          </span>
          <div className="min-w-0">
            <p className="text-[22px] leading-tight font-extrabold tracking-[-0.02em]">
              {v.verdictText}
            </p>
            <p className="mt-0.5 text-[13px] leading-snug font-semibold text-text-3">
              {v.verdictSub}
            </p>
          </div>
        </div>
        <dl className="grid grid-cols-3 gap-3 border-t-[1.5px] border-dashed border-ink pt-3">
          {timeline(v).map(([k, val]) => (
            <div key={k} className="flex flex-col">
              <dt className="text-[11px] font-bold text-text-2">{k}</dt>
              <dd className="font-mono text-[15px] font-medium">{val}</dd>
            </div>
          ))}
        </dl>
        {v.schedule && (
          <p
            data-testid="recap-schedule"
            className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 border-t-[1.5px] border-dashed border-ink pt-3 text-[13px]"
          >
            <span className="font-bold">
              {t.planned} <span className="font-mono font-medium">{v.schedule.planned}</span>
              {v.schedule.actual && (
                <>
                  {" "}
                  <span className="text-text-2">vs</span> {t.actual}{" "}
                  <span className="font-mono font-medium">{v.schedule.actual}</span>
                </>
              )}
            </span>
            {v.schedule.note && (
              <span className="font-semibold text-text-3">{v.schedule.note}</span>
            )}
          </p>
        )}
      </section>

      <dl className="grid grid-cols-4 gap-2.5">
        {v.stats.map((s) => (
          <div
            key={s.label}
            className="flex min-w-0 flex-col rounded-xl border-[1.5px] border-ink bg-white px-3 py-2.5"
          >
            <dt className="truncate text-[11px] font-bold text-text-2">{s.label}</dt>
            <dd
              data-testid={`recap-${s.label}`}
              className="text-[22px] leading-tight font-extrabold tracking-[-0.02em]"
            >
              {s.value}
            </dd>
            <span className="truncate text-[11px] font-semibold text-text-2">
              {s.note ?? "\u00a0"}
            </span>
          </div>
        ))}
      </dl>

      <dl className="flex flex-col">
        {v.rows.map((r) => (
          <div
            key={r.label}
            className="grid grid-cols-[124px_minmax(0,1fr)] gap-3 border-t-[1.5px] border-dashed border-line-soft py-2 text-[13px]"
          >
            <dt className="font-bold text-text-2">{r.label}</dt>
            <dd data-testid={`recap-row-${r.label}`} className="font-semibold">
              {r.value}
            </dd>
          </div>
        ))}
      </dl>

      <footer className="border-t-[1.5px] border-dashed border-ink pt-3 text-xs font-semibold text-text-2">
        {t.generated} {v.generated}
      </footer>
    </article>
  );
}

/* ── PNG: kartu yang sama digambar di canvas (2×) ─────────────────────────────── */

const SANS = '"Plus Jakarta Sans Variable", system-ui, sans-serif';
const MONO = '"Geist Mono", ui-monospace, monospace';
/** Warna dari token (tokens.css), dibaca saat menggambar. */
const token = (name: string) =>
  getComputedStyle(document.documentElement).getPropertyValue(name).trim() || "#000";
const C = {
  get ink() {
    return token("--ink");
  },
  get paper() {
    return token("--paper");
  },
  white: "#fff",
  get t2() {
    return token("--text-2");
  },
  get t3() {
    return token("--text-3");
  },
  get line() {
    return token("--line-soft");
  },
};
const W = 600;
const P = 26;

/** Ikon vonis dari kartu HTML (lucide SVG) sebagai gambar, supaya PNG memakai ikon yang sama. */
function iconImage(root: HTMLElement | null): Promise<HTMLImageElement | null> {
  const svg = root?.querySelector('[data-testid="recap-verdict"] svg');
  if (!svg) return Promise.resolve(null);
  const src = svg.outerHTML.replaceAll("currentColor", token("--ink"));
  return new Promise((done) => {
    const img = new Image();
    img.onload = () => done(img);
    img.onerror = () => done(null);
    img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(src)}`;
  });
}

function renderPng(data: RecapData, v: RecapView, icon: HTMLImageElement | null) {
  const measure = document.createElement("canvas").getContext("2d");
  const h = measure ? draw(measure, data, v, null) : 900;
  const c = document.createElement("canvas");
  c.width = W * 2;
  c.height = h * 2;
  const ctx = c.getContext("2d");
  if (ctx) {
    ctx.scale(2, 2);
    draw(ctx, data, v, icon);
  }
  return c;
}

function box(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
  fill: string,
) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = C.ink;
  ctx.setLineDash([]);
  ctx.stroke();
}
function dash(ctx: CanvasRenderingContext2D, x1: number, x2: number, y: number, color = C.ink) {
  ctx.beginPath();
  ctx.setLineDash([5, 4]);
  ctx.moveTo(x1, y);
  ctx.lineTo(x2, y);
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.setLineDash([]);
}
function text(
  ctx: CanvasRenderingContext2D,
  s: string,
  x: number,
  y: number,
  font: string,
  color = C.ink,
  align: CanvasTextAlign = "left",
) {
  ctx.font = font;
  ctx.fillStyle = color;
  ctx.textAlign = align;
  ctx.textBaseline = "alphabetic";
  ctx.fillText(s, x, y);
}
/** Pecah teks per kata supaya muat `max` px. */
function wrap(ctx: CanvasRenderingContext2D, s: string, font: string, max: number) {
  ctx.font = font;
  const out: string[] = [];
  let line = "";
  for (const w of s.split(" ")) {
    const next = line ? `${line} ${w}` : w;
    if (line && ctx.measureText(next).width > max) {
      out.push(line);
      line = w;
    } else line = next;
  }
  if (line) out.push(line);
  return out;
}
/** Potong dengan "…" kalau lebih lebar dari `max`. */
function fit(ctx: CanvasRenderingContext2D, s: string, font: string, max: number) {
  ctx.font = font;
  if (ctx.measureText(s).width <= max) return s;
  let x = s;
  while (x.length > 1 && ctx.measureText(`${x}…`).width > max) x = x.slice(0, -1);
  return `${x}…`;
}

/** Gambar kartu, kembalikan tinggi total (dipakai juga untuk mengukur). */
function draw(
  ctx: CanvasRenderingContext2D,
  data: RecapData,
  v: RecapView,
  icon: HTMLImageElement | null,
) {
  const inner = W - P * 2;
  let y = P;
  ctx.fillStyle = C.paper;
  ctx.fillRect(0, 0, W, 4000);

  text(ctx, t.title.toUpperCase(), P, y + 12, `800 12px ${SANS}`, C.t2);
  text(ctx, t.brand, W - P, y + 12, `800 12px ${SANS}`, C.ink, "right");
  y += 22;
  for (const l of wrap(ctx, data.name, `800 26px ${SANS}`, inner)) {
    y += 32;
    text(ctx, l, P, y, `800 26px ${SANS}`);
  }
  y += 24;
  text(
    ctx,
    [dateLong(data.date), data.venue].filter(Boolean).join("  ·  "),
    P,
    y,
    `600 14px ${SANS}`,
    C.t2,
  );
  y += 18;

  // Vonis + garis waktu
  const subFont = `600 13px ${SANS}`;
  const sub = wrap(ctx, v.verdictSub, subFont, inner - 40 - 56);
  const sched = v.schedule
    ? [
        `${t.planned} ${v.schedule.planned}${v.schedule.actual ? `  vs  ${t.actual} ${v.schedule.actual}` : ""}`,
        ...(v.schedule.note ? wrap(ctx, v.schedule.note, subFont, inner - 40) : []),
      ]
    : [];
  const vh = 18 + 28 + sub.length * 18 + 14 + 14 + 40 + (sched.length ? 16 + sched.length * 18 : 0);
  box(ctx, P, y, inner, vh, 16, token(toneOf(v).bg));
  ctx.beginPath();
  ctx.arc(P + 20 + 20, y + 18 + 20, 20, 0, Math.PI * 2);
  ctx.fillStyle = C.white;
  ctx.fill();
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = C.ink;
  ctx.stroke();
  if (icon) ctx.drawImage(icon, P + 30, y + 28, 20, 20);
  let vy = y + 18 + 22;
  text(ctx, v.verdictText, P + 76, vy, `800 22px ${SANS}`);
  for (const l of sub) {
    vy += 18;
    text(ctx, l, P + 76, vy, subFont, C.t3);
  }
  vy += 14;
  dash(ctx, P + 20, W - P - 20, vy);
  const col = (inner - 40) / 3;
  timeline(v).forEach(([k, val], i) => {
    const x = P + 20 + i * col;
    text(ctx, k, x, vy + 20, `700 11px ${SANS}`, C.t2);
    text(ctx, val, x, vy + 40, `500 15px ${MONO}`);
  });
  if (sched.length) {
    vy += 52;
    dash(ctx, P + 20, W - P - 20, vy);
    sched.forEach((l, i) => {
      text(ctx, l, P + 20, vy + 20 + i * 18, i ? subFont : `700 13px ${SANS}`, i ? C.t3 : C.ink);
    });
  }
  y += vh + 16;

  // Statistik 4 × 2
  const gap = 10;
  const sw = (inner - gap * 3) / 4;
  const sh = 74;
  v.stats.forEach((s, i) => {
    const x = P + (i % 4) * (sw + gap);
    const sy = y + Math.floor(i / 4) * (sh + gap);
    box(ctx, x, sy, sw, sh, 12, C.white);
    text(
      ctx,
      fit(ctx, s.label, `700 11px ${SANS}`, sw - 24),
      x + 12,
      sy + 20,
      `700 11px ${SANS}`,
      C.t2,
    );
    text(ctx, s.value, x + 12, sy + 46, `800 22px ${SANS}`);
    if (s.note)
      text(
        ctx,
        fit(ctx, s.note, `600 11px ${SANS}`, sw - 24),
        x + 12,
        sy + 64,
        `600 11px ${SANS}`,
        C.t2,
      );
  });
  y += sh * 2 + gap + 12;

  // Paket, booth, desain
  for (const r of v.rows) {
    dash(ctx, P, W - P, y, C.line);
    const lines = wrap(ctx, r.value, `600 13px ${SANS}`, inner - 136);
    text(ctx, r.label, P, y + 22, `700 13px ${SANS}`, C.t2);
    lines.forEach((l, i) => {
      text(ctx, l, P + 136, y + 22 + i * 18, `600 13px ${SANS}`);
    });
    y += 14 + lines.length * 18;
  }
  y += 10;
  dash(ctx, P, W - P, y);
  text(ctx, `${t.generated} ${v.generated}`, P, y + 22, `600 12px ${SANS}`, C.t2);
  y += 22 + P;
  return y;
}
