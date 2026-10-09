/**
 * Ilustrasi kamera per preset Guest Cam (#209, gaya laci kamera Dazz): tiap film punya bentuk kamera sendiri,
 * bukan satu ikon diwarnai ulang. ViewBox 64×64, garis tinta tipis, warna dari `body` preset.
 */
const INK = "#1D1D1B";
const GLASS = "#3A3936";

function Lens({ cx, cy, r }: { cx: number; cy: number; r: number }) {
  return (
    <>
      <circle cx={cx} cy={cy} r={r} fill={INK} />
      <circle cx={cx} cy={cy} r={r * 0.68} fill={GLASS} stroke="#8A8883" strokeWidth="1.2" />
      <circle cx={cx - r * 0.25} cy={cy - r * 0.25} r={r * 0.2} fill="#fff" opacity=".75" />
    </>
  );
}

const ART: Record<string, (body: string) => React.ReactNode> = {
  // Mirrorless modern: bodi ramping, lensa besar di tengah.
  original: (b) => (
    <>
      <rect x="8" y="20" width="48" height="30" rx="7" fill={b} stroke={INK} strokeWidth="2" />
      <rect x="11" y="16" width="12" height="6" rx="2" fill={INK} />
      <Lens cx={34} cy={35} r={11} />
      <circle cx="50" cy="25" r="2" fill={INK} />
    </>
  ),
  // Kamera saku film: bodi bulat panjang, lensa kanan, jendela flash kiri atas.
  gold: (b) => (
    <>
      <rect x="6" y="22" width="52" height="26" rx="13" fill={b} stroke={INK} strokeWidth="2" />
      <rect x="12" y="27" width="12" height="7" rx="2" fill="#fff" stroke={INK} strokeWidth="1.5" />
      <rect x="26" y="27" width="6" height="5" rx="1.5" fill={GLASS} />
      <Lens cx={44} cy={35} r={9} />
      <rect x="40" y="18" width="10" height="5" rx="2" fill={INK} />
    </>
  ),
  // Rangefinder: pelat atas perak, bodi kulit gelap, lensa kiri, jendela bidik kanan atas.
  portra: (b) => (
    <>
      <rect
        x="6"
        y="18"
        width="52"
        height="12"
        rx="3"
        fill="#D6D3CC"
        stroke={INK}
        strokeWidth="2"
      />
      <rect x="6" y="28" width="52" height="22" rx="3" fill={b} stroke={INK} strokeWidth="2" />
      <rect x="42" y="21" width="9" height="6" rx="1" fill={GLASS} />
      <rect x="10" y="21" width="5" height="5" rx="1" fill="#fff" stroke={INK} />
      <Lens cx={24} cy={39} r={10} />
    </>
  ),
  // Sekali pakai: kotak karton bercorak, roda film, bar flash.
  disposable: (b) => (
    <>
      <rect x="6" y="18" width="52" height="32" rx="4" fill="#fff" stroke={INK} strokeWidth="2" />
      <rect x="6" y="34" width="52" height="16" rx="0" fill={b} />
      <rect x="6" y="18" width="52" height="32" rx="4" fill="none" stroke={INK} strokeWidth="2" />
      <rect
        x="10"
        y="22"
        width="16"
        height="8"
        rx="1.5"
        fill="#FCE3C6"
        stroke={INK}
        strokeWidth="1.5"
      />
      <circle cx="44" cy="31" r="7" fill={INK} />
      <circle cx="44" cy="31" r="4" fill={GLASS} />
      <rect x="44" y="13" width="10" height="6" rx="1" fill={INK} />
      <text x="12" y="45" fontSize="7" fontWeight="800" fill={INK} fontFamily="sans-serif">
        FILM
      </text>
    </>
  ),
  // Digicam CCD: tipis perak, lensa kecil kiri atas, layar kecil.
  ccd: (b) => (
    <>
      <rect
        x="8"
        y="20"
        width="48"
        height="28"
        rx="5"
        fill="#EFEDE8"
        stroke={INK}
        strokeWidth="2"
      />
      <rect x="8" y="40" width="48" height="8" rx="0" fill={b} />
      <rect x="8" y="20" width="48" height="28" rx="5" fill="none" stroke={INK} strokeWidth="2" />
      <Lens cx={20} cy={31} r={7} />
      <rect x="32" y="25" width="7" height="4" rx="1" fill={GLASS} />
      <rect x="42" y="25" width="9" height="4" rx="1" fill="#fff" stroke={INK} />
      <rect x="40" y="16" width="8" height="4" rx="1.5" fill={INK} />
    </>
  ),
  // Instan: kotak tinggi krem, garis pelangi, slot cetak.
  instant: (b) => (
    <>
      <rect
        x="12"
        y="10"
        width="40"
        height="44"
        rx="8"
        fill="#F8F7F4"
        stroke={INK}
        strokeWidth="2"
      />
      <rect x="12" y="38" width="40" height="16" rx="0" fill={b} />
      <rect x="12" y="10" width="40" height="44" rx="8" fill="none" stroke={INK} strokeWidth="2" />
      <rect x="29" y="12" width="3" height="26" fill="#E8836F" />
      <rect x="32" y="12" width="3" height="26" fill="#F8D98B" />
      <rect x="35" y="12" width="3" height="26" fill="#8EDCCB" />
      <Lens cx={24} cy={27} r={9} />
      <rect x="42" y="15" width="7" height="6" rx="1.5" fill={GLASS} />
      <rect x="18" y="47" width="28" height="3" rx="1.5" fill={INK} />
    </>
  ),
  // SLR: pentaprisma di atas, lensa besar menonjol.
  mono: (b) => (
    <>
      <path d="M24 12 h16 l5 9 H19 z" fill={INK} />
      <rect x="6" y="20" width="52" height="28" rx="5" fill={b} stroke={INK} strokeWidth="2" />
      <rect x="6" y="20" width="52" height="7" rx="0" fill="#D6D3CC" opacity=".9" />
      <Lens cx={32} cy={36} r={12} />
      <rect x="10" y="30" width="6" height="14" rx="2" fill={INK} />
    </>
  ),
  // TLR: kotak tinggi, dua lensa bertumpuk.
  noir: (b) => (
    <>
      <rect x="16" y="8" width="32" height="48" rx="4" fill={b} stroke={INK} strokeWidth="2" />
      <rect x="18" y="6" width="28" height="5" rx="1.5" fill="#8A8883" stroke={INK} />
      <Lens cx={32} cy={24} r={8} />
      <Lens cx={32} cy={43} r={8} />
      <rect x="44" y="30" width="6" height="8" rx="2" fill="#8A8883" stroke={INK} />
    </>
  ),
  // Lipat klasik: bodi kulit, bellows, lensa di depan.
  vintage: (b) => (
    <>
      <rect x="4" y="16" width="26" height="34" rx="3" fill={b} stroke={INK} strokeWidth="2" />
      <path d="M30 22 L44 26 L44 42 L30 46 Z" fill={INK} />
      <path d="M33 25 v18 M37 26 v16 M41 27 v14" stroke="#8A8883" strokeWidth="1" />
      <rect
        x="44"
        y="24"
        width="6"
        height="20"
        rx="2"
        fill="#D6D3CC"
        stroke={INK}
        strokeWidth="1.5"
      />
      <Lens cx={55} cy={34} r={6} />
      <rect x="8" y="20" width="8" height="5" rx="1" fill={GLASS} />
    </>
  ),
};

export function CameraArt({ id, body, size = 56 }: { id: string; body: string; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      aria-hidden
      className="drop-shadow-[0_4px_8px_rgba(0,0,0,.35)]"
    >
      {(ART[id] ?? ART.original)?.(body)}
    </svg>
  );
}
