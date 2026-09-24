import { newSessionId } from "@tetra/shared";
import { useEffect, useReducer, useRef } from "react";
import { composeStrip } from "./compose";
import { copy } from "./copy";
import type { BoothEvent } from "./event";
import { usePlatform } from "./PlatformContext";
import { Attract } from "./screens/Attract";
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
/** Mode demo: jeda "tamu" di layar yang butuh sentuhan. */
const DEMO_TAP_MS = 1500;

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
}: {
  event: BoothEvent;
  guestBaseUrl: string;
  demo?: boolean;
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
    const after = (ms: number, e: SessionEvent) => {
      const t = setTimeout(() => dispatch(e), ms);
      return () => clearTimeout(t);
    };
    switch (s.phase) {
      case "attract":
        return demo ? after(DEMO_TAP_MS, startEvent(event)) : undefined;
      case "preview":
        return after(cfg.shotDelaySec * 1000, { type: "PREVIEW_DONE" });
      case "review":
        return after(demo ? DEMO_TAP_MS : cfg.reviewTimeoutSec * 1000, { type: "CONTINUE" });
      case "print_select":
        return demo ? after(DEMO_TAP_MS, { type: "PRINTS_SELECTED", count: 1 }) : undefined;
      case "qr":
        return after(demo ? DEMO_TAP_MS : cfg.qrScreenSec * 1000, { type: "FINISH" });
      default:
        return undefined;
    }
  }, [s.phase, demo, cfg, event]);

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
        console.warn("[session] capture gagal", e);
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
          console.warn("[session] reconnect gagal", e);
          if (live) timer = setTimeout(tryReconnect, RECONNECT_EVERY_MS);
        });
    timer = setTimeout(tryReconnect, RECONNECT_EVERY_MS);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [p, s.phase]);

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
        console.error("[session] compose gagal", e);
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
      .catch((e: unknown) => console.warn("[session] cetak gagal, sesi tetap lanjut", e))
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
        return <Attract eventName={event.name} onStart={() => dispatch(startEvent(event))} />;
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
        return (
          <div className="absolute inset-0 animate-[flash_120ms_ease-out_forwards] bg-surface" />
        );
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
