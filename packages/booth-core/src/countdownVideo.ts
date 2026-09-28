/**
 * Video hitung mundur (DECISIONS #117): frame live view (kamera apa pun yang punya live view) disalin ke satu
 * canvas perekam milik sesi; MediaRecorder berjalan saat countdown/jepret dan dijeda di antaranya, jadi hasilnya
 * satu MP4 berisi momen-momen menjelang tiap jepretan. MP4 (H.264) supaya diputar di iPhone; tanpa dukungan = tanpa video.
 */
const MIME = ["video/mp4;codecs=avc1.42E01E", "video/mp4"];
export const recorderMime = () =>
  typeof MediaRecorder === "undefined"
    ? null
    : (MIME.find((m) => MediaRecorder.isTypeSupported(m)) ?? null);

export class CountdownRecorder {
  private readonly canvas = document.createElement("canvas");
  private readonly g: CanvasRenderingContext2D | null;
  private readonly rec: MediaRecorder;
  private readonly chunks: Blob[] = [];
  private frames = 0;

  constructor(
    mime: string,
    private readonly mirror: boolean,
  ) {
    this.canvas.width = 1280;
    this.canvas.height = 720;
    this.g = this.canvas.getContext("2d");
    this.rec = new MediaRecorder(this.canvas.captureStream(30), {
      mimeType: mime,
      videoBitsPerSecond: 4_000_000,
    });
    this.rec.ondataavailable = (e) => {
      if (e.data.size) this.chunks.push(e.data);
    };
  }

  /** Salin satu frame live view (cover, cermin mengikuti live view). */
  draw(source: CanvasImageSource, width: number, height: number) {
    const g = this.g;
    if (!g || this.rec.state !== "recording") return;
    const { width: cw, height: ch } = this.canvas;
    const scale = Math.max(cw / width, ch / height);
    g.setTransform(this.mirror ? -1 : 1, 0, 0, 1, this.mirror ? cw : 0, 0);
    g.drawImage(
      source,
      (cw - width * scale) / 2,
      (ch - height * scale) / 2,
      width * scale,
      height * scale,
    );
    this.frames++;
  }

  resume() {
    if (this.rec.state === "inactive") this.rec.start(500);
    else if (this.rec.state === "paused") this.rec.resume();
  }

  pause() {
    if (this.rec.state === "recording") this.rec.pause();
  }

  /** Selesai: MP4 atau null (tidak ada frame, mis. kamera tanpa live view). */
  async stop(): Promise<Uint8Array | null> {
    if (this.rec.state === "inactive") return null;
    const done = new Promise<void>((ok) => {
      this.rec.onstop = () => ok();
    });
    this.rec.stop();
    await done;
    if (!this.frames || !this.chunks.length) return null;
    return new Uint8Array(await new Blob(this.chunks).arrayBuffer());
  }
}
