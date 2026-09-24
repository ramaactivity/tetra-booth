import { newSessionId } from "@tetra/shared";
import { renderEvent } from "../compose";
import type { BoothEvent } from "../event";
import type { BoothPlatform } from "../platform";

/** Test print: layout event aktif dengan foto abu-abu bertanda TEST, lewat jalur cetak yang sama dengan sesi. */
export async function testPrint(p: BoothPlatform, event: BoothEvent): Promise<void> {
  const photos = event.layout.slots.map((s, i) => {
    const c = new OffscreenCanvas(Math.round(s.w), Math.round(s.h));
    const g = c.getContext("2d");
    if (g) {
      g.fillStyle = i % 2 ? "#b8b2aa" : "#8a847d";
      g.fillRect(0, 0, c.width, c.height);
      g.fillStyle = "#ffffff";
      g.font = `${Math.round(c.height / 5)}px sans-serif`;
      g.fillText(`TEST ${i + 1}`, c.width * 0.08, c.height * 0.6);
    }
    return c;
  });
  const out = await renderEvent(event, photos);
  const blob = await out.convertToBlob({ type: "image/jpeg", quality: 0.92 });
  const id = newSessionId();
  const path = `${await p.storage.sessionDir(id)}/out/test.jpg`;
  await p.storage.writeFile(path, new Uint8Array(await blob.arrayBuffer()));
  await p.printer.submit({ jobId: `test-${id}`, path, copies: 1, paper: event.layout.paper });
}
