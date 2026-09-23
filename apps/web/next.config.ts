import type { NextConfig } from "next";

const config: NextConfig = {
  transpilePackages: ["@tetra/shared", "@tetra/template-engine", "@tetra/ui", "@tetra/db"],
};

export default config;
