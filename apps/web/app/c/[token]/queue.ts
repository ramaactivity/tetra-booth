import type { GuestMe, GuestSignResponse, GuestUploadKind } from "@tetra/shared";

/**
 * Antrean unggah Guest Cam (#197) di IndexedDB: jepretan tidak hilang saat sinyal putus atau tab ditutup, dan
 * dikirim ulang dengan idx yang sama (server idempoten per idx). Urutan: sign → PUT ke R2 → done → hapus lokal.
 */
export type QueueItem = {
  id: string;
  token: string;
  kind: GuestUploadKind;
  idx: number;
  main: Blob;
  thumb?: Blob;
  audioType?: "audio/webm" | "audio/mp4";
};

const open = () =>
  new Promise<IDBDatabase>((ok, fail) => {
    const r = indexedDB.open("tetra-guestcam", 1);
    r.onupgradeneeded = () => r.result.createObjectStore("q", { keyPath: "id" });
    r.onsuccess = () => ok(r.result);
    r.onerror = () => fail(r.error);
  });

async function tx<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>) {
  const db = await open();
  return new Promise<T>((ok, fail) => {
    const r = fn(db.transaction("q", mode).objectStore("q"));
    r.onsuccess = () => ok(r.result);
    r.onerror = () => fail(r.error);
  });
}

export const itemId = (token: string, kind: GuestUploadKind, idx: number) =>
  `${token}:${kind}:${idx}`;
export const enqueue = (item: QueueItem) => tx("readwrite", (s) => s.put(item));
export const queued = async (token: string) =>
  ((await tx("readonly", (s) => s.getAll())) as QueueItem[]).filter((i) => i.token === token);
const remove = (id: string) => tx("readwrite", (s) => s.delete(id));

const api = (token: string, path: string, body: unknown) =>
  fetch(`/api/c/${encodeURIComponent(token)}/${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

/** Kirim satu item. true = selesai (atau ditolak permanen, dibuang); false = coba lagi nanti. */
async function send(item: QueueItem): Promise<boolean | GuestMe> {
  const ref = {
    kind: item.kind,
    idx: item.idx,
    ...(item.audioType && { audioType: item.audioType }),
  };
  const sign = await api(item.token, "sign", ref);
  if (sign.status === 400 || sign.status === 404) return true;
  if (!sign.ok) return false;
  const { uploads } = (await sign.json()) as GuestSignResponse;
  for (const u of uploads) {
    const blob = u.part === "thumb" ? item.thumb : item.main;
    if (!blob) return true;
    const put = await fetch(u.url, {
      method: "PUT",
      headers: { "Content-Type": u.contentType },
      body: blob,
    });
    if (!put.ok) return false;
  }
  const done = await api(item.token, "done", ref);
  if (done.status === 400 || done.status === 404) return true;
  return done.ok ? ((await done.json()) as GuestMe) : false;
}

let running = false;
/**
 * Kirim semua yang antre untuk link ini. Berhenti di kegagalan pertama (sinyal); dipanggil ulang oleh UI.
 * true = antrean kosong; false = masih ada yang gagal / sedang dikirim proses lain.
 */
export async function flush(token: string, onMe: (me: GuestMe) => void): Promise<boolean> {
  if (running) return false;
  running = true;
  try {
    for (const item of (await queued(token)).sort((a, b) => a.idx - b.idx)) {
      const r = await send(item).catch(() => false);
      if (r === false) return false;
      await remove(item.id);
      if (typeof r === "object") onMe(r);
    }
    return true;
  } finally {
    running = false;
  }
}
