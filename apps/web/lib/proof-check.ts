import "server-only";
import { z } from "zod";
import type { Proof } from "./promo";

/**
 * Pemeriksaan otomatis screenshot bukti promo tamu (#219) lewat model vision berantarmuka OpenAI
 * (Sumopod `https://ai.sumopod.com/v1`, atau Gemini `…/v1beta/openai`). Env: `AI_API_KEY`, opsional `AI_BASE_URL`,
 * `AI_MODEL`. Hanya memeriksa ISI (story IG yang men-tag / ulasan Google untuk usaha ini); screenshot yang diedit
 * tidak bisa dibuktikan dari gambar saja, jadi Bruno/owner tetap bisa menolak belakangan.
 */
export type ProofCheck = {
  verdict: "ok" | "suspect" | "unchecked" | "rejected";
  reason: string;
  by: "ai" | "bruno" | "owner";
  at: string;
};

const Answer = z.object({ match: z.boolean(), reason: z.string().max(300) });

/** Jawaban model → hasil; JSON rusak = null (diperlakukan "belum dicek"). */
export function parseAnswer(text: string): { match: boolean; reason: string } | null {
  const json = /\{[\s\S]*\}/.exec(text)?.[0];
  if (!json) return null;
  try {
    return Answer.parse(JSON.parse(json));
  } catch {
    return null;
  }
}

const question = (kind: Proof, handles: string[], org: string) =>
  kind === "instagram"
    ? `Apakah gambar ini screenshot story atau postingan Instagram yang menandai (tag/mention) minimal satu akun berikut: ${handles.map((h) => `@${h}`).join(", ")}? Huruf besar/kecil dan titik/underscore harus sama.`
    : `Apakah gambar ini screenshot ulasan Google (Google Maps / Google Bisnis) yang sudah ditulis untuk usaha "${org}", berisi bintang dan/atau teks ulasan?`;

/** null = pemeriksa tidak tersedia (tanpa key, kuota, jaringan) → kode tetap terbit sebagai "belum dicek". */
export async function checkProof(o: {
  kind: Proof;
  image: Uint8Array;
  mime: string;
  handles: string[];
  org: string;
}): Promise<Omit<ProofCheck, "at" | "by"> | null> {
  const key = process.env.AI_API_KEY?.trim();
  if (!key) return null;
  const base = (process.env.AI_BASE_URL?.trim() || "https://ai.sumopod.com/v1").replace(/\/$/, "");
  const model = process.env.AI_MODEL?.trim() || "gemini/gemini-3.1-flash-lite";
  const data = `data:${o.mime};base64,${Buffer.from(o.image).toString("base64")}`;
  try {
    const res = await fetch(`${base}/chat/completions`, {
      method: "POST",
      headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
      signal: AbortSignal.timeout(25_000),
      body: JSON.stringify({
        model,
        temperature: 0,
        messages: [
          {
            role: "system",
            content:
              'Kamu pemeriksa bukti promo. Jawab HANYA JSON {"match": boolean, "reason": string}. "reason" satu kalimat pendek bahasa Indonesia santai untuk tamu (kalau tidak cocok: apa yang kurang).',
          },
          {
            role: "user",
            content: [
              { type: "text", text: question(o.kind, o.handles, o.org) },
              { type: "image_url", image_url: { url: data } },
            ],
          },
        ],
      }),
    });
    if (!res.ok) {
      console.warn(`[proof-check] ${model}: ${res.status}`);
      return null;
    }
    const body = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    const a = parseAnswer(body.choices?.[0]?.message?.content ?? "");
    return a ? { verdict: a.match ? "ok" : "suspect", reason: a.reason } : null;
  } catch (e) {
    console.warn(`[proof-check] ${e instanceof Error ? e.message : String(e)}`);
    return null;
  }
}
