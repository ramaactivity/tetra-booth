import { latestBoothRelease, presignGet } from "@/lib/r2";

export const dynamic = "force-dynamic";

/**
 * Link unduh installer booth untuk crew: booth.tetraphoto.com/download/booth → URL R2 bertanda tangan
 * (`*.r2.dev` diblokir sebagian ISP, DECISIONS #63/#80).
 */
export async function GET() {
  const r = await latestBoothRelease();
  if (!r) return new Response("Installer belum tersedia", { status: 404 });
  return Response.redirect(await presignGet(r.key, 60 * 60), 302);
}
