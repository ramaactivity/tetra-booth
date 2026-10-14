import { drawCover } from "./countdownVideo";

/**
 * Boomerang dari live view (opsional per event, `settings.boomerang`): selama hitung mundur booth menyimpan
 * ±1 detik frame live view terakhir (kecil, 15 fps); saat jepret, potongan itu dibekukan untuk foto tersebut.
 * Setelah sesi (compose) tiap potongan diputar maju lalu mundur, disambung urut foto, direkam jadi satu MP4.
 * Kamera apa pun yang punya live view (webcam, simulasi, SDK); tanpa frame = tanpa boomerang.
 */
export const BOOMERANG = {
  fps: 15,
  /** Panjang potongan sebelum tiap jepretan. */
  windowMs: 1000,
  width: 720,
  height: 405,
  bitrate: 3_000_000,
} as const;
export const BOOMERANG_FRAMES = Math.round((BOOMERANG.fps * BOOMERANG.windowMs) / 1000);

/** Maju lalu mundur tanpa mengulang frame ujung: [a,b,c,d] → [a,b,c,d,c,b]; loop berikutnya mulai lagi dari a. */
export const pingPong = <T>(xs: T[]): T[] => [...xs, ...xs.slice(1, -1).reverse()];

/** Lama klip (ms) untuk sejumlah frame boomerang. */
export const boomerangMs = (frames: number) => Math.round((frames * 1000) / BOOMERANG.fps);

/**
 * Pemilihan frame (tanpa DOM, diuji): sampel maks. `fps`, simpan `keep` frame terakhir (ring), bekukan per foto.
 * `make(reuse)` dipanggil hanya untuk frame yang diambil; `reuse` = slot tertua yang dibuang (hemat alokasi).
 */
export class BoomerangClips<T> {
  private ring: T[] = [];
  private last = Number.NEGATIVE_INFINITY;
  private readonly clips = new Map<number, T[]>();

  constructor(
    private readonly drop: (x: T) => void = () => {},
    private readonly keep = BOOMERANG_FRAMES,
    private readonly fps: number = BOOMERANG.fps,
  ) {}

  offer(now: number, make: (reuse: T | undefined) => T): boolean {
    // Toleransi 2 ms: sumber 30 fps (33 ms) tetap menghasilkan 15 fps, bukan 10.
    if (now - this.last < 1000 / this.fps - 2) return false;
    this.last = now;
    const reuse = this.ring.length >= this.keep ? this.ring.shift() : undefined;
    this.ring.push(make(reuse));
    return true;
  }

  /** Jepret foto `index`: potongan saat ini jadi klip foto itu (ulang foto = klip baru menggantikan). */
  freeze(index: number) {
    const clip = this.ring;
    this.ring = [];
    this.last = Number.NEGATIVE_INFINITY;
    if (clip.length < 2) {
      clip.forEach(this.drop);
      return;
    }
    this.clips.get(index)?.forEach(this.drop);
    this.clips.set(index, clip);
  }

  /** Urutan putar: klip urut nomor foto, masing-masing maju-mundur. */
  sequence(): T[] {
    return [...this.clips.keys()]
      .sort((a, b) => a - b)
      .flatMap((i) => pingPong(this.clips.get(i) ?? []));
  }

  dispose() {
    for (const c of this.clips.values()) c.forEach(this.drop);
    this.ring.forEach(this.drop);
    this.clips.clear();
    this.ring = [];
  }
}

/** Perekam boomerang sesi (DOM): frame disalin ke canvas kecil, MP4 dibuat sekali di akhir sesi. */
export class BoomerangRecorder {
  private readonly clips = new BoomerangClips<HTMLCanvasElement>((c) => {
    // Lepas memori canvas segera, tidak menunggu GC.
    c.width = 0;
    c.height = 0;
  });

  constructor(private readonly mirror: boolean) {}

  /** Salin frame live view (sinkron: frame DSLR ditutup setelah callback). */
  draw(source: CanvasImageSource, width: number, height: number, now = performance.now()) {
    this.clips.offer(now, (reuse) => {
      const c = reuse ?? document.createElement("canvas");
      if (!reuse) {
        c.width = BOOMERANG.width;
        c.height = BOOMERANG.height;
      }
      const g = c.getContext("2d");
      if (g) drawCover(g, source, width, height, this.mirror);
      return c;
    });
  }

  freeze(index: number) {
    this.clips.freeze(index);
  }

  dispose() {
    this.clips.dispose();
  }

  /** MP4 boomerang (diputar sekali secara real time, ±2 s per foto) atau null tanpa frame. Melepas frame. */
  async encode(mime: string): Promise<Uint8Array | null> {
    const frames = this.clips.sequence();
    try {
      if (frames.length < 2) return null;
      const canvas = document.createElement("canvas");
      canvas.width = BOOMERANG.width;
      canvas.height = BOOMERANG.height;
      const g = canvas.getContext("2d");
      if (!g) return null;
      // captureStream(0) + requestFrame: tepat satu frame video per frame boomerang.
      const stream = canvas.captureStream(0);
      const track = stream.getVideoTracks()[0] as CanvasCaptureMediaStreamTrack | undefined;
      const rec = new MediaRecorder(stream, {
        mimeType: mime,
        videoBitsPerSecond: BOOMERANG.bitrate,
      });
      const chunks: Blob[] = [];
      rec.ondataavailable = (e) => {
        if (e.data.size) chunks.push(e.data);
      };
      rec.start();
      const step = 1000 / BOOMERANG.fps;
      const t0 = performance.now();
      for (const [i, f] of frames.entries()) {
        g.drawImage(f, 0, 0);
        track?.requestFrame();
        await new Promise((r) =>
          setTimeout(r, Math.max(0, t0 + (i + 1) * step - performance.now())),
        );
      }
      const stopped = new Promise<void>((ok) => {
        rec.onstop = () => ok();
      });
      rec.stop();
      // Penjaga: rekaman yang macet tidak boleh menahan upload sesi (buildOutputs menunggu boomerang).
      await Promise.race([stopped, new Promise((r) => setTimeout(r, 3000))]);
      for (const t of stream.getTracks()) t.stop();
      return chunks.length ? new Uint8Array(await new Blob(chunks).arrayBuffer()) : null;
    } finally {
      this.clips.dispose();
    }
  }
}
