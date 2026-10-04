"use client";
import { Menu, X } from "lucide-react";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { copy } from "@/lib/copy";

/**
 * Admin di bawah lg (HP & tablet): top bar + sidebar yang sama sebagai drawer kiri (DECISIONS #167).
 * `<dialog>` modal bawaan: fokus terkunci, Esc menutup, fokus kembali ke tombol menu. Isi hanya dipasang
 * saat terbuka supaya teks sidebar tidak dobel di DOM.
 */
export function MobileNav({ logo, children }: { logo: ReactNode; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!open) return;
    ref.current?.showModal();
    document.documentElement.style.overflow = "hidden";
    // Tablet diputar ke ≥ lg saat drawer terbuka: dialog tersembunyi tapi halaman masih inert → tutup.
    const lg = matchMedia("(min-width: 64rem)");
    const onLg = () => lg.matches && ref.current?.close();
    lg.addEventListener("change", onLg);
    return () => lg.removeEventListener("change", onLg);
  }, [open]);
  const close = () => ref.current?.close();
  return (
    <>
      <header className="sticky top-0 z-10 flex h-14 items-center justify-between border-b-[1.5px] border-ink bg-white pr-1.5 pl-4 lg:hidden">
        {logo}
        <button
          type="button"
          aria-label={copy.admin.menuOpen}
          onClick={() => setOpen(true)}
          className="flex size-11 items-center justify-center rounded-[11px] hover:bg-paper"
        >
          <Menu aria-hidden className="size-6" strokeWidth={2} />
        </button>
      </header>
      {/* Klik di luar panel (scrim) atau tautan apa pun menutup drawer. */}
      {/* biome-ignore lint/a11y/useKeyWithClickEvents: Esc ditangani <dialog>; tautan punya keyboard sendiri */}
      <dialog
        ref={ref}
        aria-label={copy.admin.menu}
        onClose={() => {
          setOpen(false);
          document.documentElement.style.overflow = "";
        }}
        onClick={(e) => {
          const t = e.target as Element;
          if (t === e.currentTarget || t.closest("a")) close();
        }}
        className="m-0 h-dvh max-h-dvh w-[280px] max-w-[85vw] border-0 border-r-[1.5px] border-ink bg-white p-0 text-ink transition-transform duration-200 ease-out backdrop:bg-ink/40 motion-reduce:transition-none starting:open:-translate-x-full lg:hidden"
      >
        {open && (
          <div className="flex h-full flex-col gap-1.5 px-3.5 pt-3 pb-6">
            <div className="flex items-center justify-between pb-4 pl-2">
              {logo}
              <button
                type="button"
                aria-label={copy.admin.menuClose}
                onClick={close}
                className="flex size-11 items-center justify-center rounded-[11px] hover:bg-paper"
              >
                <X aria-hidden className="size-6" strokeWidth={2} />
              </button>
            </div>
            {children}
          </div>
        )}
      </dialog>
    </>
  );
}
