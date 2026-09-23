"use client";

import {
  browserContext,
  FIXTURES,
  makeFixtureInputs,
  pixelHash,
  render,
} from "@tetra/template-engine";
import { useEffect, useRef, useState } from "react";

export function EngineCheck() {
  const ref = useRef<HTMLCanvasElement>(null);
  const [hash, setHash] = useState("…");
  useEffect(() => {
    const ctx = browserContext();
    const out = render(FIXTURES["4R"], makeFixtureInputs(ctx, FIXTURES["4R"]), ctx);
    const el = ref.current;
    const g = el?.getContext("2d");
    if (el && g) g.drawImage(out as unknown as OffscreenCanvas, 0, 0, el.width, el.height);
    pixelHash(out).then(setHash);
  }, []);
  return (
    <div className="flex flex-col gap-2 text-xs text-muted">
      <canvas ref={ref} width={300} height={450} className="border border-line bg-surface" />
      <code data-testid="hash" className="break-all">
        {hash}
      </code>
    </div>
  );
}
