import { init as sentryInit } from "@sentry/electron/renderer";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import "./index.css";

sentryInit();

const root = document.getElementById("root");
if (!root) throw new Error("#root tidak ada");
window.tetra.config().then((cfg) =>
  createRoot(root).render(
    <StrictMode>
      <App cfg={cfg} />
    </StrictMode>,
  ),
);
