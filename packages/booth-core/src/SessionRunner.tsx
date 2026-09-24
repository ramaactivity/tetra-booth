import { newSessionId } from "@tetra/shared";
import { useEffect, useReducer, useRef } from "react";
import { composeStrip } from "./compose";
import { copy } from "./copy";
import { errText } from "./errors";
import type { BoothEvent } from "./event";
import { buildOutputs } from "./finalize";
import { usePlatform } from "./PlatformContext";
import { Attract } from "./screens/Attract";
import { Capturing } from "./screens/Capturing";
import { Countdown } from "./screens/Countdown";
import { LiveView } from "./screens/LiveView";
import { Message } from "./screens/Message";
import { PhotoPreview } from "./screens/PhotoPreview";
import { PrintSelect } from "./screens/PrintSelect";
import { Qr } from "./screens/Qr";
import { Review } from "./screens/Review";
import {
  canRetake,
  initialSession,
  type Photo,
  type SessionEvent,
  sessionReducer,
} from "./session";

const RECONNECT_EVERY_MS = 2000;
/** Mode demo: jeda "tamu" di layar yang butuh sentuhan (dipersingkat di mode cepat stress test). */
const DEMO_TAP_MS = 1500;
const FAST_TAP_MS = 150;

const startEvent = (event: BoothEvent): SessionEvent => ({
  type: "START",
  sessionId: newSessionId(),
  slots: event.layout.slots.length,
  retakeMax: event.settings.retakeMax,
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
  onCrew,
}: {
  event: BoothEvent;
  guestBaseUrl: string;
  demo?: boolean;
  /** Demo dipercepat (M8). */
  fast?: boolean;
  onCrew?: () => void;
}) {
  const p = usePlatform();
  const cfg = event.settings;
  const [s, dispatch] = useReducer(sessionReducer, initialSession);
  const urls = useRef<string[]>([]);
  const send = (e: SessionEvent) => () => dispatch(e);

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
        return demo ? after(tapMs, startEvent(event)) : undefined;
      case "preview":
        return after(cfg.shotDelaySec * 1000, { type: "PREVIEW_DONE" });
      case "review":
        return after(demo ? tapMs : cfg.reviewTimeoutSec * 1000, { type: "CONTINUE" });
      case "print_select":
        return demo ? after(tapMs, { type: "PRINTS_SELECTED", count: 1 }) : undefined;
      case "qr":
        return after(demo ? tapMs : cfg.qrScreenSec * 1000, { type: "FINISH" });
      default:
        return undefined;
    }
  }, [s.phase, demo, fast, cfg, event]);

  // Capture (dan retry otomatis: `attempt` berubah → efek jalan lagi).
  // biome-ignore lint/correctness/useExhaustiveDependencies: s.attempt sengaja memicu capture ulang
  useEffect(() => {
    if (s.phase !== "capture" || !s.sessionId) return;
    let live = true;
    p.camera
      .capture({ sessionId: s.sessionId, index: s.index })
      .then(async (r) => {
        const url = URL.createObjectURL(
          new Blob([await p.storage.readFile(r.path)], { type: "image/jpeg" }),
        );
        urls.current.push(url);
        if (live) dispatch({ type: "CAPTURED", photo: { ...r, url } });
      })
      .catch((e: unknown) => {
        console.warn(`[session] capture gagal: ${errText(e)}`);
        if (live) dispatch({ type: "CAPTURE_FAILED" });
      });
    return () => {
      live = false;
    };
  }, [p, s.phase, s.sessionId, s.index, s.attempt]);

  // Kamera bermasalah: coba sambung ulang tiap 2 detik sampai berhasil (FSD §1.7).
  useEffect(() => {
    if (s.phase !== "camera_error") return;
    let live = true;
    let timer: ReturnType<typeof setTimeout>;
    const tryReconnect = () =>
      p.camera
        .reconnect()
        .then(() => live && dispatch({ type: "CAMERA_READY" }))
        .catch((e: unknown) => {
          console.warn(`[session] reconnect gagal: ${errText(e)}`);
          if (live) timer = setTimeout(tryReconnect, RECONNECT_EVERY_MS);
        });
    timer = setTimeout(tryReconnect, RECONNECT_EVERY_MS);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [p, s.phase]);

  // Catat sesi mulai (untuk deteksi sesi terputus saat app mati).
  useEffect(() => {
    if (!s.sessionId) return;
    p.db
      .sessionStarted({
        id: s.sessionId,
        eventId: event.id,
        layoutVersionId: `${event.layout.id}@${event.layout.version}`,
        startedAt: new Date().toISOString(),
      })
      .catch((e: unknown) => console.error(`[session] gagal mencatat sesi: ${errText(e)}`));
  }, [p, s.sessionId, event]);

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
    const t0 = performance.now();
    (s.strip ? buildOutputs(p.storage, id, event, photos, s.strip) : Promise.resolve([]))
      .then((assets) => p.db.sessionCompleted({ ...done, assets }).then(() => assets.length))
      .then((n) =>
        console.info(
          `[session] selesai ${id}: ${n} aset, ${Math.round(performance.now() - t0)} ms`,
        ),
      )
      .catch((e: unknown) => console.error(`[session] gagal menyelesaikan ${id}: ${errText(e)}`));
  }, [p, s.phase, s.sessionId, s.photos, s.retakesUsed, s.strip, s.prints, event]);

  // Compose strip.
  useEffect(() => {
    if (s.phase !== "compose" || !s.sessionId) return;
    let live = true;
    const t0 = performance.now();
    composeStrip(
      p.storage,
      s.sessionId,
      event,
      s.photos.filter((x): x is Photo => x !== null),
    )
      .then((strip) => {
        urls.current.push(strip.url);
        console.info(`[session] compose ${Math.round(performance.now() - t0)} ms`);
        if (live) dispatch({ type: "COMPOSED", strip });
      })
      .catch((e: unknown) => {
        console.error(`[session] compose gagal: ${errText(e)}`);
        if (live) dispatch({ type: "COMPOSE_FAILED" });
      });
    return () => {
      live = false;
    };
  }, [p, s.phase, s.sessionId, s.photos, event]);

  // Cetak: gagal tidak menghentikan sesi, QR tetap muncul (FSD §1.10).
  useEffect(() => {
    if (s.phase !== "printing" || !s.strip || !s.sessionId) return;
    p.printer
      .submit({
        jobId: s.sessionId,
        path: s.strip.path,
        copies: s.prints,
        paper: event.layout.paper,
      })
      .catch((e: unknown) =>
        console.warn(`[session] cetak gagal, sesi tetap lanjut: ${errText(e)}`),
      )
      .finally(() => dispatch({ type: "PRINT_DONE" }));
  }, [p, s.phase, s.strip, s.sessionId, s.prints, event.layout.paper]);

  const shooting = s.phase === "countdown" || s.phase === "capture";
  return (
    <div className="relative h-screen w-screen overflow-hidden bg-bg">
      {shooting && <LiveView />}
      <div key={s.phase} className="absolute inset-0 animate-[enter_250ms_ease-out]">
        {screen()}
      </div>
    </div>
  );

  function screen() {
    const photo = s.photos[s.index];
    switch (s.phase) {
      case "attract":
        return (
          <Attract
            eventName={event.name}
            onStart={() => dispatch(startEvent(event))}
            onCrew={onCrew}
          />
        );
      case "countdown":
        return (
          <Countdown
            key={`${s.index}-${s.retakesUsed[s.index]}`}
            seconds={cfg.countdownSec}
            index={s.index}
            total={s.slots}
            onDone={send({ type: "COUNTDOWN_DONE" })}
          />
        );
      case "capture":
        return <Capturing />;
      case "preview":
        return photo ? <PhotoPreview url={photo.url} index={s.index} total={s.slots} /> : null;
      case "camera_error":
        return <Message>{copy.camera.preparing}</Message>;
      case "review":
        return (
          <Review
            photos={s.photos}
            canRetake={(i) => canRetake(s, i)}
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
            onSelect={(count) => dispatch({ type: "PRINTS_SELECTED", count })}
          />
        ) : null;
      case "printing":
        return <Message image={s.strip?.url}>{copy.print.busy}</Message>;
      case "qr":
        return <Qr url={`${guestBaseUrl}/s/${s.sessionId}`} onDone={send({ type: "FINISH" })} />;
    }
  }
}
