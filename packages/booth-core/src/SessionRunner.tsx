import { filterCss, newSessionId, printPaper } from "@tetra/shared";
import { useEffect, useMemo, useReducer, useRef, useState } from "react";
import { composeStrip, designPreview, renderWebPiece, shotsPerSession } from "./compose";
import { copy } from "./copy";
import { CountdownRecorder, recorderMime } from "./countdownVideo";
import { afSuspect, errText } from "./errors";
import type { BoothEvent } from "./event";
import { buildOutputs, previewUrl } from "./finalize";
import { mmss, rupiah } from "./format";
import { usePlatform } from "./PlatformContext";
import type { SessionPiece } from "./platform";
import {
  after,
  beforeCue,
  beforeText,
  type Cue,
  play,
  playAfter,
  setSoundOverrides,
} from "./prompts";
import { Attract } from "./screens/Attract";
import { Bumper } from "./screens/Bumper";
import { Capturing } from "./screens/Capturing";
import { Countdown } from "./screens/Countdown";
import { FilterSelect } from "./screens/FilterSelect";
import { Gallery } from "./screens/Gallery";
import { LayoutSelect } from "./screens/LayoutSelect";
import { LiveView, slotAspect } from "./screens/LiveView";
import { CameraError, Message } from "./screens/Message";
import { Paid, Payment } from "./screens/Payment";
import { PhotoPreview } from "./screens/PhotoPreview";
import { PrintSelect } from "./screens/PrintSelect";
import { Qr } from "./screens/Qr";
import { Review } from "./screens/Review";
import { initialSession, type Photo, type SessionEvent, sessionReducer } from "./session";
import { isBlurry, sharpNotes } from "./sharpness";

const RECONNECT_EVERY_MS = 2000;
/** Setelah 15 percobaan gagal (±30 dtk), coba tiap 10 dtk saja: kamera yang dicabut tidak dibombardir (#170). */
const RECONNECT_SLOW_AFTER = 15;
const RECONNECT_SLOW_MS = 10_000;
/** Layar "Pembayaran berhasil" sebelum sesi foto mulai (A4a). */
const PAID_SEC = 3;
/** Fase yang dibatasi timer sesi photobox. */
const TIMED = new Set([
  "countdown",
  "capture",
  "preview",
  "camera_error",
  "review",
  "filter",
  "print_select",
]);
/** Mode demo: jeda "tamu" di layar yang butuh sentuhan (dipersingkat di mode cepat stress test). */
const DEMO_TAP_MS = 1500;
const FAST_TAP_MS = 150;

/** Rasio lebar/tinggi slot foto (rotasi ±90° = tukar sisi), untuk panduan bingkai live view (#107). */

const startEvent = (
  event: BoothEvent,
  design?: { id: string; layout: BoothEvent["layout"] },
): SessionEvent => ({
  type: "START",
  sessionId: newSessionId(),
  slots: shotsPerSession(design?.layout ?? event.layout, event.settings),
  retakeMax: event.settings.retakeMax,
  ...(design && { layoutId: design.id }),
  filters: event.settings.filters.length > 0,
});

/**
 * Menjalankan satu sesi: reducer murni + efek (timer, kamera, compose, cetak) per fase.
 * `demo`: sesi berjalan sendiri tanpa sentuhan (uji otomatis & stress test M8).
 */
export function SessionRunner({
  event,
  guestBaseUrl,
  demo = false,
  fast = false,
  bumper = false,
  test = false,
  onCrew,
}: {
  event: BoothEvent;
  guestBaseUrl: string;
  demo?: boolean;
  /** Demo dipercepat (M8). */
  fast?: boolean;
  /** Booth terpasang: putar bumper saat event ini dibuka (#105). */
  bumper?: boolean;
  /** Mode "Tes dulu" crew (#153): sesi ditandai tes, lencana kecil di pojok. */
  test?: boolean;
  onCrew?: (intent?: "exit") => void;
}) {
  const p = usePlatform();
  const [s, dispatch] = useReducer(sessionReducer, initialSession);
  // Photobox / desain pilihan tamu (#99) menggantikan layout event untuk compose, cetak, dan output.
  const chosen = (event.photobox?.layouts ?? event.designs)?.find((l) => l.id === s.layoutId);
  const previews = useDesignPreviews(event, s.phase === "layout_select");
  const ev = useMemo(() => (chosen ? { ...event, layout: chosen.layout } : event), [event, chosen]);
  const cfg = ev.settings;
  const [paidAmount, setPaidAmount] = useState(0);
  const [now, setNow] = useState(Date.now());
  const urls = useRef<string[]>([]);
  /** Percobaan sambung ulang kamera yang gagal, untuk layar A10. */
  const [reconnects, setReconnects] = useState(0);
  // Jepret gagal karena kamera sibuk/tidak menjawab → saran AF ke MF untuk crew di layar kamera bermasalah.
  const [afHint, setAfHint] = useState(false);
  const send = (e: SessionEvent) => () => dispatch(e);
  // Galeri tamu (#145): layar di atas attract, bukan fase sesi; selama terbuka tidak ada sesi baru yang mulai.
  const [gallery, setGallery] = useState<{ at?: SessionPiece | undefined } | null>(null);
  useEffect(() => setSoundOverrides(event.sounds), [event.sounds]);
  // Bumper (#105): play → leave (memudar, layar awal mulai dibangun di bawahnya) → done.
  const [bumperState, setBumperState] = useState<"play" | "leave" | "done">(
    bumper && event.settings.bumper && !demo ? "play" : "done",
  );
  // Video hitung mundur (#117): rekam saat countdown/jepret, jeda di luar itu, simpan saat masuk compose.
  const recorder = useRef<CountdownRecorder | null>(null);
  // Id sesi yang video-nya benar-benar tertulis: sesi tanpa video tidak membaca video.mp4 (ENOENT di log tiap sesi).
  const videoSaved = useRef<Promise<string | null>>(Promise.resolve(null));
  /** Potongan web 2× sesi ini (#133), dirender di latar belakang setelah compose; [sessionId, path]. */
  const webPiece = useRef<Promise<[string, string | null]>>(Promise.resolve(["", null]));
  useEffect(() => {
    if (!cfg.countdownVideo || demo || !s.sessionId) return;
    const shooting = s.phase === "countdown" || s.phase === "capture";
    if (shooting) {
      const mime = recorderMime();
      if (!recorder.current && mime)
        recorder.current = new CountdownRecorder(mime, p.mirrorLiveView ?? true);
      recorder.current?.resume();
    } else if (s.phase === "compose" || s.phase === "attract") {
      const r = recorder.current;
      recorder.current = null;
      const id = s.sessionId;
      if (r)
        videoSaved.current = r
          .stop()
          .then(async (bytes) => {
            if (!bytes) return null;
            await p.storage.writeFile(`${await p.storage.sessionDir(id)}/out/video.mp4`, bytes);
            console.info(`[session] video hitung mundur ${Math.round(bytes.byteLength / 1024)} KB`);
            return id;
          })
          .catch((e: unknown) => {
            console.warn(`[session] video gagal: ${errText(e)}`);
            return null;
          });
    } else recorder.current?.pause();
  }, [s.phase, s.sessionId, cfg.countdownVideo, demo, p]);

  // Frame live view sudah tampil di layar jepret ini; countdown menunggunya (EVF DSLR dingin, lihat Countdown).
  const [live, setLive] = useState(false);
  const shooting = s.phase === "countdown" || s.phase === "capture";
  useEffect(() => {
    if (!shooting) setLive(false);
  }, [shooting]);

  // Foto 1 (W-034): EVF DSLR dinyalakan saat tamu memilih desain / selesai bayar, bukan baru saat hitung mundur.
  useEffect(() => {
    if (s.phase === "layout_select" || s.phase === "paid") p.camera.warm?.();
  }, [s.phase, p]);

  // Kalimat & suara di sela foto (#103): daftar event, atau bawaan booth.
  const before = cfg.promptsBefore.length ? cfg.promptsBefore : copy.prompts.before;
  // biome-ignore lint/correctness/useExhaustiveDependencies: sorakan baru tiap foto/percobaan
  const cheer = useMemo(() => {
    const own = cfg.promptsAfter.length > 0;
    return after(own ? cfg.promptsAfter : copy.prompts.after, Math.random(), !own);
  }, [s.index, s.attempt, cfg.promptsAfter]);
  useEffect(() => {
    if (!cfg.countdownSound) return;
    const cue: Partial<Record<typeof s.phase, Cue | null>> = {
      preview: cheer.cue,
      review: "review",
      print_select: "cetak",
      qr: "selesai",
      payment: "bayar",
    };
    const c = cue[s.phase];
    // Sorakan menunggu bunyi jepret selesai, suara review menunggu ekor sorakan (maks. 600 ms); fase lain memotong.
    if (c) void (s.phase === "preview" || s.phase === "review" ? playAfter(c) : play(c));
  }, [s.phase, cfg.countdownSound, cheer.cue]);

  // Log setiap transisi (TSD §1) + kabari shell.
  useEffect(() => {
    console.info(`[session] ${s.phase} ${s.sessionId ?? "-"} foto=${s.index + 1}`);
    p.phaseChanged(s.phase);
  }, [p, s.phase, s.sessionId, s.index]);

  // Kembali ke attract: lepas object URL sesi sebelumnya.
  useEffect(() => {
    if (s.phase !== "attract") return;
    for (const u of urls.current) URL.revokeObjectURL(u);
    urls.current = [];
  }, [s.phase]);

  // Timer sederhana per fase.
  useEffect(() => {
    const tapMs = fast ? FAST_TAP_MS : DEMO_TAP_MS;
    const after = (ms: number, e: SessionEvent) => {
      const t = setTimeout(() => dispatch(e), ms);
      return () => clearTimeout(t);
    };
    switch (s.phase) {
      case "attract":
        return demo && !gallery ? after(tapMs, startEvent(event)) : undefined;
      case "paid":
        return s.draftId
          ? after(PAID_SEC * 1000, {
              type: "START",
              sessionId: s.draftId,
              slots: shotsPerSession(ev.layout, cfg),
              retakeMax: cfg.retakeMax,
              filters: cfg.filters.length > 0,
              deadline: Date.now() + PAID_SEC * 1000 + cfg.sessionSec * 1000,
            })
          : undefined;
      case "preview":
        return after(cfg.shotDelaySec * 1000, { type: "PREVIEW_DONE" });
      case "review":
        return after(demo ? tapMs : cfg.reviewTimeoutSec * 1000, { type: "CONTINUE" });
      case "filter":
        return after(demo ? tapMs : cfg.reviewTimeoutSec * 1000, {
          type: "FILTER_CHOSEN",
          filter: "normal",
        });
      case "print_select":
        return demo ? after(tapMs, { type: "PRINTS_SELECTED", count: 1 }) : undefined;
      case "qr":
        return after(demo ? tapMs : cfg.qrScreenSec * 1000, { type: "FINISH" });
      default:
        return undefined;
    }
  }, [s.phase, s.draftId, demo, fast, cfg, event, ev, gallery]);

  // Timer sesi photobox (FSD §1.5): habis → slot kosong diisi, lanjut compose / cetak 1 lembar.
  useEffect(() => {
    if (s.deadline === null || !TIMED.has(s.phase)) return;
    const tick = setInterval(() => setNow(Date.now()), 500);
    const up = setTimeout(
      () => dispatch({ type: "TIME_UP" }),
      Math.max(0, s.deadline - Date.now()),
    );
    return () => {
      clearInterval(tick);
      clearTimeout(up);
    };
  }, [s.deadline, s.phase]);

  // Capture (dan retry otomatis: `attempt` berubah → efek jalan lagi).
  // biome-ignore lint/correctness/useExhaustiveDependencies: s.attempt sengaja memicu capture ulang
  useEffect(() => {
    if (s.phase !== "capture" || !s.sessionId) return;
    let live = true;
    p.camera
      .capture({ sessionId: s.sessionId, index: s.index })
      .then(async (r) => {
        const { url, sharp } = await previewUrl(
          await p.storage.readFile(r.path),
          r.width,
          r.height,
        );
        urls.current.push(url);
        if (live) dispatch({ type: "CAPTURED", photo: { ...r, url, sharp } });
      })
      .catch((e: unknown) => {
        console.warn(`[session] capture gagal: ${errText(e)}`);
        if (!live) return;
        setAfHint(afSuspect(e));
        dispatch({ type: "CAPTURE_FAILED" });
      });
    return () => {
      live = false;
    };
  }, [p, s.phase, s.sessionId, s.index, s.attempt]);

  // Kamera bermasalah: coba sambung ulang tiap 2 detik sampai berhasil (FSD §1.7).
  useEffect(() => {
    if (s.phase !== "camera_error") return;
    let live = true;
    setReconnects(0);
    let timer: ReturnType<typeof setTimeout>;
    let failed = 0;
    const tryReconnect = () =>
      p.camera
        .reconnect()
        .then(() => live && dispatch({ type: "CAMERA_READY" }))
        .catch((e: unknown) => {
          failed++;
          console.warn(`[session] reconnect gagal (${failed}×): ${errText(e)}`);
          if (!live) return;
          setReconnects(failed);
          timer = setTimeout(
            tryReconnect,
            failed < RECONNECT_SLOW_AFTER ? RECONNECT_EVERY_MS : RECONNECT_SLOW_MS,
          );
        });
    timer = setTimeout(tryReconnect, RECONNECT_EVERY_MS);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [p, s.phase]);

  // Mode tes dibaca saat sesi mulai saja: berganti mode tidak mencatat ulang sesi yang sudah ada.
  const testRef = useRef(test);
  testRef.current = test;
  // Catat sesi mulai (untuk deteksi sesi terputus saat app mati).
  useEffect(() => {
    if (!s.sessionId) return;
    p.db
      .sessionStarted({
        id: s.sessionId,
        eventId: ev.id,
        layoutVersionId: `${ev.layout.id}@${ev.layout.version}`,
        startedAt: new Date().toISOString(),
        ...(s.paymentId && { paymentId: s.paymentId }),
        ...(testRef.current && { isTest: true }),
      })
      .catch((e: unknown) => console.error(`[session] gagal mencatat sesi: ${errText(e)}`));
  }, [p, s.sessionId, s.paymentId, ev]);

  // QR tampil = sesi selesai. Output upload & catatan DB dibuat di belakang layar; tamu tidak menunggu.
  useEffect(() => {
    if (s.phase !== "qr" || !s.sessionId) return;
    const id = s.sessionId;
    const photos = s.photos.filter((x): x is Photo => x !== null);
    const done = {
      id,
      completedAt: new Date().toISOString(),
      photoCount: photos.length,
      retakeCount: s.retakesUsed.reduce((a, b) => a + b, 0),
      printCount: s.strip ? s.prints : 0,
    };
    // Pengingat foto buram (#88): catat skor & apakah sesi ini punya foto yang mungkin buram.
    const ref = sharpNotes.reference(ev.id);
    sharpNotes.recordSession(
      photos.flatMap((x) => (x.sharp === undefined ? [] : [x.sharp])),
      photos.some((x) => isBlurry(x.sharp, ref)),
    );
    const t0 = performance.now();
    const strip = s.strip;
    (strip
      ? Promise.all([videoSaved.current, webPiece.current]).then(([vid, [webId, web]]) =>
          buildOutputs(
            p.storage,
            id,
            photos,
            webId === id && web ? { ...strip, piecePath: web } : strip,
            filterCss(s.filter),
            vid === id,
          ),
        )
      : Promise.resolve([])
    )
      .then((assets) => p.db.sessionCompleted({ ...done, assets }).then(() => assets.length))
      .then((n) =>
        console.info(
          `[session] selesai ${id}: ${n} aset, ${Math.round(performance.now() - t0)} ms`,
        ),
      )
      .catch((e: unknown) => console.error(`[session] gagal menyelesaikan ${id}: ${errText(e)}`));
  }, [p, s.phase, s.sessionId, s.photos, s.retakesUsed, s.strip, s.prints, s.filter, ev.id]);

  // Compose strip.
  useEffect(() => {
    if (s.phase !== "compose" || !s.sessionId) return;
    let live = true;
    const t0 = performance.now();
    const sid = s.sessionId;
    const photos = s.photos.filter((x): x is Photo => x !== null);
    const filter = filterCss(s.filter);
    // QR di desain = link halaman tamu sesi ini (sama dengan QR di layar; ID dibuat booth, jalan offline).
    const qrUrl = `${guestBaseUrl}/s/${sid}`;
    composeStrip(p.storage, sid, ev, photos, filter, qrUrl)
      .then((strip) => {
        urls.current.push(strip.url);
        console.info(`[session] compose ${Math.round(performance.now() - t0)} ms`);
        if (live) dispatch({ type: "COMPOSED", strip });
        // Versi web 2× di latar belakang, tamu tidak menunggu (#133); finalize menunggunya.
        webPiece.current = renderWebPiece(p.storage, sid, ev, photos, filter, qrUrl).then(
          (path) => [sid, path],
        );
      })
      .catch((e: unknown) => {
        console.error(`[session] compose gagal: ${errText(e)}`);
        if (live) dispatch({ type: "COMPOSE_FAILED" });
      });
    return () => {
      live = false;
    };
  }, [p, s.phase, s.sessionId, s.photos, s.filter, ev, guestBaseUrl]);

  // Cetak: gagal tidak menghentikan sesi, QR tetap muncul (FSD §1.10).
  useEffect(() => {
    if (s.phase !== "printing" || !s.strip || !s.sessionId) return;
    p.printer
      .submit({
        jobId: s.sessionId,
        path: s.strip.path,
        copies: s.prints,
        paper: printPaper(ev.layout.paper),
      })
      .then(
        () => dispatch({ type: "PRINT_DONE", ok: true }),
        (e: unknown) => {
          console.warn(`[session] cetak gagal, sesi tetap lanjut: ${errText(e)}`);
          dispatch({ type: "PRINT_DONE", ok: false });
        },
      );
  }, [p, s.phase, s.strip, s.sessionId, s.prints, ev.layout.paper]);

  // Hasil akhir cetak sesi ini (event Camera Service) → layar A8 "Sudah tercetak" atau A11.
  useEffect(() => {
    if (!s.sessionId) return;
    const id = s.sessionId;
    return p.crew.onPrintUpdated((u) => {
      if (u.jobId === id) dispatch({ type: "PRINT_RESULT", ok: u.ok });
    });
  }, [p, s.sessionId]);

  return (
    <div className="relative h-full w-full overflow-hidden bg-paper">
      {shooting && (
        <LiveView
          guide={slotAspect(ev.layout.slots[s.index % ev.layout.slots.length])}
          onFrame={(f) => {
            recorder.current?.draw(f.source, f.width, f.height);
            setLive(true);
          }}
        />
      )}
      {/* printing → qr satu layar (A8): jangan animasi masuk dua kali. */}
      <div
        key={s.phase === "printing" ? "qr" : gallery && s.phase === "attract" ? "gallery" : s.phase}
        className="absolute inset-0 animate-[enter_250ms_ease-out]"
      >
        {screen()}
      </div>
      {s.deadline !== null && TIMED.has(s.phase) && (
        <span
          data-testid="time-left"
          className={`absolute top-[52px] right-[72px] z-10 rounded-full border-[2.5px] border-ink px-8 py-4 font-mono text-[30px] font-bold ${s.deadline - now <= 60_000 ? "bg-peach" : "bg-white"}`}
        >
          {copy.photobox.timeLeft} {mmss(s.deadline - now)}
        </span>
      )}
      {test && (
        <span
          data-testid="test-badge"
          title={copy.crew.testHint}
          className="pointer-events-none absolute right-5 bottom-5 z-20 rounded-full border-2 border-ink bg-butter px-3.5 py-1 font-mono text-base font-bold tracking-[0.08em]"
        >
          {copy.crew.testBadge}
        </span>
      )}
      {bumperState !== "done" && s.phase === "attract" && (
        <Bumper
          sound={cfg.countdownSound}
          leaving={bumperState === "leave"}
          onEnd={() => setBumperState((b) => (b === "play" ? "leave" : b))}
          onDone={() => setBumperState("done")}
        />
      )}
    </div>
  );

  function screen() {
    const photo = s.photos[s.index];
    switch (s.phase) {
      case "attract":
        // Selama bumper: kertas polos; layar awal baru dibangun (animasi masuk) saat bumper selesai.
        if (bumperState === "play") return null;
        if (gallery)
          return (
            <Gallery
              event={event}
              guestBaseUrl={guestBaseUrl}
              at={gallery.at}
              onClose={() => setGallery(null)}
            />
          );
        return (
          <Attract
            eventName={event.name}
            tagline={event.tagline}
            date={event.date}
            theme={event.attract}
            layout={event.layout}
            photosOf={event.photobox ? undefined : event.id}
            onGallery={event.photobox ? undefined : (at) => setGallery({ at })}
            onStart={() => {
              // Sapaan hanya kalau ada layar pilih dulu; kalau langsung foto, "gaya pertama" sudah menyapa.
              if (cfg.countdownSound && (event.photobox || event.designs)) void play("mulai");
              // Langsung foto 1: nyalakan EVF DSLR sekarang (W-034); layar pilih menyalakannya sendiri.
              if (!event.photobox && !event.designs) p.camera.warm?.();
              dispatch(
                event.photobox
                  ? { type: "PHOTOBOX_START", draftId: newSessionId() }
                  : event.designs
                    ? { type: "CHOOSE_DESIGN" }
                    : startEvent(event),
              );
            }}
            onCrew={onCrew}
          />
        );
      case "layout_select":
        return event.photobox ? (
          <LayoutSelect
            layouts={event.photobox.layouts}
            preview={previews}
            onChoose={(layoutId) => dispatch({ type: "LAYOUT_CHOSEN", layoutId })}
            onBack={send({ type: "BACK" })}
          />
        ) : event.designs ? (
          <LayoutSelect
            layouts={event.designs}
            preview={previews}
            design
            onChoose={(id) => {
              const d = event.designs?.find((x) => x.id === id);
              if (d) dispatch(startEvent(event, d));
            }}
            onBack={send({ type: "BACK" })}
          />
        ) : null;
      case "payment": {
        const pkg = event.photobox?.layouts.find((l) => l.id === s.layoutId);
        if (!s.paying || !s.draftId || !pkg || !event.photobox) return null;
        const extra = s.paying.for === "extra" ? s.paying.extraPrints : 0;
        const unit = event.photobox.extraPrintPrice;
        return (
          <Payment
            request={{
              eventId: event.id,
              sessionId: s.draftId,
              layoutId: pkg.id,
              ...(extra && { extraPrints: extra }),
            }}
            lines={
              extra
                ? [
                    {
                      label: copy.payment.extraLine(extra, rupiah(unit)),
                      value: rupiah(extra * unit),
                    },
                  ]
                : [
                    {
                      label: `${pkg.name} · ${copy.photobox.photos(pkg.layout.slots.length)}`,
                      value: rupiah(pkg.price),
                    },
                    { label: copy.payment.oneSheet, value: copy.payment.included },
                  ]
            }
            onPaid={(paymentId, amount) => {
              setPaidAmount(amount);
              dispatch({ type: "PAID", paymentId });
            }}
            onCancel={send({ type: "PAYMENT_CANCEL" })}
          />
        );
      }
      case "paid":
        return <Paid amount={paidAmount} name={chosen?.name ?? ""} seconds={PAID_SEC} />;
      case "countdown":
        return (
          <Countdown
            key={`${s.index}-${s.retakesUsed[s.index]}`}
            seconds={cfg.countdownSec}
            index={s.index}
            photos={s.photos}
            onDone={send({ type: "COUNTDOWN_DONE" })}
            belowTimer={s.deadline !== null}
            sound={cfg.countdownSound}
            prompt={beforeText(s.index, s.slots, before)}
            cue={cfg.promptsBefore.length ? null : beforeCue(s.index, s.slots)}
            live={live}
          />
        );
      case "capture":
        return <Capturing index={s.index} total={s.slots} />;
      case "preview":
        return photo ? (
          <PhotoPreview url={photo.url} index={s.index} total={s.slots} cheer={cheer.text} />
        ) : null;
      case "camera_error":
        return <CameraError attempt={reconnects + 1} onCrew={onCrew} afHint={afHint} />;
      case "filter":
        return (
          <FilterSelect
            photoUrl={s.photos.find((x) => x)?.url ?? ""}
            filters={cfg.filters}
            onChoose={(filter) => dispatch({ type: "FILTER_CHOSEN", filter })}
            onBack={() => dispatch({ type: "BACK" })}
          />
        );
      case "review":
        return (
          <Review
            photos={s.photos}
            blurry={s.photos.map((x) => isBlurry(x?.sharp, sharpNotes.reference(ev.id)))}
            aspects={s.photos.map((_, i) =>
              slotAspect(ev.layout.slots[i % ev.layout.slots.length]),
            )}
            retakesUsed={s.retakesUsed}
            retakeMax={s.retakeMax}
            onRetake={(index) => dispatch({ type: "RETAKE", index })}
            onNext={send({ type: "CONTINUE" })}
          />
        );
      case "compose":
        return <Message>{copy.compose.busy}</Message>;
      case "print_select":
        return s.strip ? (
          <PrintSelect
            stripUrl={s.strip.url}
            max={cfg.maxPrints}
            extraPrice={
              s.photobox && event.photobox && event.photobox.extraPrintPrice > 0
                ? event.photobox.extraPrintPrice
                : undefined
            }
            onSelect={(count) => dispatch({ type: "PRINTS_SELECTED", count })}
          />
        ) : null;
      case "printing":
      case "qr":
        return (
          <Qr
            url={`${guestBaseUrl}/s/${s.sessionId}`}
            stripUrl={s.strip?.url}
            sheets={s.prints}
            counting={s.phase === "qr"}
            seconds={cfg.qrScreenSec}
            print={s.print}
            brand={event.attract?.brand}
            onDone={send({ type: "FINISH" })}
          />
        );
    }
  }
}

/** Pratinjau desain/layout photobox (#99/#108): dirender sekali per event saat layar pilih pertama dibuka; URL dilepas saat ganti event. */
function useDesignPreviews(event: BoothEvent, active: boolean) {
  const [urls, setUrls] = useState<Record<string, string>>({});
  const made = useRef<string[] | null>(null);
  // Event yang sama dimuat ulang (Sync / override): pratinjau lama dibuang, dibuat ulang saat layar pilih dibuka.
  // biome-ignore lint/correctness/useExhaustiveDependencies: dibuang tiap objek event berganti
  useEffect(
    () => () => {
      for (const u of made.current ?? []) URL.revokeObjectURL(u);
      made.current = null;
      setUrls({});
    },
    [event],
  );
  useEffect(() => {
    const layouts = event.photobox?.layouts ?? event.designs;
    if (!active || made.current || !layouts) return;
    const list: string[] = [];
    made.current = list;
    void (async () => {
      for (const d of layouts) {
        const url = await designPreview(event, d.layout).catch(() => null);
        if (!url) continue;
        list.push(url);
        setUrls((u) => ({ ...u, [d.id]: url }));
      }
    })();
  }, [active, event]);
  return urls;
}
