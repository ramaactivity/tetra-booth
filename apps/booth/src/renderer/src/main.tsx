import { init as sentryInit } from "@sentry/electron/renderer";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { LanTv } from "./LanTv";
import "./index.css";

const root = document.getElementById("root");
if (!root) throw new Error("#root tidak ada");
// Dibuka dari browser device lain lewat WiFi (#205): tanpa preload Electron → layar TV Photo Stage saja.
if (!("tetra" in window)) createRoot(root).render(<LanTv />);
else {
  sentryInit();
  window.tetra.config().then((cfg) =>
    createRoot(root).render(
      <StrictMode>
        <App cfg={cfg} />
      </StrictMode>,
    ),
  );
}
