import { newSessionId } from "@tetra/shared";
import { Button } from "@tetra/ui";
import { useRef, useState } from "react";
import { copy } from "../copy";
import { errText } from "../errors";
import { previewUrl } from "../finalize";
import { usePlatform } from "../PlatformContext";
import type { CameraProp, FocusStep, LiveFrame } from "../platform";
import { LiveView } from "../screens/LiveView";
import { sharpNotes, sharpnessOf } from "../sharpness";
import { CameraProps } from "./CameraProps";

const FOCUS_FINE: { step: FocusStep; label: string }[] = [
  { step: "near2", label: "◀◀" },
  { step: "near1", label: "◀" },
  { step: "far1", label: "▶" },
  { step: "far2", label: "▶▶" },
];
const METER_MS = 300;
const GUIDES_KEY = "tb.testShot.guides";
/** Margin aman: 5% sisi pendek area slot, jauhkan wajah & tangan dari tepi potongan. */
const SAFE = 0.05;

/**
 * Tap to focus (#114): titik ketuk di layar → titik 0–1 di frame kamera. Live view digambar cover ke layar
 * (potong tengah) dan bisa dicermin; titik di luar frame dijepit ke tepi.
 */
export function tapToFrame(
  tap: { x: number; y: number },
  screen: { w: number; h: number },
  frame: { w: number; h: number },
  mirror: boolean,
) {
  const scale = Math.max(screen.w / frame.w, screen.h / frame.h);
  const fx = (tap.x - (screen.w - frame.w * scale) / 2) / scale / frame.w;
  const fy = (tap.y - (screen.h - frame.h * scale) / 2) / scale / frame.h;
  const clamp = (v: number) => Math.min(1, Math.max(0, v));
  return { x: clamp(mirror ? 1 - fx : fx), y: clamp(fy) };
}

/** Setelan yang dipakai saat jepret (label kamera apa adanya, supaya bisa dipasang ulang persis). */
type ShotSettings = {
  iso?: string | undefined;
  shutter?: string | undefined;
  aperture?: string | undefined;
  wb?: string | undefined;
};
type TestShot = {
  n: number;
  url: string;
  w: number;
  h: number;
  ms: number;
  score: number;
  s: ShotSettings;
};
const HISTORY_MAX = 6;
const SAME = "Sama dengan live view";

/** ISO/shutter efektif saat jepret: nilai "jepret" kalau diisi, kalau tidak ikut live view (#113, W-034). */
function effectiveSettings(props: CameraProp[]): ShotSettings {
  const v = (n: string) => props.find((x) => x.name === n)?.value || undefined;
  const cap = (a: string, live: string) => {
    const c = v(a);
    return c && c !== SAME ? c : v(live);
  };
  return {
    iso: cap("iso_capture", "iso"),
    shutter: cap("shutter_capture", "shutterspeed"),
    aperture: v("aperture"),
    wb: v("whitebalance"),
  };
}
const settingsLine = (s: ShotSettings) =>
  [s.iso, s.shutter, s.aperture].filter(Boolean).join(" · ") || "—";

/**
 * Tes Jepret (FSD §1.3), dirombak dari masukan Rama (W-034): live view di kiri tanpa tumpukan tombol; kolom kanan
 * berisi fokus, hasil tes terakhir, dan setelan kamera berkelompok, dengan Tes Jepret / Kembali selalu di bawah.
 * Meter ketajaman = skor pengingat foto buram (#88); tes jepret = patokan event ini.
 */
export function CameraCheck({
  eventId,
  slot,
  onBack,
}: {
  eventId: string;
  /** Rasio slot foto pertama event aktif: area yang masuk cetakan (#107). */
  slot?: number | undefined;
  onBack: () => void;
}) {
  const p = usePlatform();
  const [guides, setGuides] = useState(() => {
    try {
      return localStorage.getItem(GUIDES_KEY) !== "0";
    } catch {
      return true;
    }
  });
  const toggleGuides = () =>
    setGuides((on) => {
      try {
        localStorage.setItem(GUIDES_KEY, on ? "0" : "1");
      } catch {
        // penyimpanan ditolak: pilihan hanya berlaku sampai layar ditutup
      }
      return !on;
    });
  // Riwayat Tes Jepret (terbaru di depan): diklik = tampil besar, bisa dibandingkan & dipakai setelannya (Rama).
  const [shots, setShots] = useState<TestShot[]>([]);
  const [viewer, setViewer] = useState<{ mode: "one"; i: number } | { mode: "compare" } | null>(
    null,
  );
  const [propsRun, setPropsRun] = useState(0);
  const [note, setNote] = useState<string>();
  // Capture DSLR mematikan live view (700D macet kalau jepret saat live view jalan); di sesi tamu countdown
  // menyalakannya lagi. Di sini LiveView dipasang ulang setelah tiap Tes Jepret, kalau tidak gambar membeku
  // dan tombol fokus tidak berpengaruh (uji 60D, 2026-09-26).
  const [liveRun, setLiveRun] = useState(0);
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [meter, setMeter] = useState<{ now: number; peak: number }>();
  const lastMeter = useRef(0);
  const frameSize = useRef<{ w: number; h: number } | undefined>(undefined);
  const [reticle, setReticle] = useState<{ x: number; y: number }>();
  const tap = async (e: React.PointerEvent<HTMLDivElement>) => {
    const f = frameSize.current;
    if (!f || !p.crew.focusAt) return;
    const r = e.currentTarget.getBoundingClientRect();
    const at = { x: e.clientX - r.left, y: e.clientY - r.top };
    // Stage diskalakan ke jendela: posisi klik dalam piksel layar, kotak digambar dalam piksel Stage (W-034, jendela
    // 1266 px: kotak meleset dari kursor).
    const k = r.width / e.currentTarget.offsetWidth || 1;
    setReticle({ x: at.x / k, y: at.y / k });
    const pt = tapToFrame(at, { w: r.width, h: r.height }, f, p.mirrorLiveView ?? true);
    try {
      await p.crew.focusAt(pt.x, pt.y);
      setMeter((m) => m && { now: m.now, peak: m.now });
    } catch (err) {
      setError(errText(err));
    } finally {
      setTimeout(() => setReticle(undefined), 1200);
    }
  };
  const onFrame = ({ source, width, height }: LiveFrame) => {
    frameSize.current = { w: width, h: height };
    const t = performance.now();
    if (t - lastMeter.current < METER_MS) return;
    lastMeter.current = t;
    const now = Math.round(sharpnessOf(source, width, height));
    setMeter((m) => ({ now, peak: Math.max(now, m?.peak ?? 0) }));
  };
  const focus = async (step: FocusStep) => {
    try {
      setError(undefined);
      await p.crew.focus?.(step);
      // Puncak dihitung ulang setelah fokus digeser, supaya meter menunjukkan arah yang benar.
      setMeter((m) => m && { now: m.now, peak: m.now });
    } catch (e) {
      setError(errText(e));
    }
  };
  const take = async () => {
    setBusy(true);
    setError(undefined);
    try {
      // Setelan dibaca sebelum jepret: itulah yang dipakai kamera untuk foto ini.
      const snap = p.crew.focus
        ? effectiveSettings(await p.crew.cameraProps().catch(() => []))
        : {};
      const t0 = performance.now();
      const r = await p.camera.capture({ sessionId: newSessionId(), index: 0 });
      const bytes = await p.storage.readFile(r.path);
      // Tes Jepret setelah fokus benar = patokan ketajaman event ini (#88). Lewat preview 1600 px yang sama
      // dengan foto tamu: skor dari raw penuh ±25% lebih rendah (60D/700D, W-031), patokan jadi terlalu longgar.
      const { url, sharp } = await previewUrl(bytes, r.width, r.height);
      const score = Math.round(sharp);
      sharpNotes.setBaseline(eventId, score);
      sharpNotes.dismissWarning();
      const ms = performance.now() - t0;
      setShots((prev) => {
        const next: TestShot = {
          n: (prev[0]?.n ?? 0) + 1,
          url,
          w: r.width,
          h: r.height,
          ms,
          score,
          s: snap,
        };
        for (const old of prev.slice(HISTORY_MAX - 1)) URL.revokeObjectURL(old.url);
        return [next, ...prev.slice(0, HISTORY_MAX - 1)];
      });
    } catch (e) {
      setError(errText(e));
    } finally {
      setBusy(false);
      setLiveRun((n) => n + 1);
    }
  };
  const applySettings = async (t: TestShot) => {
    try {
      const set = (n: string, v?: string) => (v ? p.crew.setCameraProp(n, v) : Promise.resolve());
      await set("iso_capture", t.s.iso);
      await set("shutter_capture", t.s.shutter);
      await set("aperture", t.s.aperture);
      await set("whitebalance", t.s.wb);
      setPropsRun((n) => n + 1);
      setViewer(null);
      setNote(copy.crew.settingsApplied(t.n, settingsLine(t.s)));
    } catch (e) {
      setError(errText(e));
    }
  };
  const card = "flex flex-col gap-4 rounded-[22px] border-[2.5px] border-ink bg-white p-5";
  const shotCaption = (t: TestShot) => (
    <div className="flex flex-col gap-0.5 text-lg font-semibold">
      <span>{copy.crew.shotNo(t.n)}</span>
      <span className="font-mono">{settingsLine(t.s)}</span>
      <span className="text-text-2">
        {t.s.wb ? `${t.s.wb} · ` : ""}
        {copy.crew.sharpBase(t.score)}
      </span>
    </div>
  );
  return (
    <div className="relative flex h-full w-full">
      <section className="relative min-w-0 flex-1 bg-ink">
        <LiveView
          key={liveRun}
          onFrame={onFrame}
          fit="contain"
          guide={guides ? slot : undefined}
          overlay={guides ? { grid: true, safe: SAFE } : undefined}
        />
        {p.crew.focusAt && (
          // biome-ignore lint/a11y/noStaticElementInteractions: area ketuk live view (crew, layar sentuh)
          <div
            data-testid="tap-focus"
            className="absolute inset-0"
            onPointerDown={(e) => void tap(e)}
          >
            {reticle && (
              <span
                style={{ left: reticle.x - 60, top: reticle.y - 60 }}
                className="absolute size-[120px] animate-[tick_300ms_ease-out] rounded-[18px] border-4 border-dashed border-white"
              />
            )}
          </div>
        )}
        <button
          type="button"
          data-testid="toggle-guides"
          aria-pressed={guides}
          onClick={toggleGuides}
          className="pressable absolute top-6 right-6 z-10 flex min-h-14 items-center gap-3 rounded-full border-[2.5px] border-ink bg-white px-5 text-xl font-bold"
        >
          {copy.crew.guides}
          <span
            className={`rounded-full border-2 border-ink px-3 py-0.5 text-lg ${guides ? "bg-mint" : "bg-paper"}`}
          >
            {guides ? copy.crew.on : copy.crew.off}
          </span>
        </button>
        {p.crew.focusAt && (
          <p className="pointer-events-none absolute top-6 left-6 rounded-full border-2 border-ink bg-white/90 px-5 py-2 text-lg font-semibold">
            {copy.crew.tapToFocus}
          </p>
        )}
      </section>

      <aside className="flex w-[600px] shrink-0 flex-col border-l-[2.5px] border-ink bg-paper">
        <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto p-6">
          {p.crew.focus && (
            <section className={card}>
              <h3 className="text-2xl font-extrabold">{copy.crew.focus}</h3>
              <Button className="h-[76px] rounded-[18px] text-2xl" onClick={() => void focus("af")}>
                {copy.crew.autoFocus}
              </Button>
              {/* Geser fokus manual hanya berguna untuk digiCamControl; Canon EDSDK selalu AF saat jepret. */}
              {!p.crew.focusAt && (
                <div className="flex items-center gap-2">
                  <span className="text-lg font-semibold text-text-2">{copy.crew.focusFine}</span>
                  {FOCUS_FINE.map(({ step, label }) => (
                    <Button
                      key={step}
                      variant="secondary"
                      className="h-14 min-w-14 flex-1 rounded-[14px] px-2 text-xl"
                      onClick={() => void focus(step)}
                    >
                      {label}
                    </Button>
                  ))}
                </div>
              )}
              {meter && (
                <div data-testid="focus-meter" className="flex flex-col gap-2">
                  <div className="flex justify-between text-lg font-semibold text-text-2">
                    <span>{copy.crew.sharpnessNow}</span>
                    <span className="font-mono">
                      {meter.now} · {copy.crew.sharpnessBest} {meter.peak}
                    </span>
                  </div>
                  <div className="h-4 overflow-hidden rounded-full border-2 border-ink bg-paper">
                    <div
                      className="h-full bg-mint transition-[width] duration-300"
                      style={{
                        width: `${meter.peak ? Math.min(100, (meter.now / meter.peak) * 100) : 0}%`,
                      }}
                    />
                  </div>
                </div>
              )}
            </section>
          )}

          <section className={card} data-testid="last-shot">
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-2xl font-extrabold">{copy.crew.lastShot}</h3>
              {shots.length >= 2 && (
                <Button
                  variant="secondary"
                  className="h-12 rounded-[14px] px-4 text-lg"
                  onClick={() => setViewer({ mode: "compare" })}
                >
                  {copy.crew.compare}
                </Button>
              )}
            </div>
            {shots[0] ? (
              <>
                <button
                  type="button"
                  className="pressable flex items-center gap-4 text-left"
                  onClick={() => setViewer({ mode: "one", i: 0 })}
                >
                  <img
                    src={shots[0].url}
                    alt=""
                    className="w-[220px] shrink-0 rounded-[14px] border-2 border-ink"
                  />
                  <div className="flex flex-col gap-1">
                    {shotCaption(shots[0])}
                    <span className="font-mono text-base text-text-2">
                      {copy.crew.shotInfo(shots[0].w, shots[0].h, (shots[0].ms / 1000).toFixed(1))}
                    </span>
                  </div>
                </button>
                {shots.length > 1 && (
                  <div className="flex gap-2">
                    {shots.slice(1).map((t, k) => (
                      <button
                        key={t.n}
                        type="button"
                        aria-label={copy.crew.shotNo(t.n)}
                        className="pressable w-[84px] shrink-0"
                        onClick={() => setViewer({ mode: "one", i: k + 1 })}
                      >
                        <img src={t.url} alt="" className="rounded-[10px] border-2 border-ink" />
                        <span className="text-sm font-semibold">#{t.n}</span>
                      </button>
                    ))}
                  </div>
                )}
                <p className="text-base text-text-2">{copy.crew.shotHint}</p>
              </>
            ) : (
              <p className="text-lg text-text-2">{copy.crew.noShot}</p>
            )}
          </section>

          {p.crew.focus && (
            <div data-testid="camera-settings" className="flex flex-col gap-5">
              <CameraProps key={propsRun} onNote={setError} grouped />
            </div>
          )}
        </div>

        {note && !error && (
          <p
            role="status"
            className="mx-6 mb-3 rounded-[16px] border-2 border-ink bg-mint-soft px-4 py-3 text-lg font-semibold"
          >
            {note}
          </p>
        )}
        {error && (
          <p
            role="alert"
            className="mx-6 mb-3 rounded-[16px] border-2 border-ink bg-coral px-4 py-3 text-lg font-semibold"
          >
            {error}
          </p>
        )}
        <div className="flex gap-4 border-t-[2.5px] border-ink p-6">
          <Button
            className="h-[92px] flex-1 rounded-[20px] text-[28px]"
            disabled={busy}
            onClick={() => void take()}
          >
            {busy ? copy.crew.shooting : copy.crew.testShot}
          </Button>
          <Button variant="secondary" className="h-[92px] rounded-[20px] text-2xl" onClick={onBack}>
            {copy.crew.back}
          </Button>
        </div>
      </aside>
      {viewer && (
        <div
          data-testid="shot-viewer"
          className="absolute inset-0 z-20 flex flex-col gap-5 bg-ink/95 p-8 text-white"
        >
          <div className="flex min-h-0 flex-1 gap-5">
            {(viewer.mode === "one"
              ? shots.slice(viewer.i, viewer.i + 1)
              : shots.slice(0, 3).reverse()
            ).map((t) => (
              <figure
                key={t.n}
                className="flex min-w-0 flex-1 flex-col gap-3 rounded-[22px] border-[2.5px] border-white/40 bg-ink p-4"
              >
                <img src={t.url} alt="" className="min-h-0 flex-1 rounded-[14px] object-contain" />
                <figcaption className="flex items-end justify-between gap-4">
                  <div className="flex flex-col gap-0.5 text-xl font-semibold">
                    <span>{copy.crew.shotNo(t.n)}</span>
                    <span className="font-mono text-2xl">{settingsLine(t.s)}</span>
                    <span className="text-white/70">
                      {t.s.wb ? `${t.s.wb} · ` : ""}
                      {copy.crew.sharpBase(t.score)} ·{" "}
                      {copy.crew.shotInfo(t.w, t.h, (t.ms / 1000).toFixed(1))}
                    </span>
                  </div>
                  {p.crew.focus && (t.s.iso || t.s.shutter) && (
                    <Button
                      className="h-16 shrink-0 rounded-[16px] px-5 text-xl"
                      onClick={() => void applySettings(t)}
                    >
                      {copy.crew.useSettings}
                    </Button>
                  )}
                </figcaption>
              </figure>
            ))}
          </div>
          <div className="flex justify-center gap-4">
            {viewer.mode === "one" && (
              <>
                <Button
                  variant="secondary"
                  className="h-[76px] rounded-[18px] px-8 text-2xl"
                  disabled={viewer.i >= shots.length - 1}
                  onClick={() => setViewer({ mode: "one", i: viewer.i + 1 })}
                >
                  ◀ {copy.crew.older}
                </Button>
                <Button
                  variant="secondary"
                  className="h-[76px] rounded-[18px] px-8 text-2xl"
                  disabled={viewer.i <= 0}
                  onClick={() => setViewer({ mode: "one", i: viewer.i - 1 })}
                >
                  {copy.crew.newer} ▶
                </Button>
              </>
            )}
            {viewer.mode === "one" && shots.length >= 2 && (
              <Button
                variant="secondary"
                className="h-[76px] rounded-[18px] px-8 text-2xl"
                onClick={() => setViewer({ mode: "compare" })}
              >
                {copy.crew.compare}
              </Button>
            )}
            <Button
              className="h-[76px] rounded-[18px] px-10 text-2xl"
              onClick={() => setViewer(null)}
            >
              {copy.crew.close}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
