"use server";
import { randomInt } from "node:crypto";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireMember } from "@/lib/supabase/server";

const PAIR_MS = 10 * 60_000;
const newCode = () => String(randomInt(0, 1_000_000)).padStart(6, "0");
const DeviceId = z.uuid();
const Name = z.string().trim().min(1).max(60);

/** `ttlMs`: sisa umur kode; panel admin menghitung mundur dari jam browser (bebas selisih jam server). */
export type PairResult =
  | { id: string; name: string; code: string; ttlMs: number }
  | { error: string }
  | null;

/** Daftarkan booth baru → kode sambung 6 digit (FSD §1.2, desain E5). Owner/admin; RLS berlaku. */
export async function addDevice(_prev: PairResult, form: FormData): Promise<PairResult> {
  const { db, orgId } = await requireMember(["owner", "admin"]);
  const name = Name.safeParse(String(form.get("name") ?? "").slice(0, 60));
  if (!name.success) return { error: "Nama booth wajib diisi" };
  const { count } = await db
    .from("devices")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", orgId);
  const code = newCode();
  const { data, error } = await db
    .from("devices")
    .insert({
      organization_id: orgId,
      name: name.data,
      short_code: `B${String((count ?? 0) + 1).padStart(2, "0")}`,
      pairing_code: code,
      pairing_expires_at: new Date(Date.now() + PAIR_MS).toISOString(),
    })
    .select("id")
    .single();
  if (error) return { error: "Gagal menambah booth, coba lagi" };
  revalidatePath("/admin/devices");
  return { id: data.id, name: name.data, code, ttlMs: PAIR_MS };
}

/** Kode baru untuk booth yang sudah terdaftar: kode lama kedaluwarsa, ganti laptop, atau instal ulang. */
export async function newPairingCode(deviceId: string): Promise<PairResult> {
  const { db, orgId } = await requireMember(["owner", "admin"]);
  if (!DeviceId.safeParse(deviceId).success) return { error: "Booth tidak ditemukan" };
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
  return { id: deviceId, name: data.name, code, ttlMs: PAIR_MS };
}

/**
 * Sudah tersambung? Endpoint pair menghapus `pairing_code` dan memberi token dalam satu UPDATE,
 * jadi kode kosong + token ada = booth baru saja memakai kode (juga untuk sambung ulang).
 */
export async function pairStatus(deviceId: string): Promise<boolean> {
  const { db, orgId } = await requireMember(["owner", "admin"]);
  if (!DeviceId.safeParse(deviceId).success) return false;
  const { data } = await db
    .from("devices")
    .select("pairing_code, token_hash")
    .eq("id", deviceId)
    .eq("organization_id", orgId)
    .maybeSingle();
  return !!data && !data.pairing_code && !!data.token_hash;
}

/** Nonaktifkan booth: token dicabut, booth ditolak server sampai ditambahkan lagi sebagai booth baru. */
export async function revokeDevice(deviceId: string) {
  const { db, orgId } = await requireMember(["owner", "admin"]);
  if (!DeviceId.safeParse(deviceId).success) return;
  await db
    .from("devices")
    .update({ revoked_at: new Date().toISOString(), token_hash: null, pairing_code: null })
    .eq("id", deviceId)
    .eq("organization_id", orgId);
  revalidatePath("/admin/devices");
}
