import { cpuCanvas } from "@tetra/template-engine";
import { fit } from "./finalize";

/** JPEG dari file kamera: sisi panjang `max`, warna preset (`ctx.filter`, sama dengan pratinjau CSS). */
export async function renderJpeg(
  bytes: Uint8Array<ArrayBuffer>,
  max: number,
  filter: string,
  quality: number,
) {
  const bmp = await createImageBitmap(new Blob([bytes]));
  try {
    const { width, height } = fit(bmp.width, bmp.height, max);
    const c = cpuCanvas(width, height);
    const g = c.getContext("2d");
    if (!g) throw new Error("canvas 2d tidak tersedia");
    g.filter = filter;
    g.imageSmoothingQuality = "high";
    g.drawImage(bmp, 0, 0, width, height);
    return new Uint8Array(
      await (await c.convertToBlob({ type: "image/jpeg", quality })).arrayBuffer(),
    );
  } finally {
    bmp.close();
  }
}
