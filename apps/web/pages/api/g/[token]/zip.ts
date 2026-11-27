import { Readable } from "node:stream";
import type { ReadableStream as NodeWebStream } from "node:stream/web";
import type { NextApiRequest, NextApiResponse } from "next";
import { clientZip } from "@/lib/zip";

/**
 * ZIP galeri klien lewat Pages API (bukan App Router): hanya di sini header Content-Length sampai ke browser, sehingga
 * unduhan yang terputus ditandai GAGAL, bukan tersimpan sebagai ZIP rusak (#298; route handler Next 16 membuangnya).
 */
export const config = { api: { responseLimit: false }, maxDuration: 300 };

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET" && req.method !== "HEAD") return res.status(405).end();
  const ip =
    String(req.headers["x-forwarded-for"] ?? "")
      .split(",")[0]
      ?.trim() || "unknown";
  const params = new URL(req.url ?? "/", "http://x").searchParams;
  const r = await clientZip(
    String(req.query.token ?? ""),
    params,
    ip,
    req.headers["user-agent"] ?? null,
  );
  if ("error" in r) return res.status(r.status).json({ error: r.error });
  res.writeHead(200, {
    "content-type": "application/zip",
    "content-length": String(r.length),
    "content-disposition": `attachment; filename="${r.filename}"`,
  });
  if (req.method === "HEAD") return res.end();
  const body = Readable.fromWeb(r.stream as NodeWebStream<Uint8Array>);
  // Klien memutus → hentikan pembacaan R2; error di tengah → koneksi diputus (browser menandai gagal).
  req.on("close", () => body.destroy());
  await new Promise<void>((done) => {
    body.on("error", () => res.destroy());
    res.on("close", done);
    body.pipe(res);
  });
}
