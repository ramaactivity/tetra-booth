/** WhatsApp admin Tetra Photobooth: satu sumber untuk landing, halaman tamu, dan galeri (audit 27 Nov). */
export const TETRA_WA = "6285213526630";
export const waLink = (text: string) =>
  `https://wa.me/${TETRA_WA}?text=${encodeURIComponent(text)}`;
