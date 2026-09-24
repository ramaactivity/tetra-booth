"use server";
import { randomInt } from "node:crypto";
import { revalidatePath } from "next/cache";
import { requireMember } from "@/lib/supabase/server";

const PAIR_MS = 10 * 60_000;
const newCode = () => String(randomInt(0, 1_000_000)).padStart(6, "0");

export type PairResult = { name: string; code: string } | { error: string } | null;

/** Daftarkan booth baru → kode pairing 6 digit (FSD §1.2, desain E5). Owner/admin; RLS berlaku. */
export async function addDevice(_prev: PairResult, form: FormData): Promise<PairResult> {
  const { db, orgId } = await requireMember(["owner", "admin"]);
  const name = String(form.get("name") ?? "")
    .trim()
    .slice(0, 60);
  if (!name) return { error: "Nama booth wajib diisi" };
  const { count } = await db
    .from("devices")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", orgId);
  const code = newCode();
  const { error } = await db.from("devices").insert({
    organization_id: orgId,
    name,
    short_code: `B${String((count ?? 0) + 1).padStart(2, "0")}`,
    pairing_code: code,
    pairing_expires_at: new Date(Date.now() + PAIR_MS).toISOString(),
  });
  if (error) return { error: "Gagal mendaftarkan booth, coba lagi" };
  revalidatePath("/admin/devices");
  return { name, code };
}

/** Kode pairing baru untuk booth yang sudah terdaftar (pasangkan ulang laptop / ganti laptop). */
export async function newPairingCode(deviceId: string): Promise<PairResult> {
  const { db, orgId } = await requireMember(["owner", "admin"]);
  const code = newCode();
  const { data, error } = await db
    .from("devices")
    .update({
      pairing_code: code,
      pairing_expires_at: new Date(Date.now() + PAIR_MS).toISOString(),
    })
    .eq("id", deviceId)
    .eq("organization_id", orgId)
    .is("revoked_at", null)
    .select("name")
    .maybeSingle();
  if (error || !data) return { error: "Gagal membuat kode, coba lagi" };
  return { name: data.name, code };
}

/** Nonaktifkan booth: token dicabut, booth ditolak server sampai dipasangkan ulang dengan device baru. */
export async function revokeDevice(deviceId: string) {
  const { db, orgId } = await requireMember(["owner", "admin"]);
  await db
    .from("devices")
    .update({ revoked_at: new Date().toISOString(), token_hash: null, pairing_code: null })
    .eq("id", deviceId)
    .eq("organization_id", orgId);
  revalidatePath("/admin/devices");
}
