import { BoothApp, PlatformProvider, StageTv } from "@tetra/booth-core";
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

  // Jendela TV Photo Stage (#179) memuat renderer yang sama dengan hash #tv.
  if (location.hash === "#tv")
    return (
      <PlatformProvider platform={platform}>
        <StageTv />
      </PlatformProvider>
    );
  return (
    <PlatformProvider platform={platform}>
      <BoothApp
        guestBaseUrl={cfg.guestUrl}
        demo={cfg.demo}
        fast={cfg.fast ?? false}
        kiosk={cfg.kiosk ?? false}
        startScreen={cfg.startScreen ?? false}
        bumper={cfg.bumper ?? false}
      />
    </PlatformProvider>
  );
}
