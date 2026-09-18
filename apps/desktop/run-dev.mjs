#!/usr/bin/env node
import { spawn } from "node:child_process";
import net from "node:net";

const PORT = 5174;
const URL = `http://127.0.0.1:${PORT}`;

function waitPort(port, timeoutMs = 60000) {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    const tryOnce = () => {
      const sock = net.connect({ port, host: "127.0.0.1" }, () => {
        sock.end();
        resolve(undefined);
      });
      sock.on("error", () => {
        sock.destroy();
        if (Date.now() - start > timeoutMs) reject(new Error("Vite chưa sẵn sàng"));
        else setTimeout(tryOnce, 400);
      });
    };
    tryOnce();
  });
}

const vite = spawn(
  process.platform === "win32" ? "npx.cmd" : "npx",
  ["vite", "--config", "apps/desktop/vite.config.ts", "--host", "127.0.0.1", "--port", String(PORT)],
  { stdio: "inherit", env: process.env },
);

await waitPort(PORT);
const electron = spawn(
  process.platform === "win32" ? "npx.cmd" : "npx",
  ["electron", "."],
  { stdio: "inherit", env: { ...process.env, PMAI_RENDERER_URL: URL } },
);

function shutdown() {
  electron.kill();
  vite.kill();
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
electron.on("exit", (code) => {
  vite.kill();
  process.exit(code ?? 0);
});
