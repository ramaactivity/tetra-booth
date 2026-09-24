import type { Metadata } from "next";
import { copy } from "@/lib/copy";
import { LoginForm } from "./LoginForm";

export const metadata: Metadata = { title: "Masuk · Tetra Admin", robots: { index: false } };

/** Masuk admin (desain v2 E0). */
export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ e?: string }>;
}) {
  const { e } = await searchParams;
  return (
    <main className="grid min-h-dvh grid-cols-1 bg-paper md:grid-cols-2">
      <section className="flex flex-col px-8 py-10 md:px-[72px] md:py-14">
        <div className="flex items-center gap-2.5">
          <span className="flex size-9 items-center justify-center rounded-[10px] border-[1.5px] border-ink bg-mint text-base font-extrabold">
            T
          </span>
          <span className="text-xl font-extrabold tracking-[-0.02em]">tetra</span>
        </div>
        <div className="flex flex-1 flex-col justify-center py-10">
          <LoginForm note={e === "akses" ? copy.admin.noAccess : null} />
        </div>
      </section>
      <section className="relative hidden items-center justify-center overflow-hidden border-l-[1.5px] border-ink bg-sky md:flex">
        <div className="absolute -right-40 -bottom-40 size-[520px] rounded-full border-[1.5px] border-white" />
        <div className="absolute -right-[60px] -bottom-[60px] size-80 rounded-full border-[1.5px] border-white" />
        <div className="flex w-[380px] flex-col gap-3.5">
          {copy.admin.loginCards.map((c) => (
            <div
              key={c.t}
              className={`layered flex items-center gap-3 rounded-2xl border-[1.5px] border-ink bg-white p-3.5 [--lb:1.5px] [--lx:5px] [--under:#fff] ${c.ml}`}
            >
              <span
                className={`flex size-11 items-center justify-center rounded-xl border-[1.5px] border-dashed border-ink text-lg ${c.bg}`}
              >
                {c.i}
              </span>
              <div>
                <div className="text-sm font-bold">{c.t}</div>
                <div className="mt-0.5 text-xs text-text-2">{c.d}</div>
              </div>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}
