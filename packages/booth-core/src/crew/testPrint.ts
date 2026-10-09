import { newSessionId, PRINT_CANVAS, paperLabel, printPaper } from "@tetra/shared";
import { cpuCanvas } from "@tetra/template-engine";
import type { BoothEvent } from "../event";
import type { BoothPlatform } from "../platform";
import { loadPrintTone, toneForPrint } from "../printTone";
import { type ChartCtx, drawTestChart } from "./testChart";
import { TEST_PHOTO } from "./testPhoto";

const FONT = "Plus Jakarta Sans Variable";
const MONO = "Geist Mono";

/**
 * Tes Cetak (#239): lembar kalibrasi (potongan & posisi, warna, ketajaman; lihat `testChart.ts`) di kertas event
 * aktif, dengan koreksi warna printer yang sama dengan sesi, lewat jalur cetak yang sama. Kembalikan id job supaya
 * menu crew bisa menampilkan hasil akhirnya.
 */
export async function testPrint(p: BoothPlatform, event: BoothEvent): Promise<string> {
  const paper = printPaper(event.layout.paper);
  await Promise.all([
    document.fonts.load(`800 64px "${FONT}"`),
    document.fonts.load(`400 20px "${MONO}"`),
  ]).catch(() => {});
  // Tanpa fetch: CSP renderer booth menolak connect ke data: URL. Gagal = lembar tetap dicetak tanpa foto.
  const photo = await (async () => {
    try {
      const bin = atob(TEST_PHOTO.slice(TEST_PHOTO.indexOf(",") + 1));
      const bytes = Uint8Array.from(bin, (ch) => ch.charCodeAt(0));
      return await createImageBitmap(new Blob([bytes], { type: "image/jpeg" }));
    } catch {
      return null;
    }
  })();
  const version = await Promise.race([
    p.crew.checkUpdate().then((r) => r.current),
    new Promise<string>((r) => setTimeout(() => r("?"), 2000)),
  ]).catch(() => "?");
  const sheet = cpuCanvas(PRINT_CANVAS.width, PRINT_CANVAS.height) as unknown as OffscreenCanvas;
  const g = sheet.getContext("2d");
  if (!g) throw new Error("canvas 2d tidak tersedia");
  drawTestChart(
    g as unknown as ChartCtx,
    {
      paper: paper === "2x6x2" ? "Strip 2x6 (2 per lembar)" : paperLabel(event.layout.paper),
      tone: loadPrintTone(),
      version,
      when: new Intl.DateTimeFormat("id-ID", { dateStyle: "full", timeStyle: "short" }).format(
        new Date(),
      ),
      font: FONT,
      mono: MONO,
    },
    photo,
    paper === "2x6x2",
  );
  photo?.close();
  const blob = await toneForPrint(sheet).convertToBlob({ type: "image/jpeg", quality: 0.95 });
  const id = newSessionId();
  const path = `${await p.storage.sessionDir(id)}/out/test.jpg`;
  await p.storage.writeFile(path, new Uint8Array(await blob.arrayBuffer()));
  const jobId = `test-${id}`;
  await p.printer.submit({ jobId, path, copies: 1, paper });
  return jobId;
}
