import {
  browserContext,
  FIXTURES,
  makeFixtureInputs,
  pixelHash,
  render,
} from "@tetra/template-engine";
import { useEffect, useRef, useState } from "react";

/** Render fixture 4R lewat OffscreenCanvas dan tampilkan hash piksel (harus sama dengan snapshot test & web). */
export function EngineCheck() {
  const ref = useRef<HTMLCanvasElement>(null);
  const [hash, setHash] = useState("…");
  useEffect(() => {
    const ctx = browserContext();
    const out = render(FIXTURES["4R"], makeFixtureInputs(ctx, FIXTURES["4R"]), ctx);
    const el = ref.current;
    const g = el?.getContext("2d");
    if (el && g) g.drawImage(out as unknown as OffscreenCanvas, 0, 0, el.width, el.height);
    pixelHash(out).then((h) => {
      setHash(h);
      console.info("[fase0] engine hash:", h);
    });
  }, []);
  return (
    <div className="flex flex-col gap-1">
      <canvas ref={ref} width={120} height={180} className="border border-line bg-surface" />
      <code className="w-[120px] break-all">{hash.slice(0, 16)}</code>
    </div>
  );
}
