import { config, deviceNow } from "./config";
import { rawGet } from "./digicam";

/** Setelan eksposur lewat web API digiCamControl (`/?slc=list|get|set`), sampai EDSDK tersedia. */
export const CAMERA_PROPS = [
  ["iso", "ISO"],
  ["shutterspeed", "Shutter"],
  ["aperture", "Aperture"],
  ["whitebalance", "White balance"],
] as const;
export const dccBase = () => {
  const t = config.camera === "hotfolder" ? deviceNow.hotFolderTrigger : undefined;
  try {
    return t ? new URL(t).origin : null;
  } catch {
    return null;
  }
};
/** Bukan fetch: digiCamControl mengirim Content-Length ganda yang ditolak fetch (lihat digicam.ts `rawGet`). */
export const dcc = async (base: string, q: Record<string, string>) =>
  new Response(new Uint8Array(await rawGet(`${base}/?${new URLSearchParams(q)}`, 3000)));
/** Tanpa kamera, digiCamControl menjawab HTTP 200 berisi pesan exception .NET, bukan daftar nilai. */
const isDotNetError = (text: string) => /Object reference not set|Exception\b/i.test(text);
/** Daftar nilai: JSON array atau teks per baris/koma (format belum diverifikasi di 60D). */
export const parseDccList = (text: string): string[] => {
  if (isDotNetError(text)) return [];
  try {
    const j: unknown = JSON.parse(text);
    if (Array.isArray(j)) return j.map(String).filter(Boolean);
  } catch {
    // bukan JSON
  }
  return text
    .split(/[\r\n,;]+/)
    .map((s) => s.trim())
    .filter(Boolean);
};
export async function dccProp(base: string, name: string, label: string) {
  try {
    const [list, cur] = await Promise.all([
      dcc(base, { slc: "list", param1: name }).then((r) => (r.ok ? r.text() : "")),
      dcc(base, { slc: "get", param1: name }).then((r) => (r.ok ? r.text() : "")),
    ]);
    const options = parseDccList(list);
    return options.length && !isDotNetError(cur)
      ? { name, label, value: cur.trim().replace(/^"|"$/g, ""), options }
      : null;
  } catch {
    return null;
  }
}
