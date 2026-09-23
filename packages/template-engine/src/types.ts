/** Tipe kanvas minimal supaya engine jalan di browser (OffscreenCanvas) dan Node (@napi-rs/canvas). */

export type ImageLike = { readonly width: number; readonly height: number };

export interface Ctx2D {
  // biome-ignore lint/suspicious/noExplicitAny: gambar dari platform mana pun (OffscreenCanvas, HTMLImageElement, @napi-rs Image)
  drawImage(image: any, dx: number, dy: number, dw: number, dh: number): void;
  fillStyle: string | unknown;
  font: string;
  textAlign: "left" | "center" | "right" | "start" | "end";
  textBaseline: "top" | "middle" | "bottom" | "alphabetic" | "hanging" | "ideographic";
  save(): void;
  restore(): void;
  translate(x: number, y: number): void;
  rotate(rad: number): void;
  beginPath(): void;
  rect(x: number, y: number, w: number, h: number): void;
  clip(): void;
  fillRect(x: number, y: number, w: number, h: number): void;
  fillText(text: string, x: number, y: number, maxWidth?: number): void;
  getImageData(x: number, y: number, w: number, h: number): { data: Uint8ClampedArray };
}

export interface CanvasLike extends ImageLike {
  getContext(type: "2d"): Ctx2D | null;
}

export type RenderInputs = {
  /** Foto per slot, urut sesuai `spec.slots`. */
  photos: readonly ImageLike[];
  /** Aset gambar (overlay, background) berdasarkan assetId. */
  assets: Readonly<Record<string, ImageLike>>;
  /** Nilai placeholder teks. */
  vars: { event_name?: string; date?: string; custom?: string };
};

export type RenderContext = {
  createCanvas(width: number, height: number): CanvasLike;
  /** Nama font family yang sudah diregistrasi untuk fontAssetId. */
  fontFamily(fontAssetId: string): string;
};
