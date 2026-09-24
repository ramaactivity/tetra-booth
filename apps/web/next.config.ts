import type { NextConfig } from "next";

const config: NextConfig = {
  transpilePackages: ["@tetra/shared", "@tetra/template-engine", "@tetra/ui", "@tetra/db"],
  // Unggah overlay PNG dari admin (A4). Batas request Vercel 4,5 MB.
  experimental: { serverActions: { bodySizeLimit: "4mb" } },
};

export default config;
