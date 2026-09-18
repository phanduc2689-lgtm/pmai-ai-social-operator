import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { PmaiApp } from "../../src/components/pmai-app.tsx";
import "../../src/styles.css";

const el = document.getElementById("root");
if (!el) throw new Error("root missing");
createRoot(el).render(
  <StrictMode>
    <PmaiApp />
  </StrictMode>,
);
