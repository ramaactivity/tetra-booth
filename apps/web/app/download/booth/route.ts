import { latestBoothRelease, presignGet } from "@/lib/r2";

export const dynamic = "force-dynamic";

/**
 * Link unduh installer booth untuk crew: booth.tetraphoto.com/download/booth → URL R2 bertanda tangan
 * (`*.r2.dev` diblokir sebagian ISP, DECISIONS #63/#80). `?v=0.5.3` = versi lama (uji jalur update).
 */
export async function GET(req: Request) {
  const v = new URL(req.url).searchParams.get("v");
  if (v) {
    if (!/^\d+\.\d+\.\d+$/.test(v)) return new Response("Versi tidak valid", { status: 400 });
    return Response.redirect(
      await presignGet(`dev-builds/Tetra-Booth-Setup-${v}.exe`, 60 * 60),
      302,
    );
  }
  const r = await latestBoothRelease();
  if (!r) return new Response("Installer belum tersedia", { status: 404 });
  return Response.redirect(await presignGet(r.key, 60 * 60), 302);
}
