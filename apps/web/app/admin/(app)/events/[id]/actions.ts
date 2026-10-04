"use server";
import { applyRun, type EventRun, RUN_ACTIONS, setRunTimes } from "@tetra/shared";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { deleteObjects } from "@/lib/r2";
import { updateRun } from "@/lib/run";
import { requireMember } from "@/lib/supabase/server";

/**
 * Moderasi sesi (FSD §5, desain E8): sembunyikan/tampilkan atau hapus (foto di R2 ikut dihapus).
 * Owner/admin; semua aksi masuk audit_logs.
 */
export async function moderate(
  eventId: string,
  sessionId: string,
  action: "hide" | "show" | "delete",
) {
  const { db, orgId, user } = await requireMember(["owner", "admin"]);
  const scope = db
    .from("sessions")
    .update(
      action === "delete"
        ? { deleted_at: new Date().toISOString() }
        : { hidden_at: action === "hide" ? new Date().toISOString() : null },
    );
  const { data } = await scope
    .eq("id", sessionId)
    .eq("event_id", eventId)
    .eq("organization_id", orgId)
    .select("id")
    .maybeSingle();
  if (!data) return;
  if (action === "delete") {
    const { data: assets } = await db
      .from("assets")
      .select("r2_key")
      .eq("session_id", sessionId)
      .eq("organization_id", orgId);
    await deleteObjects((assets ?? []).map((a) => a.r2_key.split("#")[0] ?? a.r2_key));
    await db.from("assets").delete().eq("session_id", sessionId).eq("organization_id", orgId);
  }
  await db.from("audit_logs").insert({
    organization_id: orgId,
    actor_user_id: user.id,
    action: `session.${action}`,
    target: sessionId,
    meta: { eventId },
  });
  revalidatePath("/admin/(app)/events/[id]", "layout");
}

export type RunResult = { ok: true; run: EventRun } | { ok: false; message: string };

/** Timer event dari dashboard (DECISIONS #149): Mulai/Lanjutkan, Jeda, Selesai. Owner/admin. */
export async function runEvent(eventId: string, action: string): Promise<RunResult> {
  const { db, orgId, user } = await requireMember(["owner", "admin"]);
  const a = z.enum(RUN_ACTIONS).safeParse(action).data;
  if (!a || !z.uuid().safeParse(eventId).success)
    return { ok: false, message: "Aksi tidak dikenal" };
  const now = Date.now();
  const run = await updateRun(db, eventId, orgId, (r) =>
    applyRun(r, a, new Date(now).toISOString(), now),
  ).catch(() => null);
  if (!run) return { ok: false, message: "Gagal menyimpan, coba lagi" };
  await db.from("audit_logs").insert({
    organization_id: orgId,
    actor_user_id: user.id,
    action: `run.${a}`,
    target: eventId,
  });
  revalidatePath("/admin/(app)/events/[id]", "layout");
  return { ok: true, run };
}

/** Koreksi manual jam mulai / selesai (ISO). `end` kosong = jam selesai tidak diubah. */
export async function correctRun(
  eventId: string,
  start: string,
  end: string | null,
): Promise<RunResult> {
  const { db, orgId, user } = await requireMember(["owner", "admin"]);
  const Iso = z.iso.datetime();
  if (
    !z.uuid().safeParse(eventId).success ||
    !Iso.safeParse(start).success ||
    (end !== null && !Iso.safeParse(end).success)
  )
    return { ok: false, message: "Jam tidak valid" };
  const run = await updateRun(db, eventId, orgId, (r) =>
    setRunTimes(r, start, end, Date.now()),
  ).catch(() => null);
  if (!run)
    return {
      ok: false,
      message: "Jam selesai harus setelah jam mulai, dan tidak bertabrakan dengan jeda.",
    };
  await db.from("audit_logs").insert({
    organization_id: orgId,
    actor_user_id: user.id,
    action: "run.correct",
    target: eventId,
    meta: { start, end },
  });
  revalidatePath("/admin/(app)/events/[id]", "layout");
  return { ok: true, run };
}
