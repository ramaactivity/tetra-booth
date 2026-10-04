import { copy } from "@/lib/copy";
import type { Role } from "@/lib/supabase/server";

const t = copy.admin.team;
export const ROLES: Role[] = ["owner", "admin", "crew"];
/** Warna avatar & lencana per role (sama di daftar, panduan, dan dialog undang). */
export const ROLE_BG: Record<string, string> = {
  owner: "bg-butter",
  admin: "bg-lavender",
  crew: "bg-sky",
};

/** Fitur per tingkat akses untuk satu role, dibaca dari `matrix` (satu sumber untuk tabel & ringkasan). */
export function roleAccess(role: string) {
  const col = ROLES.indexOf(role as Role) + 1;
  const pick = (a: string) => t.matrix.filter((r) => r[col] === a).map((r) => r[0]);
  const full = pick("Penuh");
  return [
    [t.can, full.length === t.matrix.length ? t.all : full.join(", ")],
    [t.view, pick("Lihat").join(", ")],
    [t.cannot, pick("Tidak").join(", ")],
  ].filter(([, v]) => v) as [string, string][];
}
