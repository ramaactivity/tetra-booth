/** Pastikan blob foto berupa JPEG; kembalikan byte + ukuran piksel. */
export async function toJpeg(
  blob: Blob,
): Promise<{ bytes: Uint8Array; width: number; height: number }> {
  const bmp = await createImageBitmap(blob);
  const { width, height } = bmp;
  let jpeg = blob;
  if (blob.type !== "image/jpeg") {
    const c = new OffscreenCanvas(width, height);
    c.getContext("2d")?.drawImage(bmp, 0, 0);
    jpeg = await c.convertToBlob({ type: "image/jpeg", quality: 0.95 });
  }
  bmp.close();
  return { bytes: new Uint8Array(await jpeg.arrayBuffer()), width, height };
}

export const rawPath = (dir: string, index: number) => `${dir}/raw/${index + 1}.jpg`;
