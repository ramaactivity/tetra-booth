import "server-only";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@tetra/db";

const env = (k: string): string => {
  const v = process.env[k];
  if (!v) throw new Error(`env ${k} belum diisi`);
  return v;
};

/**
 * Klien service role. HANYA di server (CLAUDE.md aturan 5), dipakai endpoint booth/tamu/klien/webhook/cron
 * setelah verifikasi token masing-masing, dan selalu memfilter organization_id secara eksplisit.
 */
export const createServiceClient = () =>
  createClient<Database>(env("NEXT_PUBLIC_SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
