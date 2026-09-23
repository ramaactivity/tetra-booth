import { createContext, type ReactNode, useContext } from "react";
import type { BoothPlatform } from "./platform";

const PlatformContext = createContext<BoothPlatform | null>(null);

export function PlatformProvider({
  platform,
  children,
}: {
  platform: BoothPlatform;
  children: ReactNode;
}) {
  return <PlatformContext.Provider value={platform}>{children}</PlatformContext.Provider>;
}

export function usePlatform(): BoothPlatform {
  const p = useContext(PlatformContext);
  if (!p) throw new Error("usePlatform dipanggil di luar PlatformProvider");
  return p;
}
