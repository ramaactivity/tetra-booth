import type { NextConfig } from "next";

const config: NextConfig = {
  transpilePackages: [
    "@tetra/editor",
    "@tetra/shared",
    "@tetra/template-engine",
    "@tetra/ui",
    "@tetra/db",
  ],
  // Unggah overlay PNG dari admin (A4). Batas request Vercel 4,5 MB.
  experimental: { serverActions: { bodySizeLimit: "4mb" } },
  // Font pustaka editor dibaca server saat template disimpan lalu diunggah ke R2 (DECISIONS #77).
  outputFileTracingIncludes: { "/admin/templates/*": ["./public/fonts/*.woff2"] },
};

export default config;
