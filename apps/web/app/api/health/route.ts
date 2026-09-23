import { createAnonClient } from "@/lib/supabase/anon";

export const dynamic = "force-dynamic";

/** Cek app hidup dan koneksi Supabase (anon + RLS: tanpa error = tersambung). */
export async function GET() {
  let db = false;
  let error: string | undefined;
  try {
    const { error: e } = await createAnonClient().from("organizations").select("id").limit(1);
    db = !e;
    if (e) error = e.message;
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
  }
  return Response.json({ ok: true, db, ...(error ? { error } : {}) }, { status: db ? 200 : 503 });
}
