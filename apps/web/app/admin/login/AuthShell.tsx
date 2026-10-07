import { CalendarDays, Images, Laptop } from "lucide-react";
import type { ReactNode } from "react";
import { copy } from "@/lib/copy";

const ICONS = [Laptop, Images, CalendarDays];

/** Kerangka halaman masuk (desain v2 E0): form kiri, panel dekoratif kanan. Dipakai masuk, lupa & buat sandi. */
export function AuthShell({ children }: { children: ReactNode }) {
  return (
    <main className="grid min-h-dvh grid-cols-1 bg-paper md:grid-cols-2">
      <section className="flex flex-col px-8 py-10 md:px-[72px] md:py-14">
        <div className="flex items-center gap-2.5">
          <span className="flex size-9 items-center justify-center rounded-[10px] border-[1.5px] border-ink bg-mint text-base font-extrabold">
            T
          </span>
          <span className="text-xl font-extrabold tracking-[-0.02em]">tetra</span>
        </div>
        <div className="flex flex-1 flex-col justify-center py-10">{children}</div>
      </section>
      <section className="relative hidden items-center justify-center overflow-hidden border-l-[1.5px] border-ink bg-sky md:flex">
        <div className="absolute -right-40 -bottom-40 size-[520px] rounded-full border-[1.5px] border-white" />
        <div className="absolute -right-[60px] -bottom-[60px] size-80 rounded-full border-[1.5px] border-white" />
        <div className="flex w-[380px] flex-col gap-3.5">
          {copy.admin.loginCards.map((c, i) => {
            const I = ICONS[i] ?? Laptop;
            return (
              <div
                key={c.t}
                className={`layered flex items-center gap-3 rounded-2xl border-[1.5px] border-ink bg-white p-3.5 [--lb:1.5px] [--lx:5px] [--under:#fff] ${c.ml}`}
              >
                <span
                  className={`flex size-11 flex-none items-center justify-center rounded-xl border-[1.5px] border-ink ${c.bg}`}
                >
                  <I aria-hidden className="size-5" strokeWidth={2} />
                </span>
                <div>
                  <div className="text-sm font-bold">{c.t}</div>
                  <div className="mt-0.5 text-xs text-text-2">{c.d}</div>
                </div>
              </div>
            );
          })}
        </div>
      </section>
    </main>
  );
}
