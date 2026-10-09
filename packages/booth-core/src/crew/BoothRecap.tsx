import {
  clockOn,
  compareSchedule,
  durationText,
  fileSize,
  localHhmm,
  localYmd,
  runElapsedMs,
  runPausedMs,
  runState,
  runVerdict,
} from "@tetra/shared";
import { Button } from "@tetra/ui";
import {
  CircleCheck,
  Clock,
  ClockArrowDown,
  ClockArrowUp,
  FolderOpen,
  HardDrive,
  Link2,
  QrCode as QrCodeIcon,
  Usb,
} from "lucide-react";
import { useEffect, useState } from "react";
import { copy } from "../copy";
import { crewText } from "../errors";
import type { BoothEvent } from "../event";
import { GalleryQr } from "../GalleryQr";
import { usePlatform } from "../PlatformContext";
import type { EventSize, BoothRecap as RecapData } from "../platform";

const t = copy.crew.recap;
const TONE = {
  ok: ["var(--mint-soft)", CircleCheck],
  over: ["var(--peach)", ClockArrowUp],
  under: ["var(--coral)", ClockArrowDown],
  none: ["var(--neutral)", Clock],
} as const;

/** Hitung tampilan rekap dari data laptop (timer lokal, atau perkiraan sesi pertama → terakhir). */
function view(d: RecapData, now: number) {
  const run = d.run?.segments.length ? d.run : null;
  const st = run ? runState(run) : null;
  const startAt = run ? (run.segments[0]?.start ?? null) : d.firstAt;
  const endAt = run
    ? st === "running"
      ? null
      : (run.segments.at(-1)?.end ?? null)
    : d.sessions > 1
      ? d.lastAt
      : null;
  const ms = run
    ? runElapsedMs(run, now)
    : d.firstAt && d.lastAt
      ? Date.parse(d.lastAt) - Date.parse(d.firstAt)
      : 0;
  const hours = d.info.packageHours;
  const verdict = startAt && hours ? runVerdict(ms, hours) : null;
  const dur = durationText(ms / 60_000);
  // Hari acara = hari timer mulai (atau sesi pertama); jam di hari lain ditulis dengan tanggal (#170).
  const ref = startAt ? localYmd(startAt) : null;
  const clock = (iso: string | null) => (iso ? clockOn(iso, ref) : "–");
  return {
    run,
    clock,
    startAt,
    endAt,
    running: st === "running",
    pausedMs: run ? runPausedMs(run, now) : 0,
    verdict,
    title: !verdict
      ? t.ran(dur)
      : verdict.kind === "ok"
        ? t.okPkg
        : verdict.kind === "over"
          ? t.over(durationText(verdict.minutes))
          : t.under(durationText(verdict.minutes)),
    sub: [
      verdict ? t.ran(dur) : null,
      hours ? t.pkg(durationText(hours * 60)) : null,
      run ? null : t.noRun,
    ]
      .filter(Boolean)
      .join(" · "),
    schedule: compareSchedule(
      d.info.scheduledStart ?? null,
      d.info.scheduledEnd ?? null,
      startAt ? localHhmm(startAt) : null,
      endAt ? localHhmm(endAt) : null,
    ),
  };
}

/**
 * Kartu rekap acara di booth (#154): muncul sendiri setelah Hentikan Acara, juga dari Ringkasan → Rekap Acara.
 * Data dari SQLite & timer laptop ini (offline aman). Tombol: Buka Folder Event (salin ke flashdisk), Salin Link
 * Galeri (butuh internet), Tutup.
 */
export function BoothRecap({ event, onClose }: { event: BoothEvent; onClose: () => void }) {
  const p = usePlatform();
  const [data, setData] = useState<RecapData | null>(null);
  const [size, setSize] = useState<EventSize | null>(null);
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [qr, setQr] = useState<string | null>(null);
  const [now] = useState(Date.now);
  useEffect(() => {
    p.crew.recap(event.id).then(setData, (e: unknown) => setNote({ ok: false, text: crewText(e) }));
    // Ukuran folder event (#166): gagal = baris ukuran tetap "Menghitung…" tanpa mengganggu rekap.
    p.crew.eventSize(event.id).then(setSize, () => {});
  }, [p, event.id]);
  const v = data && view(data, now);
  const [bg, Icon] = TONE[v?.verdict?.kind ?? "none"];
  const run = (fn: () => Promise<string>, done: (s: string) => string) => () => {
    setBusy(true);
    fn()
      .then((s) => setNote({ ok: true, text: done(s) }))
      .catch((e: unknown) => setNote({ ok: false, text: crewText(e) }))
      .finally(() => setBusy(false));
  };

  return (
    <div
      role="dialog"
      aria-modal
      aria-labelledby="recap-title"
      className="fixed inset-0 z-20 flex items-center justify-center bg-ink/35"
    >
      <article
        data-testid="booth-recap"
        className="layered flex w-[1180px] flex-col gap-6 rounded-[32px] border-[2.5px] border-ink bg-white p-11 [--lx:10px]"
      >
        <header>
          <p className="text-lg font-extrabold tracking-[0.04em] text-text-2 uppercase">
            {t.title}
          </p>
          <h2
            id="recap-title"
            className="mt-1 text-[44px] leading-tight font-extrabold tracking-[-0.03em]"
          >
            {event.name}
          </h2>
          <p className="mt-1 font-mono text-2xl text-text-3">{event.date}</p>
        </header>

        {v && data && (
          <>
            <section
              data-testid="booth-recap-verdict"
              style={{ background: bg }}
              className="flex flex-col gap-5 rounded-[24px] border-[2.5px] border-ink px-8 py-6"
            >
              <div className="flex items-center gap-5">
                <span className="flex size-16 flex-none items-center justify-center rounded-full border-[2.5px] border-ink bg-white">
                  <Icon size={30} strokeWidth={2.25} />
                </span>
                <div className="min-w-0">
                  <p className="text-[34px] leading-tight font-extrabold tracking-[-0.02em]">
                    {v.title}
                  </p>
                  {v.sub && <p className="text-xl font-semibold text-text-3">{v.sub}</p>}
                </div>
              </div>
              <dl className="grid grid-cols-3 gap-4 border-t-2 border-dashed border-ink pt-4">
                {(
                  [
                    [t.start, v.clock(v.startAt)],
                    [t.end, v.running ? t.running : v.clock(v.endAt)],
                    [t.paused, v.run ? durationText(v.pausedMs / 60_000) : "–"],
                  ] as const
                ).map(([k, val]) => (
                  <div key={k}>
                    <dt className="text-lg font-bold text-text-2">{k}</dt>
                    <dd className="font-mono text-[28px] font-medium">{val}</dd>
                  </div>
                ))}
              </dl>
              {v.schedule && (
                <p
                  data-testid="booth-recap-schedule"
                  className="flex flex-wrap items-baseline gap-x-5 gap-y-1 border-t-2 border-dashed border-ink pt-4 text-xl"
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

            <dl className="grid grid-cols-4 gap-4">
              {(
                [
                  [t.sessions, String(data.sessions)],
                  [t.prints, String(data.prints)],
                  [t.first, v.clock(data.firstAt)],
                  [t.last, v.clock(data.lastAt)],
                ] as const
              ).map(([k, val]) => (
                <div key={k} className="rounded-[20px] border-[2.5px] border-ink px-6 py-4">
                  <dt className="text-lg font-bold text-text-2">{k}</dt>
                  <dd
                    data-testid={`booth-recap-${k}`}
                    className={`${val.length > 6 ? "text-[28px]" : "text-[38px]"} leading-tight font-extrabold tracking-[-0.02em]`}
                  >
                    {val}
                  </dd>
                </div>
              ))}
            </dl>
            <p className="text-lg font-semibold text-text-2">
              {data.outside > 0 && (
                <span data-testid="booth-recap-outside">{t.outside(data.outside)} · </span>
              )}
              {data.tests > 0 && <>{t.tests(data.tests)} · </>}
              {t.thisLaptop}
            </p>
          </>
        )}

        {note && (
          <p
            role="status"
            data-testid="booth-recap-note"
            className={`rounded-[18px] border-2 border-ink px-5 py-3 text-xl font-bold break-all ${note.ok ? "bg-mint-soft" : "bg-coral"}`}
          >
            {note.text}
          </p>
        )}

        <section
          data-testid="booth-recap-size"
          className="flex items-center gap-5 rounded-[20px] border-[2.5px] border-ink bg-sky px-6 py-4"
        >
          <HardDrive size={34} strokeWidth={2.25} className="flex-none" />
          <div className="min-w-0 flex-1">
            <p className="text-lg font-bold text-text-2">{t.size}</p>
            <p className="text-[34px] leading-tight font-extrabold tracking-[-0.02em]">
              {size ? t.sizeValue(fileSize(size.bytes), size.files) : t.sizeLoading}
            </p>
            <p className="text-lg font-semibold text-text-3">{t.sizeHint}</p>
          </div>
          {!!size?.drives.length && (
            <ul className="flex flex-none flex-col gap-2">
              {size.drives.map((d) => {
                const ok = d.free > size.bytes;
                return (
                  <li
                    key={d.name}
                    data-testid="booth-recap-drive"
                    className={`flex items-center gap-2 rounded-full border-2 border-ink px-4 py-1.5 text-lg font-bold ${ok ? "bg-mint-soft" : "bg-coral"}`}
                  >
                    <Usb size={20} strokeWidth={2.25} />
                    {t.drive(d.name, fileSize(d.free))} · {ok ? t.driveOk : t.driveLow}
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <div className="flex items-center gap-4">
          <Button
            className="h-[92px] flex-1 rounded-[20px] text-2xl [--lx:6px]"
            disabled={busy}
            onClick={run(() => p.crew.openEventFolder(event.id), t.folderDone)}
          >
            <FolderOpen size={28} strokeWidth={2.25} /> {t.folder}
          </Button>
          {data?.run && (
            <Button
              variant="secondary"
              className="h-[92px] flex-1 rounded-[20px] text-2xl"
              disabled={busy}
              onClick={run(() => p.crew.galleryLink(event.id), t.linkDone)}
            >
              <Link2 size={28} strokeWidth={2.25} /> {t.link}
            </Button>
          )}
          {data?.run && (
            <Button
              variant="secondary"
              className="h-[92px] flex-1 rounded-[20px] text-2xl"
              disabled={busy}
              onClick={run(
                () => p.crew.galleryLink(event.id).then((u) => (setQr(u), u)),
                t.linkDone,
              )}
            >
              <QrCodeIcon size={28} strokeWidth={2.25} /> {copy.galleryQr.button}
            </Button>
          )}
          <Button
            variant="plain"
            className="h-[92px] rounded-[20px] px-10 text-2xl"
            onClick={onClose}
          >
            {t.close}
          </Button>
        </div>
        <p className="-mt-2 text-lg font-semibold text-text-2">{t.folderNote}</p>
      </article>
      {qr && (
        <GalleryQr
          url={qr}
          onCopy={() =>
            p.crew
              .galleryLink(event.id)
              .then(() => setNote({ ok: true, text: copy.galleryQr.copied }))
          }
          onClose={() => setQr(null)}
        />
      )}
    </div>
  );
}
