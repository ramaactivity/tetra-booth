/**
 * Kalimat riwayat perubahan (audit 27 Nov): kode aksi `audit_logs.action` → bahasa sehari-hari untuk owner.
 * Nama event/booth disisipkan halaman; kode yang belum dikenal tampil apa adanya (lebih baik daripada hilang).
 */
type Meta = Record<string, unknown> | null;

const LINK: Record<string, string> = {
  client: "link galeri klien",
  live: "link live slideshow",
  guest: "link Guest Cam",
};
const QUICK: Record<string, string> = {
  enabled: "Guest Cam",
  approval: "persetujuan foto Guest Cam",
  reveal: "album tamu Guest Cam",
  print: "cetak dari HP tamu",
  voice: "ucapan suara",
  promo: "kartu promosi",
  lead: "form data tamu",
};
const VALUE: Record<string, string> = {
  true: "nyala",
  false: "mati",
  auto: "Otomatis",
  manual: "Manual",
  live: "Langsung",
  after: "Setelah acara",
};
const PLAIN: Record<string, string> = {
  "run.open": "membuka acara untuk tamu",
  "run.start": "memulai timer acara",
  "run.pause": "menjeda timer acara",
  "run.finish": "menyelesaikan acara",
  "run.correct": "mengoreksi jam mulai/selesai acara",
  "guest.reveal": "membuka album Guest Cam untuk tamu",
  "event.archive": "mengarsipkan event",
  "event.unarchive": "mengembalikan event dari arsip",
  "lead.export": "mengunduh data tamu",
  "device.emergency_pin": "membuka kode darurat PIN",
  "link.guest.rename": "mengubah alamat Guest Cam",
  "session.hide": "menyembunyikan satu sesi",
  "session.show": "menampilkan lagi satu sesi",
  "session.delete": "menghapus satu sesi",
  "session.untest": "menjadikan sesi tes sebagai sesi asli",
};

export function auditText(action: string, meta: Meta): string {
  const m = meta ?? {};
  const [kind, a, b] = action.split(".");
  if (kind === "link" && a && LINK[a] && (b === "new" || b === "revoke"))
    return `${b === "new" ? "membuat" : "mencabut"} ${LINK[a]}`;
  if (kind === "guest" && (a === "approve" || a === "reject"))
    return `${a === "approve" ? "menyetujui" : "menolak"} ${Number(m.count ?? 0)} foto Guest Cam`;
  if (action.startsWith("event.quick.") && a === "quick" && b && QUICK[b])
    return `mengubah ${QUICK[b]} jadi ${VALUE[String(m.value)] ?? String(m.value)} (Akses cepat)`;
  if (action === "event.settings")
    return `menyimpan Pengaturan event${m.bundleVersion ? ` (versi booth v${m.bundleVersion})` : ""}`;
  if (action === "device.pilot")
    return m.on ? "menjadikan booth pilot (dapat versi baru duluan)" : "melepas status pilot booth";
  if (action === "release.general")
    return `merilis Tetra Booth ${String(m.version)} ke semua booth`;
  if (action === "event.settings.booth")
    return "mengubah setelan halaman tamu & link dari Backstage";
  return PLAIN[action] ?? action;
}
