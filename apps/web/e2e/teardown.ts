import { db, hasDb } from "./admin-helpers";

/**
 * Setelah semua tes web: hapus data uji di organisasi Tetra (dev = prod) yang tertinggal karena tes gagal di tengah.
 * Hanya baris berawalan "e2e " (event, template, booth uji); data asli Rama tidak pernah bernama begitu.
 */
export default async function teardown() {
  if (!hasDb) return;
  const org = (await db.from("organizations").select("id").eq("slug", "tetra").single()).data?.id;
  if (!org) return;
  const { data: events } = await db
    .from("events")
    .select("id")
    .eq("organization_id", org)
    .ilike("name", "e2e %");
  for (const e of events ?? []) {
    await db.from("payments").delete().eq("event_id", e.id);
    await db.from("events").delete().eq("id", e.id);
  }
  const { data: layouts } = await db
    .from("layouts")
    .select("id")
    .eq("organization_id", org)
    .ilike("name", "e2e %");
  for (const l of layouts ?? []) {
    // Masih dipakai event lain (bukan e2e) → baris tetap, delete ditolak FK.
    await db.from("layout_versions").delete().eq("layout_id", l.id);
    await db.from("layouts").delete().eq("id", l.id);
  }
  await db.from("layout_presets").delete().eq("organization_id", org).ilike("name", "e2e %");
  const { data: devices } = await db
    .from("devices")
    .select("id")
    .eq("organization_id", org)
    .ilike("name", "e2e %");
  for (const d of devices ?? []) await db.from("devices").delete().eq("id", d.id);
  // User uji (makeUser / undangan) yang cleanup()-nya tidak sempat jalan karena tes di-kill/timeout.
  const { data: users } = await db.auth.admin.listUsers({ perPage: 1000 });
  for (const u of users?.users ?? []) {
    if (!/^e2e-.*@example\.com$/.test(u.email ?? "")) continue;
    await db.from("members").delete().eq("user_id", u.id);
    await db.auth.admin.deleteUser(u.id);
  }
}
