import { cpuCanvas } from "@tetra/template-engine";
import type { BoothCamera, BoothStorage } from "../platform";

/**
 * Opsi crew "Cermin hasil foto" (bawaan mati, DECISIONS #35): file raw dibalik kiri-kanan tepat setelah capture,
 * jadi preview, review, cetakan, dan original semuanya sama dengan yang dilihat tamu di live view.
 */
export const withMirroredPhotos = (camera: BoothCamera, storage: BoothStorage): BoothCamera => ({
  ...camera,
  async capture(req) {
    const r = await camera.capture(req);
    const bmp = await createImageBitmap(new Blob([await storage.readFile(r.path)]));
    const c = cpuCanvas(bmp.width, bmp.height);
    const g = c.getContext("2d");
    if (!g) throw new Error("canvas 2d tidak tersedia");
    g.setTransform(-1, 0, 0, 1, bmp.width, 0);
    g.drawImage(bmp, 0, 0);
    bmp.close();
    const jpeg = await c.convertToBlob({ type: "image/jpeg", quality: 0.95 });
    await storage.writeFile(r.path, new Uint8Array(await jpeg.arrayBuffer()));
    return r;
  },
});
