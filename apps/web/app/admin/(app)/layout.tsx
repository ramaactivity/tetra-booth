import type { Metadata } from "next";
import type { ReactNode } from "react";
import { copy } from "@/lib/copy";
import { requireMember } from "@/lib/supabase/server";
import { signOut } from "../login/actions";
import { Nav } from "./Nav";

export const metadata: Metadata = { title: "Tetra Admin", robots: { index: false } };

/** Kerangka admin: sidebar (desain v2 E1) + konten. Semua halaman di dalamnya butuh anggota organisasi. */
export default async function AdminLayout({ children }: { children: ReactNode }) {
  const { user, role } = await requireMember();
  const name = user.email ?? "";
  return (
    <div className="flex min-h-dvh bg-paper">
      <aside className="sticky top-0 flex h-dvh w-[236px] flex-none flex-col gap-1.5 border-r-[1.5px] border-ink bg-white px-3.5 py-6">
        <div className="flex items-center gap-2.5 px-2 pb-6">
          <span className="flex size-[34px] items-center justify-center rounded-[9px] border-[1.5px] border-ink bg-mint text-[15px] font-extrabold">
            T
          </span>
          <span className="text-lg font-extrabold tracking-[-0.02em]">tetra</span>
        </div>
        <Nav />
        <div className="mt-auto flex items-center gap-2.5 rounded-[14px] border-[1.5px] border-dashed border-ink p-2.5">
          <span className="flex size-8 flex-none items-center justify-center rounded-full border-[1.5px] border-ink bg-peach text-xs font-extrabold uppercase">
            {name[0]}
          </span>
          <div className="min-w-0 flex-1">
            <div className="truncate text-[13px] font-bold">{name}</div>
            <div className="text-[11px] text-text-2">{copy.admin.roles[role]}</div>
          </div>
          <form action={signOut}>
            <button type="submit" className="text-[11px] font-bold underline">
              {copy.admin.signOut}
            </button>
          </form>
        </div>
      </aside>
      <main className="flex min-w-0 flex-1 flex-col gap-5 px-10 py-8">{children}</main>
    </div>
  );
}
