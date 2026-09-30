import { newSessionId } from "@tetra/shared";
import { Button } from "@tetra/ui";
import { useRef, useState } from "react";
import { copy } from "../copy";
import { errText } from "../errors";
import { previewUrl } from "../finalize";
import { usePlatform } from "../PlatformContext";
import type { FocusStep, LiveFrame } from "../platform";
import { LiveView } from "../screens/LiveView";
import { sharpNotes, sharpnessOf } from "../sharpness";
import { CameraProps } from "./CameraProps";

const FOCUS_ROW: { step: FocusStep; label: string }[] = [
  { step: "near3", label: "◀◀◀" },
  { step: "near2", label: "◀◀" },
  { step: "near1", label: "◀" },
  { step: "af", label: copy.crew.focusAf },
  { step: "far1", label: "▶" },
  { step: "far2", label: "▶▶" },
  { step: "far3", label: "▶▶▶" },
];
const METER_MS = 300;

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

/**
 * Cek kamera: live view + test shot (FSD §1.3). Meter ketajaman live view (skor yang sama dengan pengingat
 * foto buram #88, puncak = fokus terbaik yang terlihat) + kontrol fokus DSLR bila kamera mendukung.
 */
export function CameraCheck({ eventId, onBack }: { eventId: string; onBack: () => void }) {
  const p = usePlatform();
  const [shot, setShot] = useState<string>();
  // Capture DSLR mematikan live view (700D macet kalau jepret saat live view jalan); di sesi tamu countdown
  // menyalakannya lagi. Di sini LiveView dipasang ulang setelah tiap Tes Jepret, kalau tidak gambar membeku
  // dan tombol fokus tidak berpengaruh (uji 60D, 2026-09-26).
  const [liveRun, setLiveRun] = useState(0);
  const [info, setInfo] = useState<string>();
  // Setelan kamera di atas live view (DSLR): efek ISO/shutter/aperture/WB terlihat langsung (Rama, W-034).
  const [settings, setSettings] = useState(false);
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
      setInfo(errText(err));
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
      await p.crew.focus?.(step);
      // Puncak dihitung ulang setelah fokus digeser, supaya meter menunjukkan arah yang benar.
      setMeter((m) => m && { now: m.now, peak: m.now });
    } catch (e) {
      setInfo(errText(e));
    }
  };
  const take = async () => {
    try {
      const t0 = performance.now();
      const r = await p.camera.capture({ sessionId: newSessionId(), index: 0 });
      const bytes = await p.storage.readFile(r.path);
      // Tes Jepret setelah fokus benar = patokan ketajaman event ini (#88). Lewat preview 1600 px yang sama
      // dengan foto tamu: skor dari raw penuh ±25% lebih rendah (60D/700D, W-031), patokan jadi terlalu longgar.
      const { url, sharp } = await previewUrl(bytes, r.width, r.height);
      if (shot) URL.revokeObjectURL(shot);
      setShot(url);
      const score = Math.round(sharp);
      sharpNotes.setBaseline(eventId, score);
      sharpNotes.dismissWarning();
      setInfo(
        `${r.width}×${r.height} · ${Math.round(performance.now() - t0)} ms · ${copy.crew.sharpBase(score)}`,
      );
    } catch (e) {
      setInfo(errText(e));
    } finally {
      setLiveRun((n) => n + 1);
    }
  };
  return (
    <div className="relative h-full w-full">
      <LiveView key={liveRun} onFrame={onFrame} />
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
      <div className="absolute top-8 left-1/2 flex -translate-x-1/2 flex-col items-center gap-3">
        {p.crew.focus && (
          <div className="flex items-center gap-2 rounded-[20px] border-[2.5px] border-ink bg-paper p-2">
            <span className="px-3 text-xl font-bold">{copy.crew.focus}</span>
            <span className="text-lg text-text-2">{copy.crew.focusNear}</span>
            {FOCUS_ROW.map(({ step, label }) => (
              <Button
                key={step}
                variant={step === "af" ? "primary" : "secondary"}
                className="h-16 min-w-16 rounded-[14px] px-4 text-xl"
                onClick={() => void focus(step)}
              >
                {label}
              </Button>
            ))}
            <span className="pr-3 text-lg text-text-2">{copy.crew.focusFar}</span>
          </div>
        )}
        {p.crew.focusAt && (
          <p className="rounded-full border-2 border-ink bg-white px-5 py-2 text-lg font-semibold">
            {copy.crew.tapToFocus}
          </p>
        )}
        {meter && (
          <p
            data-testid="focus-meter"
            className="rounded-full border-2 border-ink bg-white px-5 py-2 font-mono text-lg"
          >
            {copy.crew.focusMeter} {meter.now}
            <span className="text-text-2">
              {" "}
              / {copy.crew.focusPeak} {meter.peak}
            </span>
          </p>
        )}
      </div>
      {shot && (
        <img
          src={shot}
          alt=""
          className="absolute right-10 bottom-44 w-1/4 rounded-[20px] border-[2.5px] border-ink"
        />
      )}
      {settings && (
        <aside
          data-testid="camera-settings"
          className="absolute top-8 right-8 bottom-[168px] flex w-[520px] flex-col gap-4 overflow-y-auto rounded-[24px] border-[2.5px] border-ink bg-paper/95 p-6"
        >
          <CameraProps onNote={setInfo} showEmpty />
        </aside>
      )}
      <div className="absolute inset-x-0 bottom-0 flex items-center justify-center gap-6 border-t-[2.5px] border-ink bg-paper px-10 py-6">
        <span className="font-mono text-xl text-text-2">{info}</span>
        {p.crew.focus && (
          <Button
            variant="secondary"
            aria-pressed={settings}
            className="h-[92px] rounded-[20px] px-8 text-[26px]"
            onClick={() => setSettings((v) => !v)}
          >
            {copy.crew.cameraSettings}
          </Button>
        )}
        <Button className="h-[92px] rounded-[20px] px-10 text-[26px]" onClick={() => void take()}>
          {copy.crew.testShot}
        </Button>
        <Button
          variant="secondary"
          className="h-[92px] rounded-[20px] px-10 text-[26px]"
          onClick={onBack}
        >
          {copy.crew.back}
        </Button>
      </div>
    </div>
  );
}
