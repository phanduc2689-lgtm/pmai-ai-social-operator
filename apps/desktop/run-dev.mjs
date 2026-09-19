#!/usr/bin/env node
/**
 * Windows Node 20+/24: spawn("npx.cmd") throws EINVAL (CVE-2024-27980).
 * Launch Vite with `node vite/bin/vite.js` and Electron with the real binary.
 */
import { spawn } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import { createRequire } from "node:module";
import net from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const PORT = 5174;
const DEV_URL = `http://127.0.0.1:${PORT}`;
const ELECTRON_ARGS = [
  "--disable-gpu",
  "--disable-gpu-compositing",
  "--disable-gpu-sandbox",
  "--disable-direct-composition",
  "--disable-features=CalculateNativeWinOcclusion,HardwareMediaKeyHandling",
  "--use-angle=swiftshader",
  ".",
];

function mustExist(file, hint) {
  if (!fs.existsSync(file)) {
    console.error(`Thieu: ${file}`);
    console.error(hint || "Chay: npm install");
    process.exit(1);
  }
  return file;
}

function run(command, args, extraEnv = {}) {
  const child = spawn(command, args, {
    cwd: root,
    stdio: "inherit",
    env: { ...process.env, ...extraEnv },
    windowsHide: false,
    shell: false,
  });
  child.on("error", (err) => {
    console.error(`Khong chay duoc ${path.basename(String(command))}:`, err.message);
    process.exit(1);
  });
  return child;
}

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
        if (Date.now() - start > timeoutMs) reject(new Error("Vite chua san sang (het 60s)."));
        else setTimeout(tryOnce, 400);
      });
    };
    tryOnce();
  });
}

function waitHttp(url, timeoutMs = 45000) {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    const tryOnce = () => {
      const req = http.get(url, (res) => {
        res.resume();
        if (res.statusCode && res.statusCode < 500) {
          resolve(undefined);
          return;
        }
        retry();
      });
      req.on("error", retry);
      req.setTimeout(1500, () => {
        req.destroy();
        retry();
      });
    };
    const retry = () => {
      if (Date.now() - start > timeoutMs) reject(new Error("Vite chua tra trang (het thoi gian cho)."));
      else setTimeout(tryOnce, 300);
    };
    tryOnce();
  });
}

function electronBinary() {
  try {
    const p = require("electron");
    if (typeof p === "string" && fs.existsSync(p)) return p;
  } catch {
    /* path.txt missing in this environment */
  }
  return null;
}

mustExist(path.join(root, "package.json"), "Chay CAI-DAT-WINDOWS.bat trong thu muc repo (co package.json).");
const viteJs = mustExist(path.join(root, "node_modules", "vite", "bin", "vite.js"), "Chay: npm install");
const viteConfig = mustExist(path.join(root, "apps", "desktop", "vite.config.ts"));
const electronCli = path.join(root, "node_modules", "electron", "cli.js");
mustExist(electronCli, "Chay: npm install");
const mainCjs = mustExist(path.join(root, "apps", "desktop", "dist-main", "main.cjs"));

console.log("PMAI v1.0.0 — thu muc:", root);
console.log("PMAI boot gpu-swiftshader");
if (!fs.readFileSync(mainCjs, "utf8").includes("disableHardwareAcceleration")) {
  console.error("BAN MAIN.CJS CU — cua so se khong hien. Tai lai repo tu GitHub (khong dung ZIP cu).");
}
if (!fs.existsSync(path.join(root, ".git"))) {
  console.error("Thu muc nay khong co .git — co the la ZIP cu. Tai: https://github.com/phanduc2689-lgtm/pmai-ai-social-operator");
}

const vite = run(process.execPath, [viteJs, "--config", viteConfig, "--host", "127.0.0.1", "--port", String(PORT)], {
  VITE_CONFIG_NATIVE_IGNORE_WARNING: "true",
});
vite.on("exit", (code) => {
  if (code) {
    console.error("Vite thoat ma", code);
    process.exit(code);
  }
});

try {
  await waitPort(PORT);
  await waitHttp(DEV_URL);
} catch (e) {
  console.error(e instanceof Error ? e.message : e);
  vite.kill();
  process.exit(1);
}

console.log("PMAI: mo Electron (tat GPU, tranh crash Windows 0xC0000005)...");
const exe = electronBinary();
const electron = exe
  ? run(exe, ELECTRON_ARGS, { PMAI_RENDERER_URL: DEV_URL, VITE_CONFIG_NATIVE_IGNORE_WARNING: "true" })
  : run(process.execPath, [electronCli, ...ELECTRON_ARGS], {
      PMAI_RENDERER_URL: DEV_URL,
      VITE_CONFIG_NATIVE_IGNORE_WARNING: "true",
    });

function shutdown() {
  try {
    electron.kill();
  } catch {
    /* ignore */
  }
  try {
    vite.kill();
  } catch {
    /* ignore */
  }
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
electron.on("exit", (code) => {
  if (code === 0) {
    console.log("PMAI: Electron da thoat.");
    console.log("Neu cua so khong hien: Task Manager → dong electron.exe / PMAI → npm start lai.");
  } else {
    console.error("PMAI: Electron thoat ma", code);
  }
  vite.kill();
  process.exit(code ?? 0);
});
