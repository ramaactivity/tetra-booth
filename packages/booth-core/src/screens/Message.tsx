import type { ReactNode } from "react";

/** Layar satu kalimat (compose, cetak, kamera disiapkan). */
export function Message({ children, image }: { children: ReactNode; image?: string | undefined }) {
  return (
    <main className="flex h-full w-full flex-col items-center justify-center gap-10 bg-bg p-16 text-fg">
      {image && (
        <img
          src={image}
          alt=""
          className="max-h-[60vh] rounded border border-line bg-surface p-2"
        />
      )}
      <p className="text-3xl font-medium">{children}</p>
    </main>
  );
}
