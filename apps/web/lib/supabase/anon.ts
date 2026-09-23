import { createClient } from "@supabase/supabase-js";
import type { Database } from "@tetra/db";

const env = (k: string): string => {
  const v = process.env[k];
  if (!v) throw new Error(`env ${k} belum diisi`);
  return v;
};

/** Klien anon (RLS berlaku). Aman di server maupun browser. */
export const createAnonClient = () =>
  createClient<Database>(env("NEXT_PUBLIC_SUPABASE_URL"), env("NEXT_PUBLIC_SUPABASE_ANON_KEY"), {
    auth: { persistSession: false },
  });
