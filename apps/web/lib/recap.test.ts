import { describe, expect, it } from "vitest";
import { type RecapData, recapText, recapView } from "./recap";

const base: RecapData = {
  name: "Employee Day DSO 2026",
  date: "2026-10-04",
  venue: "Gedung Kirana",
  packageName: "Paket 3 Jam",
  packageHours: 3,
  booths: ["Booth 1"],
  designs: ["Strip 3 foto"],
  sessions: 10,
  prints: 22,
  opened: 6,
  saved: 3,
  leads: 4,
  photos: 30,
  firstAt: "2026-10-04T03:05:00.000Z",
  lastAt: "2026-10-04T05:50:00.000Z",
  outside: 0,
  run: {
    segments: [
      { start: "2026-10-04T03:00:00.000Z", end: "2026-10-04T04:00:00.000Z" },
      { start: "2026-10-04T04:10:00.000Z", end: "2026-10-04T06:30:00.000Z" },
    ],
    finishedAt: "2026-10-04T06:30:00.000Z",
  },
  scheduledStart: "10:00",
  scheduledEnd: "13:00",
  local: { bytes: 3.2 * 1024 ** 3, files: 412 },
  cloudBytes: 850 * 1024 ** 2,
};
const now = Date.parse("2026-10-04T08:00:00.000Z");

describe("rekap event", () => {
  it("durasi dari timer, jeda dipisah, vonis lebih", () => {
    const v = recapView(base, now);
    expect(v.source).toBe("timer");
    expect(v.durationMs).toBe(200 * 60_000);
    expect(v.pausedMs).toBe(10 * 60_000);
    expect(v.verdictText).toBe("Lebih 20 menit");
    expect(v.stats.find((s) => s.label === "QR dibuka")?.value).toBe("60%");
  });

  it("tanpa timer: perkiraan sesi pertama → terakhir; kurang dari paket", () => {
    const v = recapView({ ...base, run: { segments: [] } }, now);
    expect(v.source).toBe("sessions");
    expect(v.verdictText).toBe("Kurang 15 menit");
    expect(v.verdictSub).toContain("perkiraan");
  });

  it("teks WhatsApp memuat inti rekap", () => {
    const t = recapText(base, now);
    expect(t).toContain("*Rekap Event · Employee Day DSO 2026*");
    expect(t).toContain("Paket: Paket 3 Jam · 3 jam");
    expect(t).toContain("*Lebih 20 menit*");
    expect(t).toContain("Mulai 10.00 · Selesai 13.30 · Jeda 10 menit");
    expect(t).toContain("Lembar dicetak: 22 (+ cetak ulang)");
    expect(t).toContain("Jadwal 10.00–13.00 · Nyata 10.00–13.30");
    expect(t).toContain("Mulai tepat waktu · selesai telat 30 menit");
    expect(t).toContain("Ukuran di laptop: 3,2 GB (412 file)");
    expect(t).toContain("Ukuran di cloud: 850 MB");
    expect(recapText({ ...base, local: null }, now)).toContain(
      "Ukuran di laptop: Belum dilaporkan booth",
    );
  });

  it("jadwal kosong = tidak dibandingkan", () => {
    expect(recapView({ ...base, scheduledStart: null }, now).schedule).toBeNull();
  });
});

describe("rekap: sesi hari lain & di luar waktu acara (#170)", () => {
  it("jam hari lain ditulis dengan tanggal, sesi di luar acara dicatat", () => {
    // Event 27 Sep dipakai lagi untuk uji 5 Okt: sesi pertama dari 27 Sep, timer 5 Okt.
    const d: RecapData = {
      ...base,
      date: "2026-09-27",
      firstAt: "2026-09-27T16:51:00.000Z",
      lastAt: "2026-10-05T07:30:00.000Z",
      outside: 3,
      run: {
        segments: [{ start: "2026-10-05T05:05:00.000Z", end: "2026-10-05T07:00:00.000Z" }],
        finishedAt: "2026-10-05T07:00:00.000Z",
      },
    };
    const v = recapView(d, Date.parse("2026-10-05T09:00:00.000Z"));
    expect(v.startText).toBe("12.05");
    expect(v.endText).toBe("14.00");
    expect(v.stats.find((s) => s.label === "Sesi pertama")?.value).toBe("27 Sep 23.51");
    expect(v.stats.find((s) => s.label === "Sesi terakhir")?.value).toBe("14.30");
    expect(v.stats.find((s) => s.label === "Sesi")?.note).toBe("3 sesi di luar waktu acara");
    expect(recapText(d, now)).toContain("Sesi pertama: 27 Sep 23.51");
    // Tanpa timer: hari acara = tanggal event.
    const noRun = recapView({ ...d, run: { segments: [] } }, now);
    expect(noRun.startText).toBe("23.51");
    expect(noRun.stats.find((s) => s.label === "Sesi terakhir")?.value).toBe("5 Okt 14.30");
  });
});
