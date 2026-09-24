import "server-only";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@tetra/db";

/** Klien service role: melewati RLS, jadi setiap query WAJIB memfilter organization_id sendiri (aturan 3 & 5). */
export const createServiceClient = () => {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("env Supabase service role belum diisi");
  return createClient<Database>(url, key, { auth: { persistSession: false } });
};
