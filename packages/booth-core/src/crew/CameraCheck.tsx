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
          className="absolute right-10 bottom-44 w-1/4 rounded-[20px] border-[2.5px] border-ink"
        />
      )}
      <div className="absolute inset-x-0 bottom-0 flex items-center justify-center gap-6 border-t-[2.5px] border-ink bg-paper px-10 py-6">
        <span className="font-mono text-xl text-text-2">{info}</span>
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
