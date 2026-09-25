// Supabase Auth email templates (DECISIONS #73). One layout, rendered to supabase/templates/*.html (used by the
// local config.toml). `--push` also writes subjects + HTML to the hosted project through the Management API:
//   SUPABASE_ACCESS_TOKEN=sbp_… node scripts/email-templates.mjs --push
import { writeFileSync } from "node:fs";

const PROJECT = "zamkqxcufukaudjjqotr";
const LINK = "{{ .ConfirmationURL }}";

/** key = Management API suffix (mailer_subjects_<key>, mailer_templates_<key>_content) and file name. */
const TEMPLATES = {
  invite: {
    subject: "Undangan tim Tetra Booth",
    pill: ["Undangan tim", "#D6F1EA"],
    title: "Kamu diundang ke tim Tetra Booth",
    body: 'Akun <strong style="color:#1D1D1B;">{{ .Email }}</strong> sudah ditambahkan ke admin Tetra Booth. Buat kata sandi untuk mulai mengelola event, booth, dan galeri.',
    cta: "Terima Undangan",
    note: "Link ini hanya bisa dipakai sekali. Kalau sudah kedaluwarsa, minta owner mengirim ulang undangan dari halaman Tim.",
  },
  recovery: {
    subject: "Atur ulang kata sandi Tetra Booth",
    pill: ["Akun admin", "#CEC8F6"],
    title: "Atur ulang kata sandi",
    body: 'Ada permintaan untuk membuat kata sandi baru untuk akun <strong style="color:#1D1D1B;">{{ .Email }}</strong> di Tetra Booth. Tekan tombol di bawah untuk lanjut.',
    cta: "Buat Kata Sandi Baru",
    note: "Link ini berlaku 1 jam dan hanya bisa dipakai sekali. Kalau kamu tidak memintanya, abaikan email ini. Kata sandimu tidak berubah.",
  },
  confirmation: {
    subject: "Konfirmasi email Tetra Booth",
    pill: ["Akun baru", "#D6F1EA"],
    title: "Konfirmasi emailmu",
    body: 'Satu langkah lagi. Konfirmasi bahwa <strong style="color:#1D1D1B;">{{ .Email }}</strong> adalah emailmu untuk mengaktifkan akun Tetra Booth.',
    cta: "Konfirmasi Email",
    note: "Kalau kamu tidak mendaftar di Tetra Booth, abaikan email ini.",
  },
  magic_link: {
    subject: "Link masuk Tetra Booth",
    pill: ["Masuk", "#CEC8F6"],
    title: "Masuk ke Tetra Booth",
    body: 'Tekan tombol di bawah untuk masuk sebagai <strong style="color:#1D1D1B;">{{ .Email }}</strong> tanpa kata sandi.',
    cta: "Masuk Sekarang",
    note: "Link ini berlaku 1 jam dan hanya bisa dipakai sekali. Kalau kamu tidak memintanya, abaikan email ini.",
  },
  email_change: {
    subject: "Konfirmasi email baru Tetra Booth",
    pill: ["Ganti email", "#FCE3C6"],
    title: "Konfirmasi email baru",
    body: 'Email akun Tetra Booth akan diganti dari <strong style="color:#1D1D1B;">{{ .Email }}</strong> ke <strong style="color:#1D1D1B;">{{ .NewEmail }}</strong>. Tekan tombol di bawah untuk mengonfirmasi.',
    cta: "Konfirmasi Email Baru",
    note: "Kalau kamu tidak meminta perubahan ini, abaikan email ini dan segera ganti kata sandimu.",
  },
  reauthentication: {
    subject: "Kode verifikasi Tetra Booth",
    pill: ["Verifikasi", "#FCE3C6"],
    title: "Kode verifikasi",
    body: "Masukkan kode ini untuk melanjutkan perubahan di akun Tetra Booth.",
    code: "{{ .Token }}",
    note: "Kode berlaku sebentar dan hanya bisa dipakai sekali. Jangan berikan kode ini ke siapa pun, termasuk crew.",
  },
  password_changed_notification: {
    subject: "Kata sandi Tetra Booth diganti",
    pill: ["Keamanan", "#F7D5CC"],
    title: "Kata sandimu baru saja diganti",
    body: 'Kata sandi akun <strong style="color:#1D1D1B;">{{ .Email }}</strong> di Tetra Booth sudah diganti.',
    cta: "Buka Admin",
    href: "https://booth.tetraphoto.com/admin/login",
    note: "Bukan kamu? Segera atur ulang kata sandi dari halaman masuk dan kabari owner tim.",
  },
};

const render = (t) => `<!doctype html>
<html lang="id">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light only">
<title>${t.subject}</title>
<link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@500;700;800&display=swap" rel="stylesheet">
</head>
<body style="margin:0;padding:0;background:#F8F7F4;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F8F7F4;font-family:'Plus Jakarta Sans',-apple-system,'Segoe UI',Helvetica,Arial,sans-serif;color:#1D1D1B;">
<tr><td align="center" style="padding:40px 16px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;">
  <tr><td style="padding:0 4px 20px;">
    <table role="presentation" cellpadding="0" cellspacing="0"><tr>
      <td width="36" height="36" align="center" style="width:36px;height:36px;background:#8EDCCB;border:1.5px solid #1D1D1B;border-radius:10px;font-size:17px;font-weight:800;">T</td>
      <td style="padding-left:10px;font-size:22px;font-weight:800;letter-spacing:-0.02em;">tetra</td>
    </tr></table>
  </td></tr>
  <tr><td style="background:#FFFFFF;border:1.5px solid #1D1D1B;border-radius:20px;box-shadow:6px 6px 0 #1D1D1B;padding:36px 32px;">
    <p style="margin:0 0 16px;"><span style="display:inline-block;background:${t.pill[1]};border:1.5px solid #1D1D1B;border-radius:999px;padding:4px 12px;font-size:12px;font-weight:700;">${t.pill[0]}</span></p>
    <h1 style="margin:0 0 12px;font-size:28px;line-height:1.15;font-weight:800;letter-spacing:-0.035em;">${t.title}</h1>
    <p style="margin:0 0 28px;font-size:15px;line-height:1.6;color:#3A3936;">${t.body}</p>
${
  t.code
    ? `    <p style="margin:0;display:inline-block;background:#F8F7F4;border:1.5px solid #1D1D1B;border-radius:12px;box-shadow:4px 4px 0 #1D1D1B;padding:14px 24px;font-family:'Geist Mono',ui-monospace,Menlo,Consolas,monospace;font-size:30px;font-weight:700;letter-spacing:0.18em;">${t.code}</p>`
    : `    <table role="presentation" cellpadding="0" cellspacing="0"><tr>
      <td style="background:#F8D98B;border:1.5px solid #1D1D1B;border-radius:12px;box-shadow:4px 4px 0 #1D1D1B;">
        <a href="${t.href ?? LINK}" style="display:inline-block;padding:14px 28px;font-size:15px;font-weight:800;color:#1D1D1B;text-decoration:none;">${t.cta}</a>
      </td>
    </tr></table>`
}
    <p style="margin:28px 0 0;padding:12px 14px;background:#D6EEF8;border:1.5px dashed #1D1D1B;border-radius:12px;font-size:13px;line-height:1.5;">${t.note}</p>
${
  t.code || t.href
    ? ""
    : `    <p style="margin:24px 0 0;font-size:12px;line-height:1.5;color:#8A8883;">Tombol tidak berfungsi? Salin link ini ke browser:<br><a href="${LINK}" style="color:#5F5E5A;word-break:break-all;">${LINK}</a></p>
`
}  </td></tr>
  <tr><td style="padding:24px 4px 0;font-size:12px;line-height:1.5;color:#8A8883;">Tetra Booth · <a href="https://booth.tetraphoto.com" style="color:#5F5E5A;">booth.tetraphoto.com</a></td></tr>
</table>
</td></tr>
</table>
</body>
</html>
`;

const config = {};
for (const [key, t] of Object.entries(TEMPLATES)) {
  const html = render(t);
  writeFileSync(new URL(`../supabase/templates/${key}.html`, import.meta.url), html);
  config[`mailer_subjects_${key}`] = t.subject;
  config[`mailer_templates_${key}_content`] = html;
}

if (process.argv.includes("--push")) {
  const token = process.env.SUPABASE_ACCESS_TOKEN;
  if (!token) throw new Error("SUPABASE_ACCESS_TOKEN kosong");
  config.mailer_notifications_password_changed_enabled = true;
  const res = await fetch(`https://api.supabase.com/v1/projects/${PROJECT}/config/auth`, {
    method: "PATCH",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(config),
  });
  console.log(res.status, res.ok ? "templates pushed" : await res.text());
  if (!res.ok) process.exit(1);
}
