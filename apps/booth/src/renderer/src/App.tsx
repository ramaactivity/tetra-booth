import { BoothApp, PlatformProvider } from "@tetra/booth-core";
import { type BoothConfig, createElectronPlatform } from "@tetra/platform-electron";
import { useEffect, useMemo } from "react";

export function App({ cfg }: { cfg: BoothConfig }) {
  const platform = useMemo(() => createElectronPlatform(window.tetra, cfg), [cfg]);

  useEffect(() => {
    console.info(`[boot] kamera=${cfg.camera} demo=${cfg.demo}`);
    platform
      .health()
      .then((h) => console.info(`[boot] camera service: OK · printer ${h.printer}`))
      .catch((e: Error) => console.warn(`[boot] camera service: tidak terhubung (${e.message})`));
  }, [platform, cfg]);

  return (
    <PlatformProvider platform={platform}>
      <BoothApp
        guestBaseUrl={cfg.guestUrl}
        demo={cfg.demo}
        fast={cfg.fast ?? false}
        kiosk={cfg.kiosk ?? false}
      />
    </PlatformProvider>
  );
}
