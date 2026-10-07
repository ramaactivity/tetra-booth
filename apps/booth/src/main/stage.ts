import { randomUUID } from "node:crypto";
import { mkdir } from "node:fs/promises";
import { BrowserWindow } from "electron";
import { request } from "./camera-client";

/**
 * Photo Stage (#178): laptop berperan `stage` menerima jepretan rana fotografer lewat Camera Service
 * (`capture.listen`) ke folder `<sessions>/_stage-inbox`, lalu tiap `capture.shot` diteruskan ke renderer.
 * Status dengar disimpan di sini dan dipasang ulang setiap koneksi event Camera Service tersambung lagi.
 */
let inbox: string | null = null;

export const stageInbox = (sessionsRoot: string) => `${sessionsRoot}/_stage-inbox`;

export async function stageListen(dir: string | null) {
  if (dir) await mkdir(dir, { recursive: true });
  inbox = dir;
  await request({ id: randomUUID(), type: "capture.listen", payload: { outputDir: dir } });
}

/** Dipanggil saat koneksi event Camera Service (re)terbuka. */
export function stageReassert(log: (m: string) => void) {
  if (!inbox) return;
  stageListen(inbox).catch((e) => log(`[stage] gagal memasang ulang dengar rana: ${String(e)}`));
}

export function stageShot(s: { path: string; width: number; height: number }) {
  for (const w of BrowserWindow.getAllWindows()) w.webContents.send("stageShot", s);
}
