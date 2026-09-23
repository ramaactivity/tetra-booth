import { Attract, PlatformProvider, usePlatform } from "@tetra/booth-core";
import { createElectronPlatform } from "@tetra/platform-electron";
import { useEffect, useState } from "react";
import { EngineCheck } from "./EngineCheck";

const platform = createElectronPlatform(window.tetra);

export function App() {
  return (
    <PlatformProvider platform={platform}>
      <Attract eventName="Tetra Booth" onStart={() => {}} />
      <DevPanel />
    </PlatformProvider>
  );
}

/** Panel verifikasi Fase 0: status Camera Service + hash render template engine. */
function DevPanel() {
  const p = usePlatform();
  const [health, setHealth] = useState("memeriksa…");
  useEffect(() => {
    p.health()
      .then((h) => setHealth(`OK · kamera ${h.camera} · printer ${h.printer}`))
      .then(() => undefined)
      .catch((e: Error) => setHealth(`tidak terhubung (${e.message})`));
  }, [p]);
  useEffect(() => console.info("[fase0] camera service:", health), [health]);
  return (
    <aside className="fixed bottom-4 left-4 flex items-end gap-4 text-xs text-muted">
      <EngineCheck />
      <div>Camera Service: {health}</div>
    </aside>
  );
}
