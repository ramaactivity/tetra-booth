import { newSessionId, printPaper } from "@tetra/shared";
import { placeholderPhotos, renderEvent } from "../compose";
import type { BoothEvent } from "../event";
import type { BoothPlatform } from "../platform";

/** Test print: layout event aktif dengan foto abu-abu bertanda TEST, lewat jalur cetak yang sama dengan sesi. */
/** Kembalikan id job, supaya menu crew bisa menampilkan hasil akhirnya. */
export async function testPrint(p: BoothPlatform, event: BoothEvent): Promise<string> {
  const { sheet } = await renderEvent(event, placeholderPhotos(event.layout, "TEST"));
  const blob = await sheet.convertToBlob({ type: "image/jpeg", quality: 0.92 });
  const id = newSessionId();
  const path = `${await p.storage.sessionDir(id)}/out/test.jpg`;
  await p.storage.writeFile(path, new Uint8Array(await blob.arrayBuffer()));
  const jobId = `test-${id}`;
  await p.printer.submit({ jobId, path, copies: 1, paper: printPaper(event.layout.paper) });
  return jobId;
}
