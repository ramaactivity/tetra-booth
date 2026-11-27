/**
 * Kode darurat PIN crew (audit 27 Nov): crew lupa PIN di lokasi → owner membuka admin → Booth → "Lupa PIN" dan
 * membacakan kode 6 digit. Booth menghitung kode yang sama dari token device-nya sendiri, jadi jalan tanpa internet.
 * Kunci = sha256(token device) = `devices.token_hash` di server. Berganti tiap hari (WIB).
 */
const enc = new TextEncoder();
const hex = (b: ArrayBuffer) =>
  [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, "0")).join("");

export const tokenHash = async (token: string) =>
  hex(await crypto.subtle.digest("SHA-256", enc.encode(token)));

/** Tanggal WIB `YYYY-MM-DD`. */
export const wibDay = (t = Date.now()) => new Date(t + 7 * 3_600_000).toISOString().slice(0, 10);

export async function emergencyPin(hash: string, day = wibDay()): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(hash),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(`tetra-crew-reset:${day}`));
  return String(new DataView(sig).getUint32(0) % 1_000_000).padStart(6, "0");
}

/** Booth: terima kode kemarin, hari ini, besok — jam laptop bisa meleset, owner bisa membuka kode lewat tengah malam. */
export async function isEmergencyPin(token: string, pin: string, now = Date.now()) {
  const hash = await tokenHash(token);
  const codes = await Promise.all(
    [-1, 0, 1].map((d) => emergencyPin(hash, wibDay(now + d * 86_400_000))),
  );
  return codes.includes(pin);
}
