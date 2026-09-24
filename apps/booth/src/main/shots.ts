import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { WebContents } from "electron";
import { shotsDir } from "./config";

let n = 0;

/** Log fase ke konsol main; dengan --shots=<dir>, simpan screenshot jendela booth per fase (hanya isi jendela app). */
export function onPhase(wc: WebContents, phase: string) {
  console.info(`[phase] ${phase}`);
  const dir = shotsDir;
  if (!dir) return;
  const file = join(dir, `${String(++n).padStart(3, "0")}-${phase}.png`);
  setTimeout(() => {
    wc.capturePage()
      .then((img) => {
        mkdirSync(dir, { recursive: true });
        writeFileSync(file, img.toPNG());
      })
      .catch((e: unknown) => console.warn("[shots] gagal", e));
  }, 700);
}
