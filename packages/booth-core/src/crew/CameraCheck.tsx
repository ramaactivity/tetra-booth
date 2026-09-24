import { newSessionId } from "@tetra/shared";
import { Button } from "@tetra/ui";
import { useState } from "react";
import { copy } from "../copy";
import { errText } from "../errors";
import { usePlatform } from "../PlatformContext";
import { LiveView } from "../screens/LiveView";

/** Cek kamera: live view + test shot (FSD §1.3). */
export function CameraCheck({ onBack }: { onBack: () => void }) {
  const p = usePlatform();
  const [shot, setShot] = useState<string>();
  const [info, setInfo] = useState<string>();
  const take = async () => {
    try {
      const t0 = performance.now();
      const r = await p.camera.capture({ sessionId: newSessionId(), index: 0 });
      const bytes = await p.storage.readFile(r.path);
      if (shot) URL.revokeObjectURL(shot);
      setShot(URL.createObjectURL(new Blob([bytes], { type: "image/jpeg" })));
      setInfo(`${r.width}×${r.height} · ${Math.round(performance.now() - t0)} ms`);
    } catch (e) {
      setInfo(errText(e));
    }
  };
  return (
    <div className="relative h-full w-full">
      <LiveView />
      {shot && (
        <img
          src={shot}
          alt=""
          className="absolute right-6 bottom-28 w-1/4 rounded border-4 border-surface"
        />
      )}
      <div className="absolute inset-x-0 bottom-0 flex items-center justify-center gap-6 bg-bg/90 p-4">
        <span className="text-sm text-muted">{info}</span>
        <Button onClick={() => void take()}>{copy.crew.testShot}</Button>
        <Button variant="secondary" onClick={onBack}>
          {copy.crew.back}
        </Button>
      </div>
    </div>
  );
}
