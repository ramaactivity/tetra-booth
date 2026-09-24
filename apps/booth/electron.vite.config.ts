import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig, externalizeDepsPlugin } from "electron-vite";

// Paket workspace berupa TS source, jadi harus di-bundle, bukan di-externalize.
const workspace = [
  "@tetra/shared",
  "@tetra/booth-core",
  "@tetra/platform-electron",
  "@tetra/template-engine",
  "@tetra/ui",
];

export default defineConfig({
  main: { plugins: [externalizeDepsPlugin({ exclude: workspace })] },
  // Preload jalan di sandbox (tanpa require node_modules), jadi Sentry ikut di-bundle.
  preload: { plugins: [externalizeDepsPlugin({ exclude: [...workspace, "@sentry/electron"] })] },
  renderer: { plugins: [react(), tailwindcss()] },
});
